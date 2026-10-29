# cnc-kurulum: kural ve test eşlemesi

Dosyalar: `sunucu/moduller/cnc-kurulum/kurallar.test.ts` (saf, 4), `sunucu/moduller/cnc-kurulum/cnc-kurulum.test.ts` (gerçek PostgreSQL, 10),
`istemci/src/moduller/cnc-kurulum/CncKurulumCercevesi.test.tsx` (5), `istemci/src/moduller/cnc-kurulum/cerceve-kopru.test.ts` (7). Hepsi koşuldu, yeşil.

| Kural | Kısıt / yer | Test |
|---|---|---|
| CK-1 Anahtar prototipin önekiyle başlar; başka anahtar ve yol karakteri reddedilir | sözleşme + `cnc_kurulum_kayit_anahtar_bicimi` | `CK-K4`, `CK-05` |
| CK-2 Yazma yalnız beklenen sürümde; null yalnız kayıt yokken; tutmazsa 409, kayıt değişmez | servis (satır kilidi) | `CK-K1`, `CK-02` |
| CK-3 Aynı anda iki ilk yazmadan yalnız biri geçer | birincil anahtar + `ON CONFLICT DO NOTHING` | `CK-03` |
| CK-4 Metin biçimi dizedir; U+0000 reddedilir (400, 500 değil); değerin JSON metni 1 MB'ı (UTF-8 bayt) aşarsa 413 | servis + `cnc_kurulum_kayit_metin_dize` | `CK-K2`, `CK-K3`, `CK-K3b`, `CK-04`, `CK-04b` |
| CK-5 Silme sürüm ister | servis | `CK-06` |
| CK-6 Okuma sayfa, oku ya da yaz; yazma ve silme yalnız yaz | uç yetkisi | `CK-07`, `CK-08` |
| CK-7 Yazma deftere gövdesiz girer (anahtar, biçim, beklenen sürüm) | uç (`denetim: 'govdesiz'`) | `CK-09` |
| CK-8 Başka modül durumu yalnız `disari.ts` ile, salt okunur alır | `disari.ts` | `CK-10` |
| CK-9 Köprü önekli anahtarı beklemeden sonra, ayrıştırılmış ve sürümüyle yazar; öteki anahtar bellekte kalır | köprü | `KK-01`, `KK-02` |
| CK-10 Anahtar başına tek yazma yoldadır; sonraki yazma dönen sürümle gider | köprü | `KK-03` |
| CK-11 Çatışmada bir kez uyarır ve durur; 1 MB üstü gönderilmez, bir kez uyarır; ağ hatasında yeniden dener | köprü | `KK-04`, `KK-05` |
| CK-12 Yazma işlemi yoksa değişiklik bellekte kalır | köprü + `ben.yazabilir` | `KK-06` |
| CK-13 Çerçeve dışarıya istek atamaz; köprü prototipten önce koşar; kayıt metni betiği kapatamaz | içerik politikası + `cerceveBetigi` | `prototipi içerik politikasıyla...`, `sayfaKur...`, `KK-07` |
| CK-14 Yetkisiz kişi uçlara gitmez | ekran + uç | `sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez` |
| CK-15 Toplu aktarım (kart #1196): çerçeve toplu kipte düğme koymaz, kayıt yazmaz, listeyi yollar, istenen makineyi üretir | köprü | `KK-12`, `KP-04`, `KP-05`, `TA-02`, `TA-03` |
| CK-16 Eşleştirilen model yayınlanır ve istasyona bağlanır; yayınlama yetkisi yoksa taslak kalır; Çizim Merkezi'ne yazamayan sayfayı açamaz | ekran + Çizim Merkezi uçları (`cizimler.yayinla`, `cizimler.yaz`, CZ-14) | `MA-04`, `MA-05`, `TA-01`, `TA-04` |
| CK-17 STEP okuyucusu (WASM) açılışta yüklenmez; ilk STEP açılışında bir kez yüklenir, ikincide yeniden yüklenmez; yükleme hatası anlaşılır iletiyle döner | köprü | `PRT-01`, `SO-01`, `SO-02`, `SO-03`, `SO-04`, `KK-15` |
| CK-18 Hazırlık sırası: son onay yalnız bütün adımlar (tezgâh, program, bağlama, çene, malzeme, sıfırlama, takımlar ya da magazin, soğutma, ölçüm, sarf) son onayın imzasıyla aynı imzayla onaylıyken verilir; aksi 422 ve kayıt, defter değişmez. Yalnız yeni ya da imzası değişen son onaya uygulanır; adım geri alma ve son onayı kaldırma geçer. Program, ham ölçü ve takım uygunluğu denetimleri ekranda kalır | servis (onay uçları) + `sonOnaySiraDisiMi` | `CK-K24`, `CK-22` |
| CK-19 Takım stoğu stokta (153 a, 163 b, 164 b): stok kartına bağlı kütüphane kalemi okurken stoğun kullanılabilir miktarıyla ve `tmiStok` işaretiyle gelir (örnek işareti düşer); azalan adet durum yazıldıktan sonra istek kimliğiyle `POST /cnc-kurulum/takimlar/stok-dus` ucuna gider (`cnc-kurulum.stok-dus`, yalnız yönetici), stok yetmezse ya da kalem bağsızsa 422 ve hareket yok; artış, bağsız kalem ve kart değişimi düşüş değildir. Kalemi karta bağlama, kart değiştirme ve bağı kaldırma `malzemeler.yaz` ister; yalnız sarf ve demirbaş kartı. Çerçevede bağlı kalemin adedi salt okunur, artırma gizli; stoktan düşemeyen kişide azaltma da gizli | servis + uç yetkisi + `stokBindir` + köprü | `CK-K25`, `CK-23`, `KP-10`, `KP-11`, `KP-12`, `KP-13`, `KK-30`, `KK-31`, `stok kartı bağlama ve stoktan düşme yetkisi çerçeveye geçer` |
| CK-20 Emir listesi (182 a): `ben` cevabındaki `emirGorebilir` uçtaki denetimle aynıdır (üretim emri okuma işlemleri, `sayfa.stok`, `sayfa.atolye`); görmeyen kişide çerçeve `GET /cnc-kurulum/emirler` istemez, alan salt okunur ve "Emir listesini görme yetkiniz yok" der. Yetki değişmez; uç yine 403 döner | servis + köprü | `CK-11b`, `KK-18b`, `emir listesi yetkisi çerçeveye geçer` |
| CK-21 Tezgâh ayarı (1091 a, 1136 a, 1139 b): liste İstasyonlar'ın makine kayıtlarıdır (istasyonsuz ya da talaşlı istasyondaki; pasif olan yalnız ayarı varsa); ayar makine başına bir satır, `POST /cnc-kurulum/tezgahlar/:makineId/ayar` ile `cnc-kurulum.yaz` taşıyan yazar; ayarsız makinenin sürümü 0, sürüm tutmazsa 409 ve satır değişmez; geçersiz değer, talaşlı olmayan istasyondaki ve pasif makine 400, olmayan makine 404; canlı takım devri yalnız canlı takımlı tezgâhta; ayarı olan makine silinmez | uç yetkisi + sözleşme + servis + veritabanı kısıtı + `tezgahListesi` | `TZ-01`..`TZ-06` |
| CK-22 3B model bağı (1212 a): makineye (listedeki, aktif, talaşlı ya da istasyonsuz) ve bağlama aparatına Çizim Merkezi'nde yayındaki tek bir 3B model belgesi (GLB, glTF, STEP, IGES, STL) `POST /cnc-kurulum/modeller/bagla` ile `cnc-kurulum.yaz` taşıyan bağlar; bağ Çizim Merkezi'ndedir, yeni bağ eskisini kaldırır, null bağı kaldırır; sürüm tutmazsa 409; parça çizimi ve başka tür 400, taslak ve olmayan belge 404; dosya `GET /cnc-kurulum/modeller/:id/dosya` ile sayfanın okuma işlemleriyle verilir (atölyenin istasyon modeli ucu emsali, Çizim Merkezi yetkisi sorulmaz), modeli kalkmış bağda 204; seçici yalnız yazana açık. Ekranda bağlı model çizilen gövdenin yerine geçer, açılamazsa çizilen gövde kalır ve Tanımlar'da neden görünür | uç yetkisi + sözleşme + servis + `modelBelgesiSec` + veritabanı kısıtı + `glb-yukle.ts` | `MD-01`..`MD-07`, `GM-01`..`GM-04`, `3B modeller sekmesi` |

Prototipin öteki iş kuralları (kesme verisi, stok yeterliliği hesabı, takım ömrü) ekranda kalır (UYUM-BORCU.md); bunlar için sunucu testi yoktur. Hazırlık sırası CK-18'de, takım stoğu CK-19'dadır.
