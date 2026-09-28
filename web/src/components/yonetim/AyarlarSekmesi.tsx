"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Ayarlar } from "@/lib/types";

const ALANLAR: { k: keyof Ayarlar; ad: string; aciklama: string }[] = [
  {
    k: "personelDuzenleyebilir",
    ad: "Personel firma ve şoför düzenleyebilir",
    aciklama:
      "Açıkken personel yeni firma/şoför ekler, bilgilerini değiştirir, şoför siler. Kapalıyken sadece görür. Firma silme her zaman yalnızca yöneticidedir.",
  },
  {
    k: "personelTcGorebilir",
    ad: "Personel T.C. kimlik noyu tam görebilir",
    aciklama:
      "Kapalıyken personele TC'nin ortası gizli gösterilir (634*****260), kopyalayamaz ve değiştiremez. KVKK açısından ihtiyaç yoksa kapalı tutun.",
  },
];

export default function AyarlarSekmesi() {
  const [ayar, setAyar] = useState<Ayarlar | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean }>({ t: "" });
  const [busy, setBusy] = useState<keyof Ayarlar | null>(null);

  useEffect(() => {
    api<Ayarlar>("/api/ayarlar")
      .then(setAyar)
      .catch((e) => setMsg({ t: "Ayarlar okunamadı: " + (e as Error).message }));
  }, []);

  if (!ayar) return msg.t ? <div className="status err">{msg.t}</div> : <div className="skel h-40 w-full" />;

  async function degistir(k: keyof Ayarlar) {
    setBusy(k);
    setMsg({ t: "" });
    try {
      const yeni = await api<Ayarlar>("/api/admin/ayarlar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [k]: !ayar![k] }),
      });
      setAyar(yeni);
      setMsg({ t: "Kaydedildi. Personel sayfayı yenileyince geçerli olur (sunucu hemen uygular).", ok: true });
    } catch (err) {
      setMsg({ t: (err as Error).message });
    }
    setBusy(null);
  }

  return (
    <div className="panel">
      <h2>🔧 Ayarlar</h2>
      <div className="ayar-liste">
        {ALANLAR.map((a) => (
          <div key={a.k} className="ayar">
            <span className="ayar-metin" id={"ayar-" + a.k}>
              <b>{a.ad}</b>
              <small>{a.aciklama}</small>
            </span>
            <button
              type="button"
              role="switch"
              className="anahtar"
              aria-checked={ayar[a.k]}
              aria-labelledby={"ayar-" + a.k}
              disabled={busy !== null}
              onClick={() => void degistir(a.k)}
            />
          </div>
        ))}
      </div>
      <div className={"status" + (msg.t ? (msg.ok ? " ok" : " err") : "")} role="status">
        {msg.t}
      </div>
    </div>
  );
}
