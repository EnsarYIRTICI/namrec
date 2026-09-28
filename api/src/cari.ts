/**
 * Firma / şoför alanlarının doğrulama ve biçimlendirme yardımcıları.
 * Arayüz bu hesapları kendisi yapmaz; API her kayıtla birlikte hazır sonucu döner (tcDurum, plakaGorunum ...).
 */

/** Türkçe büyük harf (i→İ, ı→I). */
export function trUpper(s: string): string {
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toLocaleUpperCase("tr-TR");
}

/** Karşılaştırma anahtarı: Türkçe büyük/küçük harf duyarsız, fazla boşluklar tek boşluk (DB'deki tr_fold ile uyumlu). */
export function katla(s: string): string {
  return trUpper(s.trim().replace(/\s+/g, " ")).replace(/İ/g, "I").replace(/[ÂÎÛ]/g, (c) => ({ Â: "A", Î: "I", Û: "U" })[c]!);
}

/** Metin alanı: baştaki/sondaki boşluk atılır, içteki birden çok boşluk teke iner, kontrol karakterleri silinir. */
export function temizMetin(s: unknown, max = 200): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ---------- T.C. kimlik no ----------

export type TcDurum = "yok" | "gecerli" | "gecersiz" | "ornek";

/** Rakam dışını atar ("123 456 789 01" → "12345678901"). Excel'den sayı olarak gelen değer de olduğu gibi çalışır. */
export function normTc(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

/** Resmi algoritma: 11 hane, ilk hane 0 değil, 10. ve 11. haneler kontrol hanesi. */
export function tcAlgoritmaGecerli(tc: string): boolean {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = [...tc].map(Number);
  const tek = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const cift = d[1]! + d[3]! + d[5]! + d[7]!;
  const h10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const h11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return h10 === d[9] && h11 === d[10];
}

/**
 * "ornek": algoritmaya uyan ama gerçek olmayan yer tutucu (11111111110 gibi, ilk 10 hane aynı rakam).
 * Kayıtta bilgi eksik olduğunu gösterir.
 */
export function tcDurum(tc: string): TcDurum {
  if (!tc) return "yok";
  if (/^(\d)\1{9}\d$/.test(tc)) return "ornek";
  return tcAlgoritmaGecerli(tc) ? "gecerli" : "gecersiz";
}

/** Kayda girilebilir mi: boş ya da tam 11 hane. Algoritma hatası engel değildir, uyarı olarak gösterilir. */
export function tcHata(tc: string): string | null {
  if (tc === "" || /^\d{11}$/.test(tc)) return null;
  return "T.C. kimlik no 11 haneli olmalı.";
}

// ---------- Plaka ----------

/** Boşluksuz büyük harf: "34 lk 8127" → "34LK8127". */
export function normPlaka(s: unknown): string {
  return trUpper(String(s ?? "")).replace(/İ/g, "I").replace(/[^A-Z0-9]/g, "");
}

const PLAKA_RE = /^(\d{2})([A-Z]{1,3})(\d{2,4})$/;

/**
 * Türkiye plaka biçimi: il kodu (01-81) + 1-3 harf + 2-4 rakam, toplam en az 7 karakter
 * (harf sayısına göre rakam sayısı değişir: 1 harf → 4 rakam, 2 harf → 3-4, 3 harf → 2-3).
 */
export function plakaGecerli(p: string): boolean {
  const m = PLAKA_RE.exec(p);
  if (!m) return false;
  const il = Number(m[1]);
  if (il < 1 || il > 81) return false;
  const h = m[2]!.length;
  const r = m[3]!.length;
  if (h === 1) return r === 4;
  if (h === 2) return r === 3 || r === 4;
  return r === 2 || r === 3;
}

/** Görünüm: "34LK8127" → "34 LK 8127". Biçime uymayan plaka olduğu gibi döner. */
export function plakaGorunum(p: string): string {
  const m = PLAKA_RE.exec(p);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

// ---------- Telefon ----------

/** Rakam dışını atar, başta +90 / 90 / 0 varsa tek biçime getirir: "0 (532) 111 22 33" → "05321112233". */
export function normTelefon(s: unknown): string {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("5")) d = "0" + d;
  return d.slice(0, 15);
}

/** KVKK: işlem kaydında ve dışa aktarma dışındaki yerlerde TC'nin ortası gizlenir: 634*****260 */
export function tcMaske(tc: string): string {
  return tc.length === 11 ? tc.slice(0, 3) + "*****" + tc.slice(8) : tc;
}
