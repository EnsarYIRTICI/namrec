import { describe, expect, it } from "vitest";
import { katla, normPlaka, normTc, normTelefon, plakaGecerli, plakaGorunum, tcDurum, tcMaske, temizMetin } from "./cari";
import { xlsxYaz } from "./xlsx";
import { unzipSync, strFromU8 } from "fflate";

describe("T.C. kimlik no", () => {
  it("algoritmaya göre doğrular (örnek numaralar uydurmadır)", () => {
    expect(tcDurum("18301661332")).toBe("gecerli");
    expect(tcDurum("84911862582")).toBe("gecerli");
    expect(tcDurum("62601815965")).toBe("gecersiz"); // kontrol hanesi tutmuyor
    expect(tcDurum("11111111110")).toBe("ornek"); // algoritmaya uyar ama yer tutucu
    expect(tcDurum("")).toBe("yok");
    expect(tcDurum("01234567890")).toBe("gecersiz");
  });
  it("rakam dışını atar, maskeler", () => {
    expect(normTc(" 183 016 613 32 ")).toBe("18301661332");
    expect(normTc(18301661332)).toBe("18301661332");
    expect(tcMaske("18301661332")).toBe("183*****332");
  });
});

describe("plaka", () => {
  it("normalleştirir ve biçimler", () => {
    expect(normPlaka("34 lk 8127")).toBe("34LK8127");
    expect(normPlaka("35-btc-708")).toBe("35BTC708");
    expect(normPlaka("16 aip 749")).toBe("16AIP749"); // i → I
    expect(plakaGorunum("34LK8127")).toBe("34 LK 8127");
    expect(plakaGorunum("34DM324")).toBe("34 DM 324");
  });
  it("biçim kuralları", () => {
    for (const p of ["34LK8127", "34A1234", "34DM324", "35BTC708", "34ABC12", "01AB123", "81AB1234"]) expect(plakaGecerli(p), p).toBe(true);
    for (const p of ["16ABCD123", "00AB123", "82AB123", "34A123", "34ABC1234", "34AB12", "ABC", ""]) expect(plakaGecerli(p), p).toBe(false);
  });
});

describe("metin", () => {
  it("katla Türkçe harf duyarsız", () => {
    expect(katla("İçim (Seher Gıda)")).toBe(katla("içim  (seher gıda)"));
    expect(katla("Şenpiliç")).toBe(katla("ŞENPİLİÇ"));
    expect(katla("Torku")).not.toBe(katla("Torka"));
  });
  it("temizMetin boşlukları toplar, kontrol karakterini atar", () => {
    expect(temizMetin("  Ayşe \t yılmaz\n")).toBe("Ayşe yılmaz");
    expect(temizMetin(null)).toBe("");
  });
  it("telefon", () => {
    expect(normTelefon("0 (532) 111 22 33")).toBe("05321112233");
    expect(normTelefon("+90 532 111 22 33")).toBe("05321112233");
    expect(normTelefon("5321112233")).toBe("05321112233");
  });
});

describe("xlsx yazıcı", () => {
  it("geçerli zip, metin hücreleri, XML kaçışı", () => {
    const buf = xlsxYaz("Firma Listesi", ["Firma", "TC"], [["A & B <x>", "01234567890"]]);
    const files = unzipSync(buf);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain("A &amp; B &lt;x&gt;");
    expect(sheet).toContain(">01234567890<");
    expect(sheet).toContain('t="inlineStr"');
    expect(Object.keys(files)).toContain("[Content_Types].xml");
  });
});
