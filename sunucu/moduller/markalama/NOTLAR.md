# markalama notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır.

- Arkon'daki markalama paneli seriyi istemcide, paket kaydında üretiyordu; tekillik yoktu. Bu modül seriyi sunucuda sayaçtan verir
  (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`), `markalama_birimi.seri_no` tekil kısıtla korunur. Panelin bu modüle geçmesi ayrı dal.
- Önizleme sayacı tüketmez; ekrandaki "sıradaki seri" öngörüdür. Aynı anda iki istasyon markalarsa numarayı sunucu belirler.
- Markala tekrar korumalıdır: ağ koparsa aynı istek kimliği ilk cevabı döner, ikinci numara yanmaz.
- Hatalı markalama numarayı yakar ve birimi hurdaya düşürür (olay `hatali_markalama`); numara yeniden verilmez.
- 3B yer modelin sahne çerçevesindedir (model okuyucusunun Y yukarı, mm çerçevesi). Yer revizyona bağlıdır: revizyon değişince yer yeniden işaretlenir;
  ekran tanımdaki revizyon yoksa uyarır. Vazgeçilen: yeri yüzey kimliğiyle (B-rep face) tutmak; okuyucu yüz kimliği vermiyor.
- {PARCA} malzemenin stok kodudur (`malzemeler/disari.ts` `malzemeOzeti().kod`).
