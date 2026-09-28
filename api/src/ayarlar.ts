import type { Pool } from "pg";
import { z } from "zod";

/**
 * Yönetim panelinden değiştirilebilen ayarlar. Veritabanında olmayan anahtar varsayılan değeri kullanır.
 * Yeni ayar: buraya alan + varsayılan ekleyin, arayüzde web/src/components/yonetim/AyarlarSekmesi.tsx.
 */
export const ayarSchema = z.object({
  /** Personel firma/şoför ekleyip düzenleyebilir, şoför silebilir. Kapalıysa sadece görür. */
  personelDuzenleyebilir: z.boolean(),
  /** Personel T.C. kimlik numarasını tam görebilir. Kapalıysa ortası gizli gösterilir (634*****260). */
  personelTcGorebilir: z.boolean(),
});

export type Ayarlar = z.infer<typeof ayarSchema>;

export const VARSAYILAN_AYARLAR: Ayarlar = {
  personelDuzenleyebilir: true,
  personelTcGorebilir: true,
};

/** Kısmi güncelleme şeması: bilinmeyen anahtar reddedilir. */
export const ayarGuncelleSchema = ayarSchema.partial().strict();

export async function ayarlariOku(pool: Pool): Promise<Ayarlar> {
  const rows = (await pool.query("SELECT anahtar, deger FROM ayarlar")).rows as { anahtar: string; deger: unknown }[];
  const out: Ayarlar = { ...VARSAYILAN_AYARLAR };
  for (const r of rows) {
    const alan = ayarSchema.shape[r.anahtar as keyof Ayarlar];
    if (!alan) continue; // artık kullanılmayan eski anahtar
    const v = alan.safeParse(r.deger);
    if (v.success) (out as Record<string, unknown>)[r.anahtar] = v.data;
  }
  return out;
}

/** Birleşik (mevcut + yeni) ayarların tutarlılığı. Hata mesajı ya da null. */
export function ayarTutarlilik(_a: Ayarlar): string | null {
  return null;
}
