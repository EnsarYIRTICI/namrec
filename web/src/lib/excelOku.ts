import { katla } from "./tr";
import type { Sheet } from "./xlsx";

export type Alan = "firma" | "adSoyad" | "tc" | "plaka" | "cari" | "telefon";

export const ALAN_ADI: Record<Alan, string> = {
  firma: "Firma",
  adSoyad: "Adı Soyadı",
  tc: "Şoför TC",
  plaka: "Plaka",
  cari: "Cari",
  telefon: "Telefon",
};

/**
 * Başlık hücresinin hangi alana karşılık geldiği. Sıra önemli: "Şoför TC" hem şoför hem TC içerir, önce TC denenir.
 * Tanınan örnekler: Firma / Tedarikçi, Adı Soyadı / Şoför / Sürücü, Şoför TC / TC No / Kimlik, Plaka, Cari / Cari Ünvan, Telefon / Tel / GSM.
 */
export function baslikAlani(hucre: string): Alan | null {
  const h = katla(hucre).replace(/[.\-_/()]/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return null;
  if (/(^| )(TC|T C)( |$)|KIMLIK/.test(h)) return "tc";
  if (h.includes("PLAKA")) return "plaka";
  if (h.startsWith("CARI")) return "cari";
  if (/^(TEL|GSM|CEP)/.test(h)) return "telefon";
  if (/^(FIRMA|TEDARIK)/.test(h)) return "firma";
  if (/^(AD|ŞOFÖR|SOFOR|SÜRÜCÜ|SURUCU)/.test(h)) return "adSoyad";
  return null;
}

export interface OkunanSatir {
  satir: number;
  firma: string;
  adSoyad: string;
  tc: string;
  plaka: string;
  cari: string;
  telefon: string;
}

export interface OkumaSonucu {
  sayfa: string;
  baslikSatiri: number;
  sutunlar: Partial<Record<Alan, string>>;
  satirlar: OkunanSatir[];
}

/**
 * Sayfalar arasında "Firma" başlığı olan ilk tabloyu bulur (ilk 10 satıra bakar), satırları alanlara çevirir.
 * Tanınmayan sütunlar (Durum, notlar vb.) yok sayılır.
 */
export function excelSatirlari(sheets: Sheet[]): OkumaSonucu {
  for (const sh of sheets) {
    for (let i = 0; i < Math.min(sh.rows.length, 10); i++) {
      const idx: Partial<Record<Alan, number>> = {};
      const sutunlar: Partial<Record<Alan, string>> = {};
      (sh.rows[i] ?? []).forEach((c, j) => {
        const a = baslikAlani(c);
        if (a && idx[a] === undefined) {
          idx[a] = j;
          sutunlar[a] = c.trim();
        }
      });
      if (idx.firma === undefined) continue;
      const al = (row: string[], a: Alan) => (idx[a] === undefined ? "" : (row[idx[a]!] ?? "").trim());
      const satirlar: OkunanSatir[] = [];
      for (let r = i + 1; r < sh.rows.length; r++) {
        const row = sh.rows[r] ?? [];
        const s: OkunanSatir = {
          satir: r + 1,
          firma: al(row, "firma"),
          adSoyad: al(row, "adSoyad"),
          tc: al(row, "tc"),
          plaka: al(row, "plaka"),
          cari: al(row, "cari"),
          telefon: al(row, "telefon"),
        };
        if (Object.values(s).some((v) => typeof v === "string" && v !== "")) satirlar.push(s);
      }
      return { sayfa: sh.name, baslikSatiri: i + 1, sutunlar, satirlar };
    }
  }
  throw new Error('Dosyada "Firma" başlıklı bir sütun bulunamadı. İlk satırda Firma, Adı Soyadı, Şoför TC, Plaka, Cari başlıkları olmalı.');
}
