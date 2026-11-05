# KURAL-TEST: bildirim

| Kural | Nerede | Test |
|---|---|---|
| BIL-1 Mesaj ve e-posta kanalları bu aşamada kapalı; seçim saklanır | `kurallar.ts` `ACIK_KANALLAR` | `tercihler: yalnız alabileceği olaylar ...` (`kanallar` iki kanal da false) |
| ALT-8 Tercih yalnız kişinin tercih listesindeki türe yazılır; e-posta seçemeyenin e-posta isteği 400 (sessizce kapatılmaz) | `kurallar.test.ts` `tercih kuralı: ...` (izinli istek geçer); `bildirim.test.ts` `tercihler: yalnız alabileceği olaylar ...` | `bildirim.test.ts` `alamadığı türe tercih yazılamaz: 400, satır açılmaz`, `operatör e-posta seçemez ve tercih listesi boştur: ...` |
| BIL-2 Operatörde e-posta seçeneği çıkmaz | `kurallar.ts` `epostaSecilebilir` | `BIL-2: ...` (saf); `operatör e-posta seçemez ...` (akış) |
| BIL-3 Alıcı: olay türünün işlem sahibi ya da adıyla verilen etkin kişi; tetikleyen almaz | `kurallar.ts` `alicilariSec` | `BIL-3` üç saf test; `olay işlem sahiplerine gider ...`, `adıyla verilen kişi de alır ...` |
| BIL-4 Okunmamış aynı kaynak yeni satır açmaz, sayaç artar | `kurallar.ts` `tekilAnahtar`; dizin `bildirim_kaydi_tekil_okunmamis` | `BIL-4` (saf); `aynı kaynak okunmamışken ...` |
| BIL-5 Başlık boş olamaz, uzun metin kesilir | `kurallar.ts` `metniHazirla`; kısıt `bildirim_kaydi_baslik_gecerli` | `BIL-5` (saf); `geçersiz yol ve boş başlık olayı yazmaz` |
| BIL-6 Gönderilen yol türün ekranı ya da altıdır; alıcı roller o ekranı açar | `kurallar.ts` `yolTureUyar`; tür alanı `yol` | `BIL-6` (saf); `araclar/bildirim-yollari.test.ts` (rol x sayfa) |
| Kişi yalnız kendi satırını görür ve işaretler | `sorgular.ts` `kisi_id = $` | `başkasının bildirimi görünmez ...` |
| BIL-7 Ekip çağrısının alıcısı ekibin yönlendirmesindeki rollerdeki etkin, girişli kişidir; açan almaz; boş yönlendirme kimseye gitmez | `servis.ts` `ekipCagrisiBildir`, `kurallar.ts` `alicilariSec` | `cagri-yonlendirme.test.ts`: `varsayılan ...`, `BIL-7 ...`, `pasif kişi düşer`, `boş yönlendirme ...`, `yönlendirme değişince ...` |
| BIL-9 Kişinin "benim ekiplerim" listesi çağrının ona gideceği ekiplerdir; yalnız oturumdaki kişi | `servis.ts` `cagriEkiplerim` | `cagri-yonlendirme.test.ts`: `benim ekiplerim: ...`, `benim ekiplerim yönlendirmeyle değişir ...`, `benim ekiplerim oturum ister ...` |
| BIL-8 Yönlendirmeye ve alıcı ayarına yalnız var olan rol ve etkin girişli kişi, bir kez yazılır | `kurallar.ts` `olmayanKimlikler`; şema `cagriYonlendirmeDegistirGovdesi` | `BIL-8` (saf); `BIL-8: olmayan rol ve yinelenen rol reddedilir` |
| Ekip listesi sözleşme, yönlendirme ve duruş nedeni kısıtında aynı | kısıtlar `bildirim_cagri_ekibi_ekip_gecerli`, `durus_nedeni_ekip` | `ekip listesi sözleşme, yönlendirme ve duruş nedeni kısıtında aynıdır` |
| BIL-10 Seçim yapılmış türde alıcı yalnız seçilen rollerdeki ve seçilen etkin girişli kişilerdir (yönetici seçilmediyse almaz); seçimsiz türde işlem kuralı; kayda bağlı kişi iki durumda da alır | `kurallar.ts` `alicilariSec` (`ayarli`); `servis.ts` `ayarliAlicilar` | `BIL-10` iki saf test; `tur-alicilari.test.ts`: `seçimsiz türde ...`, `BIL-10 ...` (iki), `tercih listesi seçime uyar ...`, `ikisi de boş yazılınca ...`, `yönetici rolü seçilirse ...` |
| Alıcı ayarı sürümle yazılır; ilk yazım sürümsüz, ayarlı türe sürümsüz yazım eski sürümdür | `sorgular.ts` `turAyariYaz` | `tur-alicilari.test.ts`: `sürüm denetimi ...` |
| BIL-11 Elle yayının önemi türünden (uyarı, acil; duyuru ve bilgi -> bilgi) | `kurallar.ts` `YAYIN_ONEMI` | `BIL-11` (saf); `yayin.test.ts`: `herkese yayın ...` |
| BIL-12 Yayın zamanı boş ya da geçmişse hemen; en çok 90 gün ileri; bitiş yayından sonra | `kurallar.ts` `yayinZamaniHatasi`, `hemenMi`; kısıt `bildirim_yayini_bitis_sonra` | `BIL-12` (saf); `yayin.test.ts`: `ileri tarihli yayın ...` |
| BIL-13 Alıcı yayın anında etkin girişli adaydır; yazan almaz; bir kez dağıtılır | `kurallar.ts` `yayinAlicilari`; `yayin.ts` `yayiniDagit` (satır kilidi) | `BIL-13` (saf); `yayin.test.ts`: `herkese yayın ...`, `rol, kişi ve istasyon hedefi ...`, `ileri tarihli ...` (ikinci tur 0) |
| BIL-14 Raporu yazan ve `bildirim.yayin-oku` görür; geri çekmek yalnız yazanın | `kurallar.ts` `yayiniGorurMu`; `yayin.ts` `geriCek` | `BIL-14` (saf); `yayin.test.ts`: `geri çekilen yayın ...` |
| BIL-15 Onay isteyen onaylanana dek ortada kalır ve arşivlenemez; onaysız okunana dek | `sorgular.ts` `ortadakiler`, `arsivle`; kısıtlar `bildirim_kaydi_onay_*` | `yayin.test.ts`: `herkese yayın ...`, `onaysız ortadaki ...` |
| BIL-16 Otomatikte yalnız acil önem ortada | `kurallar.ts` `otomatikOrtadaMi`; `servis.ts` `bildirimGonder` | `BIL-16` (saf); `yayin.test.ts`: `2147-3 a: otomatik acil ...` |
| Görseli yalnız yükleyen bağlar; alıcı, yazan ve rapor işlemi görür | `yayin.ts` `yayinla`, `yayinGorseli` | `yayin.test.ts`: `görsel yerel depoda ...` |
