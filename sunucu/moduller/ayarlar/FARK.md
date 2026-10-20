## Yedek klasörü ekrandan seçilir (kart #1205 eki)
- Eklenen: `POST /yedekler/dizin/degistir` (`ayarlar.yedek-indir`, yalnız bayraklı yönetici; yeni rol x işlem yok). Seçilen klasör `ayar`
  tablosunda `yedek.dizin` satırında durur (tanım değil: genel listede yok, genel değiştirme ucu 404). Boşsa `TMIV2_YEDEK_DIZINI` geçerlidir.
  Kabul: mutlak, var olan, klasör olan ve sunucunun yazabildiği her yol (kullanıcı kararı "Her klasör"); yazma deneme dosyasıyla sınanır.
  Her değişiklik eski ve yeni klasörle denetim kaydına düşer; aynı klasörü yeniden seçmek kayıt bırakmaz.
- Güncelleyici için: seçim `<TMIV2_GUNCELLEME_DIZINI>/yedek-dizini.json` dosyasına yazılır (gece işi her turda eşitler);
  `disari.ts` `yedekDizini(guncellemeDizini, env)` veritabanısız okur, dosya yoksa ya da bozuksa ortama düşer.
- `GET /yedekler` cevabına `dizin` ve `kaynak` (`ayar` | `ortam`) eklendi. Ekran: Yedekler sekmesinde klasör alanı, Kaydet ve "Sunucu ayarına dön".

## Sayfa yetkileri ekranı (kart #1233)
- Eklenen (yalnız istemci): Sistem Ayarları ikinci menüsüne "Sayfa yetkileri" (`/ayarlar/sayfa-yetkileri`, `kisiler.rol-yonet`). Kişi seçilir;
  sayfa ve işlemler gruplu listelenir, rolden gelen "Rolden" yazar ve değişmez, öteki işlem kişiye ek verilir ya da alınır
  (`GET /kisi-ek-islemleri`, `POST /kisiler/:id/ek-islem-degistir`; kurallar kisiler KS-4). Tüm yetkili kişi listede yoktur.
- Uç, göç, yetki bu modülde değişmez. `Yetkiler.tsx` düzenleme işaretini dışa açar.

## Güncelleme paketini uygulama, sunucu ve ekran (kart #1210)
- Eklenen: `POST /guncelleme/paketler/:commit/uygula` (`ayarlar.guncelleme-yukle`; rol değişmedi). Sunucu paketi uygulamaz: güncelleme
  klasörüne `uygula.json` yazar; uygulamayı sunucuyu açan güncelleyici yapar (ayrı PR). Güncelleyici süreç numarasını
  `guncelleyici.json`'a yazar (ortam değişkeni olamaz: `.env`'de olmayan TMIV2_ değişkeni sunucuyu durdurur); süreç yaşamıyorsa reddedilir.
- AY-G1 (geri gidilmez): çalışan sürüm, uygulanmış göçlerin hepsini taşımayan ya da çalışandan eski paket uygulanamaz. Çalışan sürüm
  güncelleyicinin yazdığı `calisan.json`'dan, yoksa `TMIV2_COMMIT`'ten; uygulanmış göçler çalışan kodun `sunucu/gocler` listesidir.
- `GET /guncelleme/paketler` cevabına `guncelleyici`, `calisan`, `bekleyen`, `sonUygulama` ve paket başına `uygulanamaz` eklendi.
- `disari.ts` dosya adlarını, biçimlerini ve AY-G1'i güncelleyiciye verir. Göç yok, tablo yok, yeni paket yok.
- Ekran: "Uygula" açıldı (onay penceresiyle); kapalıyken nedeni, son uygulamanın sonucu ve bekleyen istek yazılır.
- Eski paket ve kurulu sürüm silme: `POST /guncelleme/paketler/:commit/sil` ve `POST /guncelleme/surumler/:commit/sil`
  (`ayarlar.guncelleme-yukle`). Liste cevabına `surumler` (güncelleme klasöründeki `surumler/<commit>`), `uygulaniyor` ve
  paket başına `silinemez` eklendi. Çalışan sürüm klasörü, bekleyen ya da şu an uygulanan sürümün paketi ve klasörü silinmez.
  Güncelleyici aldığı isteği uygulama bitene kadar `uygulaniyor.json`'da tutar; işaret istek silinmeden yazılır.
  Ekran: "Kurulu sürümler" kartı ve iki tabloda satır başına "Sil" (onay penceresiyle).
- Yedek klasörü (seçilen, yoksa `TMIV2_YEDEK_DIZINI`) sunucuda yoksa uygulama isteği 422 alır ve yazılmaz; önceden istek kabul edilip
  güncelleyicide "Başarısız" düşüyordu. Liste cevabına `yedek` (`dizin`, `hazir`) eklendi; ekran Uygula'yı kapatır ve nereden seçileceğini yazar.
## Veritabanı yedeği ve yedek indirme (kart #1205)
- Eklenen: gece yedeği işi `ayarlar-gece-yedegi` (`isler.ts`, ADR 0010 kalıbı): on dakikada bir bakar, tesis saatiyle 02:00'den sonra
  günün gece yedeği yoksa `pg_dump --format=custom` ile alır; 14 günden eski yedeği siler, en yeni 3 yedek her zaman kalır.
  pg_dump sürerken transaction saniyede bir nabız sorgusuyla canlı tutulur (boş transaction süresi işi kesmesin).
- Eklenen uçlar: `GET /yedekler`, `POST /yedekler/al` (elle yedek; cevabı beklemez, sonuç listede), `GET /yedekler/:ad/indir` (ikili cevap).
  Yeni işlem `ayarlar.yedek-indir`: hiçbir role verilmez, yalnız bayraklı yönetici (rol x işlem göçü yok; kullanıcı kararı kartta).
- Yedek diske yazılır (`TMIV2_YEDEK_DIZINI`, mutlak yol; yoksa kapalı, sunucu açılır); pg_dump yolu `TMIV2_PG_DUMP` (boşsa PATH).
  Göç yok, tablo yok. pg_dump uygulama kullanıcısıyla bağlanır; parola alt sürecin ortamında, `TMIV2_` değişkenleri alt sürece geçmez.
- Eklenen (istemci): Sistem Ayarları'nda "Yedekler" sekmesi (yalnız işlemi olana): durum, son hata, "Şimdi yedek al", yedek listesi ve indirme.
- Belge: `kurulum/yedek.md` (kurulum, geri yükleme, deneme geri yüklemesi), `.env.ornek`, `kurulum/devir.md` satırı.
- Yok: geri yüklemeyi uygulamadan yapmak (veritabanını değiştirir; yönetici elle yapar), güncelleme paketinin "Uygula" adımı.

## Paket üretici ve değişiklik notu (kart #886)
- Bildirime `degisiklikler` eklendi (en çok 200 satır, satır en çok 300 karakter; yoksa boş liste: #870 paketleri geçerli kalır). Başlık sınırı 64 KB'tan 256 KB'a çıktı.
- `disari.ts` paket biçimini (imleç, çözücü, sınırlar) `araclar/paket-yap.ts`'ye verir; üretici ile doğrulayıcı tek kaynaktan.
- Araç: `npm run paket -- anahtar-uret <pem>` (depo dışı, 0600; ortak anahtarı yazar) ve `npm run paket -- --anahtar <pem> --cikti <x.tmip>`.
  Sürüm `YYYY.AA.GG-N` (tesis günü), değişiklikler önceki `yayin/*` etiketinden bu yana birleşen PR'lar; yük verilmezse `git archive` HEAD. Etiket atmaz, komutunu yazar.
- Ekran: tabloda "Değişiklik" ve "Yeni göç" (sunucunun son göçünden sonrakiler; sağlık ayrıntısı okunamazsa "?"), seçilen paketin değişiklik listesi ve notu.
- Yok: `.github` yayın işi ve paketi uygulama (ayrı onay).

## Güncelleme paketi yükleme kanalı (kart #870)
- Eklenen: `GET /guncelleme/paketler`, `POST /guncelleme/yuklemeler/:kimlik/parca` (gövde `{ boyut, sira, veri }`, 512 KB base64),
  `POST /guncelleme/yuklemeler/:kimlik/bitir`. İşlem `ayarlar.guncelleme-yukle`: hiçbir role verilmez, yalnız bayraklı yönetici (kullanıcı onayı 2026-10-12).
- Paket diske yazılır (`TMIV2_GUNCELLEME_DIZINI`, mutlak yol; `yuklemeler/` ve `paketler/<commit>.tmip` + `.json`); göç yok, tablo yok.
  İmza ed25519, ortak anahtar `TMIV2_GUNCELLEME_ANAHTARI` (ham 32 bayt base64); ikisinden biri yoksa kanal kapalı, sunucu açılır.
- Paket biçimi: `TMIV2-GUNCELLEME 1\n`, başlık satırı `{ bildirim, imza }`, yük. Bildirim: bicim, surum, commit, tarih, gocler, not, yukBoyut, yukSha256.
- Eklenen (istemci): Sistem Ayarları'nda "Güncelleme" sekmesi (yalnız işlemi olana): kanal durumu, yükleme, paket listesi; "Uygula" kapalı.
- Denetim: parça ucu gövdesiz (özet; kullanıcı kararı 2026-10-12), `TAM_DENETLENMEYEN_UCLAR`'a tek satır.
- Yok: paketi uygulama (yedek, göç, yeniden başlatma, geri dönüş), paket üretimi (`.github`, ayrı onay).

## 625-sayfa-acma-kapama (kart #625)
- Eklenen: `GET /kapali-sayfalar` (oturum), `POST /kapali-sayfalar/degistir` (`ayarlar.yaz`, gövde `{ yol: string, kapali: boolean }`: tek sayfa, liste sunucuda kilit altında kurulur). Liste `ayar`
  tablosunda `kabuk.kapali-sayfalar` satırıdır (göç yok); bilinmeyen ya da korunan yol 400, boş liste satırı siler, değişiklik denetime
  eski ve yeni listeyle yazılır. Sistem Ayarları'nda "Sayfalar" bölümü (sayfa ve alt sayfa anahtarları).

## 617-kabuk-logo-surum-tema (kart #617)
- Eklenen: `GET /kurum-logosu` (oturum), `POST /kurum-logosu/degistir` (`ayarlar.yaz`, gövde `{ logo: string | null }`). Logo `ayar`
  tablosunda `kabuk.logo` satırıdır (göç yok); ayar tanımı değildir, listede görünmez, genel değiştirme ucu 404 verir. null satırı siler.
- Eklenen (istemci): Sistem Ayarları'nda "Kurum logosu" (yükle, değiştir, kaldır) ve "Sürüm" (sürüm, derleme tarihi, arayüz commit;
  sağlık ayrıntısını okuyana sunucu commit ve son göç) bölümleri.

# FARK: ayarlar, liste testi boş varsayılan (kart #420 eki, dal 420-ayarlar-test-varsayilan)

Yalnız test değişti. `ayarlar.test.ts` "saklanan değer tanımın türüne uymuyorsa ..." testinde öteki ayarların değeri artık
"null değil" diye değil, kendi varsayılanına eşit diye sınanır: varsayılanı bilerek boş olan sayı ayarı (#339,
`logo.hizmet-kdv-orani`) null gelir ve geçer; varsayılanı dolu ayarın null ya da başka değer gelmesi yine yakalanır
(iki mutasyonla denendi).

---

# FARK: ayarlar, KD-015 ve KD-016 (kart #420, dal 420-ayarlar-kd-015-016)

Şema ve göç yok; uç yolu, işlem ve rol değişmedi.

## Değişen
- `GET /ayarlar` (KD-015): türe uymayan saklanan değer listeyi 500'e düşürmez. O ayar `gecersiz: true` ve `deger: null` gelir,
  ötekiler değeriyle gelir. Sözleşme (`paylasilan/sozlesme/ayarlar.ts`): `gecersiz` isteğe bağlı (yalnız `true`), açık-kapalı
  ayarın değeri yalnız işaretliyken null olabilir. Kural `kurallar.ts` `listeDegeri`.
- `sistemAyariOku` (başka modüllerin okuması) değişmedi: bozuk değerde hata verir; sessizce varsayılana dönmek ayarı değiştirirdi.
- `POST /ayarlar/:anahtar/degistir` (KD-016): eski değer okunmadan önce anahtar başına danışma kilidi (`sorgular.ts`
  `ayarKilitle`). Aynı anda gelen ikinci komut bekler; değişiklik kaydı birincinin yazdığını eski değer olarak taşır. 409 yok.
- Ekran: işaretli ayarın satırında "Kayıtlı değer okunamıyor; yeni değer kaydedin." uyarısı. Açık-kapalı ayarda anahtar yerine
  "Açık kaydet" ve "Kapalı kaydet" düğmeleri; sayı ayarında Kaydet boş kutuyla da açık.
- Testler: `ayarlar.test.ts` (iki test güncellendi, KD-016 testi eklendi), `sozlesme.test.ts` (yeni), `SistemAyarlari.test.tsx` (iki test).
- Belgeler: `NOTLAR.md`, `UYUM-BORCU.md` madde 2, `KURAL-TEST.md`, `GUVENLIK-DENETIMI.md`.

## Değişen onaylı kararlar
Yok.

---

# FARK: ayarlar, Aşama 1 tur 2 (dal 259-temel-moduller, taban main 65901d0)

Şema, göç, uç, işlem ve ekran değişmedi.

## Eklenen
- İkinci menü: `paylasilan/sayfalar/ayarlar.ts` `AYARLAR_IKINCI_MENU` (tek grup, tek madde `/ayarlar`, işlem `ayarlar.yaz`). Toplayıcıya
  (`paylasilan/sayfalar.ts`) yalnız bu modülün kaydı, ayrı commit'te (dar istisna). Okuma ucu zaten `ayarlar.yaz` ister; görünüm değişmez.
- Belgeler: `UYUM-BORCU.md`, `ORTAKLIK-ayarlar.md`, `GUVENLIK-DENETIMI.md`.

## Değişen onaylı kararlar
Yok. K1 a (`ayar` tablo öneki istisnası) borca yazıldı.
