# Finans kayıt formları tarayıcıda (kart #246, dal 246-finans-form)

Headless Chromium, yönetici oturumu, `http://127.0.0.1:4101/finans/firmalar`. Her adımda çerçevenin içinde formun gerçek gönder düğmesine tıklandı;
kabuğun TMI sunucusuna yaptığı yazma istekleri ağdan (CDP Network) kaydedildi. Betik: `sekiz-form.mjs`, ham çıktı: `sonuc.json`, her adımın ekranı: `<adım>-<form>.png`.

Çerçevenin sandbox özniteliği: `allow-scripts allow-downloads allow-forms allow-modals`

| Adım | Form | Düğme | Bildirim | Sunucuya yazma |
|---|---|---|---|---|
| 1 kurulum (ekForm/kurulum) | ekForm/kurulum | Kurulumu tamamla | Kurulum tamamlandı. | POST /api/finans/hesaplar/ekle → 200, POST /api/finans/ayar/guncelle → 200 |
| 2 hesap (ekForm/hesap çekmecesi) | ekForm/hesap | Kaydet | Hesap kaydedildi. | POST /api/finans/hesaplar/ekle → 200 |
| 3 firma (firmaForm) | firmaForm | Kaydet | Firma açıldı. | POST /api/finans/firmalar/ekle → 200 |
| 4 KDV oranı (ekForm/kdv) | ekForm/kdv | Oran ekle | KDV oranı eklendi. | POST /api/finans/kdv-oranlari/ekle → 200 |
| 5 kur (ekForm/kur) | ekForm/kur | Kur ekle | Kur kaydedildi. | POST /api/finans/kurlar/ekle → 200 |
| 6a satış faturası (flowForm/satis) | flowForm/satis | Satışı kaydet | Satış kaydedildi. | POST /api/finans/belgeler/ekle → 200 |
| 6b belge düzeltme (txForm) | txForm | Değişiklikleri kaydet | Belge düzeltildi. | POST /api/finans/belgeler/5/duzelt → 200 |
| 7 alınan çek (flowForm/cekal) | flowForm/cekal | Çeki kaydet | Çek kaydedildi. | POST /api/finans/cekler/ekle → 200 |
| 8 çek düzeltme (chqForm) | chqForm | Kaydet | Çek düzeltildi. | POST /api/finans/cekler/5/duzelt → 200 |

Sekiz form: ekForm (kurulum, hesap çekmecesi, KDV, kur), firmaForm, flowForm (satış ve alınan çek iki ayrı tür), txForm, chqForm. Hepsi kaydetti (2xx).

Ek gözlem (izinle ilgisiz, prototipin kendi davranışı): Ayarlar > KDV oranları ya da Kurlar sekmesi açıkken çekmece formu (örn. virman) açılırsa
çekmecedeki `form="ekForm"` düğmesi sayfadaki ekForm'a bağlanıyor (ölçülen: `{'cekmeceDugmesininFormu': 'kdv'}`). UYUM-BORCU'ya yazıldı.
