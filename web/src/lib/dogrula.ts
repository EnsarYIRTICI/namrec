/**
 * Formda anında uyarı göstermek için (api/src/cari.ts ile aynı kurallar). Asıl doğrulama sunucudadır;
 * kayıtlı veride gösterilen işaretler (tcDurum, plakaGecerli) API'den gelir.
 */
import { sade } from "./tr";
import type { TcDurum } from "./types";

export function tcDurum(tc: string): TcDurum {
  if (!tc) return "yok";
  if (!/^[1-9]\d{10}$/.test(tc)) return "gecersiz";
  if (/^(\d)\1{9}\d$/.test(tc)) return "ornek";
  const d = [...tc].map(Number);
  const h10 = ((((d[0]! + d[2]! + d[4]! + d[6]! + d[8]!) * 7 - (d[1]! + d[3]! + d[5]! + d[7]!)) % 10) + 10) % 10;
  const h11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return h10 === d[9] && h11 === d[10] ? "gecerli" : "gecersiz";
}

export function plakaGecerli(p: string): boolean {
  const m = /^(\d{2})([A-Z]{1,3})(\d{2,4})$/.exec(sade(p));
  if (!m) return false;
  const il = Number(m[1]);
  if (il < 1 || il > 81) return false;
  const h = m[2]!.length;
  const r = m[3]!.length;
  return h === 1 ? r === 4 : h === 2 ? r === 3 || r === 4 : r === 2 || r === 3;
}

export const TC_UYARI: Record<TcDurum, { metin: string; renk: "kirmizi" | "sari" | "gri" } | null> = {
  gecerli: null,
  yok: { metin: "TC yok", renk: "gri" },
  ornek: { metin: "TC gerçek değil", renk: "sari" },
  gecersiz: { metin: "TC hatalı", renk: "kirmizi" },
};
