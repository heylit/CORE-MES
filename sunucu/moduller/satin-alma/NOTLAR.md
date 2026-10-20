# satin-alma (sürüm 6: Satın Alma Merkezi gömülü modül)

- Kullanıcı kararı (07.10.2026): Satın Alma Merkezi'nin arayüzü, akışı ve işlevleri değişmeden TMI'ye girer. Ekran kodu
  `istemci/.../satin-alma/merkez/` altında prototipin kendisidir; TMI'ye `merkez/tasiyici.ts` bağlar.
- Ana menüde tek sayfa (`/satin-alma`); bölümler ikinci menüde ve menüyü kabuk çizer (şartname). Prototipin kendi menüsü
  çizilmez (`renderNav` boş). Ekran madde rotasından gelir; içeride sayfa değişince adres madde yoluna güncellenir, ayrıntı korunur.
- "Taleplerim" şimdilik yok (kullanıcı kararı); `talep-ac` duruyor, satın alma ve müdür talebi içeriden açar.
- Teslim alma bu modülde YOK (kullanıcı düzeltmesi): mal kabul stokta (belge, sayım, parti), kalite mal kabulden önceki GKK rota
  adımında. Okuma noktası `teslim-bilgisi.ts`: stok `teslimAlinanlar`, rota/kalite `gkkSonuclari`; ikisi gelene kadar boş döner,
  sipariş "teslim bekleniyor"da kalır. "Teslim alındı" yazılmaz, bütün siparişler tam kabul edilince türetilir.
- Sipariş satırı (`satin_alma_siparis_satiri`) tamsayı kimliklidir; stokun mal kabulü ve GKK buna bağlanır. Kayıt yeniden
  yazılınca kimlik korunur (eşitleme). Stok satırları `disari.ts` `siparisSatirlari` ile fiyatsız okur.
- Talep bütün olarak, sürümle kaydedilir (`/kaydet`). Gereken işlemi değişikliğin türü belirler (`degisiklikTuru`).
- Tuzak: karşılaştırma alan ve küme sırasından ve sunucuya ait alanlardan bağımsız olmalı; ondalıklar sade gönderilir (`sade`).
  Biri bozulursa müdürün onayı 403 alır (yaşandı; `tasiyici.test.ts` korur).
- Onay ve geçmiş yalnız eklenir; kişi ve zaman sunucunundur.
- Teklif toplamı, ilk toplam ve revizyon sunucuda (`satin_alma_teklif_toplami`). Karar destek hesapları ekranda (kullanıcı kararı 10).
- Kimlikler istemcide üretilen uuid'dir (bütün kaydı; sipariş satırı hariç). Tedarikçi kimliği firma kimliğidir.
- Kataloğun malzeme bağı `malzeme_no` → `malzeme_katalog_karti(no)`; bugün boş (senkron sonra), yabancı anahtar Aşama 2'de (SA4).
- Tedarikçi finanstaki firmadır: firma finansta açılır, burada seçilir (S1). Finans yokken firma yok (`firma-gecici.ts`), yeni tedarikçi eklenemez.
- Teklif fiyatı denetim kaydına ek satırı olarak girer (S2): talep açma ve kaydetme gövdesiz denetlenir, fiyatı değişen her teklif ve kalem bir satır.
- Prototip dinleyicileri `document`'a bağlıdır; yalnız `[data-sa-merkez]` içinde çalışır. Çizim yalnız modül bağlıyken.
- Stil `.sa-kok` altında, değişkenler `--sa-` önekli ve TMI değişkenlerine eşli; sabit satır içi stiller `data-sa-y` kurallarında.
- Sayaç ucu `/satin-alma-menu-sayaclari`: "Talepler" prototipin açık tanımını (OPEN) sayar; yetkisiz madde boş.
- Kaldırılanlar: TCMB'den kur (dış servis yok), örnek veri, JSON yedek, görünüm seçicisi, depo ekranı.
