# Ortaklık: kisiler

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Sütunlar `npm run harita -- --modul kisiler` çıktısından (DOĞRULANDI, `9b6582f`).

## Tablolar

| Tablo | Sütunlar | Sahibi |
|---|---|---|
| `kisi` | id, ad, aktif, kullanici_adi?, parola_ozeti?, olusturuldu, sicil_no?, gorev?, oturumlar_gecersiz_once?, ozluk_ik, ozluk_cikis_tarihi? | kisiler (ad, sicil no, görev ve çıkış İK'ya bağlı kişide İK'nın, 1302 a) |
| `kisi_rolu` | kisi_id -> kisi, rol_id -> rol | kisiler |
| `rol` | id, kod, ad, yerlesik, yonetici | kisiler (K2 a) |
| `rol_islemi` | rol_id -> rol, islem | kisiler (K2 a) |
| `kisi_islemi` | kisi_id -> kisi, islem, veren_id -> kisi, verildi | kisiler (kart #1233) |

## Kavramlar

| Kavram | Tablo ve sütun | Başka modülde | Not |
|---|---|---|---|
| kişi (personel) | `kisi.id`, `kisi.ad`, `kisi.aktif` | sabit kimlik: kisiler | başka modül `kisi.id` ile bağlanır; ad `kisiAdlari`, varlık `kisiVarMi`, liste `kisileriListele` (`disari.ts`) |
| sicil no | `kisi.sicil_no` | `ik_personel.sicil_no` | doluysa tekil (`kisi_sicil_no_tek`); İK'ya bağlı kişide İK iter (1302 a) |
| görev | `kisi.gorev` | `ik_personel.pozisyon` | İK'ya bağlı kişide İK iter (1302 a); ayarcı görevden değil yetkinlikten okunacak (1303 a) |
| çıkış tarihi | `kisi.ozluk_cikis_tarihi` | `ik_personel.cikis_tarihi` (asıl) | İK'nın kopyası; tarih gelince kişi pasif (1315 a) |
| kullanıcı (giriş) | `kisi.kullanici_adi`, `kisi.parola_ozeti` | oturum okur | giriş akışı oturumda, doğrulama `girisDogrula` |
| rol | `rol.kod`, `rol.ad`, `rol.yonetici` | yok | `yonetici` bayrağı "bütün işlemler" demektir |
| rol x işlem | `rol_islemi (rol_id, islem)` | işlem adları bütün modüllerde (`paylasilan/islemler.ts`) | aşağıda |
| kişiye ek işlem | `kisi_islemi (kisi_id, islem)` | yok | rolün üstüne eklenir, rolden işlem almaz; oturumdaki işlem listesine girer |

## Rol ve rol x işlem sahipliği (K2 a)

- `rol` ve `rol_islemi` tablolarının sahibi kisiler modülüdür. Tabloyu yalnız kisiler okur (`sorgular.ts`, oturum kullanıcısının
  işlem listesi); başka modül yetkiyi oturumdaki işlem listesinden alır, tabloyu sorgulamaz.
- Rol x işlem satırlarını yazan konu yine çekirdek konusudur; satırlar kisiler adlı göçlerle girer
  (`<damga>_kisiler_<konu>.sql`). Modül konuları satırı yazmaz, `CEKIRDEK-ISTEKLERI.md` ile ister. Dağılım kullanıcı onayıyla girer.
- Tabloyu kuran göç (`20261006011806_yetki_islem_ve_giris.sql`) modül adıyla başlamadığı için harita sahibi "belirsiz" gösteriyor;
  düzeltme kart #72'de araçtadır (UYUM-BORCU madde 4).

## Başka modüle bağlar

Yok: kisiler hiçbir modüle bağımlı değil (harita: "Bağımlı olduğu (0)"). Ona bağımlı: arkon, istasyonlar, kalibrasyon, malzemeler,
oturum, satin-alma, uretim-emirleri.

## Doğal sahibi başka modül olabilecekler

- `kisi.gorev`: vardiya/mesai ya da personel tanımları gelince görev listesi oradan okunabilir. Karar Aşama 2'de.
