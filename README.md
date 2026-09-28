# Namrec v1.0 — Cari / firma-şoför kayıtları

Mal getiren firmaların, şoförlerinin (ad soyad, T.C. kimlik no, plaka, telefon) ve muhasebedeki **cari** hesap adlarının tutulduğu panel. Eskiden `cari.xlsx` dosyasında tutulan liste artık burada; herkes aynı güncel listeyi görür, kim neyi ne zaman değiştirdi kayıtlıdır.

**Yığın:** Next.js 16 + TypeScript + Tailwind CSS 4 (arayüz) · Express 5 + TypeScript (API) · PostgreSQL 17 · Docker Compose. Nginx compose dışında, host'ta çalışır. Giriş, roller, işlem kaydı ve yönetim paneli **namtag** ile aynı altyapıdır.

```
tarayıcı → host nginx ─┬─ /api/ → api (127.0.0.1:4200) → postgres (iç ağ)
                       └─ /     → web (127.0.0.1:3200)
```

Portlar namtag (3000/4000) ve naman (3100/4100) ile çakışmaz; üçü aynı sunucuda çalışabilir.

## Kurulum

```bash
cp .env.example .env      # CHANGE_ME olanları doldurun, APP_ORIGIN'i kendi adresinize ayarlayın
docker compose up -d --build
docker compose logs -f api
```

`nginx/namrec.conf` dosyasını host nginx'e ekleyin (alan adını kontrol edin), `nginx -t && systemctl reload nginx`, ardından `certbot --nginx -d namrec.xenny.cloud`. **HTTPS'siz internete açmayın** (T.C. kimlik numaraları var). Kopyala düğmeleri de tarayıcıda yalnızca HTTPS'te tam çalışır.

İlk kullanıcı `.env`'deki `ADMIN_USERNAME` / `ADMIN_PASSWORD` ile, hiç kullanıcı yokken ilk açılışta **yönetici** olarak oluşur (sonra `ADMIN_PASSWORD` satırını silin).

### Mevcut cari.xlsx'i yükleme

Yönetim → **Excel** → dosyayı seçin. Önce ne ekleneceği/güncelleneceği ve uyarılar gösterilir, **Onayla ve aktar** demeden hiçbir şey yazılmaz.

## Ana sayfa (cari listesi)

- **Arama:** firma, şoför adı, plaka, TC, telefon, cari ve notlarda arar. Türkçe harf ve büyük/küçük harf duyarsız; plaka boşluklu ya da boşluksuz yazılabilir (`34lk8127`, `34 LK`). `/` tuşu arama kutusuna gider, `Esc` temizler. Aramada pasif firmalar da bulunur.
- **Filtreler:** Aktif · Eksik/hatalı · Pasif · Tümü. "Eksik/hatalı": TC'si hatalı ya da yer tutucu (`11111111110`), plakası olağandışı, aynı plaka/TC başka kayıtta da geçen ya da hiç şoförü olmayan firmalar.
- **Kopyala:** cari adı, plaka ve TC yanındaki ⧉ ile tek dokunuşta kopyalanır. TC ekranda ortası gizli durur (`634•••••260`), üstüne dokununca açılır; kopyala her zaman tam numarayı kopyalar.
- **Düzenleme:** firma (ad, cari, not, pasif) ve şoför (ad soyad, TC, plaka, telefon, not) pencereden düzenlenir. Bir firmanın birden fazla şoförü olabilir. Artık gelmeyen firma **pasif** yapılır (silinmez, listede gizlenir).
- **Doğrulama:** TC 11 hane değilse kaydedilmez. Resmi kontrol hanesi tutmayan TC ve Türkiye plaka biçimine uymayan plaka **kaydedilir ama işaretlenir** (yanlış yazım olabilir, ama elinizdeki tek bilgi de olabilir). Plaka boşluksuz saklanır, `34 LK 8127` biçiminde gösterilir.
- Sayfa, sekmeye geri dönüldüğünde listeyi sunucudan tazeler (başka cihazdaki değişiklikler görünür).

## Roller ve yönetim paneli

| | Yönetici | Personel |
|---|:---:|:---:|
| Listeyi görme, arama, kopyalama | ✓ | ✓ |
| Firma/şoför ekleme, düzenleme, şoför silme | ✓ | Ayara bağlı (varsayılan açık) |
| TC'yi tam görme / girme | ✓ | Ayara bağlı (varsayılan açık) |
| Firma silme | ✓ | |
| Excel içe / dışa aktarma | ✓ | |
| Yönetim paneli (`/yonetim`) | ✓ | |

Yönetim paneli:

- **Kullanıcılar:** ekle, rol değiştir, pasifleştir, şifre sıfırla, oturumları kapat, sil (namtag ile aynı; en az bir aktif yönetici kalır).
- **İşlem kaydı:** giriş/çıkış, firma/şoför ekleme-düzenleme-silme (**eski → yeni** değerleriyle), Excel içe/dışa aktarma, kullanıcı ve ayar değişiklikleri. TC kayıtta gizli tutulur (`177*****838`). Kayıtlar 1 yıl saklanır. Görüntüleme ve arama kaydedilmez.
- **Excel:**
  - *İçe aktar:* ilk satırda `Firma`, `Adı Soyadı`, `Şoför TC`, `Plaka`, `Cari` (isteğe bağlı `Telefon`) başlıkları olan .xlsx. Başlıkların küçük farkları tanınır (`TC No`, `Kimlik`, `Şoför`, `Cari Ünvanı`, `Tel` ...); tanınmayan sütunlar yok sayılır. Firma ve şoför adı harf farkı gözetmeden eşleşir. Olmayan eklenir; olanın dosyada **dolu** alanları güncellenir; dosyada boş alan mevcut bilgiyi **silmez**; **hiçbir kayıt silinmez**. Hatalı satır (firma adı boş, TC 11 hane değil, aynı şoför iki kez) varsa hiçbir şey yazılmaz. Eski `.xls` okunmaz (Excel'de "Farklı Kaydet → .xlsx").
  - *Dışa aktar:* tüm liste tek sayfa .xlsx olarak iner (TC metin hücresi olarak, Excel `6,35E+10`'a çevirmez). Aynı dosya düzenlenip geri yüklenebilir.
- **Ayarlar:** "Personel firma ve şoför düzenleyebilir", "Personel T.C. kimlik noyu tam görebilir". İkincisi kapalıyken personele TC maskeli gelir (sunucu tarafında; tarayıcıya tam numara hiç gitmez), personel TC'yi kopyalayamaz ve değiştiremez.

## Komut satırından kullanıcı yönetimi

```bash
docker compose exec api node dist/cli.js user add <kullanici> [--yonetici]   # şifre ekranda görünmez; varsayılan personel
docker compose exec api node dist/cli.js user role <kullanici> <yonetici|personel>
docker compose exec api node dist/cli.js user passwd <kullanici>   # açık oturumlar kapanır
docker compose exec api node dist/cli.js user delete <kullanici>
docker compose exec api node dist/cli.js user list
```

## Yedek

```bash
docker compose exec -T db pg_dump -U namrec namrec | gzip > namrec-db-$(date +%F).sql.gz
```

Ek olarak Yönetim → Excel → "Excel dosyasını indir" okunabilir bir yedek verir (kullanıcılar ve işlem kaydı hariç).

## Geliştirme

```bash
cd api && npm i && DATABASE_URL=postgres://... APP_ORIGIN=http://localhost:3200 ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run dev   # 4200
cd web && npm i && npm run dev        # 3200; /api istekleri localhost:4200'e yönlenir
npm test                              # hem api/ hem web/ içinde
```

`api/` içindeki veritabanı testleri `TEST_DATABASE_URL` yoksa atlanır. Çalıştırmak için:

```bash
cd api && npm run test:db             # Docker ile geçici PostgreSQL 17 açar, testlerden sonra siler
# ya da: TEST_DATABASE_URL=postgres://kullanici:sifre@localhost:5432/veritabani npm test
```

## Notlar

- **KVKK:** T.C. kimlik no kişisel veridir. Sayfa kabuğu herkese açıktır ama veri oturum olmadan API'den dönmez. Arama motorlarına kapalıdır (`robots.txt`, `noindex`). TC ekranda varsayılan olarak maskelidir; işlem kaydında hep maskelidir. Dışa aktarma işlem kaydına yazılır ve yalnızca yöneticiye açıktır. İhtiyaç yoksa personelin TC görmesini kapatın.
- Şifreler scrypt ile hash'lenir, oturum belirteçleri veritabanında yalnızca SHA-256 özeti olarak tutulur. Çerez: HttpOnly, SameSite=Strict, HTTPS'te Secure. Hatalı girişte hız sınırı (IP başına 15 dk'da 8). Durum değiştiren isteklerde Origin kontrolü yapılır.
- TC doğrulaması resmi algoritmadır (10. ve 11. hane kontrolü); numaranın gerçekten o kişiye ait olduğunu doğrulamaz.
- Renkler `web/src/app/globals.css` başındaki `@theme` bloğundadır (vurgu rengi deniz yeşili; namtag'den ayırt edilsin diye).
