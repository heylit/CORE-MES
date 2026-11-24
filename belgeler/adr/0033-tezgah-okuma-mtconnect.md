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
- Sık okumanın (5 saniye) servise ve SmartES'e etkisi ölçülmedi (Ek, 24.11.2026).
- Servisin `/assets` yolunu destekleyip desteklemediği bilinmiyor; desteklemiyorsa ekran "Veri yok" yazar, tur hata vermez (Ek).

## Ek (24.11.2026, kart 3659)

Kullanıcı kararı: tezgah verisi anlık okunacak; `/current` ile `/sample` arasındaki değişiklikler kaybolmayacak; `/probe` alan tanımları ve
`/assets` takım bilgisi alınacak. Karar 2 ve karar 5 aşağıdaki hâliyle değişir; kararların kalanı aynen geçerlidir.

**Karar 2 (yeni hâli): dört sabit yol, `/sample` parametreleri.** Yalnız `GET /probe`, `/current`, `/sample` ve `/assets`; yönlendirme izlenmez
(`TEZGAH_YOLLARI`, `redirect: 'error'`). Sorgu parametresi yalnız `/sample`'da ve yalnız `from` ile `count`'tur; `from` sıfır ya da pozitif tam
sayı, `count` izin listesinden (`SAMPLE_SAYILARI`: 100, 500, 1000, 2000). Başka yol ya da parametre istemcide reddedilir, istek hiç çıkmaz. Adres kuralı
(karar 3) değişmez; istek yine yalnız `istemci.ts`'ten çıkar. Alan sayısı sınırı kalktı (eskiden cihaz başına 400); yerine cevap boyu sınırı
geldi: gövde okunurken 8 MiB'ı aşarsa reddedilir (`xml.ts` `AZAMI_CEVAP_UZUNLUGU`); DTD ve ENTITY reddi kalır.

**Karar 5 (yeni hâli): ayarlanabilir aralık, geri çekilme, tampon boşluğu.**
- Tur aralığı Sistem Ayarları'ndaki "Tezgah bağlantısı okuma aralığı (saniye)" ayarıdır: 5-60, varsayılan 5. Servis başka sistemleri de
  besleyebileceği için kullanıcı kod değiştirmeden yavaşlatabilir. Okuma ayarı (karar 4) varsayılan kapalı kalır.
- Art arda hatada aralık ikiye katlanarak 60 saniyeye kadar uzar; başarılı turda ayardaki değere döner. Önceki tur sürerken yenisi başlamaz;
  istek süresi 5 saniyedir, yinelenmez.
- Her turda `/sample?from=<son sıra + 1>&count=<sınır>` okunur; geride kalınmışsa bir turda en çok 5 sayfa. İlk tur ve boşluk sonrası `/current` ile başlanır.
  İstenen sıra tampondan düşmüşse (`from` < `firstSequence`, ya da servis OUT_OF_RANGE verirse) "veri boşluğu" kaydı yazılır ve `/current` ile
  devam edilir. Servisin `instanceId`'si değişirse boşluk yazılır, `/probe` yeniden okunur.
- `/probe` süreç başında ve `instanceId` değişince; `/assets` 60 saniyede bir okunur. `/assets` hatası ya da 404'ü turu bozmaz.
- Saklama (göç `20261124130100`): `tezgah_alan_tanimi`, `tezgah_deger_gecmisi` (24 saat, saatlik silinir), `tezgah_varlik`, `tezgah_veri_boslugu`
  (24 saat). `tezgah_okuma` ve `tezgah_ornek` değişmez; örnekler 30 gün kalır. Değer gelmediyse `null` yazılır, sıfır yazılmaz.

**Karar 6 aynen geçerlidir.** Okunan hiçbir değer üretim kaydına, sayıma, duruşa, stoğa ya da plana işlenmez; SmartES modülünün ayarı ve verisi
değişmez; sayfa yalnız `sayfa.tezgah-baglantisi` yetkisiyle açılır; program ve cihaz adı günlüğe ya da hata iletisine yazılmaz.

**Doğrulanmadı (Ek).**
- Beş saniyelik okumanın servise ve aynı servisi okuyan SmartES'e yükü ölçülmedi; kullanıcı aralığı Sistem Ayarları'ndan yükseltebilir.
- Servisin `/assets` yolunu desteklediği doğrulanmadı.
- Gerçek servisin tampon dışı isteğe cevabının biçimi (HTTP kodu, `MTConnectError` içeriği) denenmedi; istemci 400/404/416 ile `OUT_OF_RANGE` gövdesini
  ve başlıktaki `firstSequence`'i tanır.
- 24 saatlik geçmişin gerçek hacmi (FARK.md'deki ölçüm sentetiktir).
