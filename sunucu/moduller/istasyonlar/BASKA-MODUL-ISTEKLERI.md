# Başka modül istekleri: istasyonlar

1. arkon (Arkon konusuna iletildi): `sunucu/moduller/arkon/guvenlik.test.ts:1390` ve `:1415`'teki `POST /makineler/:id/guncelle` gövdelerine `surum: 1`.
   Neden: güncelleme sürüm ister (IS9); sürümsüz çağrı 400 alır. Bugünkü main'de zararsız (fazla alan atılır).
2. uretim-emirleri (kullanıcıya iletilir; bu modüle yazılmaz): `servis.ts` `adlariAl` her okumada `istasyonlar(db, { pasiflerDahil: true })` çekip adları bellekte eşliyor.
   İstek: `istasyonAdlari(db: Db, idler: number[]): Promise<Map<number, string>>` (`istasyonlar/disari.ts`) ile yalnız gereken kimliklerin adlarını alması.
3. uretim-emirleri: rota adımı ya da iş emri operasyon tipi taşıyacaksa `operasyonTipleri(db, { pasiflerDahil }?): Promise<OperasyonTipi[]>` okunur,
   bağ `istasyonlar_operasyon_tipi.id`'ye sayı kimliğiyle (yabancı anahtar Aşama 2'de).
4. malzemeler (bağlamada): ekran sabitleri `OPS`, `OP_VARSAYILAN` ve ayar `operasyonlar` yerine `operasyonTipleri(db)`; kodlar aynı.
5. arkon ve çekirdek test kurulumları (bağlamada, E2z): `POST /istasyonlar` gövdelerine `kapasiteKaynagi` ('makine' ya da 'insan'). Neden: IK4 bağlamada sunucuda zorunlu olacak.
6. vardiya ve plan (bağlamada): kişi kapasitesi `istasyondakiKisiler`, `makineKisiAtamalari`, `ekipUyeleri` (yüzde, tarih) ve `ekipler` (istasyon bağı) ile okunur; pasif ekip sayılmaz (IK7).
7. rota (bağlamada, #324 birleşince): `baglanti.ts` `operasyonKatalogu` yerine `operasyonTipleri(db, { pasiflerDahil: true })` (kısaltma, varsayılan süreler ve istasyon artık katalogda; sıra yok, kod sırası);
   `istasyonKisileri` yerine `istasyonKisiAtamalari(db)` tek sorgu, en yüksek yüzdeyi seçmek rotada kalır (IR5 b).
8. stok (bağlamada, #368, SH5 b): üretim alanı konumu işaretli istasyona bağlanır. Stok göçü `stok_konum.istasyon_id int REFERENCES istasyon`, `stok_konum_tur_degeri`'ne `uretim_alani`,
   kısıt `uretim_alani` ⇔ `istasyon_id` dolu. Konum açarken `aktifUretimAlaniMi(db, istasyonId)`, seçim listesi `uretimAlanlari(db)`, adlar `istasyonAdlari(db, idler)`.
   İşaret sonradan kalkarsa ya da istasyon pasife alınırsa var olan konum bozulmaz (yabancı anahtar silmeyi engeller), yeni konum açılmaz; ekranda gösterimi stokun kararı.
   Stok `UYUM-BORCU` 17 ve `BASKA-MODUL-ISTEKLERI` 47-50 bununla kapanır.
9. rota (T4 bağlamada, #409): `istemci/src/moduller/rota/beklenen/istasyonlar-plan.ts` yerine `#paylasilan/sozlesme/istasyonlar.ts` (`planAyariGovdesi`, `istasyonPlanAyari`,
   `makineDurumuGovdesi`, `makineDurumuSemasi`, cevaplar); uç yolları aynı. Plan ayarı ve makine durumu yazarken okunan `surum` gönderilsin (satır yoksa 0).
   Kaynaklar > Personel "Yetkinlik": `GET /kisi-yetkinlikleri`, `POST /kisi-yetkinlikleri/:kisiId/belirle` (`{ istasyonIdleri }`).
   `baglanti.ts` `istasyonKisileri` yerine `istasyonlar/disari.ts` `istasyonKisileri`. Okuma uçlarına `sayfa.rota` eklenmesi rol kararıyla (bu modülde değişmedi).
10. plan (T4 bağlamada, #409): `baglanti.ts` `istasyonKisileri` kalkar, `istasyonlar/disari.ts` `istasyonKisileri` (P-B4). Kapasite için `planAyarlari`, `calisirMakineler`,
   `isMerkeziPersonelSayilari`, personel kapasitesi için `istasyonYetkinlikleri` (aktiflik `kisiler/disari.ts`'ten). S3 uyarısı "Kişinin bu istasyonda yetkinliği yok": `yetkinMi`.
11. arkon (#409, KD-008): kişi başına `kisininIzinliIsMerkezleri` döngüsü yerine `kisilerinIzinliIsMerkezleri(db)`; kısıtsız kişi haritada yok.
12. kisiler (#409): `bayrakliKisiIdleri(db): Promise<Set<number>>` gibi toplu okuma. Neden: `kisilerinIzinliIsMerkezleri` kısıtı olan her kişi için ayrı `kisiBayrakliMi` sorgusu atıyor.
   Personel kartının "+ Personel", ad, görev, aktif / pasif ve saatlik ücret alanları kişi kaydıdır; bu modülde yazılmadı (OZELLIK-LISTESI EK, sahibi kisiler ya da finans, kullanıcı kararı).
13. vardiya (#409): personel kartındaki "Vardiya" alanı vardiya modülünündür (koordinatör notu, kullanıcı cevabı bekleniyor); bu modülde kişiye vardiya sütunu yok.
   Vardiya iş merkezlerini, istasyonları ve kişinin istasyonunu `isMerkezleri`, `istasyonlar`, `istasyonKisileri` ile okur.
14. rota, malzemeler, arkon (#460, #544): operasyon tipinin kodu yalnız kullanılmamışken düzenlenebilir (rotada ya da iş emrinde kullanılmışsa 409). Tipi kodla arayan yerler kimliğe geçsin: rota `servis.ts` standart taslak (`STANDART_ROTA` `tipKodu`),
   malzemelerin `operasyonlar` ayarı ve Arkon operasyon metni (bağlamada). Kodu değiştirilen tip standart taslakta bulunamazsa rota bugün 422 "Standart rotanın operasyon tipi tanımlı değil" verir.
   Rota Operasyonlar ekranı kod düzenlemesini `POST /operasyon-tipleri/:id/guncelle` gövdesine `kod` ekleyerek yapar.
15. rota, malzemeler (#544, R1 ve M1): operasyon tipi kataloğu ekranı artık İstasyonlar > Operasyon tipleri'nde (arama, grup süzgeci, CSV, rotadaki kullanım, satır içi aktif/pasif).
   Rota Operasyonlar ekranının katalog kısmı ve Malzemeler `op` görünümü kaldırılabilir. Rotanın kod düzenleyen testi (`Rotalar.test.tsx`) kullanılmış tipte 409 bekler.
   Kullanım sayısı `GET /rota/secenekler` `operasyonTipleri[].kullanim` alanından okunur; bu alan kalmalı (pasif tipleri de verirse ekranda pasiflerin kullanımı da görünür).
15. vardiya (#1109, kullanıcı kararı "Vardiya ekranı İstasyonlar'ın içinde, yazma vardiya modülünde"): vardiya `rotalar.tsx`'e `{ yol: '/istasyonlar/vardiyalar', ekran: <VardiyaDuzeni'ni saran ekran> }`.
   Neden: vardiya `PlanliDuruslar.tsx` `istasyonlar/disari.ts`'ten `IstasyonSecimi` ithal ediyor; istasyonlar `VardiyaDuzeni`'ni ithal ederse modüller döngüye girer (sınır kuralı f).
   Rota vardiyada olunca İstasyonlar ikinci menüsündeki "Vardiyalar" maddesi düzeni açar, ithal yönü değişmez. O gelene kadar bu bölüm özet gösterir ve `/vardiya`'ya bağlanır;
   rota eklendiğinde istasyonlardaki `vardiyalar` bölümü `Istasyonlar.tsx`'ten kalkar (statik yol `:bolum`'dan önce eşleşir, çakışma yok).
16. atolye (#1296): Makineler bölümündeki "Haritada göster" `/atolye?suzgec=yerlesmemis` adresini, ağaçta istasyon seçiliyse `&istasyon=<istasyonId>` ekleyerek açar; yalnız `sayfa.atolye` taşıyana görünür.
   Harita bu adresle yerleşmemiş makineler listesini açar ve istasyonu vurgular (Fabrika Haritası tarafı ayrı PR, Refs #1296).
17. arkon (yük testi 2026-10-18): anomali hesabı istasyon başına `istasyonKapasitesi(db, id, tarih)` çağırıp yalnız `.kaynak` alıyor (istasyon başına 5 sorgu);
   yerine döngüden önce tek `kapasiteKaynaklari(db, istasyonIdleri)`. Kaynak tarihe bağlı değildir; olmayan istasyon haritada yoktur (bugünkü `?? 'makine'` aynı kalır).
