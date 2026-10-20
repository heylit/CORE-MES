# Plan, çizelge ve kuyruk

Kural kodu: PLAN. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| PLAN-01 | Çizelgelenen birim emir değil adımdır; her adım kendi tezgahının kuyruğuna girer. | Tanım | onay bekliyor | |
| PLAN-02 | Bir adımın başlangıcı şunların en geç olanıdır: bugün, elle verilen başlangıç, öncül adımın bitişi, tezgah kuyruğunun boşalması. | Hesap | onay bekliyor | |
| PLAN-03 | Bir günün kullanılabilir dakikası, tezgahın o günkü vardiya saati çarpı 60'tır; sıfırsa o gün tatildir ve atlanır. | Hesap | onay bekliyor | |
| PLAN-04 | Önce ayar süresi tüketilir (birden çok güne taşabilir), kalan dakika üretime gider ve bir parça güne bölünebilir. | Hesap | onay bekliyor | Kapasite boşa gitmesin diye. |
| PLAN-05 | Plan kalan adede göre yapılır; üretim başlamışsa ayar yapılmış sayılır, iş duraklatılıp yeniden ayar işaretlenmişse ayar tekrar eklenir. | Hesap | onay bekliyor | Kalan adet: emir adedi eksi gerçekleşen. |
| PLAN-06 | Plan bugünden öncesine kaymaz. | Değişmez | onay bekliyor | |
| PLAN-07 | Çizelge bir taahhüttür: veri değişince plan yalnız "bayat" işaretlenir, tarihler kendiliğinden kaymaz. | Değişmez | onay bekliyor | Gün geçse de tarihler aynı kalır. |
| PLAN-08 | Tarihi ileri taşıyan tek yol planı yayınlamaktır; otomatik yayın ve otomatik yeniden hesap yoktur. | Değişmez | onay bekliyor | |
| PLAN-09 | Yayınlama planı bugüne göre yeniden hesaplar, kimin ne zaman yayınladığını damgalar ve bayat işaretini kaldırır. | Akış | onay bekliyor | |
| PLAN-10 | Plana girmeyen bir işlem (stok hareketi, form düzenleme gibi) plan tarihlerini değiştirmez. | Değişmez | onay bekliyor | |
| PLAN-11 | Onay donmadır: optimizer önerisi onaylanınca tezgah gerçekten atanır ve adım sabitlenir; serbest bırakılmadan motor yeniden dağıtmaz. | Değişmez | onay bekliyor | |
| PLAN-12 | Öneri, dayandığı verinin parmak izini taşır; arada veri değiştiyse onay reddedilir. | Değişmez | onay bekliyor | |
| PLAN-13 | Tezgahsız adımlar senaryo ile dağıtılır: aday tezgahlar gerçek vardiya kapasitesiyle simüle edilir ve en erken bitiren seçilir, en boş olan değil. | Akış | onay bekliyor | Stratejiler: dengeli, en erken bitiş, az ayar. |
| PLAN-14 | Plan puanında ufka sığmama baskındır (sığmayan plan hep kaybeder); sonra toplam süre, tezgah dengesi ve ayar oranı gelir. | Hesap | onay bekliyor | Termin varsayılan olarak puanı etkilemez, karnede raporlanır. |
| PLAN-15 | Bitiş günü üç durumda hesaplanamaz: kaynak yok, kalan adet sıfır, süre girilmemiş; üçü de veri eksiğidir, hata değildir. | Tanım | onay bekliyor | |
| PLAN-16 | Bitişi hesaplanamayan iş "zamanında" diye gösterilmez, "eksik veri" denir. | Değişmez | onay bekliyor | |
| PLAN-17 | Kuyruk tezgah başına iş sırasıdır; sıra değişikliği onay bekler, sırası verilmeyen adım sona düşer. | Akış | onay bekliyor | |
| PLAN-18 | Adım başka tezgaha taşınınca adımın istasyonu da yeni tezgahı izler; yoksa operatör işi görür ama kayıt giremez. | Değişmez | onay bekliyor | |
| PLAN-19 | Projenin planlanan bitişi kaydedilmez, açık emirlerin çizelgedeki en geç bitişinden hesaplanır. | Hesap | onay bekliyor | |
| PLAN-20 | Plan geçmişi tutulmaz; her zaman tek plan vardır. | Sınır | onay bekliyor | Eski karar; yayın tabanı saklama kararı uygulanmamıştı. |
| PLAN-21 | Yayınlanan planın tabanı saklanıp gerçekleşenle karşılaştırılacaktı (karar verilmiş, uygulanmamış). | Açık soru | onay bekliyor | Yeni sistemde taban (baseline) ilk kapsamda mı? Taban tutmak otomatik yayın demek değildir. |
| PLAN-22 | Muayene ve kalite adımları çizelgede sıfır dakika tutuyordu, çünkü bu adımların süresi ve istasyonu girilmemişti. | Açık soru | onay bekliyor | Plan kalite için süre ayırsın mı? |
| PLAN-23 | Plan uyarıları beş kalemdi: plan, mesai, gecikmiş, termin, kapasite. | Tanım | onay bekliyor | |
| PLAN-24 | Termin olmayan emir "terminsiz" listelenir ve gecikme sayacı çalışmaz. | Açık soru | onay bekliyor | Termin zorunlu olursa bu satır düşer (bkz. UE-22). |
