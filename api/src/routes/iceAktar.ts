import type { PoolClient } from "pg";
import {
  katla,
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

/** Arayüzün Excel'den okuyup gönderdiği satır (satir: Excel'deki satır numarası, hata mesajları için). */
export interface IceAktarSatir {
  satir: number;
  firma?: unknown;
  adSoyad?: unknown;
  tc?: unknown;
  plaka?: unknown;
  cari?: unknown;
  telefon?: unknown;
}

type Deg = Record<string, { eski: string; yeni: string }>;

export interface IceAktarOzet {
  yeniFirma: { ad: string; cari: string }[];
  firmaGuncelle: { ad: string; degisiklik: Deg }[];
  yeniSofor: { firma: string; adSoyad: string; tc: string; plaka: string }[];
  soforGuncelle: { firma: string; adSoyad: string; degisiklik: Deg }[];
  degismeyen: number;
  bosSatir: number;
  hatalar: { satir: number; mesaj: string }[];
  uyarilar: { satir: number; mesaj: string }[];
}

interface Firma {
  id: number | null; // null: bu içe aktarmada eklenecek
  ad: string;
  cari: string;
  yeniCari?: string;
}
interface Sofor {
  id: number | null;
  firmaKey: string;
  adSoyad: string;
  tc: string;
  plaka: string;
  telefon: string;
  deg?: { tc?: string; plaka?: string; telefon?: string };
  dosyaSatiri?: number; // dosyada ilk görüldüğü satır (tekrar kontrolü)
}

/**
 * Excel satırlarından içe aktarma planı çıkarır. Kurallar:
 * - Firma adı Türkçe büyük/küçük harf duyarsız eşleşir. Yoksa eklenir; varsa ve Cari doluysa, farklıysa güncellenir.
 * - Şoför aynı firmada ad soyadıyla eşleşir. Yoksa eklenir; varsa dosyadaki DOLU alanlar (TC, plaka, telefon) farklıysa
 *   güncellenir. Dosyada boş olan alan mevcut değeri silmez.
 * - Hiçbir şey silinmez.
 * - Hatalı satır (firma adı yok, TC 11 hane değil, aynı şoför iki kez ...) varsa uygulama yapılmaz.
 */
export async function iceAktarPlan(client: PoolClient, satirlar: IceAktarSatir[]) {
  const firmalar = new Map<string, Firma>();
  for (const f of (await client.query("SELECT id, ad, cari FROM firmalar")).rows) {
    firmalar.set(katla(f.ad), { id: f.id, ad: f.ad, cari: f.cari });
  }
  const firmaKeyById = new Map([...firmalar].map(([k, f]) => [f.id, k]));
  const soforler = new Map<string, Sofor>();
  for (const s of (await client.query("SELECT id, firma_id, ad_soyad, tc, plaka, telefon FROM soforler")).rows) {
    const fk = firmaKeyById.get(s.firma_id)!;
    soforler.set(fk + "|" + katla(s.ad_soyad), {
      id: s.id,
      firmaKey: fk,
      adSoyad: s.ad_soyad,
      tc: s.tc,
      plaka: s.plaka,
      telefon: s.telefon,
    });
  }

  const hatalar: IceAktarOzet["hatalar"] = [];
  const uyarilar: IceAktarOzet["uyarilar"] = [];
  let degismeyen = 0;
  let bosSatir = 0;

  for (const r of satirlar) {
    const firmaAd = temizMetin(r.firma, 120);
    const adSoyad = temizMetin(r.adSoyad, 100);
    const tc = normTc(r.tc);
    const plaka = normPlaka(r.plaka);
    const telefon = normTelefon(r.telefon);
    const cari = temizMetin(r.cari, 200);
    const hata = (mesaj: string) => hatalar.push({ satir: r.satir, mesaj });

    if (!firmaAd) {
      if (adSoyad || tc || plaka || telefon || cari) hata("Firma adı boş.");
      else bosSatir++;
      continue;
    }
    if (!adSoyad && (tc || plaka || telefon)) {
      hata("Şoför bilgisi var ama adı soyadı boş.");
      continue;
    }
    const th = tcHata(tc);
    if (th) {
      hata(`${th} (${String(r.tc ?? "")})`);
      continue;
    }
    if (plaka.length > 12) {
      hata("Plaka çok uzun.");
      continue;
    }

    // Firma
    const fk = katla(firmaAd);
    let firma = firmalar.get(fk);
    let degisti = false;
    if (!firma) {
      firma = { id: null, ad: firmaAd, cari };
      firmalar.set(fk, firma);
      degisti = true;
    } else if (cari && cari !== (firma.yeniCari ?? firma.cari)) {
      if (firma.id === null) firma.cari = cari;
      else firma.yeniCari = cari;
      degisti = true;
    }

    // Şoför
    if (adSoyad) {
      const sk = fk + "|" + katla(adSoyad);
      const s = soforler.get(sk);
      if (s?.dosyaSatiri) {
        hata(`${adSoyad} bu firmada dosyada iki kez var (${s.dosyaSatiri}. satırda da).`);
        continue;
      }
      if (!s) {
        soforler.set(sk, { id: null, firmaKey: fk, adSoyad, tc, plaka, telefon, dosyaSatiri: r.satir });
        degisti = true;
      } else {
        s.dosyaSatiri = r.satir;
        const deg: Sofor["deg"] = {};
        if (tc && tc !== s.tc) deg.tc = tc;
        if (plaka && plaka !== s.plaka) deg.plaka = plaka;
        if (telefon && telefon !== s.telefon) deg.telefon = telefon;
        if (Object.keys(deg).length) {
          s.deg = deg;
          degisti = true;
        }
      }
      const td = tcDurum(tc);
      if (td === "gecersiz") uyarilar.push({ satir: r.satir, mesaj: `${adSoyad}: T.C. kimlik no doğrulanamadı (yanlış yazılmış olabilir).` });
      if (td === "ornek") uyarilar.push({ satir: r.satir, mesaj: `${adSoyad}: T.C. kimlik no gerçek değil (${tc}), yer tutucu gibi görünüyor.` });
      if (plaka && !plakaGecerli(plaka)) uyarilar.push({ satir: r.satir, mesaj: `${adSoyad}: plaka biçimi olağandışı (${plaka}).` });
    }
    if (!degisti) degismeyen++;
  }

  // TC aynı olan farklı şoför kayıtları (yer tutucu olmayanlar) — muhtemelen yazım hatası
  const tcSahip = new Map<string, string[]>();
  for (const s of soforler.values()) {
    const tc = s.deg?.tc ?? s.tc;
    if (tc && tcDurum(tc) !== "ornek") tcSahip.set(tc, [...(tcSahip.get(tc) ?? []), s.adSoyad]);
  }
  for (const [tc, adlar] of tcSahip) {
    if (adlar.length > 1) uyarilar.push({ satir: 0, mesaj: `Aynı T.C. kimlik no (${tcMaske(tc)}) birden fazla şoförde: ${adlar.join(", ")}.` });
  }

  const firmaAdi = (k: string) => firmalar.get(k)!.ad;
  const ozet: IceAktarOzet = {
    yeniFirma: [...firmalar.values()].filter((f) => f.id === null).map((f) => ({ ad: f.ad, cari: f.cari })),
    firmaGuncelle: [...firmalar.values()]
      .filter((f) => f.id !== null && f.yeniCari !== undefined)
      .map((f) => ({ ad: f.ad, degisiklik: { cari: { eski: f.cari, yeni: f.yeniCari! } } })),
    yeniSofor: [...soforler.values()]
      .filter((s) => s.id === null)
      .map((s) => ({ firma: firmaAdi(s.firmaKey), adSoyad: s.adSoyad, tc: tcMaske(s.tc), plaka: plakaGorunum(s.plaka) })),
    soforGuncelle: [...soforler.values()]
      .filter((s) => s.id !== null && s.deg)
      .map((s) => {
        const deg: Deg = {};
        if (s.deg!.tc) deg.tc = { eski: tcMaske(s.tc), yeni: tcMaske(s.deg!.tc) };
        if (s.deg!.plaka) deg.plaka = { eski: plakaGorunum(s.plaka), yeni: plakaGorunum(s.deg!.plaka) };
        if (s.deg!.telefon) deg.telefon = { eski: s.telefon, yeni: s.deg!.telefon };
        return { firma: firmaAdi(s.firmaKey), adSoyad: s.adSoyad, degisiklik: deg };
      }),
    degismeyen,
    bosSatir,
    hatalar,
    uyarilar,
  };

  async function uygula(u: string) {
    for (const f of firmalar.values()) {
      if (f.id === null) {
        f.id = (
          await client.query("INSERT INTO firmalar (ad, cari, guncelleyen) VALUES ($1, $2, $3) RETURNING id", [f.ad, f.cari, u])
        ).rows[0].id as number;
      } else if (f.yeniCari !== undefined) {
        await client.query("UPDATE firmalar SET cari = $1, guncelleme = now(), guncelleyen = $2 WHERE id = $3", [f.yeniCari, u, f.id]);
      }
    }
    for (const s of soforler.values()) {
      const firmaId = firmalar.get(s.firmaKey)!.id!;
      if (s.id === null) {
        await client.query(
          "INSERT INTO soforler (firma_id, ad_soyad, tc, plaka, telefon, guncelleyen) VALUES ($1, $2, $3, $4, $5, $6)",
          [firmaId, s.adSoyad, s.tc, s.plaka, s.telefon, u],
        );
      } else if (s.deg) {
        await client.query(
          `UPDATE soforler SET tc = $1, plaka = $2, telefon = $3, guncelleme = now(), guncelleyen = $4 WHERE id = $5`,
          [s.deg.tc ?? s.tc, s.deg.plaka ?? s.plaka, s.deg.telefon ?? s.telefon, u, s.id],
        );
        await client.query("UPDATE firmalar SET guncelleme = now(), guncelleyen = $1 WHERE id = $2", [u, firmaId]);
      }
    }
  }

  return { ozet, hatalar, uygula };
}
