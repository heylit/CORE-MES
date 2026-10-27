# UYUM BORCU: markalama (kart #806, dal 806-markalama)

Her madde: kural / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak
1. Rol x işlem satırı yok: `sayfa.markalama` ve üç işlem hiçbir rolde değil; modül yalnız bayraklı yöneticide (Aşama 1). Uyum: ortak yetki matrisinden.
2. Yabancı anahtarlar yok (Aşama 1): `malzeme_id` (malzemeler), `uretim_emri_id` (uretim-emirleri), `istasyon_id` (istasyonlar), `hurda_nedeni_id`
   (durus-nedenleri), `model_belge_id` (cizimler), (malzeme, op_no) -> rota adımı (rota). Uyum: ayrı göçle. VARSAYIM: op no rota adımının op numarasıdır.
3. Rota onayı: tanımın rota adımı var mı denetlenmiyor; rota iptal ya da op silinince tanım kalır. Uyum: rota `disari.ts` okuması.
4. Arkon markalama paneli seriyi hâlâ istemcide üretiyor; panel bu modülün `markala` ucuna geçmeli (ayrı dal, Arkon modülü).
5. Kalite: red ve hurdanın KM NCR kaydına bağlanması (karar 4a). Uyum: kalite modülü `disari.ts` ile, akış akış.
6. Hurda nedenleri `GET /hurda-nedenleri`'den okunur; o ucun okuma yetkisi `sayfa.markalama`'yı içermez. Yöneticide çalışır; kalite rolünde 403 olur.
   Uyum: durus-nedenleri okuma listesine `sayfa.markalama` (BASKA-MODUL-ISTEKLERI).
7. 3B model Çizim Merkezi okuma yetkisi ister; operatörde 403 olabilir (ekran yazıyla uyarır). Uyum: rol matrisinde operatöre `cizimler.oku` ya da cizimler okuma listesine `sayfa.markalama`.
8. `paylasilan/islem-adlari.ts` satırları #811 birleşince ayrı yama (DEVIR'de); o yama olmadan `tip` kırmızıdır, bu yüzden teslimin bütün yamaları birlikte girer.
9. Emir özeti ve izleme kişi adı göstermiyor (yalnız `kisi_id`). Uyum: kisiler `disari.ts`.
