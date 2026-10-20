# Aşama 2, tur 1 (akış C, tedarik): stok listesi

Kart #206 (açık, kabul Aşama 2'de). Dal önerisi: `206-bagla-tedarik` (kullanıcı "yaz" demeden açılmaz). Taban: main `c73e2d4`.
Dayanak: `bagla/HAZIRLIK.md` (SH1 a, SH2 b, SH3 a, SH4 a, SH5 b, SH6 a, TR1 a) ve `sunucu/moduller/stok/UYUM-BORCU.md`.

## Stokun yazacakları (bu tur)

| # | İş | HAZIRLIK | Kapanan borç | Göç | Bekler |
|---|---|---|---|---|---|
| Y1 | Mal kabul satırına sipariş satırı: `stok_mal_kabul_satiri.siparis_satir_id bigint` (boş olabilir; ad satın almayla uzlaşıldı) + yabancı anahtar `satin_alma_siparis_satiri(id)`; aynı satır iki kez bağlanırsa miktar sınırı satın almada | C7 | 18 | [G-DOLU] var olan tabloya boş olabilen sütun; satır değişmez | onay (S1) |
| Y2 | SH1 a: mal kabul komutu, satır siparişe bağlıysa satın almanın `teslimIsle(db, kullanici, {siparisSatirId, miktar, malKabulSatirId})`'ini aynı işlemde çağırır (miktar pozitif ondalık metin; kişi ve tarih satın almada sunucudan). Mal kabul düzeltmesi (DEP-53) eski satır için `teslimGeriAl(db, kullanici, {malKabulSatirId})`, yeni satır için `teslimIsle` çağırır; satın alma kaydı silmez, ters kayıt ekler. Satın almanın 422/409 hatası olduğu gibi geçer, işlem geri sarılır. Kalan miktarı aşan teslim: TS1 (kullanıcıya soruldu). Yön stok -> satın alma; satın alma stoğu ithal etmez (döngü denetimi) | C6 | 18 | yok | satın alma isteği (İ1) |
| Y3 | Mal kabul ekranında siparişe bağlı kabul: tür "satın alma" seçilince açık sipariş satırları (tedarikçi, malzeme, kalan miktar) listelenir, satır seçilince malzeme ve miktar dolar | C6 | 18 | yok | ekran onayı (S2), İ1 |
| Y4 | Toplu ad ve arama: `malzemeOzetleri` ile satır başı çağrılar teke iner (liste, panel); `malzemeAra` ile mal kabul ve Malzemeler araması adla çalışır | C5 | 2, 5, 9 | yok | malzemeler isteği (İ2) |
| Y5 | Birim: sözleşmeye `birim` alanı (özette var), Malzemeler, ayrıntı ve mal kabulde gösterim | C13 | 4, 21 | yok | ekran onayı (S3) |
| Y6 | Üretime sarfta iş merkezi kapsamı (DEP-36): `emirOzeti.istasyonId` -> `istasyonGetir` -> iş merkezi; kişinin izinli iş merkezleri `kisininIzinliIsMerkezleri`; dışındaysa ret | C11 | 1 | yok | yok (fonksiyonlar var) |
| Y7 | Tekrar koruması: bütün yazma uçları `tekrarKorumali`, istemci `useStokKomutu` istek kimliği taşır (görünüm değişmez). Mal kabul artık satın almaya yazdığı için bu turda zorunlu. Ortak arayüz isteğini de karşılar (`ortak-arayuz/bagla-borc-listesi.md`: ağ hatasından sonra yeniden gönderilen mal kabul ve stok hareketi) | C15 | 7, 12 | yok | yok |
| Y8 | Toplamayı kapatma kişi denetimi | C15 | 15 | yok | karar (S4) |
| Y9 | Okuma uçları yetkisi | C15 | 13 | yok | karar (S5) |
| Y11 | Depocu modu anahtarı ortak cihaz tercihine taşınır (ortak arayüz #357, #172; tablette cihaza göre sade menü). #357 ana dala girince; ekrana dokunursa önce ve sonra görüntüsü | - | 10 | yok | #357 |
| Y10 | Belge düzeltmesi: `BASKA-MODUL-ISTEKLERI.md` satır 23 eski (yabancı anahtar yok, servis denetimi var) | bulgu 5 | - | yok | yok |

Bu tura girmeyenler (gerekçe):
- C10 / borç 11 (emir yabancı anahtarı): SH3 a'ya göre sarf iş emrine bağlanır; iş emri tablosu yeni emir modelinde, bugün depoda yok. Tur 2'de (akış A) UE modeli gelince.
- C12 / borç 16 (firma): satın alma kabulünde tedarikçi siparişten okunur, stokta sütun gerekmez (VARSAYIM, geri alma: yeni sütun göçü). Fason firma ve fason konumu kapalı kalır: S6.
- Borç 17 (üretim alanı): SH5 b istasyonlarda bayrak göçü ister; HAZIRLIK'e göre ayrı gelir.
- Borç 3 (emir numarası): UE `emirNolari` isteği.
- Borç 14 (DEP kurallarının kaynağı): eski kural karşılaştırması kullanıcıya ayrı liste olarak sorulur; bu turun işi değil.
- Borç 19, 20, 22, 23: akış C dışı ya da "sonra".

## Başka parçalara istekler (stok yazmaz)

- İ1 satın alma (uzlaşıldı, satın alma oturumu 2026-10-09): `teslimIsle(db, kullanici, {siparisSatirId, miktar, malKabulSatirId})` ve `teslimGeriAl(db, kullanici, {malKabulSatirId})`; çağıranın işleminde, yetki denetlemez; sipariş satırı yok ya da talep iptal: 422. Kalanı aşan teslim TS1'e bağlı (ret çıkarsa `teslimIsle` 409). `siparisSatirlari`'na açık satır süzgeci (tedarikçi adı, malzeme no, kalan miktar). `teslim-bilgisi.ts` `teslimAlinanlar` geçici karşılığı kalkar (SH1 a ile stok bu fonksiyonu vermez).
- İ2 malzemeler: `malzemeOzetleri(db, idler): Map<number, KatalogMalzemeOzeti>`; `malzemeAra(db, { metin, turler?, yalnizAktif?, sayfa })` (rota ile tek imza).
- İ3 uretim-emirleri (yalnız UE listesi): `emirNolari(db, idler)`; iş emri modeli ve sarfın bağlanacağı iş emri kimliği (SH3 a).
- Rol satırları: ortak yetki matrisinden, kullanıcı onayıyla (stok işlemleri `stok.*`).

## Sorulanlar (kullanıcıya)

S1 göç onayı, S2 mal kabul ekranı, S3 birim gösterimi, S4 toplama kapatma, S5 okuma yetkisi, S6 fason firma. Metinleri thread cevabında.
