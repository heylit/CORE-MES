# ADR 0026 — Belgeler ve revizyonları tek modülde kontrol edilir

Durum: kabul (kart 1624; kullanıcı kararları 1601 b ve 1601 teyit, 1602, 1603 a, 1604 a, 1605 a, 1631 a; metin onayı "1624 teyit", 01.11.2026 karar kartı).
Değiştirir: -. ADR 0009'u (dosya saklama) ve ADR 0022'yi (donmuş kopya) tamamlar.

## Bağlam

- Belge ve revizyonu tutan beş ayrı düzen var: Çizim Merkezi (`cizimler`: değişmez revizyon, tek yayındaki, her modüle bağ), rota işlem
  şartnamesi (sürüm emre sabitlenir), değişiklik yönetimi (çizim ve rota revizyonunu kimlikle anar), kalite form şablonu (revizyon ve
  yürürlük serbest metin) ve KYS dokümanı (revizyon, hazırlayan ve onaylayan serbest metin). Son ikisinde sunucu onayı denetlemez.
- Çizim Merkezi'nde revizyonu yükleyen kişi aynı revizyonu yayınlayabilir; revizyon notu isteğe bağlıdır; dağıtım yoktur.
- Üretim terminali çizimi her açılışta yayındaki revizyondan okur; açık emirde yeni revizyon yayınlanırsa terminal yenisini gösterir.
- Belge (boş form, şablon, şartname, prosedür, çizim) ile kayıt (doldurulmuş form, muayene, uygunsuzluk) farklı kurala tabidir: belge
  revizyonlanır, kayıt değişikliğe karşı korunur.

## Seçenekler

- **a) Çizim Merkezi genişler:** tablo taşınmaz; modül adı belge kontrolünü anlatmaz.
- **b) Yeni `belge-merkezi` modülü, çizimler taşınır (1601 b):** ad ve sahiplik nettir; bedeli dolu tabloyu değiştiren göç ve çizimleri
  okuyan modüllerin ithal değişikliği.
- **c) Yeni modül, çizimler ayrı kalır:** iki revizyon düzeni sürer.

## Karar

Seçenek b.

1. **Tek sahip.** Belge, revizyon, bağ, önizleme ve dağıtım listesinin sahibi `belge-merkezi` modülüdür. `cizimler` modülünün tabloları,
   kodu ve ekranları bu modüle taşınır; kimlikler değişmez (göç `20261031214000`). Başka modül belgeyi yalnız `belge-merkezi/disari.ts`
   ile okur ve bağlar.
2. **Belge türü aileleri.** Teknik (teknik resim, 3B model, makine, kroki, diğer; sertifika ve rapor revizyonsuz kanıttır), KYS (el kitabı,
   politika, prosedür, talimat, form şablonu, liste, plan, görev tanımı) ve dış kaynaklı (müşteri şartnamesi, standart). Her belgenin
   sunucunun verdiği tekil kodu vardır (`ONEK-TUR-SIRA`).
3. **Revizyon akışı.** Durumlar `taslak`, `onay-bekliyor`, `yururlukte`, `eski`. Belgede en çok bir yürürlükte ve bir açık (taslak ya da
   onay bekleyen) revizyon olur. Yürürlüğe giren revizyon önceki yürürlüktekini eskiye çevirir. Yayınlanmış revizyonun dosyası ve sırası
   değişmez, silinmez. İlk revizyon dışında değişiklik nedeni zorunludur. Eski revizyonun yeniden yürürlüğe alınması yeni onaydır.
   Geçişler `paylasilan/durum-gecis.ts` `GecisTablosu` ile yazılır, veritabanı tetikleyicisi aynı kuralı tutar (ADR 0025 kural 3).
4. **Dört göz ayarı (1602).** Hazırlayanla onaylayanın ayrı kişi olması tür ailesi başına bir ayardır; varsayılan kapalıdır. Açık olan
   ailede sunucu hazırlayanın kendi onayını reddeder. Onaylayan ve zaman oturumdan ve sunucudan gelir. Ayarı yalnız yönetici değiştirir;
   değişiklik denetim kaydına yazılır.
5. **Dağıtım, okundu yok (1603 a).** Belgenin dağıtım listesi (rol, kişi, istasyon) vardır; yeni revizyon yürürlüğe girince listedekilere
   bildirim gider. Okundu onayı tutulmaz.
6. **Eski revizyon kullanılmaz.** Eski revizyon terminalde ve dağıtımda görünmez; ekranda "GEÇERSİZ" işaretlidir; indirilmesi ayrı
   işlem ister ve denetim kaydına yazılır. Yazdırma görünümü "KONTROLSÜZ KOPYA" bandı taşır; PDF'e sunucuda damga basılmaz.
7. **Emre sabitleme (1605 a).** İş emri açılırken malzemeye ve rotaya bağlı belgelerin yürürlükteki revizyonu emre yazılır; terminal
   emrin revizyonunu gösterir, daha yeni revizyon varsa uyarır. Açık emrin yeni revizyona geçmesi açık bir komutla olur. Uygulaması
   Aşama 2'dedir (1604 a).
8. **Kayıt sahibi modülde kalır.** Doldurulmuş form, muayene ve benzeri kayıtlar belge merkezine girmez; kayıt, doldurulduğu şablonun
   belge kodunu ve revizyonunu taşır. Kalite form şablonu ve KYS dokümanı yürürlüğe alma için merkeze bağlanır (Aşama 2, 1604 a).
9. **Değişiklik yönetimiyle sınır.** Belge merkezi revizyonu yürürlüğe alan tek yerdir; hangi değişikliğin değişiklik talebi
   gerektirdiğini ve onun akışını değişiklik yönetimi kararı (kart 1606) belirler. Değişiklik yönetimine bağlı revizyon merkezin kendi onayıyla değil, onun çağırdığı
   `disari.ts` komutuyla yürürlüğe girer.

## Sonuçlar

- Çizimleri okuyan modüller (arkon, atolye, cnc-kurulum, geometri, kalite-merkezi, saat, satin-alma, stok ve istemcide malzemeler,
  markalama, üretim emirleri) ithal yolunu değiştirir; davranışları değişmez.
- Bugün yayında olan revizyonlar yürürlükte sayılır; geriye dönük onay aranmaz.
- Rota işlem şartnamesi parametrik veridir ve rota modülünde kalır; müşteri şartnamesinin dosyası merkezde durur, rota ona belge
  kimliğiyle atıf verir.
- Saklama süresi bilgi alanıdır; otomatik imha yoktur.

## Vazgeçilenler

- **Okundu onayı:** kullanıcı kararı 1603 a; ISO 9001 erişimi ister, okundu imzası istemez.
- **Sunucuda PDF damgası:** yeni paket ister; yazdırma bandı aynı uyarıyı verir.
- **Satır kopyalayarak taşıma:** yeniden adlandırma kimliği bozmadan aynı sonucu verir (1631 a: tablolar, işlem adları, sayfa yolu ve veri anahtarları yeniden adlanır).

## Doğrulanmadı

- ISO 9001:2015 madde 7.5 eşleşmesi standart metniyle karşılaştırılmadı (özel takip deposu, rapor 1600).
