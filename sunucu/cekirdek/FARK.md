# Çekirdek şeridi FARK (sunucu/cekirdek ve paylasilan kökü)

Her çekirdek çekme isteği bu dosyaya kendi satırlarını ekler: eklenen, değişen, silinen; değişen onaylı kararlar.

## 731-cekirdek-gzip (kart #731; kullanıcı kararları 725-730, 26.10.2026)

- Değişen: `uc.ts` ikili cevap. Sıkışan türdeki dosya (`model/step`, `model/iges`, `model/stl`, `model/gltf+json`, `image/vnd.dxf`,
  `application/octet-stream`) 64 KiB'ı aşıyor ve istemci gzip kabul ediyorsa en hızlı gzip düzeyiyle sıkışmış gider; Content-Length
  yazılmaz, `vary: accept-encoding` yazılır. PDF ve resim sıkıştırılmaz (içten sıkışık). Akış bildirilen boyutu tutmazsa sıkışmış
  cevap da tamamlanmış görünmez (bağlantı kesilir ya da ilk bayttan önceyse 500).
- Neden: terminal STEP dosyasını ağdan bütün iner; metin STEP ağda birkaç kat küçülür. Yeni paket yok (`node:zlib`).
- Test: `uc-ikili.test.ts` üç yeni test. Göç yok. Silinen: yok. Önbellek ve denetim davranışı aynı.

## 852-projeler-rolleri (kart #852; kullanıcı onayı 12.10.2026 "Öneri")

- Eklenen: göç `*_kisiler_projeler_islemleri.sql`: `sayfa.projeler` ve `projeler.oku` müdür, planlama, satın alma, kalite, depo ve
  CAM'de; `projeler.yaz` yalnız müdür ve planlamada. Üretim, operatör ve finans görmez. Matris testleri ve `kurulum/yetki-matrisi.md` güncel.

## 625-sayfa-acma-kapama (kart #625)

- Eklenen (paylasilan): `sayfalar.ts` `KAPATILABILIR_YOLLAR` (ana menü sayfaları ve ikinci menü maddeleri; ana sayfa ve
  `/ayarlar` altı hariç), `yolKapaliMi` (kapalı yolun altı da kapalı); `sozlesme/ayarlar.ts` kapalı sayfa şemaları.
- Eklenen (istemci ortak): `ortak/veri/kapali-sayfalar.ts`. Kabuk `kapali` özelliğini alır: kapalı sayfa ve madde menüden ve
  aramadan kalkar, adresle açılınca içerik yerine "Bu sayfa şu an kapalı" yazar. Uygulama kapalı sayfanın işlemini panoya
  vermez (kartları kalkar) ve açılış sayfası kapalıysa yönlendirmez. Yalnız görünürlüktür; uçlar değişmez.

## 599-atolye-roller (kart #599; kullanıcı onayı 11.10.2026 "Hepsi onay")

- Eklenen: göç `20261011214500_kisiler_atolye_islemleri.sql`: `sayfa.atolye` müdür, planlama, kalite, CAM, depo ve operatörde;
  `atolye.yaz` yalnız planlamada. Onaylı matris testleri ve `kurulum/yetki-matrisi.md` güncel.

## 617-kabuk-logo-surum-tema (kart #617)

- Değişen (istemci ortak): `ortak/veri/tema.ts` tema tek depoda (`useSyncExternalStore`); kabuktaki düğme temayı okuyan her bileşene
  yansır. Finans ve Malzemeler çerçevesi tema değişince yeniden kurulur (önceden kendi kopyalarında eski tema kalıyordu).
- Eklenen (istemci ortak): `ortak/veri/surum.ts` (`DERLEME`: sürüm, derleme zamanı, commit; `vite.config.ts` derlemede yazar,
  commit `TMIV2_COMMIT` ya da git), `ortak/veri/kurum-logosu.ts` (`useKurumLogosu`, `useKurumLogosuDegistir`).
  Kabuk `logo` özelliğini alır (yoksa TMI işareti) ve marka altında `v<sürüm> · <tarih>` yazar.
- Eklenen (paylasilan): `sozlesme/ayarlar.ts` kurum logosu şemaları (PNG, JPEG, WebP veri adresi, en çok 200 000 karakter).

## 585-ana-sayfa-duzen (kart #585)

- Değişen (yalnız istemci `ortak/arayuz/ana-sayfa.css`): sayı kartı ızgarasının alt sınırı `--pano-kart-enaz + --b-6`; 1280'de dört dar sütun yerine üç sütun,
  başlık ve açıklama tek satıra iner. Bölümsüz kartlar arası boşluk bölüm ızgarasıyla aynı (`--b-4`). Davranış, sıralama ve kart dağılımı değişmedi.

## 598-sevkiyat (kart #598; kullanıcı onayı 11.10.2026 "sevkiyat rolleri onay")

- Eklenen: `paylasilan/islemler/sevkiyat.ts` (beş işlem) ve toplayıcıda tek satır; `paylasilan/sayfalar/sevkiyat.ts` (sayfa, Planlama grubu, simge `next`;
  ikinci menü: Günlük sevkiyat, Rota hesapla, Noktalar, Araçlar) ve toplayıcıda iki satır.
- Eklenen: göç `20261011200700_kisiler_sevkiyat_islemleri.sql`: yerleşik `sevkiyat` rolü (depo ile eş sevkiyat yetkisi ve `sayfa.stok`);
  planlama oku, iş ve plan yazar; depo bütün beş işlem; öbür sekiz rol sayfa ve oku. Onaylı matris testleri ve `kurulum/yetki-matrisi.md` güncel.

## 599-atolye (kart #599)

- Eklenen: `paylasilan/islemler/atolye.ts` (`atolye.yaz`) ve toplayıcıda tek satır; `paylasilan/sayfalar/atolye.ts` (Fabrika Haritası, Üretim) ve
  toplayıcıda iki satır; `paylasilan/atolye-sabitleri.ts` (zod'suz; `eslint.config.js` ZODSUZ listesi); `istemci/src/ortak/tasarim/tokens.css`
  sahne ve plan renkleri (`--sahne-*`, `--plan-*`, `--sahne3b-*`). Rol satırı yok.
- Değişen: `three` 0.169.0 yerine 0.186.1, `@types/three` 0.186.0 (stok 3B depo da bu sürümle); yeni `pdfjs-dist` 6.3.289
  (isteğe bağlı `@napi-rs/canvas` ile). Kullanıcı onayı "atölye paketleri onay" (11.10.2026).

## 568-rol-acilis-sayfasi (kart #568; kullanıcı kararı 11.10.2026 "yaz a")

- Eklenen: göç `20261011175913_kisiler_rol_acilis_sayfasi.sql`, `rol.acilis_sayfasi` (boş olabilir, `rol_acilis_sayfasi_bicimi`
  kısıtı); operatör rolüne `/uretim-terminali`. `Kullanici.acilisSayfasi` (isteğe bağlı, null olabilir): kişinin bütün rolleri
  aynı sayfayı söylüyorsa o, yoksa null.
- Değişen: istemci uygulama ana sayfadan açılınca açılış sayfasına bir kez yönlenir; sayfa görünmüyor ya da rotası yoksa ana sayfada kalır.
- Eklenen: göç `20261011194410_kisiler_operator_uretim_terminali.sql`, operatöre `sayfa.uretim-terminali` (kullanıcı onayı "sayfa.uretim-terminali operatör ve yöneticiye verilsin"); yönetici bayraklı rolle zaten alır.

## 587-ayar-ekranlari (kart #587)

- Eklenen (istemci ortak): `ortak/rota/ayar-ekranlari.ts` keşfi; modül `moduller/<ad>/ayar-ekranlari.tsx` içinde `ayarEkranlari` verir,
  Sistem Ayarları kendi listesinin altında kişinin işlemine göre modül bölümlerini çizer. Sayfa yetkisi, uç, işlem, şema değişmedi.

## 544-cekirdek-menu (kart #544; B1 C1)

- Değişen: `paylasilan/sayfalar/rota.ts` ikinci menüde `operasyonlar` maddesinin başlığı "Operasyonlar" yerine "Rota revizyonları"; yol, simge ve işlem aynı.

## 544-planlama-satin-alma (kart #223; kullanıcı kararı 11.10.2026)

- Eklenen: göç `20261011171112_kisiler_planlama_satin_alma.sql`, `planlama_proje` rolüne `sayfa.satin-alma` ve `satin-alma.oku`
  satırları. Okuma olmadan satın alma sayfasının açılış ucu 403 verirdi; yazma ve onay verilmez. `kurulum/yetki-matrisi.md` güncel.

## 485-havuz-ayari (kart #485; denetim S-05, kullanıcı kararı 2-a)

- Eklenen: zorunlu ortam değişkenleri `TMIV2_PG_HAVUZ` (1-500) ve `TMIV2_PG_OKUMA_SURE_MS` (sorgu süresinden büyük olamaz);
  `PgAyari.havuzBoyutu` ve `PgAyari.okumaSureMs`. Varsayılan yoktur: çalışan kurulumun `.env`'ine iki satır eklenmeden sunucu açılmaz.
- Değişen: `okumaTx` transaction'ı `SET LOCAL statement_timeout = <okuma süresi>` ile açar (aynı iletide). Yazma transaction'ı ve
  tek sorgu genel sınırda kalır.
- Silinen: `db.ts` `HAVUZ_BOYUTU` sabiti; havuz boyutunu bilmesi gereken test `ayarOku().pg.havuzBoyutu` okur.
- Değişen onaylı karar: ADR 0004 madde 6 (kullanıcı onayı, 11.10.2026).

## 485-sure-asimi-503 (kart #485; denetim S-08, kullanıcı kararı 3-a)

- Değişen: istek sınırı sorgu ve kilit bekleme süre aşımını (57014, 55P03) 503 `MESGUL`, ulaşılamayan ya da istek sırasında
  kopan veritabanını 503 `VERITABANI_YOK` ("Veritabanına ulaşılamıyor, birkaç saniye sonra tekrar deneyin.") yapar; önce ikisi
  500 `SUNUCU` idi. Günlüğe "Beklenmeyen hata" yerine uyarı düşer ("Sorgu süre sınırına takıldı", "Veritabanına ulaşılamadı").
- Değişen: `db.ts` kopan bağlantının sonraki ve süren sorgu hatalarını ulaşılamama olarak işaretler (`vtUlasilamadi` doğru döner);
  sağlam bağlantıda sürücünün attığı hata (bozuk parametre) işaretlenmez, 500 kalır.
- Değişen onaylı karar: ADR 0004 madde 7 (kullanıcı onayı, 11.10.2026). İstemci 5xx'i zaten yeniden denenebilir sayar.

## 494-isleyici-gunluk (kart #494; denetim S-20, Arkon isteği)

- Eklenen: `sunucu/cekirdek/gunluk.ts` `Gunluk` (`uyar(mesaj, hata?)`, `hata(mesaj, hata?)`) ve `gunlukKur`. Veritabanı hatası
  `vtHataIzi` süzgecinden geçer (satır ve girdi değeri sızmaz); günlüğe yazılamaması yazanı düşürmez.
- Eklenen: `IsleBaglami.gunluk` (satır `uc: "<YONTEM> <yol>"` taşır) ve `IsTanimi.calis(db, gunluk)` ikinci parametresi (satır
  `is: <ad>` taşır). İkisi de isteğe bağlı kullanımdır: var olan işleyici ve işler değişmeden derlenir.
- Değişen: `IsGunlugu` artık `HamGunluk` (pino yüzü); `isiBirKezCalistir(vt, is, gunluk?)` üçüncü parametre alır, verilmezse
  işin yazdıkları atılır (yalnız test).
- Değişen onaylı karar: yok. Arkon'un yuttuğu hataları (`arkon/servis.ts`) yazması Arkon'un işidir.

## saat-dilimi-p-b24 takip (borç P-B24; kart numarası verilmedi)

- Değişen: `TESIS_SAAT_DILIMI`, `tesisGunu`, `tesisSaati`, `tesisGunBasi` `paylasilan/zaman.ts`'ten zod taşımayan
  `paylasilan/tesis-zamani.ts`'e taşındı; `eslint.config.js` `ZODSUZ` listesine `tesis-zamani` eklendi. İstemci bunları değer
  olarak ithal edebilir (önce `#paylasilan/zaman.ts` ithali lint'te reddediliyordu). Sunucu için `zaman.ts` de yeniden dışarı verir;
  istemci yalnız `tesis-zamani.ts`'i kullanır. Testler `paylasilan/tesis-zamani.test.ts`'e taşındı.

## saat-dilimi-p-b24 (borç P-B24; kart numarası verilmedi)

- Eklenen: `paylasilan/zaman.ts` `TESIS_SAAT_DILIMI` (`Europe/Istanbul`), `tesisGunu(an)`, `tesisSaati(an)`, `tesisGunBasi(tarih)`;
  saf, `Intl` ile (yeni paket yok), sunucu ve istemci kullanır. Testler `paylasilan/zaman.test.ts`.
- Değişen: `db.ts` her bağlantıyı (uygulama ve göç) `TimeZone=Europe/Istanbul` ile açar. `current_date`, `date` ile `timestamptz`
  arası çevirme (vardiya aralıkları) ve zaman çıktısının saat farkı artık sunucu kurulumunun saat dilimine bağlı değil; zaman
  metni `+00:00` yerine `+03:00` ile çıkar (an aynı). Kayıtlı veri değişmez, göç yok. Test `db.test.ts`.
- Varsayım: tesis tek ve İstanbul'da; dilim sabittir, ortam değişkeni değildir (değiştirmek tek satır).
- Modül tarafı (plan günleri UTC, arkon günlük saati, rota ve stok ekranında "bugün") `BASKA-MODUL-ISTEKLERI.md` "Saat dilimi".

## 370-kilitlenme-test-kararli (kart #370)

- Değişen: `kilitlenme.test.ts` gerçek kilitlenme testinde rakip, sabit 200 ms yerine ucun kendi transaction'ını beklediğini
  `pg_locks` üzerinden görene dek sorar. Yükte rakip uçtan önce bekleyip düşebiliyordu (#396 CI koşusu 37898778335 kırmızı).
  Kod değişmedi.
## 223-satin-alma-rol-satirlari (kart #223, kullanıcı kararı RC1 R1-R3; ana sayfadan talep, kart #375)

- Eklenen: göç `20261009065000_kisiler_satin_alma_islemleri.sql`, 16 rol satırı. Satın alma: `sayfa.satin-alma`, `satin-alma.oku`,
  `satin-alma.talep-ac`, `satin-alma.yaz`, `satin-alma.ayar`. Müdür: `sayfa.satin-alma`, `satin-alma.oku`, `satin-alma.talep-ac`,
  `satin-alma.onayla`. Muhasebe: `sayfa.satin-alma`, `satin-alma.oku`. Yalnız `satin-alma.talep-ac`: planlama, CAM, bakım, kalite, depo.
  Operatör, insan kaynakları ve idari işler almaz.
- Talep açan üretim rolleri satın alma sayfasını ve açılış ucunu almaz; talebi ana sayfa kartından açar ve kendi taleplerini okur.
- Göç önce var olan satın alma satırlarını sayar (NOTICE); yalnız ekler, elle girilmiş satıra birincil anahtarla takılıp durur.
- Testler: `kisiler/rol-dagilimi.test.ts` (rol başına uç yetki kapısı), `kisiler/goc.test.ts`, `oturum/oturum.test.ts` matrisi,
  `kurulum/yetki-matrisi.md`.

## 370-kilitlenme-yineleme (kart #370, kullanıcı kararı "3 kez yeniden deneme, sonra 503: a")

- Eklenen: `db.ts` `vtGeciciCakisma` (40P01 kilitlenme, 40001 serileştirme; yalnız sunucu hatası). `kilitlenme.ts`
  `kilitlenmedeYinele(vt, is)`: her denemede yeni transaction, ilk koşudan sonra en çok 3 yineleme (`KILITLENME_YINELEME_SAYISI`),
  aralarda 10-50 ms rastgele bekleme; tükenince son hata. İmza transaction açabilen nesne ister: açık transaction içinden çağrılamaz.
- Eklenen: uç tanımında seçimli `kilitlenmedeYinele: true`, yalnız yazma ucu (GET tanım hatası). İşaretli uçta bütün transaction
  (tekrar koruması, işleyici, denetim) baştan koşar; önceki denemenin çerezleri düşer. İşleyici transaction dışına yan etki
  bırakıyorsa işaret konmaz.
- Değişen: kilitlenme ya da serileştirme hatası (işaretsiz uçta ilk seferde, işaretli uçta yinelemeler tükenince) 500 yerine 503
  `MESGUL` ("Sistem şu an meşgul, birkaç saniye sonra tekrar deneyin."); günlüğe beklenmeyen hata değil uyarı yazılır.
  İş kuralı reddi, kısıt ihlali, süre aşımı değişmedi ve yeniden denenmez.
- İstemci: 503 için ayrı davranış yok; ortak `api.ts` sunucu iletisini gösterir (DOĞRULANDI, `istemci/src/ortak/veri/api.ts`).
- Yorum: "3 kez yeniden deneme" ilk koşuya ek üç koşu olarak okundu (toplam en çok 4); geri alma tek sabit.
- İlk işaretli uç bu dalda yok: her modül işaretini kendi dalında, testiyle koyar (aday: stok hareketi, üretim emri, Arkon kaydı).
- Başka modüle istek: Arkon kendi `GECICI_SQLSTATE` listesi yerine `vtGeciciCakisma` kullanabilir (`arkon/servis.ts`); bu dal
  Arkon'a dokunmaz. `yapi-kaliplari` skill notu (hangi uca işaret) ajan düzeni dosyasıdır, şefe kalır.

## 223-stok-rol-satirlari (kart #223, kullanıcı kararı RC1 R4-R6, R13)

- Eklenen: göç `20261009063500_kisiler_stok_islemleri.sql`, 14 rol satırı. Depo: `stok.giris`, `stok.cikis`, `stok.transfer`,
  `stok.sayim`, `stok.toplama`. Müdür: bütün stok işlemleri (ek olarak `stok.tanim`, `stok.geri-al`). Planlama: `stok.toplama`.
  Bakım: `sayfa.stok` (yalnız okuma; `stok.cikis` verilmez).
- Koşul olan borçlar ana dalda kapalı: stok borcu 12 (tekrar koruması), 15 (ST4 kapatma denetimi), 13 (ST5 okuma yetkisi, #365).
- Göç önce var olan stok satırlarını sayar (NOTICE); yalnız ekler, elle girilmiş satıra birincil anahtarla takılıp durur.
- Testler: `kisiler/rol-dagilimi.test.ts` (rol başına uç yetki kapısı), `kisiler/goc.test.ts`, `oturum/oturum.test.ts` matrisi,
  `kurulum/yetki-matrisi.md`.
## 223-finans-rol-satirlari (kart #223, kullanıcı kararı RC1 R8-R12, karar kartı "Gir" 09.10.2026)

- Eklenen: göç `20261009053000_kisiler_finans_islemleri.sql`, 16 rol satırı. Muhasebe: `sayfa.finans`, `finans.oku`,
  `finans.yaz`, `finans.yonet`, `finans.firma-oku`, `finans.firma-yaz`. Müdür: `sayfa.finans`, `finans.oku`, `finans.firma-oku`.
  Satın alma ve planlama: `sayfa.finans`, `finans.firma-oku`, `finans.firma-yaz`. Depo: yalnız `finans.firma-oku` (sayfa yok).
- Göç önce var olan finans satırlarını sayar (NOTICE); yalnız ekler, elle girilmiş satıra birincil anahtarla takılıp durur.
- Testler: `kisiler/rol-dagilimi.test.ts` (uç davranışı, rol başına izin ve ret), `kisiler/goc.test.ts` (göç var olan
  veritabanında), `oturum/oturum.test.ts` onaylı matris güncellendi.
- Dış yazım için: finans modülünün `UYUM-BORCU`/`CEKIRDEK-ISTEKLERI` dosyalarındaki rol maddesi bu dalda kapatılmadı (modül
  dosyası); finans yazarı kapatır.

## 259-cekirdek-3 (kart #259, kullanıcı kararı O1)

- Değişen: `paylasilan/sayfalar.ts` `IKINCI_MENULER` satır başına tek kayıt, son kayıtta virgül. Sekiz kayıt ve sıraları aynı;
  dizinin JSON özeti önce ve sonra aynı (sha256 `cb8eab9b…9d23e7`).
- Eklenen: bu dosya.
- Silinen: yok. Onaylı karar değişmedi.
- Listeden fark: "sırayı koruyan test" eklenmedi. Kaynağı metin olarak okuyan test sınır denetiminde yasak (kural h); sırayı
  davranışla sabitleyen test ise her yeni menüde aynı test satırına dokunur ve O1'in kaldırdığı çakışmayı geri getirir.
  İçerik, var olan test ("modül dosyasındaki her ikinci menü toplayıcıdadır") ile korunur: bir kayıt silinince kırmızı.

## 259-cekirdek-roller (kart #259, kullanıcı kararları RM2, RM3, D48m)

- Eklenen: göç `20261008082300_kisiler_kalibrasyon_istasyon_denetim.sql`, beş rol satırı: kalite `sayfa.kalibrasyon`, kalite
  `kalibrasyon.yaz`, müdür `sayfa.kalibrasyon`, müdür `istasyonlar.yaz`, müdür `sayfa.denetim`. `kalibrasyon.oku` hiçbir role
  verilmedi (okuma uçları sayfa işlemini kabul ediyor).
- Değişen: `kurulum/yetki-matrisi.md` iki satır, "yalnız yöneticide" bölümüne `denetim.govde-oku`, bir kural; matris testleri.
- Silinen: yok. Onaylı karar değişmedi; kalibrasyonun "şimdilik yalnız yönetici" kararını RM2 kararı değiştirdi.

## 259-denetim-modul-yetki (kart #259, kullanıcı kararları H2 a, K9 a)

- Değişen: `uc.ts` `DenetimGirdisi` isteğe bağlı `modul` ve `yetki`; `KayitSecenegi.modul`; uç katmanı her kayda `yetkiMetni(yetki)` ve
  verilmişse modül adını yazar. `uygulama.ts` uçları modül modül kaydeder (aynı uç iki kez kaydedilemez kuralı korunur).
- Denetim modülü (sahibi artık çekirdek): göç, `sorgular.ts`, test ve belgeler; ayrıntı `sunucu/moduller/denetim/FARK.md`.
- Silinen: yok.

## 259-denetim-eki (kart #259, kullanıcı kararı N4; ADR 0008)

- Eklenen: `uc.ts` `IsleBaglami.denetimEki`, `DENETIM_EKI_SATIR_SINIRI` (100), `DenetimGirdisi.ek`; test `uc-denetim-eki.test.ts`.
- Değişen: seçim denetimi ortak `secimiKopyala` işlevine alındı; seçicinin davranışı ve iletileri aynı.
- Denetim modülü: `servis.ts` eki gövdede `_ek` altına maskeli yazar; ayrıntı `sunucu/moduller/denetim/FARK.md`.
- Silinen: yok. Onaylı karar değişmedi.

## 82-dosya-saklama (kart #82, kullanıcı kararları DS1-DS10 a, DSm a; ADR 0009)

- Eklenen: `uc.ts` ikili cevap (`ikiliCevap`, `IkiliCevap`, `dosyaAdiBasligi`); test `uc-ikili.test.ts`. `paylasilan/sozlesme/dosya.ts`.
  Hata kodu `COK_BUYUK` (413) ve `cokBuyuk`.
- Değişen: `uygulama.test.ts` gövdesiz denetim listesine iki dosya ucu (DS9 a, ayrı commit).
- Yeni modül `dosya` (sahibi çekirdek); ayrıntı `sunucu/moduller/dosya/FARK.md`.
- Silinen: yok.

## 259-cekirdek-yansima-yeniden (kart #259, kullanıcı kararı Y1 a)

- Eklenen: göç `20261008104500_kisiler_arkon_yansima_yeniden.sql`, müdür ve planlama rollerine `arkon.yansima-yeniden`.
- Değişen: `kurulum/yetki-matrisi.md` iki rol satırı ve kural satırı; rol testleri (`oturum.test.ts`, `goc.test.ts`, `rol-dagilimi.test.ts`).
- Silinen: yok. Arkon modülünün `UYUM-BORCU.md` "KALAN" satırı ve `CEKIRDEK-ISTEKLERI.md` 7. madde bu işle karşılanır; modül
  dosyalarına çekirdek yazmaz, kapatma Arkon konusunda.

## 298-zamanlayici (kart #298, kullanıcı kararları Z1-Z5, Z4d a, V3 koşullu kabul; ADR 0010)

- Eklenen: `sunucu/cekirdek/zamanlayici.ts`: `isTanimi`, `modulIsleriniKesfet` (`moduller/*/isler.ts`), `zamanlayiciKur`
  (`baslat`, `durdur`, `durumlar`), `isiBirKezCalistir`, `isDurumlari`, `hataOzeti`. Her tur ayrı transaction ve şemalı advisory
  kilit; kilit yoksa tur atlanır. Testleri `zamanlayici.test.ts`.
- Değişen: `sunucu/ana.ts` işleri keşfeder, dinlemeden sonra başlatır, kapanışta en çok 10 sn bekler. `paylasilan/sozlesme/saglik.ts`
  `ayrintiCevabi.isler`; sağlık modülü ve Sistem durumu ekranı iş tablosunu gösterir (yetki değişmedi: `saglik.ayrinti-oku`).
- Değişen onaylı karar: #70 madde 5'in genel "arka plan işi yazılmaz" hükmü bu kalıp için kalktı (Z1 a); makine verisi toplayıcısı yasağı sürer.
- Listeden fark: ADR numarası 0010 (0008 ve 0009 dolu). Süreçte tek zamanlayıcı kuralı ve `hataOzeti` listede yoktu; boş iş listesi
  ekranda tablo yerine düz metin (tablonun boş durumu ikinci bir durum bölgesi açıyordu). Silinen: yok.

## 206-cekirdek-23001 (kullanıcı kararı CK1 a; stok kartı #206'dan doğdu)

- Değişen: `db.ts` kısıt eşlemesi 23001'i (RESTRICT yabancı anahtar, PostgreSQL 18) 23503 gibi 409 `BAGIMLI_KAYIT` sayar. Stok dalındaki
  commit (6284c0b) olduğu gibi alındı; `kisit-korumali.test.ts` RESTRICT anahtarlı tabloyla sınar.
- Eklenen: `kisit-restrict.test.ts`: bütün göçlerdeki RESTRICT anahtarlar sabit listedir (bugün yalnız kalibrasyon); kalibrasyonun anahtarı
  gerçek ihlalde ve sınır katmanında 409 verir. Yerelde PostgreSQL 16 (23503), CI'da 18 (23001) koşar.
- Not: modül servisinde `pgKodu === '23503'` diye bakan kod RESTRICT anahtarında ıskalar (bugün satın alma `servis.ts`, anahtarı NO ACTION
  olduğu için etkilenmez). Silinen: yok. Onaylı karar değişmedi.

## 207-ayar-sayi-turu (Logo çekirdek isteği 6, kullanıcı kararı LB10 a)

- Eklenen: ayar türü `sayi` (`paylasilan/ayar-tanimi.ts`): `varsayilan: number | null`, `enAz`, `enCok` (dahil), `ondalik` (0-6). `null` boştur;
  sıfır uydurulmaz, boşken ne yapılacağını okuyan modül söyler. Doğrulama tanıma göre (`ayarDegerSemasi`); ayar görünümü sınırları taşır.
  Sistem Ayarları ekranında sayı kutusu ve Kaydet; boş kutu `null` kaydeder, virgül de nokta da ondalık ayırıcıdır.
- Bugün kayıtlı `sayi` ayarı yok: ilk kullanan Logo KDV oranıdır (#339). Sayılan öteki kullanımlar: stok sayım süresi, finans kur sınırı.
  Sunucu testi kurallar ve sözleşme düzeyinde; uç düzeyi ilk kayıtlı sayı ayarıyla gelir. Silinen: yok. Onaylı karar değişmedi.

## 207-is-bekleme-nedeni (Logo çekirdek isteği 7)

- Eklenen: zamanlanmış iş `calis` içinden `isBekliyor(neden)` dönebilir (1-200 karakter, modülün sabit metni). İş durumu `sonSonuc: 'bekliyor'`
  ve `sonNeden` taşır; günlüğe uyarı yalnız bekleme başlayınca ya da neden değişince yazılır. Atlanan tur nedeni korur; `tamam` ve hata siler.
  Biçimsiz dönüş değeri tur hatasıdır. Sağlık ayrıntısı ve Sistem Durumu ekranı nedeni gösterir (sütun adı "Açıklama").
- Değişen: zamanlayıcı günlüğü `warn` da ister (`IsGunlugu`); `isiBirKezCalistir` `'bekliyor'` da dönebilir. Hata turları önceki gibi her
  turda günlüğe yazılır. Zamanlayıcı testlerinin üst sınırı 20 sn'den 40 sn'ye çıktı (bekleme testi altı tur sürer). Silinen: yok.

## 207-ayar-bos-deger-lh2 (Logo çekirdek isteği 6a; kullanıcı kararı LH2 b)

- Değişen: göç `20261009050115_ayarlar_bos_deger.sql` önce `ayar` satırlarını sayıp bildirir, sonra `ayar_deger_dolu` kısıtını kaldırır. Bir kez
  doldurulan sayı ayarı yeniden boşaltılabilir: boş (JSON null) satırıyla saklanır ve okumada varsayılana düşmez; değersiz satırı (SQL NULL)
  `NOT NULL` reddeder. Var olan satırlar değişmedi.
- Eklenen: `ayarlar.test.ts` doldurulan değerin boşaltılıp satırıyla okunduğunu, satırsız ayardan ayrıldığını sınar. Uç düzeyindeki
  "doldur, boşalt, KDV gitmez" testi Logo'nun iki KDV ayarıyla gelir (#339). Silinen: `ayar_deger_dolu`. Önceki deneme #354 kapatıldı.

## 207-ayar-varsayilan-turu (Logo çekirdek isteği 6b)

- Değişen: `paylasilan/ayarlar.ts` `varsayilanDeger(anahtar)` varsayılanı anahtarın türüyle verir; `ayarlar/kurallar.ts` `gecerliDeger` onu
  kullanır. İlk sayı ayarı kaydedilince `npm run tip` `kurallar.ts(17,26) TS2322` ile düşüyordu (geçici sayı ayarıyla yeniden üretildi).
  Kalıcı bekçi: `logo.kdv-orani` kaydedilince `tip`. Silinen: yok. Onaylı karar değişmedi.

## 369-surum-sutunu (kart #369, kullanıcı kararı CK2 a)

- Eklenen: `durus_nedeni`, `hurda_nedeni`, `olcu_aleti`, `olcu_aleti_turu` tablolarına `surum` (varsayılan 1, adlı pozitif kısıt). Göç önce
  satırları sayıp bildirir; var olan değerler değişmez. Sözleşmede dört kaydın cevabı `surum` taşır, dört düzenleme gövdesi `beklenenSurum` ister.
- Değişen: dört `guncelle` ucu `surumluGuncelle` ile yazar: eski sürüm 409, olmayan kayıt 404, sürümsüz gövde 400. Kalibrasyon kaydı ve elle
  kullanım dışı bırakma aletin sürümünü de artırır (durum değiştiren yazma; açık düzenleme formu yeniden okur). Ekranlar okudukları sürümü gönderir;
  görünüm değişmedi. Silinen: yok. Kapanan borç: durus-nedenleri UYUM-BORCU 3, kalibrasyon UYUM-BORCU 4.
- Arkon'a not (kullanıcı kararı, 09.10.2026): `sunucu/moduller/arkon/kurallar.test.ts` duruş nedeni çevirisi deneme verisine `surum: 1`
  eklendi (yalnız test verisi, ayrı commit). Arkon'un dışarıdaki yazımı aynı satırı taşımalı: `DurusNedeni` artık `surum` alanı taşır.
- Terminale not (kullanıcı kararı, 09.10.2026): `istemci/src/moduller/terminal/Terminal.test.tsx` deneme verisinde iki duruş ve iki hurda
  nedenine `surum: 1` eklendi (yalnız test verisi, ayrı commit). Terminalin dışarıdaki yazımı aynı dört satırı taşımalı: duruş ve hurda nedeni
  cevabı artık `surum` alanı taşır.

## 25-test-eszamanli (kullanıcı kararı CI1 c; kart #25'e bağlı)

- Değişen: `npm run test:sunucu` artık `araclar/test-sunucu.ts` üzerinden koşar; `TMIV2_TEST_ESZAMANLI` (1-16) aynı anda koşan dosya sayısını
  verir, boşsa node varsayılanı kalır. CI 8 verir; yerel koşu değişmez (#120'deki sahte kırmızı yüzünden).
- Ölçüm (yerel, 4 çekirdek): 3 dosya 201 sn, 6 dosya 169 sn, 8 dosya 154 sn; hepsi yeşil. Test atlanmadı. Silinen: yok. Onaylı karar değişmedi.

## 25-kisiler-test-kurulum (kullanıcı kararı CI1 c devamı, a)

- Eklenen: `test-vt.ts` `sifirlamaHazirla(ortam)`: göç sonrası tohum satırlarını ve dizi değerlerini bir kez okur; dönen işlev şemayı o duruma
  getirir (silme çocuk önce, kullanıcı tetikleri sıfırlama süresince kapalı, yabancı anahtar denetimi açık). Yaklaşık 45 ms; yeni şema ve
  bütün göçler yaklaşık 1 sn. Test içinde DDL yapan dosya bunu kullanamaz (DDL geri alınmaz).
- Değişen: kisiler `kisi-yonetimi` ve `rol-atama` testleri göçü dosya başına bir kez uygular, her testte sıfırlar. Yerel ölçüm: 57 sn -> 13 sn,
  45 sn -> 10 sn; 8 eşzamanlı dosyayla bütün sunucu takımı 149 sn -> 133 sn. Test atlanmadı. Silinen: yok. Onaylı karar değişmedi.

## 25-sema-silme-sirasi (ana dal kırmızısı, koşu 37818363524; kart #25'e bağlı)

- Değişen: `test-vt.ts` `kaldir()` şemayı açılış temizliğinin kilidiyle (`TEMIZLIK_KILIDI`) sıraya girerek siler. 8 dosya eşzamanlıyken
  dört dosyanın kapanışı aynı anda tam şema sildi, kilit tablosu doldu (53200, out of shared memory); testlerin hepsi geçmişti.
- Eklenen: `test-vt.test.ts` kilit başkasındayken kapanışın beklediğini, boşalınca sildiğini sınar. CI eşzamanlılığı 8 kaldı; `.github`
  değişmedi. Test atlanmadı. Silinen: yok. Onaylı karar değişmedi.

## cekirdek-kablolama (mimari geçiş, Çekirdek şeridi; değerlendirme M4)

- Değişen: ters yöndeki 12 bağ (uretim-emirleri -> stok 7, uretim-emirleri/satın alma -> sevkiyat 3, Reçete ve Rota -> stok çözücü 2)
  artık modül yüklenirken yan etkiyle kurulmuyor; tek yerde, `sunucu/kablolama.ts` `kablola()` kurar. Sıra bugünkü yükleme sırası
  (stok, sonra sevkiyat). Çağıranlar: `sunucu/ana.ts`, `araclar/ornek-veri.ts`, sunucu testlerinin ön yüklemesi `araclar/kablolama-yukle.ts`.
- Modüllerde yalnız kayıt satırları kalktı; dinleyici gövdeleri adlı işleve döndü ve `disari.ts`'ten verildi. Davranış aynı.
- Eklenen: `sunucu/kablolama.test.ts` (iptal olayı stoğa ulaşır, ikinci `kablola` ikilemez; kablosuz yüklemede hiçbir dinleyici
  kendiliğinden kaydolmaz). Silinen: yok. Onaylı karar değişmedi; ADR 0006 güncellemesi ayrıca sorulacak.

## cekirdek-adr-0006 (kullanıcı kararı "Güncellensin", 16.10.2026)

- ADR 0006'ya karar 6 eklendi: olayı haber veren modül `...Dinle`/`...Cozucusu` tanımlar, dinleyen modül işlevini kendi `disari.ts`'inden verir,
  bütün bağlar `sunucu/kablolama.ts`'teki tek listededir. Vazgeçilenlere "modülün yüklenirken kendini kaydetmesi" eklendi.
- Eklenen: `bag()` ve `sunucununBaglari()`; bir bağın ucu çalışma anında yoksa `kablola` hiçbir bağı kurmadan hata atar, `sunucu/ana.ts` açılmaz.
  Testler: bütün bağların iki ucu var; eksik bağda hata ve sıfır kurulum. Davranış ve ekranlar aynı. Silinen: yok.

## cekirdek-is-tx-disi (Logo çekirdek isteği 2, SmartES çekirdek isteği 4; borç 258, 405)

- Eklenen: `IsTanimi.txDisi?: (vt: Veritabani, gunluk: Gunluk) => Promise<void | IsBekliyor>` (`TxDisiIs`). `calis` ile `txDisi`'den tam biri
  verilir; ikisi birden ya da hiçbiri `isTanimi`'de hata. txDisi turu transaction açmaz: kilit oturum düzeyinde (`pg_try_advisory_lock`, anahtar
  önceki gibi şema + iş adı) ödünç alınan tek bağlantıda tutulur, tur bitince aynı bağlantıda bırakılır. İş kendi kısa transaction'larını `vt.tx`
  ile açar, dış köprüyü transaction dışında bekler; hata atarsa önceki transaction'ların yazıları kalır. Tur iki bağlantı kullanır (havuz en az 2).
- Eklenen: `Veritabani.oturumda?<T>(is: (db: Db) => Promise<T>): Promise<T>` (isteğe bağlı; elle kurulmuş sahteler kırılmaz). Bağlantı havuza
  `DISCARD ALL` ile döner; iş ya da temizlik hata verirse bağlantı kapatılır (kilit sunucuda düşer). Açık transaction bırakan iş hata alır.
  Yöntemi olmayan veritabanıyla txDisi turu açık hatadır, iş koşmaz.
- Değişmeyen: `calis` işleri aynen (tek transaction, `pg_try_advisory_xact_lock`); iki biçim aynı anahtarı paylaşır, birbirini atlatır.
  Logo ve SmartES işleri geçirilmedi (satın alma şeridi). Silinen: yok. Onaylı karar değişmedi.

## stok-fason-eksik-alani (Stok şeridi sözleşme isteği; kullanıcı kararı "fason eksikte İş kutusu uyarısı")

- Eklenen: `paylasilan/sozlesme/stok.ts` `isKutusuCevabi.fasonEksikGonderimi: z.number().int().optional()`. Sunucu henüz doldurmuyor;
  Stok şeridi doldurunca `.optional()` kalkar. Aynı şemadaki `fasondaEksik` (kart #1310) değişmedi.
- Yerel doğrulama (16.10.2026): `npm run tip` temiz; `npm run sinir` 1487 dosya, 0 ihlal; eslint temiz; `test:modul -- stok` 149/149.
  Silinen: yok. Onaylı karar değişmedi.

## 551d-cekirdek (kullanıcı kararı 560 b, 26.10.2026)

- Eklenen: tekrar korumasız yazma ucuna `istek-kimligi` başlığı gelirse istek reddedilmez, uç adıyla günlüğe uyarı yazılır
  ("Korumasız uca istek kimliği geldi; yineleme koruması yok"). GET, kimliksiz istek ve korumalı uç uyarı yazmaz.
- Neden 400 değil: ölçümde (551d-OLCUM) kural 25 modülde 72 test dosyasının yardımcısını kırdı, gerçek ekran kayması bulunmadı.
- Test: `uc-tekrar.test.ts` "korumasız yazma ucuna istek kimliği gelirse...". Göç yok. Silinen: yok. Onaylı karar 551 2 a, 560 b ile değişti.
