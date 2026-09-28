import type { IslemKaydi } from "./types";

/** İşlem kaydındaki işlem adlarının Türkçe etiketleri (api/src/islemKaydi.ts ile aynı liste). */
export const ISLEM_ETIKET: Record<string, string> = {
  giris: "Giriş",
  giris_hatali: "Hatalı giriş",
  cikis: "Çıkış",
  sifre_degistir: "Kendi şifresini değiştirdi",
  firma_ekle: "Firma ekledi",
  firma_guncelle: "Firma düzenledi",
  firma_sil: "Firma sildi",
  sofor_ekle: "Şoför ekledi",
  sofor_guncelle: "Şoför düzenledi",
  sofor_sil: "Şoför sildi",
  ice_aktar: "Excel'den içe aktardı",
  disa_aktar: "Excel'e dışa aktardı",
  kullanici_ekle: "Kullanıcı ekledi",
  kullanici_sil: "Kullanıcı sildi",
  kullanici_rol: "Rol değiştirdi",
  kullanici_aktif: "Hesap durumu değiştirdi",
  kullanici_sifre: "Kullanıcı şifresi sıfırladı",
  kullanici_oturum_kapat: "Oturumları kapattı",
  ayar_degistir: "Ayar değiştirdi",
};

/** Dikkat çekmesi gereken işlemler (silme, toplu değişiklik, veri dışarı alma, yetki) */
export const ONEMLI_ISLEMLER = new Set([
  "firma_sil",
  "sofor_sil",
  "ice_aktar",
  "disa_aktar",
  "kullanici_sil",
  "kullanici_rol",
  "kullanici_aktif",
  "kullanici_sifre",
  "giris_hatali",
]);

export const AYAR_ETIKET: Record<string, string> = {
  personelDuzenleyebilir: "Personel düzenleyebilir",
  personelTcGorebilir: "Personel TC görebilir",
};

export const ALAN_ETIKET: Record<string, string> = {
  ad: "ad",
  cari: "cari",
  notlar: "not",
  aktif: "durum",
  adSoyad: "ad soyad",
  tc: "TC",
  plaka: "plaka",
  telefon: "telefon",
};

const rolAdi = (r: unknown) => (r === "yonetici" ? "yönetici" : "personel");
const deger = (v: unknown) => (v === true ? "aktif" : v === false ? "pasif" : v === "" || v == null ? "(boş)" : String(v));

function degisiklikMetni(deg: unknown): string {
  if (!deg || typeof deg !== "object") return "";
  return Object.entries(deg as Record<string, { eski: unknown; yeni: unknown }>)
    .map(([k, v]) => `${ALAN_ETIKET[k] ?? k}: ${deger(v?.eski)} → ${deger(v?.yeni)}`)
    .join(", ");
}

/** Kaydın ayrıntısını tek satır okunur metne çevirir. */
export function islemDetay(k: IslemKaydi): string {
  const d = k.detay as Record<string, any>;
  switch (k.islem) {
    case "giris_hatali":
      return d.neden === "pasif" ? "hesap pasif" : "şifre ya da kullanıcı adı hatalı";
    case "firma_ekle":
      return `${d.firma}${d.soforler?.length ? " · şoför: " + d.soforler.join(", ") : ""}`;
    case "firma_guncelle":
      return `${d.firma} · ${degisiklikMetni(d.degisiklik)}`;
    case "firma_sil":
      return String(d.firma ?? "");
    case "sofor_ekle":
    case "sofor_sil":
      return `${d.firma} · ${d.sofor}${d.plaka ? " (" + d.plaka + ")" : ""}`;
    case "sofor_guncelle":
      return `${d.firma} · ${d.sofor} · ${degisiklikMetni(d.degisiklik)}`;
    case "ice_aktar":
      return `${d.yeniFirma} yeni firma, ${d.yeniSofor} yeni şoför, ${d.firmaGuncelle + d.soforGuncelle} güncelleme`;
    case "disa_aktar":
      return `${d.firma} firma, ${d.satir} satır`;
    case "kullanici_ekle":
      return `${d.hedef} (${rolAdi(d.rol)})`;
    case "kullanici_rol":
      return `${d.hedef} → ${rolAdi(d.rol)}`;
    case "kullanici_aktif":
      return `${d.hedef} → ${d.aktif ? "aktif" : "pasif"}`;
    case "kullanici_sil":
    case "kullanici_sifre":
      return String(d.hedef ?? "");
    case "kullanici_oturum_kapat":
      return `${d.hedef} · ${d.kapatilan ?? 0} oturum`;
    case "ayar_degistir":
      return Object.entries(d)
        .map(([k, v]) => `${AYAR_ETIKET[k] ?? k}: ${(v as any)?.eski ? "açık" : "kapalı"} → ${(v as any)?.yeni ? "açık" : "kapalı"}`)
        .join(", ");
    default:
      return Object.keys(d).length ? JSON.stringify(d) : "";
  }
}
