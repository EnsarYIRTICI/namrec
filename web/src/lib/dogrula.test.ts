import { describe, expect, it } from "vitest";
import { plakaGecerli, tcDurum } from "./dogrula";

describe("form doğrulama (API ile aynı sonuç)", () => {
  it("TC", () => {
    expect(tcDurum("18301661332")).toBe("gecerli");
    expect(tcDurum("62601815965")).toBe("gecersiz");
    expect(tcDurum("11111111110")).toBe("ornek");
    expect(tcDurum("1709540392")).toBe("gecersiz");
    expect(tcDurum("")).toBe("yok");
  });
  it("plaka", () => {
    expect(plakaGecerli("34 lk 8127")).toBe(true);
    expect(plakaGecerli("16 ABCD123")).toBe(false);
    expect(plakaGecerli("35 BC 807")).toBe(true);
    expect(plakaGecerli("16 aip 749")).toBe(true);
  });
});
