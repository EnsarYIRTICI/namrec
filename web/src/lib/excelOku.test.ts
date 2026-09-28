import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baslikAlani, excelSatirlari } from "./excelOku";
import { readXlsx } from "./xlsx";

describe("başlık tanıma", () => {
  it("cari.xlsx başlıkları ve yaygın varyasyonlar", () => {
    expect(baslikAlani("Firma")).toBe("firma");
    expect(baslikAlani("Adı Soyadı")).toBe("adSoyad");
    expect(baslikAlani("Şoför TC")).toBe("tc");
    expect(baslikAlani("T.C. No")).toBe("tc");
    expect(baslikAlani("Kimlik No")).toBe("tc");
    expect(baslikAlani("Plaka")).toBe("plaka");
    expect(baslikAlani("Cari")).toBe("cari");
    expect(baslikAlani("Cari Ünvanı")).toBe("cari");
    expect(baslikAlani("Şoför")).toBe("adSoyad");
    expect(baslikAlani("Tel")).toBe("telefon");
    expect(baslikAlani("Durum")).toBeNull();
  });
});

describe("cari.xlsx", () => {
  it("11 firma satırını okur, TC sayı hücresi düz yazılır", () => {
    const buf = fs.readFileSync(path.join(__dirname, "__fixtures__", "cari.xlsx"));
    const r = excelSatirlari(readXlsx(buf));
    expect(r.sayfa).toBe("Firma Listesi");
    expect(r.baslikSatiri).toBe(1);
    expect(r.satirlar).toHaveLength(11);
    expect(r.satirlar[0]).toEqual({
      satir: 2,
      firma: "Şarküteri Depo",
      adSoyad: "Ahmet Yılmaz",
      tc: "62601815965",
      plaka: "34 KL 7218",
      cari: "",
      telefon: "",
    });
    expect(r.satirlar.find((s) => s.firma === "Nestle")?.cari).toBe("AKTIF GRUP TUKETIM URUNLERI DAG. A.Ş. (NESTLE)");
  });

  it("Firma sütunu yoksa anlaşılır hata", () => {
    expect(() => excelSatirlari([{ name: "S", rows: [["Ad", "Soyad"], ["a", "b"]] }])).toThrow(/Firma/);
  });
});
