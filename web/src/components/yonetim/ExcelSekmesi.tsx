"use client";
import { useRef, useState } from "react";
import { postJson, ApiError } from "@/lib/api";
import { ALAN_ADI, excelSatirlari, type Alan, type OkumaSonucu } from "@/lib/excelOku";
import type { IceAktarSonuc } from "@/lib/types";
import { readXlsx } from "@/lib/xlsx";

const alanAdi: Record<string, string> = { cari: "cari", tc: "TC", plaka: "plaka", telefon: "telefon" };
const degMetni = (d: Record<string, { eski: string; yeni: string }>) =>
  Object.entries(d)
    .map(([k, v]) => `${alanAdi[k] ?? k}: ${v.eski || "(boş)"} → ${v.yeni}`)
    .join(", ");

export default function ExcelSekmesi() {
  return (
    <>
      <IceAktar />
      <div className="panel">
        <h2>📤 Excel'e aktar</h2>
        <p className="yardim">
          Tüm firmalar ve şoförler tek sayfa olarak iner (T.C. kimlik no tam haliyle, metin olarak). Aynı dosya düzenlenip
          yukarıdan geri yüklenebilir. Dışa aktarma işlem kaydına yazılır.
        </p>
        <a className="dl-btn" href="/api/disa-aktar.xlsx" download>
          Excel dosyasını indir
        </a>
      </div>
    </>
  );
}

function IceAktar() {
  const [okunan, setOkunan] = useState<(OkumaSonucu & { dosya: string }) | null>(null);
  const [sonuc, setSonuc] = useState<IceAktarSonuc | null>(null);
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function sifirla() {
    setOkunan(null);
    setSonuc(null);
    setHata("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function gonder(o: OkumaSonucu, uygula: boolean) {
    setBusy(true);
    setHata("");
    try {
      setSonuc(await postJson<IceAktarSonuc>("/api/ice-aktar", { satirlar: o.satirlar, uygula }));
    } catch (e) {
      // Uygulama sırasında hata çıkarsa (veri önizlemeden sonra değiştiyse) sunucu güncel planı döner
      setHata((e as Error).message);
      if (e instanceof ApiError && uygula) await gonder(o, false);
    }
    setBusy(false);
  }

  async function dosyaSecildi(f: File | undefined) {
    sifirla();
    if (!f) return;
    try {
      const o = excelSatirlari(readXlsx(await f.arrayBuffer()));
      if (!o.satirlar.length) throw new Error("Dosyada başlık satırının altında veri yok.");
      setOkunan({ ...o, dosya: f.name });
      await gonder(o, false);
    } catch (e) {
      setHata((e as Error).message);
    }
  }

  const s = sonuc;
  const degisiklikSayisi = s ? s.yeniFirma.length + s.firmaGuncelle.length + s.yeniSofor.length + s.soforGuncelle.length : 0;
  const eksikSutun = okunan ? (Object.keys(ALAN_ADI) as Alan[]).filter((a) => !okunan.sutunlar[a]) : [];

  return (
    <div className="panel">
      <h2>📥 Excel'den içe aktar</h2>
      <p className="yardim">
        İlk satırda <b>Firma</b>, <b>Adı Soyadı</b>, <b>Şoför TC</b>, <b>Plaka</b>, <b>Cari</b> (isteğe bağlı <b>Telefon</b>)
        başlıkları olan .xlsx dosyası. Firma adı ve şoför adı büyük/küçük harf farkı gözetmeden eşleşir. Olmayanlar
        eklenir, olanların dosyada <b>dolu</b> alanları güncellenir; dosyada boş olan alan mevcut bilgiyi silmez.{" "}
        <b>Hiçbir kayıt silinmez.</b> Önce ne olacağı gösterilir, onaylamadan hiçbir şey değişmez.
      </p>
      <input
        ref={inputRef}
        className="dosya-sec"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => void dosyaSecildi(e.target.files?.[0])}
      />
      {hata && (
        <div className="status err" role="alert">
          {hata}
        </div>
      )}
      {okunan && (
        <p className="yardim !mt-3 !mb-0">
          <b>{okunan.dosya}</b> · "{okunan.sayfa}" sayfası · {okunan.satirlar.length} satır. Tanınan sütunlar:{" "}
          {(Object.keys(okunan.sutunlar) as Alan[]).map((a) => `${ALAN_ADI[a]} ← "${okunan.sutunlar[a]}"`).join(", ")}
          {eksikSutun.length > 0 && <> · Dosyada olmayan: {eksikSutun.map((a) => ALAN_ADI[a]).join(", ")}</>}
        </p>
      )}
      {busy && !s && <div className="skel h-24 w-full mt-3" />}
      {s && okunan && (
        <div className="onizleme">
          {s.uygulandi ? (
            <div className="onay-kutu ok" role="status">
              <b>
                ✓ Aktarıldı: {s.yeniFirma.length} yeni firma, {s.yeniSofor.length} yeni şoför,{" "}
                {s.firmaGuncelle.length + s.soforGuncelle.length} güncelleme.
              </b>
              <div>
                <button type="button" className="savebtn" onClick={sifirla}>
                  Yeni dosya seç
                </button>{" "}
                <a href="/" className="metin-btn">
                  Cari listesine git
                </a>
              </div>
            </div>
          ) : s.hatalar.length > 0 ? (
            <div className="onay-kutu hata" role="alert">
              <b>Dosyada {s.hatalar.length} hatalı satır var; düzeltmeden hiçbir şey aktarılmaz.</b>
              <span className="text-[12.5px]">Excel'de düzeltip dosyayı yeniden seçin.</span>
            </div>
          ) : degisiklikSayisi === 0 ? (
            <div className="onay-kutu ok">
              <b>Değişecek bir şey yok, sistem dosyayla aynı ({s.degismeyen} satır).</b>
            </div>
          ) : (
            <div className="onay-kutu ok">
              <b>
                {s.yeniFirma.length} yeni firma, {s.yeniSofor.length} yeni şoför eklenecek; {s.firmaGuncelle.length + s.soforGuncelle.length}{" "}
                kayıt güncellenecek. {s.degismeyen} satır zaten aynı.
              </b>
              {s.uyarilar.length > 0 && <span className="text-[12.5px]">Uyarılar aktarmayı engellemez ama gözden geçirin.</span>}
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="yeni-btn !py-2" disabled={busy} onClick={() => void gonder(okunan, true)}>
                  Onayla ve aktar
                </button>
                <button type="button" className="savebtn" disabled={busy} onClick={sifirla}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          <Liste baslik="Hatalı satırlar" cls="hata" acik items={s.hatalar.map((h) => `${h.satir}. satır: ${h.mesaj}`)} />
          <Liste baslik="Uyarılar" cls="uyar" acik items={s.uyarilar.map((h) => (h.satir ? `${h.satir}. satır · ` : "") + h.mesaj)} />
          <Liste baslik="Yeni firmalar" items={s.yeniFirma.map((f) => f.ad + (f.cari ? ` (cari: ${f.cari})` : ""))} />
          <Liste
            baslik="Yeni şoförler"
            items={s.yeniSofor.map((x) => `${x.firma} · ${x.adSoyad}${x.plaka ? " · " + x.plaka : ""}${x.tc ? " · TC " + x.tc : ""}`)}
          />
          <Liste
            baslik="Güncellenecek"
            acik
            items={[
              ...s.firmaGuncelle.map((f) => `${f.ad} · ${degMetni(f.degisiklik)}`),
              ...s.soforGuncelle.map((x) => `${x.firma} · ${x.adSoyad} · ${degMetni(x.degisiklik)}`),
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Liste({ baslik, items, cls, acik }: { baslik: string; items: string[]; cls?: string; acik?: boolean }) {
  if (!items.length) return null;
  return (
    <details className={cls} open={acik}>
      <summary>
        {baslik} ({items.length})
      </summary>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </details>
  );
}
