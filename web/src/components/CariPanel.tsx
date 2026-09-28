"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { TC_UYARI } from "@/lib/dogrula";
import { katla, sade } from "@/lib/tr";
import type { Firma, Me, Sofor, Yetki } from "@/lib/types";
import { FirmaFormu, SoforFormu } from "./Formlar";
import Kopyala from "./Kopyala";
import Plaka from "./Plaka";
import UstBar from "./UstBar";

type Filtre = "aktif" | "uyarili" | "pasif" | "tumu";
type Uyari = { metin: string; renk: "kirmizi" | "sari" | "gri" };

/** "05321112233" → "0532 111 22 33"; başka biçimler olduğu gibi. */
const telefonGorunum = (t: string) => (/^0\d{10}$/.test(t) ? `${t.slice(0, 4)} ${t.slice(4, 7)} ${t.slice(7, 9)} ${t.slice(9)}` : t);

const zaman = (s: string) => new Date(s).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });

/** Şoför başına uyarılar: TC ve plaka sorunları, başka kayıtta da geçen plaka/TC. */
function uyarilariHesapla(firmalar: Firma[]): Map<number, Uyari[]> {
  const plakalar = new Map<string, string[]>();
  const tcler = new Map<string, string[]>();
  for (const f of firmalar) {
    for (const s of f.soforler) {
      const kim = `${f.ad} / ${s.adSoyad}`;
      if (s.plaka) plakalar.set(s.plaka, [...(plakalar.get(s.plaka) ?? []), kim]);
      // Maskeli TC'ler (personel görünümü) karşılaştırılmaz
      if (s.tc && !s.tc.includes("*") && s.tcDurum !== "ornek") tcler.set(s.tc, [...(tcler.get(s.tc) ?? []), kim]);
    }
  }
  const out = new Map<number, Uyari[]>();
  for (const f of firmalar) {
    for (const s of f.soforler) {
      const u: Uyari[] = [];
      const t = TC_UYARI[s.tcDurum];
      if (t) u.push(t);
      if (!s.plaka) u.push({ metin: "Plaka yok", renk: "gri" });
      else if (!s.plakaGecerli) u.push({ metin: "Plaka biçimi?", renk: "sari" });
      const kim = `${f.ad} / ${s.adSoyad}`;
      const pd = (plakalar.get(s.plaka) ?? []).filter((k) => k !== kim);
      if (pd.length) u.push({ metin: `Plaka başka kayıtta da var: ${pd.join(", ")}`, renk: "sari" });
      const td = (tcler.get(s.tc) ?? []).filter((k) => k !== kim);
      if (td.length) u.push({ metin: `TC başka kayıtta da var: ${td.join(", ")}`, renk: "sari" });
      out.set(s.id, u);
    }
  }
  return out;
}

/** Aramada bakılan tüm alanlar tek metinde (katlanmış) + harf/rakam dışı atılmış hali (plaka/TC için). */
function aramaMetni(f: Firma) {
  const parca = [f.ad, f.cari, f.notlar, ...f.soforler.flatMap((s) => [s.adSoyad, s.plakaGorunum, s.tc, s.telefon, s.notlar])];
  return { duz: katla(parca.join(" | ")), sade: parca.map(sade).join("|") };
}

export default function CariPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [firmalar, setFirmalar] = useState<Firma[] | null>(null);
  const [yetki, setYetki] = useState<Yetki>({ duzenle: false, tcGor: false });
  const [hata, setHata] = useState("");
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("aktif");
  const [firmaForm, setFirmaForm] = useState<Firma | "yeni" | null>(null);
  const [soforForm, setSoforForm] = useState<{ firma: Firma; sofor: Sofor | null } | null>(null);
  const [bildirim, setBildirim] = useState("");
  const aramaRef = useRef<HTMLInputElement>(null);

  const yukle = useCallback(async () => {
    try {
      const r = await api<{ firmalar: Firma[]; yetki: Yetki }>("/api/firmalar");
      setFirmalar(r.firmalar);
      setYetki(r.yetki);
      setHata("");
    } catch (e) {
      setHata(e instanceof TypeError ? "Sunucuya ulaşılamıyor" : (e as Error).message);
    }
  }, []);

  useEffect(() => {
    api<Me>("/api/me")
      .then((m) => {
        setMe(m);
        return yukle();
      })
      .catch((e: Error & { status?: number }) => {
        if (e.status !== 401) setHata(e instanceof TypeError ? "Sunucuya ulaşılamıyor" : e.message);
      });
    // Sekmeye dönünce tazele: başka cihazdan yapılan değişiklikler görünsün
    const gorunur = () => document.visibilityState === "visible" && void yukle();
    document.addEventListener("visibilitychange", gorunur);
    // "/" arama kutusuna odaklar
    const kisayol = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        aramaRef.current?.focus();
      }
    };
    document.addEventListener("keydown", kisayol);
    return () => {
      document.removeEventListener("visibilitychange", gorunur);
      document.removeEventListener("keydown", kisayol);
    };
  }, [yukle]);

  const bildir = useCallback((m: string) => {
    setBildirim(m);
    setTimeout(() => setBildirim((x) => (x === m ? "" : x)), 2500);
  }, []);

  const uyarilar = useMemo(() => uyarilariHesapla(firmalar ?? []), [firmalar]);
  const aramaIndeksi = useMemo(() => new Map((firmalar ?? []).map((f) => [f.id, aramaMetni(f)])), [firmalar]);

  const uyariliMi = useCallback(
    (f: Firma) => f.soforler.length === 0 || f.soforler.some((s) => (uyarilar.get(s.id) ?? []).some((u) => u.renk !== "gri")),
    [uyarilar],
  );

  const sayilar = useMemo(() => {
    const l = firmalar ?? [];
    return {
      aktif: l.filter((f) => f.aktif).length,
      uyarili: l.filter((f) => f.aktif && uyariliMi(f)).length,
      pasif: l.filter((f) => !f.aktif).length,
      tumu: l.length,
      sofor: l.filter((f) => f.aktif).reduce((n, f) => n + f.soforler.length, 0),
    };
  }, [firmalar, uyariliMi]);

  const gorunen = useMemo(() => {
    const l = firmalar ?? [];
    const kelimeler = katla(q).split(" ").filter(Boolean);
    const qSade = sade(q);
    const filtredeMi = (f: Firma) => {
      switch (filtre) {
        case "aktif":
          return kelimeler.length > 0 || f.aktif; // aramada pasif firmalar da bulunsun
        case "pasif":
          return !f.aktif;
        case "uyarili":
          return f.aktif && uyariliMi(f);
        default:
          return true;
      }
    };
    return l.filter((f) => {
      if (!filtredeMi(f)) return false;
      if (!kelimeler.length) return true;
      const m = aramaIndeksi.get(f.id)!;
      if (qSade.length >= 3 && m.sade.includes(qSade)) return true;
      return kelimeler.every((k) => m.duz.includes(k));
    });
  }, [firmalar, q, filtre, aramaIndeksi, uyariliMi]);

  const firmaGuncelle = (f: Firma, mesaj: string) => {
    setFirmalar((prev) => {
      const l = prev ?? [];
      const varMi = l.some((x) => x.id === f.id);
      const yeni = varMi ? l.map((x) => (x.id === f.id ? f : x)) : [...l, f];
      return yeni.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    });
    setFirmaForm(null);
    setSoforForm(null);
    bildir(mesaj);
  };

  if (!me) {
    return (
      <div className="wrap">
        {hata ? (
          <div className="panel max-w-md">
            <h2>Sunucuya bağlanılamadı</h2>
            <p className="m-0 mb-3 text-sm text-stone-500">{hata}</p>
            <button type="button" className="retry-btn" onClick={() => location.reload()}>
              Tekrar dene
            </button>
          </div>
        ) : (
          <div className="skel h-8 w-48" aria-label="Yükleniyor" />
        )}
      </div>
    );
  }

  const FILTRELER: { id: Filtre; ad: string; n: number }[] = [
    { id: "aktif", ad: "Aktif", n: sayilar.aktif },
    { id: "uyarili", ad: "Eksik / hatalı", n: sayilar.uyarili },
    { id: "pasif", ad: "Pasif", n: sayilar.pasif },
    { id: "tumu", ad: "Tümü", n: sayilar.tumu },
  ];

  return (
    <div>
      <UstBar me={me} sayfa="cari" />
      <div className="wrap">
        <div className="arac-cubugu">
          <input
            ref={aramaRef}
            className="arama"
            type="search"
            placeholder="Firma, şoför, plaka, TC, cari…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            autoComplete="off"
            spellCheck={false}
            aria-label="Ara"
          />
          {yetki.duzenle && (
            <button type="button" className="yeni-btn" onClick={() => setFirmaForm("yeni")}>
              + Yeni firma
            </button>
          )}
        </div>
        <div className="filtreler" role="group" aria-label="Filtre">
          {FILTRELER.map((x) => (
            <button
              key={x.id}
              type="button"
              className={"filtre" + (filtre === x.id ? " secili" : "")}
              aria-pressed={filtre === x.id}
              onClick={() => setFiltre(x.id)}
            >
              {x.ad} ({x.n})
            </button>
          ))}
          <span className="ozet">
            {sayilar.aktif} firma · {sayilar.sofor} şoför
          </span>
        </div>

        {hata && <div className="status err">{hata}</div>}
        {!firmalar ? (
          <div className="firma-izgara">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skel h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : gorunen.length === 0 ? (
          <div className="panel empty">
            {firmalar.length === 0
              ? yetki.duzenle
                ? 'Henüz firma yok. "+ Yeni firma" ile ekleyin' + (me.rol === "yonetici" ? " ya da Yönetim > Excel'den cari listesini yükleyin." : ".")
                : "Henüz firma yok."
              : q
                ? `"${q}" için sonuç yok.`
                : "Bu filtrede firma yok."}
          </div>
        ) : (
          <div className="firma-izgara">
            {gorunen.map((f) => (
              <FirmaKarti
                key={f.id}
                f={f}
                yetki={yetki}
                uyarilar={uyarilar}
                onFirma={() => setFirmaForm(f)}
                onSofor={(s) => setSoforForm({ firma: f, sofor: s })}
              />
            ))}
          </div>
        )}
      </div>

      {firmaForm && (
        <FirmaFormu
          firma={firmaForm === "yeni" ? null : firmaForm}
          yetki={yetki}
          yonetici={me.rol === "yonetici"}
          onClose={() => setFirmaForm(null)}
          onKaydedildi={firmaGuncelle}
          onSilindi={(id, m) => {
            setFirmalar((prev) => (prev ?? []).filter((x) => x.id !== id));
            setFirmaForm(null);
            bildir(m);
          }}
        />
      )}
      {soforForm && (
        <SoforFormu
          firma={soforForm.firma}
          sofor={soforForm.sofor}
          yetki={yetki}
          onClose={() => setSoforForm(null)}
          onKaydedildi={firmaGuncelle}
        />
      )}
      {bildirim && (
        <div className="bildirim-kutu" role="status">
          {bildirim}
        </div>
      )}
    </div>
  );
}

function FirmaKarti({
  f,
  yetki,
  uyarilar,
  onFirma,
  onSofor,
}: {
  f: Firma;
  yetki: Yetki;
  uyarilar: Map<number, Uyari[]>;
  onFirma: () => void;
  onSofor: (s: Sofor | null) => void;
}) {
  return (
    <article className={"firma" + (f.aktif ? "" : " pasif")}>
      <div className="firma-ust">
        <div className="min-w-0">
          <h3>
            {f.ad} {!f.aktif && <span className="uyari gri align-middle">Pasif</span>}
          </h3>
          {f.cari ? (
            <div className="firma-cari">
              <span>Cari: {f.cari}</span>
              <Kopyala metin={f.cari} ad="Cari" />
            </div>
          ) : (
            <div className="firma-cari">
              <span className="italic">Cari girilmemiş</span>
            </div>
          )}
        </div>
        {yetki.duzenle && (
          <button type="button" className="kucuk-btn" onClick={onFirma}>
            Düzenle
          </button>
        )}
      </div>
      {f.notlar && <div className="firma-not">📝 {f.notlar}</div>}
      {f.soforler.length === 0 ? (
        <div className="sofor-yok border-t border-stone-100 dark:border-stone-800">Şoför kaydı yok.</div>
      ) : (
        <ul className="sofor-liste">
          {f.soforler.map((s) => (
            <SoforSatiri key={s.id} s={s} yetki={yetki} uyarilar={uyarilar.get(s.id) ?? []} onDuzenle={() => onSofor(s)} />
          ))}
        </ul>
      )}
      <div className="firma-alt">
        <span>{f.guncelleyen ? `${f.guncelleyen} · ${zaman(f.guncelleme)}` : zaman(f.guncelleme)}</span>
        {yetki.duzenle && (
          <button type="button" className="ekle-link" onClick={() => onSofor(null)}>
            + Şoför ekle
          </button>
        )}
      </div>
    </article>
  );
}

function SoforSatiri({ s, yetki, uyarilar, onDuzenle }: { s: Sofor; yetki: Yetki; uyarilar: Uyari[]; onDuzenle: () => void }) {
  // TC ekranda varsayılan olarak ortası gizli; dokununca açılır (kopyala her zaman tam değeri kopyalar).
  const [tcAcik, setTcAcik] = useState(false);
  const tamTc = yetki.tcGor && s.tc && !s.tc.includes("*");
  const tcGoster = tamTc && !tcAcik ? s.tc.slice(0, 3) + "•••••" + s.tc.slice(8) : s.tc;
  return (
    <li className="sofor">
      <div className="sofor-ust">
        <span className="sofor-ad">{s.adSoyad}</span>
        {yetki.duzenle && (
          <button type="button" className="kucuk-btn" onClick={onDuzenle}>
            Düzenle
          </button>
        )}
      </div>
      <div className="sofor-bilgi">
        {s.plaka && (
          <span className="bilgi">
            <Plaka metin={s.plakaGorunum} />
            <Kopyala metin={s.plakaGorunum} ad="Plaka" />
          </span>
        )}
        {s.tc && (
          <span className="bilgi">
            <span className="etiket">TC</span>
            {tamTc ? (
              <button type="button" className="tc bg-transparent border-0 p-0 cursor-pointer text-inherit text-[13px]" title={tcAcik ? "Gizle" : "Göster"} onClick={() => setTcAcik(!tcAcik)}>
                {tcGoster}
              </button>
            ) : (
              <span className="tc">{s.tc}</span>
            )}
            {tamTc && <Kopyala metin={s.tc} ad="TC" />}
          </span>
        )}
        {s.telefon && (
          <span className="bilgi">
            <span className="etiket">Tel</span>
            <a href={"tel:" + s.telefon} className="text-inherit">
              {telefonGorunum(s.telefon)}
            </a>
          </span>
        )}
      </div>
      {uyarilar.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {uyarilar.map((u) => (
            <span key={u.metin} className={"uyari " + u.renk}>
              {u.metin}
            </span>
          ))}
        </div>
      )}
      {s.notlar && <div className="sofor-not">📝 {s.notlar}</div>}
    </li>
  );
}
