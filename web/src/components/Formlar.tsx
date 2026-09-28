"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { plakaGecerli, tcDurum } from "@/lib/dogrula";
import type { Firma, Sofor, Yetki } from "@/lib/types";
import Modal from "./Modal";

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ---------- Şoför alanları (yeni firma formunda da kullanılır) ----------

export interface SoforGirdi {
  adSoyad: string;
  tc: string;
  plaka: string;
  telefon: string;
  notlar: string;
}
const bosSofor: SoforGirdi = { adSoyad: "", tc: "", plaka: "", telefon: "", notlar: "" };

/** TC alanının altındaki anlık ipucu. null: sorun yok. */
function tcIpucu(tc: string): { t: string; cls: "hata" | "uyar" } | null {
  const d = tc.replace(/\D/g, "");
  if (!d) return null;
  if (d.length !== 11) return { t: `${d.length}/11 hane`, cls: "hata" };
  const s = tcDurum(d);
  if (s === "gecersiz") return { t: "Kontrol hanesi tutmuyor, yanlış yazılmış olabilir. Yine de kaydedilebilir.", cls: "uyar" };
  if (s === "ornek") return { t: "Gerçek bir TC değil (yer tutucu). Yine de kaydedilebilir.", cls: "uyar" };
  return null;
}

function SoforAlanlari({ v, set, tcGor, tcDokunma }: { v: SoforGirdi; set: (v: SoforGirdi) => void; tcGor: boolean; tcDokunma?: string }) {
  const ti = tcIpucu(v.tc);
  const pl = v.plaka.trim();
  return (
    <>
      <label className="alan">
        <span>Adı soyadı</span>
        <input value={v.adSoyad} onChange={(e) => set({ ...v, adSoyad: e.target.value })} autoComplete="off" maxLength={100} />
      </label>
      <div className="form-satir !mb-0 !items-start">
        <label className="alan">
          <span>T.C. kimlik no</span>
          {tcGor ? (
            <input
              value={v.tc}
              onChange={(e) => set({ ...v, tc: e.target.value.replace(/[^\d ]/g, "") })}
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              className="tc"
            />
          ) : (
            <input value={tcDokunma ?? ""} disabled className="tc" title="TC görme/değiştirme yetkiniz yok" />
          )}
          {ti && <small className={"ipucu-metin " + ti.cls}>{ti.t}</small>}
          {!tcGor && <small className="ipucu-metin">TC'yi yalnızca yönetici değiştirebilir.</small>}
        </label>
        <label className="alan">
          <span>Plaka</span>
          <input
            value={v.plaka}
            onChange={(e) => set({ ...v, plaka: e.target.value.toLocaleUpperCase("tr-TR") })}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={16}
            placeholder="34 AB 1234"
          />
          {pl && !plakaGecerli(pl) && <small className="ipucu-metin uyar">Plaka biçimi olağandışı. Yine de kaydedilebilir.</small>}
        </label>
      </div>
      <label className="alan">
        <span>Telefon (isteğe bağlı)</span>
        <input value={v.telefon} onChange={(e) => set({ ...v, telefon: e.target.value })} inputMode="tel" autoComplete="off" maxLength={20} />
      </label>
      <label className="alan">
        <span>Not (isteğe bağlı)</span>
        <input value={v.notlar} onChange={(e) => set({ ...v, notlar: e.target.value })} autoComplete="off" maxLength={500} />
      </label>
    </>
  );
}

function tcHataVar(v: SoforGirdi) {
  const d = v.tc.replace(/\D/g, "");
  return d.length > 0 && d.length !== 11;
}

// ---------- Firma formu ----------

/** Yeni firma (isteğe bağlı ilk şoförüyle) ya da mevcut firmanın bilgileri. */
export function FirmaFormu({
  firma,
  yetki,
  yonetici,
  onClose,
  onKaydedildi,
  onSilindi,
}: {
  firma: Firma | null;
  yetki: Yetki;
  yonetici: boolean;
  onClose: () => void;
  onKaydedildi: (f: Firma, mesaj: string) => void;
  onSilindi: (id: number, mesaj: string) => void;
}) {
  const [ad, setAd] = useState(firma?.ad ?? "");
  const [cari, setCari] = useState(firma?.cari ?? "");
  const [notlar, setNotlar] = useState(firma?.notlar ?? "");
  const [aktif, setAktif] = useState(firma?.aktif ?? true);
  const [sofor, setSofor] = useState<SoforGirdi>(bosSofor);
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);

  const soforVar = !firma && Object.values(sofor).some((x) => x.trim());

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (soforVar && !sofor.adSoyad.trim()) return setHata("Şoför bilgisi girdiyseniz adı soyadını da yazın.");
    setBusy(true);
    setHata("");
    try {
      if (firma) {
        const f = await api<Firma>(`/api/firmalar/${firma.id}`, json("PATCH", { ad, cari, notlar, aktif }));
        onKaydedildi(f, `${f.ad} güncellendi.`);
      } else {
        const body: Record<string, unknown> = { ad, cari, notlar };
        if (soforVar) {
          const { tc, ...geri } = sofor;
          body.soforler = [yetki.tcGor ? sofor : geri];
        }
        const f = await api<Firma>("/api/firmalar", json("POST", body));
        onKaydedildi(f, `${f.ad} eklendi.`);
      }
    } catch (err) {
      setHata((err as Error).message);
      setBusy(false);
    }
  }

  async function sil() {
    if (!firma) return;
    const n = firma.soforler.length;
    if (!confirm(`${firma.ad} ${n ? `ve ${n} şoförü ` : ""}kalıcı olarak silinsin mi? Bu işlem geri alınamaz.\n\nArtık çalışmadığınız firmaları silmek yerine "pasif" yapabilirsiniz.`)) return;
    setBusy(true);
    try {
      await api(`/api/firmalar/${firma.id}`, { method: "DELETE" });
      onSilindi(firma.id, `${firma.ad} silindi.`);
    } catch (err) {
      setHata((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal baslik={firma ? "Firmayı düzenle" : "Yeni firma"} onClose={onClose} onSubmit={kaydet} genis>
      <label className="alan">
        <span>Firma adı</span>
        <input value={ad} onChange={(e) => setAd(e.target.value)} autoFocus autoComplete="off" maxLength={120} placeholder="örn. Pınar" />
      </label>
      <label className="alan">
        <span>Cari (muhasebe programındaki hesap adı)</span>
        <input value={cari} onChange={(e) => setCari(e.target.value)} autoComplete="off" maxLength={200} />
      </label>
      <label className="alan">
        <span>Not (isteğe bağlı)</span>
        <input value={notlar} onChange={(e) => setNotlar(e.target.value)} autoComplete="off" maxLength={500} placeholder="örn. Salı ve cuma gelir" />
      </label>
      {firma && (
        <label className="onay-satir">
          <input type="checkbox" checked={!aktif} onChange={(e) => setAktif(!e.target.checked)} />
          Pasif (artık mal getirmiyor; listede gizlenir, silinmez)
        </label>
      )}
      {!firma && (
        <>
          <p className="yardim !mb-0 !mt-1">
            <b>İlk şoför</b> (isteğe bağlı; sonra da eklenebilir)
          </p>
          <SoforAlanlari v={sofor} set={setSofor} tcGor={yetki.tcGor} />
        </>
      )}
      <button className="anabtn" type="submit" disabled={busy || !ad.trim() || (soforVar && tcHataVar(sofor))}>
        {firma ? "Kaydet" : "Firmayı ekle"}
      </button>
      {hata && (
        <div className="status err" role="alert">
          {hata}
        </div>
      )}
      {firma && yonetici && (
        <div className="modal-alt">
          <span />
          <button type="button" className="metin-btn !text-red-600" disabled={busy} onClick={() => void sil()}>
            Firmayı sil
          </button>
        </div>
      )}
    </Modal>
  );
}

// ---------- Şoför formu ----------

export function SoforFormu({
  firma,
  sofor,
  yetki,
  onClose,
  onKaydedildi,
}: {
  firma: Firma;
  sofor: Sofor | null;
  yetki: Yetki;
  onClose: () => void;
  onKaydedildi: (f: Firma, mesaj: string) => void;
}) {
  const [v, setV] = useState<SoforGirdi>(
    sofor
      ? {
          adSoyad: sofor.adSoyad,
          tc: yetki.tcGor ? sofor.tc : "",
          plaka: sofor.plakaGorunum,
          telefon: sofor.telefon,
          notlar: sofor.notlar,
        }
      : bosSofor,
  );
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setHata("");
    const body: Partial<SoforGirdi> = { ...v };
    if (!yetki.tcGor) delete body.tc;
    try {
      const f = sofor
        ? await api<Firma>(`/api/soforler/${sofor.id}`, json("PATCH", body))
        : await api<Firma>(`/api/firmalar/${firma.id}/soforler`, json("POST", body));
      onKaydedildi(f, `${v.adSoyad.trim()} ${sofor ? "güncellendi" : "eklendi"}.`);
    } catch (err) {
      setHata((err as Error).message);
      setBusy(false);
    }
  }

  async function sil() {
    if (!sofor || !confirm(`${sofor.adSoyad} (${firma.ad}) silinsin mi?`)) return;
    setBusy(true);
    try {
      const f = await api<Firma>(`/api/soforler/${sofor.id}`, { method: "DELETE" });
      onKaydedildi(f, `${sofor.adSoyad} silindi.`);
    } catch (err) {
      setHata((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal baslik={`${firma.ad} · ${sofor ? "şoförü düzenle" : "yeni şoför"}`} onClose={onClose} onSubmit={kaydet} genis>
      <SoforAlanlari v={v} set={setV} tcGor={yetki.tcGor} tcDokunma={sofor?.tc} />
      <button className="anabtn" type="submit" disabled={busy || !v.adSoyad.trim() || tcHataVar(v)}>
        {sofor ? "Kaydet" : "Şoförü ekle"}
      </button>
      {hata && (
        <div className="status err" role="alert">
          {hata}
        </div>
      )}
      {sofor && (
        <div className="modal-alt">
          <span className="text-[11.5px] text-stone-400">
            {sofor.guncelleyen ? `Son değişiklik: ${sofor.guncelleyen}, ${new Date(sofor.guncelleme).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}` : ""}
          </span>
          <button type="button" className="metin-btn !text-red-600" disabled={busy} onClick={() => void sil()}>
            Şoförü sil
          </button>
        </div>
      )}
    </Modal>
  );
}
