import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, startHarness } from "./test/harness";

const DB = process.env.TEST_DATABASE_URL;
const SIFRE = "personel-sifre-123";

/** cari.xlsx biçiminde uydurma satırlar (arayüzün Excel'den okuyup gönderdiği biçim). TC'ler gerçek değildir. */
const CARI = [
  { satir: 2, firma: "Şarküteri Depo", adSoyad: "Ahmet Yılmaz", tc: "62601815965", plaka: "34 KL 7218", cari: "" },
  { satir: 3, firma: "Sütaş", adSoyad: "Mehmet Kaya", tc: "18301661332", plaka: "16 ABCD123", cari: "" },
  { satir: 4, firma: "Eker", adSoyad: "Ali Demir", tc: "11111111110", plaka: "16 AB 749", cari: "" },
  { satir: 5, firma: "Torku", adSoyad: "Mustafa Öztürk", tc: "11111111110", plaka: "35 BC 807", cari: "" },
  { satir: 6, firma: "İçim (Seher Gıda)", adSoyad: "Hüseyin Şahin", tc: "70308246202", plaka: "34 MJ 2020", cari: "SEHER GIDA PAZ. SAN.VE TİC. AŞ-YOGURT PEYNIR" },
  { satir: 7, firma: "UNO", adSoyad: "Osman Aydın", tc: 45181909322, plaka: "34 MK 689", cari: "UNMAS" },
];

describe.skipIf(!DB)("firmalar ve şoförler", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness(DB!);
  });
  afterAll(async () => {
    await h?.close();
  });

  async function personel(username: string) {
    expect((await h.call("POST", "/admin/kullanicilar", { username, password: SIFRE, rol: "personel" })).status).toBe(201);
    return h.loginAs(username, SIFRE);
  }

  describe("Excel içe aktarma", () => {
    it("önizleme hiçbir şey yazmaz, uyarıları döner", async () => {
      const r = await h.call("POST", "/ice-aktar", { satirlar: CARI });
      expect(r.status).toBe(200);
      expect(r.data.uygulandi).toBe(false);
      expect(r.data.yeniFirma).toHaveLength(6);
      expect(r.data.yeniSofor).toHaveLength(6);
      expect(r.data.hatalar).toEqual([]);
      const u = r.data.uyarilar.map((x: { mesaj: string }) => x.mesaj).join("\n");
      expect(u).toContain("Ahmet Yılmaz: T.C. kimlik no doğrulanamadı");
      expect(u).toContain("Ali Demir: T.C. kimlik no gerçek değil");
      expect(u).toContain("plaka biçimi olağandışı (16ABCD123)");
      expect((await h.call("GET", "/firmalar")).data.firmalar).toHaveLength(0);
    });

    it("uygular; ikinci kez aynı dosya değişiklik yapmaz", async () => {
      const r = await h.call("POST", "/ice-aktar", { satirlar: CARI, uygula: true });
      expect(r.status).toBe(200);
      expect(r.data.uygulandi).toBe(true);
      const f = (await h.call("GET", "/firmalar")).data.firmalar;
      expect(f).toHaveLength(6);
      const uno = f.find((x: any) => x.ad === "UNO");
      expect(uno.cari).toBe("UNMAS");
      expect(uno.soforler[0]).toMatchObject({ adSoyad: "Osman Aydın", tc: "45181909322", tcDurum: "gecerli", plaka: "34MK689", plakaGorunum: "34 MK 689", plakaGecerli: true });
      const r2 = await h.call("POST", "/ice-aktar", { satirlar: CARI });
      expect(r2.data.yeniFirma.length + r2.data.yeniSofor.length + r2.data.soforGuncelle.length + r2.data.firmaGuncelle.length).toBe(0);
      expect(r2.data.degismeyen).toBe(6);
    });

    it("harf farkıyla eşleşir, dolu alanı günceller, boş alan mevcut değeri silmez", async () => {
      const r = await h.call("POST", "/ice-aktar", {
        satirlar: [
          { satir: 2, firma: "uno", adSoyad: "osman aydın", tc: "", plaka: "34 mk 987", cari: "" },
          { satir: 3, firma: "Yeni Firma", adSoyad: "", tc: "", plaka: "", cari: "YENI CARI" },
        ],
        uygula: true,
      });
      expect(r.status).toBe(200);
      expect(r.data.soforGuncelle).toEqual([
        { firma: "UNO", adSoyad: "Osman Aydın", degisiklik: { plaka: { eski: "34 MK 689", yeni: "34 MK 987" } } },
      ]);
      expect(r.data.yeniFirma).toEqual([{ ad: "Yeni Firma", cari: "YENI CARI" }]);
      const uno = (await h.call("GET", "/firmalar")).data.firmalar.find((x: any) => x.ad === "UNO");
      expect(uno.soforler[0].tc).toBe("45181909322");
      expect(uno.cari).toBe("UNMAS");
    });

    it("hatalı satır varsa hiçbir şey yazılmaz", async () => {
      const r = await h.call("POST", "/ice-aktar", {
        satirlar: [
          { satir: 2, firma: "Hatasız Firma", adSoyad: "Ali Veli", tc: "", plaka: "", cari: "" },
          { satir: 3, firma: "Hatalı", adSoyad: "Ayşe", tc: "12345", plaka: "", cari: "" },
          { satir: 4, firma: "", adSoyad: "Sahipsiz", tc: "", plaka: "", cari: "" },
          { satir: 5, firma: "Hatasız Firma", adSoyad: "ali veli", tc: "", plaka: "", cari: "" },
          { satir: 6, firma: "", adSoyad: "", tc: "", plaka: "", cari: "" },
        ],
        uygula: true,
      });
      expect(r.status).toBe(400);
      expect(r.data.hatalar.map((x: any) => x.satir)).toEqual([3, 4, 5]);
      expect(r.data.bosSatir).toBe(1);
      const f = (await h.call("GET", "/firmalar")).data.firmalar;
      expect(f.find((x: any) => x.ad === "Hatasız Firma")).toBeUndefined();
    });
  });

  describe("elle düzenleme", () => {
    let firmaId: number;
    it("firma ilk şoförüyle eklenir; aynı ad (harf farkıyla) reddedilir", async () => {
      const r = await h.call("POST", "/firmalar", {
        ad: "  Pınar  ",
        cari: "PINAR SUT",
        soforler: [{ adSoyad: "Hasan Çelik", tc: "28609139020", plaka: "34 fad 712", telefon: "0532 111 22 33" }],
      });
      expect(r.status).toBe(201);
      firmaId = r.data.id;
      expect(r.data).toMatchObject({ ad: "Pınar", cari: "PINAR SUT", guncelleyen: "tester" });
      expect(r.data.soforler[0]).toMatchObject({ plaka: "34FAD712", telefon: "05321112233", tcDurum: "gecerli" });
      expect((await h.call("POST", "/firmalar", { ad: "PINAR" })).status).toBe(409);
      expect((await h.call("POST", "/firmalar", { ad: "   " })).status).toBe(400);
    });

    it("şoför ekle / güncelle / sil; TC 11 hane değilse reddedilir", async () => {
      expect((await h.call("POST", `/firmalar/${firmaId}/soforler`, { adSoyad: "Yedek", tc: "123" })).status).toBe(400);
      const r = await h.call("POST", `/firmalar/${firmaId}/soforler`, { adSoyad: "Yedek Şoför", plaka: "34 ab 1234" });
      expect(r.status).toBe(201);
      const yedek = r.data.soforler.find((s: any) => s.adSoyad === "Yedek Şoför");
      expect((await h.call("POST", `/firmalar/${firmaId}/soforler`, { adSoyad: "yedek şoför" })).status).toBe(409);
      const g = await h.call("PATCH", `/soforler/${yedek.id}`, { plaka: "34AB1235", tc: "91948219968" });
      expect(g.status).toBe(200);
      expect(g.data.soforler.find((s: any) => s.id === yedek.id)).toMatchObject({ plakaGorunum: "34 AB 1235", tcDurum: "gecerli" });
      const s = await h.call("DELETE", `/soforler/${yedek.id}`);
      expect(s.status).toBe(200);
      expect(s.data.soforler).toHaveLength(1);
    });

    it("işlem kaydına yazılır, TC gizlenir", async () => {
      const k = (await h.call("GET", "/admin/islemler?islem=sofor_guncelle")).data.items[0];
      expect(k.detay.degisiklik.tc).toEqual({ eski: "", yeni: "919*****968" });
      expect(k.detay.degisiklik.plaka).toEqual({ eski: "34 AB 1234", yeni: "34 AB 1235" });
      const islemler = (await h.call("GET", "/admin/islemler")).data.items.map((x: any) => x.islem);
      for (const i of ["firma_ekle", "sofor_ekle", "sofor_sil", "ice_aktar"]) expect(islemler).toContain(i);
    });

    it("pasif yapılabilir; ad değişince benzersizlik korunur", async () => {
      const r = await h.call("PATCH", `/firmalar/${firmaId}`, { aktif: false, notlar: "Artık gelmiyor" });
      expect(r.data).toMatchObject({ aktif: false, notlar: "Artık gelmiyor" });
      expect((await h.call("PATCH", `/firmalar/${firmaId}`, { ad: "uno" })).status).toBe(409);
      expect((await h.call("PATCH", `/firmalar/${firmaId}`, { bilinmeyen: 1 })).status).toBe(400);
      expect((await h.call("PATCH", `/firmalar/999999`, { notlar: "x" })).status).toBe(404);
    });
  });

  describe("personel yetkileri", () => {
    let p: Awaited<ReturnType<Harness["loginAs"]>>;
    beforeAll(async () => {
      p = await personel("depo1");
    });

    it("varsayılan: görür ve düzenler; firma silemez, içe/dışa aktaramaz", async () => {
      const me = (await p("GET", "/me")).data;
      expect(me.yetki).toEqual({ duzenle: true, tcGor: true });
      const r = await p("POST", "/firmalar", { ad: "Danone", soforler: [{ adSoyad: "İbrahim Yıldız", tc: "91948219968" }] });
      expect(r.status).toBe(201);
      expect((await p("DELETE", `/firmalar/${r.data.id}`)).status).toBe(403);
      expect((await p("POST", "/ice-aktar", { satirlar: CARI })).status).toBe(403);
      expect((await p("GET", "/disa-aktar.xlsx")).status).toBe(403);
      expect((await h.call("DELETE", `/firmalar/${r.data.id}`)).status).toBe(200);
    });

    it("ayar kapalıysa: TC gizli gelir, düzenleyemez", async () => {
      expect((await h.call("PUT", "/admin/ayarlar", { personelDuzenleyebilir: false, personelTcGorebilir: false })).status).toBe(200);
      const f = (await p("GET", "/firmalar")).data;
      expect(f.yetki).toEqual({ duzenle: false, tcGor: false });
      const uno = f.firmalar.find((x: any) => x.ad === "UNO");
      expect(uno.soforler[0].tc).toBe("451*****322");
      expect(uno.soforler[0].tcDurum).toBe("gecerli");
      expect((await p("POST", "/firmalar", { ad: "Yasak" })).status).toBe(403);
      expect((await p("PATCH", `/soforler/${uno.soforler[0].id}`, { plaka: "34AB123" })).status).toBe(403);
    });

    it("sadece TC gizliyken düzenleyebilir ama TC gönderemez", async () => {
      await h.call("PUT", "/admin/ayarlar", { personelDuzenleyebilir: true });
      const uno = (await p("GET", "/firmalar")).data.firmalar.find((x: any) => x.ad === "UNO");
      const sid = uno.soforler[0].id;
      expect((await p("PATCH", `/soforler/${sid}`, { tc: "91948219968" })).status).toBe(403);
      const r = await p("PATCH", `/soforler/${sid}`, { telefon: "05320000000" });
      expect(r.status).toBe(200);
      expect(r.data.soforler[0].tc).toBe("451*****322");
      // TC'si değişmemiş olmalı
      const tam = (await h.call("GET", "/firmalar")).data.firmalar.find((x: any) => x.ad === "UNO");
      expect(tam.soforler[0].tc).toBe("45181909322");
    });
  });

  it("dışa aktarma xlsx döner ve kaydedilir", async () => {
    const r = await fetch(h.base + "/disa-aktar.xlsx", { headers: { cookie: await h.login("tester", "test-sifresi-123") } });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
    const b = new Uint8Array(await r.arrayBuffer());
    expect(b[0]).toBe(0x50);
    expect((await h.call("GET", "/admin/islemler?islem=disa_aktar")).data.items).toHaveLength(1);
  });

  it("oturumsuz erişim yok", async () => {
    expect((await fetch(h.base + "/firmalar")).status).toBe(401);
  });
});
