import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { ayarlariOku } from "../ayarlar";
import {
  normPlaka,
  normTc,
  normTelefon,
  plakaGecerli,
  plakaGorunum,
  tcDurum,
  tcHata,
  tcMaske,
  temizMetin,
} from "../cari";
import type { Deps } from "../deps";
import { kaydet } from "../islemKaydi";
import { requireAdmin } from "./yonetim";
import { iceAktarPlan, type IceAktarSatir } from "./iceAktar";
import { xlsxYaz } from "../xlsx";

/** Oturumdaki kullanıcının bu veride yapabildikleri (rol + ayarlar). */
export interface Yetki {
  duzenle: boolean;
  tcGor: boolean;
}

export async function yetkiOku(d: Deps, req: Request): Promise<Yetki> {
  if (req.user?.rol === "yonetici") return { duzenle: true, tcGor: true };
  const a = await ayarlariOku(d.pool);
  return { duzenle: a.personelDuzenleyebilir, tcGor: a.personelTcGorebilir };
}

// ---------- Girdi şemaları ----------

const metin = (max: number) => z.unknown().transform((v) => temizMetin(v, max));

const firmaSchema = z.object({
  ad: metin(120).refine((s) => s.length > 0, "Firma adı boş olamaz."),
  cari: metin(200).optional(),
  notlar: metin(500).optional(),
  aktif: z.boolean().optional(),
});
const firmaGuncelleSchema = firmaSchema.partial().strict();

const soforSchema = z.object({
  adSoyad: metin(100).refine((s) => s.length > 0, "Şoför adı soyadı boş olamaz."),
  tc: z
    .unknown()
    .transform(normTc)
    .superRefine((s, ctx) => {
      const h = tcHata(s);
      if (h) ctx.addIssue({ code: "custom", message: h });
    })
    .optional(),
  plaka: z
    .unknown()
    .transform(normPlaka)
    .refine((s) => s.length <= 12, "Plaka çok uzun.")
    .optional(),
  telefon: z.unknown().transform(normTelefon).optional(),
  notlar: metin(500).optional(),
});
const soforGuncelleSchema = soforSchema.partial().strict();

/** Yeni firma: ilk şoför(ler) de aynı istekte verilebilir. */
const yeniFirmaSchema = firmaSchema.extend({ soforler: z.array(soforSchema).max(20).optional() });

function ilkHata(e: z.ZodError): string {
  const i = e.issues[0];
  return i?.message && !i.message.startsWith("Invalid") ? i.message : "Geçersiz istek.";
}

const idParam = (req: Request) => {
  const n = Number(req.params.id);
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null;
};

// ---------- Çıktı ----------

interface FirmaSatir {
  id: number;
  ad: string;
  cari: string;
  notlar: string;
  aktif: boolean;
  olusturma: Date;
  guncelleme: Date;
  guncelleyen: string | null;
}
interface SoforSatir {
  id: number;
  firma_id: number;
  ad_soyad: string;
  tc: string;
  plaka: string;
  telefon: string;
  notlar: string;
  guncelleme: Date;
  guncelleyen: string | null;
}

function soforCikti(s: SoforSatir, y: Yetki) {
  return {
    id: s.id,
    firmaId: s.firma_id,
    adSoyad: s.ad_soyad,
    tc: y.tcGor ? s.tc : tcMaske(s.tc),
    tcDurum: tcDurum(s.tc),
    plaka: s.plaka,
    plakaGorunum: plakaGorunum(s.plaka),
    plakaGecerli: s.plaka === "" || plakaGecerli(s.plaka),
    telefon: s.telefon,
    notlar: s.notlar,
    guncelleme: s.guncelleme,
    guncelleyen: s.guncelleyen,
  };
}

async function firmalariGetir(d: Deps, y: Yetki, id?: number) {
  const f = await d.pool.query<FirmaSatir>(
    `SELECT id, ad, cari, notlar, aktif, olusturma, guncelleme, guncelleyen FROM firmalar
      ${id ? "WHERE id = $1" : ""} ORDER BY tr_fold(ad)`,
    id ? [id] : [],
  );
  const s = await d.pool.query<SoforSatir>(
    `SELECT id, firma_id, ad_soyad, tc, plaka, telefon, notlar, guncelleme, guncelleyen FROM soforler
      ${id ? "WHERE firma_id = $1" : ""} ORDER BY firma_id, id`,
    id ? [id] : [],
  );
  const bySofor = new Map<number, ReturnType<typeof soforCikti>[]>();
  for (const r of s.rows) {
    const arr = bySofor.get(r.firma_id) ?? [];
    arr.push(soforCikti(r, y));
    bySofor.set(r.firma_id, arr);
  }
  return f.rows.map((r) => ({ ...r, soforler: bySofor.get(r.id) ?? [] }));
}

// ---------- Değişiklik kaydı ----------

type Degisiklik = Record<string, { eski: unknown; yeni: unknown }>;

/** İki kayıt arasındaki farkı işlem kaydı için çıkarır; TC gizlenir. */
function fark<T extends Record<string, unknown>>(eski: T, yeni: Partial<T>, alanlar: (keyof T & string)[]): Degisiklik {
  const out: Degisiklik = {};
  for (const k of alanlar) {
    if (yeni[k] === undefined || yeni[k] === eski[k]) continue;
    const gizle = (v: unknown) => (k === "tc" && typeof v === "string" ? tcMaske(v) : v);
    out[k] = { eski: gizle(eski[k]), yeni: gizle(yeni[k]) };
  }
  return out;
}

const benzersizIhlal = (e: unknown) => (e as { code?: string })?.code === "23505";

export function firmalarRoutes(d: Deps): Router {
  const r = Router();

  /** Düzenleme yetkisi yoksa 403 döner ve false verir. */
  async function duzenleyebilir(req: Request, res: Response): Promise<Yetki | null> {
    const y = await yetkiOku(d, req);
    if (!y.duzenle) {
      res.status(403).json({ error: "Düzenleme yetkiniz yok. Yöneticiyle görüşün." });
      return null;
    }
    return y;
  }

  r.get("/firmalar", async (req, res) => {
    const y = await yetkiOku(d, req);
    res.json({ firmalar: await firmalariGetir(d, y), yetki: y });
  });

  // ---------- Firma ----------

  r.post("/firmalar", async (req, res) => {
    const y = await duzenleyebilir(req, res);
    if (!y) return;
    const b = yeniFirmaSchema.safeParse(req.body ?? {});
    if (!b.success) {
      res.status(400).json({ error: ilkHata(b.error) });
      return;
    }
    if (!y.tcGor && b.data.soforler?.some((s) => s.tc)) {
      res.status(403).json({ error: "T.C. kimlik no girme yetkiniz yok." });
      return;
    }
    const u = req.user!.username;
    const client = await d.pool.connect();
    let id: number;
    try {
      await client.query("BEGIN");
      id = (
        await client.query(
          "INSERT INTO firmalar (ad, cari, notlar, aktif, guncelleyen) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [b.data.ad, b.data.cari ?? "", b.data.notlar ?? "", b.data.aktif ?? true, u],
        )
      ).rows[0].id as number;
      for (const s of b.data.soforler ?? []) await soforEkle(client, id, s, u);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      if (benzersizIhlal(e)) {
        res.status(409).json({ error: "Bu adda bir firma ya da aynı adda iki şoför var." });
        return;
      }
      throw e;
    } finally {
      client.release();
    }
    await kaydet(d.pool, req, "firma_ekle", {
      firma: b.data.ad,
      soforler: (b.data.soforler ?? []).map((s) => s.adSoyad),
    });
    res.status(201).json((await firmalariGetir(d, y, id))[0]);
  });

  r.patch("/firmalar/:id", async (req, res) => {
    const y = await duzenleyebilir(req, res);
    if (!y) return;
    const id = idParam(req);
    const b = firmaGuncelleSchema.safeParse(req.body ?? {});
    if (!id || !b.success) {
      res.status(400).json({ error: b.success ? "Geçersiz firma." : ilkHata(b.error) });
      return;
    }
    const eski = (await d.pool.query<FirmaSatir>("SELECT * FROM firmalar WHERE id = $1", [id])).rows[0];
    if (!eski) {
      res.status(404).json({ error: "Firma bulunamadı." });
      return;
    }
    const deg = fark(eski as unknown as Record<string, unknown>, b.data, ["ad", "cari", "notlar", "aktif"]);
    if (Object.keys(deg).length) {
      try {
        await d.pool.query(
          `UPDATE firmalar SET ad = $1, cari = $2, notlar = $3, aktif = $4, guncelleme = now(), guncelleyen = $5
            WHERE id = $6`,
          [
            b.data.ad ?? eski.ad,
            b.data.cari ?? eski.cari,
            b.data.notlar ?? eski.notlar,
            b.data.aktif ?? eski.aktif,
            req.user!.username,
            id,
          ],
        );
      } catch (e) {
        if (benzersizIhlal(e)) {
          res.status(409).json({ error: "Bu adda bir firma zaten var." });
          return;
        }
        throw e;
      }
      await kaydet(d.pool, req, "firma_guncelle", { firma: b.data.ad ?? eski.ad, degisiklik: deg });
    }
    res.json((await firmalariGetir(d, y, id))[0]);
  });

  // Firma silme sadece yöneticinin işi (şoförleriyle birlikte gider). Artık çalışılmayan firma için "pasif" önerilir.
  r.delete("/firmalar/:id", requireAdmin, async (req, res) => {
    const id = idParam(req);
    const eski = id
      ? (await d.pool.query("DELETE FROM firmalar WHERE id = $1 RETURNING ad", [id])).rows[0]
      : undefined;
    if (!eski) {
      res.status(404).json({ error: "Firma bulunamadı." });
      return;
    }
    await kaydet(d.pool, req, "firma_sil", { firma: eski.ad });
    res.json({ ok: true });
  });

  // ---------- Şoför ----------

  async function soforEkle(
    client: PoolClient | Deps["pool"],
    firmaId: number,
    s: z.infer<typeof soforSchema>,
    u: string,
  ): Promise<number> {
    return (
      await client.query(
        `INSERT INTO soforler (firma_id, ad_soyad, tc, plaka, telefon, notlar, guncelleyen)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [firmaId, s.adSoyad, s.tc ?? "", s.plaka ?? "", s.telefon ?? "", s.notlar ?? "", u],
      )
    ).rows[0].id as number;
  }

  async function firmaDokun(id: number, u: string) {
    await d.pool.query("UPDATE firmalar SET guncelleme = now(), guncelleyen = $1 WHERE id = $2", [u, id]);
  }

  r.post("/firmalar/:id/soforler", async (req, res) => {
    const y = await duzenleyebilir(req, res);
    if (!y) return;
    const id = idParam(req);
    const b = soforSchema.safeParse(req.body ?? {});
    if (!id || !b.success) {
      res.status(400).json({ error: b.success ? "Geçersiz firma." : ilkHata(b.error) });
      return;
    }
    if (!y.tcGor && b.data.tc) {
      res.status(403).json({ error: "T.C. kimlik no girme yetkiniz yok." });
      return;
    }
    const firma = (await d.pool.query("SELECT ad FROM firmalar WHERE id = $1", [id])).rows[0];
    if (!firma) {
      res.status(404).json({ error: "Firma bulunamadı." });
      return;
    }
    try {
      await soforEkle(d.pool, id, b.data, req.user!.username);
    } catch (e) {
      if (benzersizIhlal(e)) {
        res.status(409).json({ error: "Bu firmada aynı adda bir şoför zaten var." });
        return;
      }
      throw e;
    }
    await firmaDokun(id, req.user!.username);
    await kaydet(d.pool, req, "sofor_ekle", {
      firma: firma.ad,
      sofor: b.data.adSoyad,
      plaka: plakaGorunum(b.data.plaka ?? ""),
    });
    res.status(201).json((await firmalariGetir(d, y, id))[0]);
  });

  r.patch("/soforler/:id", async (req, res) => {
    const y = await duzenleyebilir(req, res);
    if (!y) return;
    const id = idParam(req);
    const b = soforGuncelleSchema.safeParse(req.body ?? {});
    if (!id || !b.success) {
      res.status(400).json({ error: b.success ? "Geçersiz şoför." : ilkHata(b.error) });
      return;
    }
    if (!y.tcGor && b.data.tc !== undefined) {
      res.status(403).json({ error: "T.C. kimlik no değiştirme yetkiniz yok." });
      return;
    }
    const eski = (
      await d.pool.query(
        `SELECT s.*, s.ad_soyad AS "adSoyad", f.ad AS firma FROM soforler s JOIN firmalar f ON f.id = s.firma_id
          WHERE s.id = $1`,
        [id],
      )
    ).rows[0] as (SoforSatir & { adSoyad: string; firma: string }) | undefined;
    if (!eski) {
      res.status(404).json({ error: "Şoför bulunamadı." });
      return;
    }
    const deg = fark(eski as unknown as Record<string, unknown>, b.data, ["adSoyad", "tc", "plaka", "telefon", "notlar"]);
    if (Object.keys(deg).length) {
      try {
        await d.pool.query(
          `UPDATE soforler SET ad_soyad = $1, tc = $2, plaka = $3, telefon = $4, notlar = $5,
                  guncelleme = now(), guncelleyen = $6 WHERE id = $7`,
          [
            b.data.adSoyad ?? eski.ad_soyad,
            b.data.tc ?? eski.tc,
            b.data.plaka ?? eski.plaka,
            b.data.telefon ?? eski.telefon,
            b.data.notlar ?? eski.notlar,
            req.user!.username,
            id,
          ],
        );
      } catch (e) {
        if (benzersizIhlal(e)) {
          res.status(409).json({ error: "Bu firmada aynı adda bir şoför zaten var." });
          return;
        }
        throw e;
      }
      await firmaDokun(eski.firma_id, req.user!.username);
      if (deg.plaka) deg.plaka = { eski: plakaGorunum(eski.plaka), yeni: plakaGorunum(b.data.plaka!) };
      await kaydet(d.pool, req, "sofor_guncelle", {
        firma: eski.firma,
        sofor: b.data.adSoyad ?? eski.ad_soyad,
        degisiklik: deg,
      });
    }
    res.json((await firmalariGetir(d, y, eski.firma_id))[0]);
  });

  r.delete("/soforler/:id", async (req, res) => {
    const y = await duzenleyebilir(req, res);
    if (!y) return;
    const id = idParam(req);
    const eski = id
      ? (
          await d.pool.query(
            `DELETE FROM soforler s USING firmalar f WHERE s.id = $1 AND f.id = s.firma_id
             RETURNING s.firma_id, s.ad_soyad, s.plaka, f.ad AS firma`,
            [id],
          )
        ).rows[0]
      : undefined;
    if (!eski) {
      res.status(404).json({ error: "Şoför bulunamadı." });
      return;
    }
    await firmaDokun(eski.firma_id, req.user!.username);
    await kaydet(d.pool, req, "sofor_sil", { firma: eski.firma, sofor: eski.ad_soyad, plaka: plakaGorunum(eski.plaka) });
    res.json((await firmalariGetir(d, y, eski.firma_id))[0]);
  });

  // ---------- Excel içe / dışa aktarma (yönetici) ----------

  const iceAktarSchema = z.object({
    satirlar: z
      .array(
        z.object({
          satir: z.number().int().min(1),
          firma: z.unknown().optional(),
          adSoyad: z.unknown().optional(),
          tc: z.unknown().optional(),
          plaka: z.unknown().optional(),
          cari: z.unknown().optional(),
          telefon: z.unknown().optional(),
        }),
      )
      .min(1, "Dosyada satır yok.")
      .max(5000, "En fazla 5000 satır yüklenebilir."),
    uygula: z.boolean().default(false),
  });

  /**
   * Önizleme (uygula: false) ya da uygulama. Sadece ekler/günceller, silmez. Dosyada hata varsa hiçbir şey yazılmaz.
   * Aynı işlem içinde plan yeniden hesaplanır: önizleme ile uygulama arasında veri değiştiyse güncel hali esas alınır.
   */
  r.post("/ice-aktar", requireAdmin, async (req, res) => {
    const b = iceAktarSchema.safeParse(req.body ?? {});
    if (!b.success) {
      res.status(400).json({ error: ilkHata(b.error) });
      return;
    }
    const client = await d.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(727031)");
      const plan = await iceAktarPlan(client, b.data.satirlar as IceAktarSatir[]);
      if (!b.data.uygula || plan.hatalar.length > 0) {
        await client.query("ROLLBACK");
        res.status(b.data.uygula ? 400 : 200).json({ ...plan.ozet, uygulandi: false });
        return;
      }
      await plan.uygula(req.user!.username);
      await client.query("COMMIT");
      const o = plan.ozet;
      await kaydet(d.pool, req, "ice_aktar", {
        yeniFirma: o.yeniFirma.length,
        firmaGuncelle: o.firmaGuncelle.length,
        yeniSofor: o.yeniSofor.length,
        soforGuncelle: o.soforGuncelle.length,
      });
      res.json({ ...o, uygulandi: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });

  r.get("/disa-aktar.xlsx", requireAdmin, async (req, res) => {
    const firmalar = await firmalariGetir(d, { duzenle: true, tcGor: true });
    const basliklar = ["Firma", "Adı Soyadı", "Şoför TC", "Plaka", "Cari", "Telefon", "Durum", "Firma notu", "Şoför notu"];
    const satirlar: string[][] = [];
    for (const f of firmalar) {
      const ortak = (s?: (typeof f.soforler)[number]) => [
        f.ad,
        s?.adSoyad ?? "",
        s?.tc ?? "",
        s?.plakaGorunum ?? "",
        f.cari,
        s?.telefon ?? "",
        f.aktif ? "Aktif" : "Pasif",
        f.notlar,
        s?.notlar ?? "",
      ];
      if (f.soforler.length === 0) satirlar.push(ortak());
      for (const s of f.soforler) satirlar.push(ortak(s));
    }
    const buf = xlsxYaz("Firma Listesi", basliklar, satirlar, [22, 22, 14, 13, 40, 14, 8, 30, 30]);
    await kaydet(d.pool, req, "disa_aktar", { firma: firmalar.length, satir: satirlar.length });
    const tarih = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cari-${tarih}.xlsx"`,
    });
    res.send(Buffer.from(buf));
  });

  return r;
}
