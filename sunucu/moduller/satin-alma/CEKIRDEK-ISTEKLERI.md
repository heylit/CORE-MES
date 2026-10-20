# CEKIRDEK-ISTEKLERI: satin-alma (kart #162, dal 162-satin-alma-uyum)

Çekirdek konusuna (kart #259) koordinatörle iletildi. Her madde: ne, neden, önerilen imza.

## Ç1. İkinci menü toplayıcı satırı ve iki test (bu dalın birleşmesi için gerekli)
- Ne: `paylasilan/sayfalar.ts` `IKINCI_MENULER`'e `SATIN_ALMA_IKINCI_MENU` (ithal `./sayfalar/satin-alma.ts`).
  `paylasilan/sayfalar.test.ts` "Satın Alma grubu ..." testinde beklenen yollar `['/satin-alma']`.
  `sunucu/moduller/oturum/oturum.test.ts:192` `SAYFA('satin-alma', 'satin-alma-taleplerim', 'satin-alma-onaylari', 'satin-alma-teslimleri')` -> `SAYFA('satin-alma')`.
- Neden: dört sayfa tek sayfaya indi (kullanıcı emri, Aşama 1 1. tur); menüyü kabuk çizer, toplayıcıda olmayan menü görünmez.
  DOĞRULANDI (komut çıktısı, yerelde gönderilmeden): üç değişiklikle `paylasilan/sayfalar.test.ts` + `oturum.test.ts` "pass 31, fail 0".
  Değişiklik olmadan bu dalda `sayfalar.test.ts` iki testte ("Satın Alma grubu ...", "modül dosyasındaki her ikinci menü toplayıcıdadır ...")
  ve `oturum.test.ts` bir testte kırmızıdır. İstemcide menü eşlemesi (`gorunumler.ts`) menüyü toplayıcıdan okur: satır gelmeden satın alma sayfası
  "açabileceğiniz bir bölüm yok" der.
- Not: üç sayfa işlemi (`sayfa.satin-alma-taleplerim`, `-onaylari`, `-teslimleri`) kalkar; hiçbir role verilmemişti (rol göçünde yok, DOĞRULANDI `grep sunucu/gocler`).

## Ç2. KAPANDI: Denetim kaydında değişiklik listesi (kullanıcı kararı S2, 07.10.2026; çekirdek `denetimEki` #290, satın almada UYUM-BORCU 13)
- Ne: `POST /satin-alma-talepleri/:id/kaydet` denetim kaydına ne tam gövde ne gövdesiz girer; teklif kimliği, tedarikçi, kalem, birim fiyat, para birimi,
  miktar, önceki ve yeni değer girer; dosya eki ve serbest metin girmez.
- Neden: bugünkü özet seçici (`sunucu/cekirdek/uc.ts:26-52, 99-107`) yalnız gövdeyi görür, en çok 8 ilkel alan ve 512 bayt döner; önceki değeri göremez.
  Talep bütün olarak (N teklif x M kalem) tek gövdede gelir; karar bu sınıra sığmaz.
- Önerilen imza (iki yoldan biri):
  a) işleyici bağlamına `denetimEki(satirlar: readonly Record<string, string | number | boolean | null>[])`: işleyici önceki ve yeni kaydı bildiği için
     değişen satırları kendisi verir; satır başına en çok 8 ilkel alan, en çok 200 satır; aşan komut 500 ile geri alınır (bugünkü seçici kuralı gibi).
  b) `denetimOzeti?: (govde, onceki) => DenetimSecimi[]` ve uç tanımında `denetimOncesi?: (db, parametre) => Promise<unknown>`.
  Öneri a: önceki değer zaten serviste okunuyor (`talepKaydet` `eski`), ikinci okuma gerekmez.
- Ayrıca: uç çekirdeğin sabit denetim listesi testine `govdesiz+secim` (ya da yeni kip) olarak girer.
- Çekirdek gelene kadar: uç değişmedi, gövde TAM girer (UYUM-BORCU 13).

## Ç3. (önceki teslimden, açık) rol x işlem önerisi
- Teslimin önerdiği matris onay bekler (UYUM-BORCU 6); bu turda istenmedi.

## Tur 4 (teslim 08.10.26 14.33)
Teslim beş çekirdek isteği getirdi; durumları:
- Ç1 "Satın Alma" menü grubu: depoda var (1. tur).
- Ç2 toplayıcılar: depoda var. Bu turda değişen tek çekirdek liste satırı `sunucu/moduller/oturum/oturum.test.ts` `SATIN_ALMA` (`satin-alma.teslim-al` çıktı), dar istisnayla ayrı commit.
- Ç3 rol x işlem matrisi: yazılmadı; işlemler yalnız yöneticide, roller Aşama 2'de. Teslimin matrisindeki `firmalar.yaz` ve `sayfa.firmalar` ayrı firmalar modülü olmadığı için geçersiz (UYUM-BORCU 6).
- Ç4 firmalar göçünün damgası: geçersiz; ayrı firmalar modülü yok, firma finansta (kullanıcı kararı SA2).
- Ç5 tablette sol ikinci menü (768 pikselden itibaren sütun): bu dalda yapılmadı; bütün modülleri etkilediği için ortak arayüz listesine gitti (kullanıcı kararı).
  Teslimin ölçümü: 1024 ve 820 pikselde sütun, 600 pikselde şerit; yalnız kip eşiği değişir.
