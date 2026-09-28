export type Rol = "yonetici" | "personel";
export type TcDurum = "yok" | "gecerli" | "gecersiz" | "ornek";

export interface Yetki {
  /** Firma/şoför ekleyip düzenleyebilir */
  duzenle: boolean;
  /** T.C. kimlik noyu tam görür (değilse ortası gizli gelir: 634*****260) */
  tcGor: boolean;
}

export interface Me {
  username: string;
  rol: Rol;
  yetki: Yetki;
  version: string;
  commit: string;
  startedAt: string;
}

export interface Sofor {
  id: number;
  firmaId: number;
  adSoyad: string;
  tc: string;
  tcDurum: TcDurum;
  /** Boşluksuz: "34LK8127" */
  plaka: string;
  /** "34 LK 8127" */
  plakaGorunum: string;
  plakaGecerli: boolean;
  telefon: string;
  notlar: string;
  guncelleme: string;
  guncelleyen: string | null;
}

export interface Firma {
  id: number;
  ad: string;
  cari: string;
  notlar: string;
  aktif: boolean;
  olusturma: string;
  guncelleme: string;
  guncelleyen: string | null;
  soforler: Sofor[];
}

/** Yönetim panelinden değiştirilebilen ayarlar (api/src/ayarlar.ts ile aynı) */
export interface Ayarlar {
  personelDuzenleyebilir: boolean;
  personelTcGorebilir: boolean;
}

export interface Kullanici {
  username: string;
  rol: Rol;
  aktif: boolean;
  createdAt: string;
  sonGiris: string | null;
  acikOturum: number;
}

export interface IslemKaydi {
  id: string;
  zaman: string;
  kullanici: string | null;
  islem: string;
  detay: Record<string, unknown>;
  ip: string | null;
}

type Deg = Record<string, { eski: string; yeni: string }>;

/** Excel içe aktarma önizlemesi / sonucu (api/src/routes/iceAktar.ts) */
export interface IceAktarSonuc {
  yeniFirma: { ad: string; cari: string }[];
  firmaGuncelle: { ad: string; degisiklik: Deg }[];
  yeniSofor: { firma: string; adSoyad: string; tc: string; plaka: string }[];
  soforGuncelle: { firma: string; adSoyad: string; degisiklik: Deg }[];
  degismeyen: number;
  bosSatir: number;
  hatalar: { satir: number; mesaj: string }[];
  uyarilar: { satir: number; mesaj: string }[];
  uygulandi: boolean;
}
