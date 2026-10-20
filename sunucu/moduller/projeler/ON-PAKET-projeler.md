# Ön paket: projeler (kart #803)

Kaynak: kullanıcı kararı 2026-10-12 ("Üretim emirleri ve parti böl" konusu): emir no "firma kodu + proje no + parça no + YY + AA + sıra",
proje no için "PROJELER SAYFASI AÇALIM". Prototip yok; ekran depodaki liste kalıbıyla (Ölçü Aletleri, Çizimler).

- Ad: `projeler`. Sayfa "Projeler" (`/projeler`, grup Planlama, sıra 5, simge `layers`). İkinci menü: "Proje listesi".
- Tablo `projeler_proje`: kod, ad, durum (aktif / tamamlandi / iptal), firma_id (finans_firma, boş olabilir), baslangic, bitis,
  aciklama, olusturan_id, olusturma, guncelleyen_id, guncelleme, surum.
- Uçlar: `GET /projeler` (sayfalı; ara, durum, sıralama kod/ad/baslangic), `GET /projeler/:id`, `POST /projeler`,
  `POST /projeler/:id/guncelle`, `GET /projeler/firma-secenekleri`. Ayrıntı GUVENLIK-DENETIMI.md.
- İş kuralları PRJ-01..PRJ-06: KURAL-TEST.md.
- Rol dağılımı önerisi: CEKIRDEK-ISTEKLERI.md madde 1.

Bu modül şunları varsaydı (geri alma maliyeti düşük: tablo yeni ve boş):
1. Proje kodu en çok 24 karakter (Logo stok kodu sınırı; Logo proje kodu için DOĞRULANMADI).
2. Kodda tire yok, Türkçe harf yok (emir numarasında ayraç tire; Logo ile eşleşme).
3. Kod açıldıktan sonra değişmez; proje silinmez, iptal edilir.
4. Müşteri firması isteğe bağlı; her türden aktif firma seçilebilir.
5. Durumlar aktif / tamamlandı / iptal; her durum arasında geçiş serbest.
6. "Yalnız aktif projeye emir açılır" kuralı üretim emirlerinde uygulanır (öneri olarak iletildi).

Açık soru: yok.
