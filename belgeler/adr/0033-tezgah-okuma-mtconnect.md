# ADR 0033 — Tezgah verisi kurum içi MTConnect servisinden salt okunur okunur (deneme)

Durum: kabul (3373 a, 17.11.2026). Numara 0033 koordinatörce 3373 için ayrıldı.

## Bağlam

Tezgah verisi bugün yalnız SmartES üzerinden gelir (ADR 0013): CORE tezgaha bağlanmaz, SmartES'in servisini sorar. Kullanıcı, SmartES'i
bozmadan tezgah verisini doğrudan kaynağından okumayı denemek istedi (3373). Atölyedeki tezgahların bir bölümü kurum içindeki ortak bir
MTConnect servisinden yayın yapar; servis standart olarak yalnız okunur (HTTP GET, XML). Bu servise istek atmak CLAUDE.md'deki
"dış servis çağrısı yok" kırmızı çizgisine yeni bir istisnadır.

## Seçenekler

- **a) Ortak MTConnect servisini salt okunur okumak:** tezgah ağına ve SmartES'e dokunmaz, yeni paket istemez; yalnız bu servisten
  yayın yapan tezgahları kapsar.
- **b) Tezgah kontrol ünitesine doğrudan bağlanmak:** bütün tezgahları kapsar; kontrol ünitesinin eş zamanlı bağlantı sınırı SmartES'in
  bağlantısını düşürebilir, protokol başına ayrı sürücü ve paket ister.
- **c) Yalnız SmartES:** yeni risk yok; iki kaynağı karşılaştırma olanağı da yok.

## Karar

1. **Tek dosya, tek modül.** Tezgah servisine yalnız `tezgah-baglantisi` modülünün `istemci.ts` dosyası istek atar
   (`sunucu/moduller/tezgah-baglantisi/istemci.ts` `tezgahIstemcisiKur`; `npm run sinir` kural j).
2. **Yalnız okuma, iki sabit yol.** Yalnız `GET /probe` ve `GET /current`; yönlendirme izlenmez, akış (`/sample`) ve başka yol yoktur
   (`TEZGAH_YOLLARI`). Tezgaha komut giden bir yol yoktur.
3. **Adres yalnız ortam değişkeninde ve kurum içi.** `TMIV2_TEZGAH_MTCONNECT_ADRESI`; kimlik bilgisi ve sorgu taşımaz; depoya, teste,
   günlüğe ve hata metnine girmez (`ayar.ts` `tezgahAdresiOku`).
4. **Varsayılan kapalı.** `tezgah-baglantisi.okuma` ayarı kapalıysa ya da adres yoksa istek atılmaz (`servis.ts` `okumaTuru`).
5. **Servise yük bindirilmez.** `/probe` süreç başına bir kez, `/current` dakikada bir; istek beş saniyede bırakılır, yinelenmez, önceki
   tur sürerken yenisi başlamaz.
6. **Yalnız gösterilir.** Okunan değer üretim kaydına, sayıma, stoğa işlenmez; SmartES'in değeriyle yan yana, yalnız yöneticiye gösterilir.
   SmartES modülünün ayarı ve verisi değişmez.
7. **Gerçek cevap depoya girmez.** Cihaz adı, seri no ve program adı gerçek veridir: test ve ön izleme yalnız uydurma (ORN) veri kullanır;
   program adı günlüğe ve hata iletisine yazılmaz. Durum örnekleri otuz gün saklanır.
8. **Cevap güvenli ayrıştırılır.** DTD ve ENTITY reddedilir, boy ayrıştırmadan önce sınırlanır (`xml.ts` `xmlAyristir`).

## Sonuçlar

- Deneme yalnız ortak servisten yayın yapan tezgahları kapsar. Kontrol ünitesine doğrudan bağlanma (seçenek b) bu ADR'nin kapsamında
  değildir; ayrı istisna ve ayrı karar ister.
- Anahtar kapatılınca istek durur; modül tek değişiklikle kaldırılır, iki tablo ayrı göçle düşürülür.

## Vazgeçilenler

- b: SmartES'i düşürme riski doğrulanmadan alınmaz.
- c: denemenin amacı iki kaynağı karşılaştırmaktır.

## Doğrulanmadı

- Ortak servisin sahibi (tezgah üreticisinin aracı mı, SmartES'in parçası mı) bilinmiyor.
- `/current` cevabındaki değer biçimleri canlı serviste denenmedi; tanınmayan değer boş kalır, durum "bilinmiyor" görünür.
