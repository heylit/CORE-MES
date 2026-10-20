# recete-rota: kural ve test eşlemesi

Dosyalar: `sunucu/moduller/recete-rota/kurallar.test.ts` (saf), `sunucu/moduller/recete-rota/recete-rota.test.ts` (gerçek PostgreSQL),
`istemci/src/moduller/recete-rota/ReceteRotaCercevesi.test.tsx`, `istemci/src/moduller/recete-rota/cerceve-kopru.test.ts`. KK-* kimlikleri
`cerceve-kopru.test.ts` dosyasınındır (`kaynak-komutlari.test.ts` aynı öneki kaynak komutları için ayrıca kullanır).

| Kural | Kısıt / yer | Test |
|---|---|---|
| RR-1 Anahtar `recete-rota-motoru-v1` ya da `recete-rota-motoru-v1:<alt>`; başka anahtar ve yol karakteri reddedilir | sözleşme + `recete_rota_kayit_anahtar_bicimi` | `RR-K4`, `RR-05` |
| RR-2 Yazma yalnız beklenen sürümde; null yalnız kayıt yokken; tutmazsa 409, kayıt değişmez | servis (satır kilidi) | `RR-K1`, `RR-02` |
| RR-3 Aynı anda iki ilk yazmadan yalnız biri geçer | birincil anahtar + `ON CONFLICT DO NOTHING` | `RR-03` |
| RR-4 Metin biçimi dizedir; U+0000 reddedilir (400, 500 değil); değerin JSON metni 1 MB'ı (UTF-8 bayt) aşarsa 413 | servis + `recete_rota_kayit_metin_dize` | `RR-K2`, `RR-K3`, `RR-K3b`, `RR-04`, `RR-04b` |
| RR-5 Silme sürüm ister | servis | `RR-06` |
| RR-6 Okuma sayfa, oku ya da yaz; yazma ve silme yalnız yaz | uç yetkisi | `RR-07`, `RR-08` |
| RR-7 Yazma deftere gövdesiz girer (anahtar, biçim, beklenen sürüm) | uç (`denetim: 'govdesiz'`) | `RR-09` |
| RR-8 Başka modül durumu yalnız `disari.ts` ile, salt okunur alır | `disari.ts` | `RR-10` |
| RR-9 Köprü önekli anahtarı beklemeden sonra, ayrıştırılmış ve sürümüyle yazar; öteki anahtar bellekte kalır | köprü | `KK-01`, `KK-02` |
| RR-10 Anahtar başına tek yazma yoldadır; sonraki yazma dönen sürümle gider | köprü | `KK-03` |
| RR-11 Çatışmada bir kez uyarır ve durur; 1 MB üstü gönderilmez, bir kez uyarır; ağ hatasında yeniden dener | köprü | `KK-04`, `KK-05` |
| RR-12 Yazma işlemi yoksa değişiklik bellekte kalır | köprü + `ben.yazabilir` | `KK-06` |
| RR-13 Çerçeve dışarıya istek atamaz, eval kapalı, Google Fonts bağlantısı çıkar; köprü prototipten önce koşar; kayıt metni betiği kapatamaz | içerik politikası + `sayfaKur` + `cerceveBetigi` | `prototipi içerik politikasıyla...`, `sayfaKur...`, `KK-07` |
| RR-14 window.claude hiçbir yetenek vermez (db, user, downloads null); çerçeve indirme ve pano izni almaz | köprü + `ReceteRotaCercevesi` | `KK-08`, `prototipi içerik politikasıyla...` |
| RR-18 Boş kayıtta ekran boş fabrikayla açılır, ilk değişiklikten önce yazılmaz; kayıtlı veri açılışta ezilmez; okunamayan kayıtta hata iletisi çıkar ve kaydın üstüne yazılmaz | ekran | `kurulum ekranı ve Proje penceresi yok...`, `kayıtlı veri açılışta ezilmez...`, `okunamayan kayıtta...` |
| RR-15 TMI teması kök öğeye geçer; yalnız "Bu cihazda kayıtlı" yazısı değişir | köprü | `KK-09` |
| RR-16 Yetkisiz kişi uçlara gitmez | ekran + uç | `sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez` |
| RR-17 Cihaza özel anahtar (`:op`, `:side`, `:studio:intro`) ortak kayda gitmez; kabuğun tarayıcı deposunda önekle durur; listede olmayan anahtar ve 10 000 karakterden büyük değer reddedilir | köprü + `kopru.ts` | `KK-10`, `cihaz anahtarları kabuğun tarayıcı deposunda...` |

Prototipin kendi iş kuralları (plan, malzeme ihtiyacı, revizyon onayı, stok hareketi) ekranda kalır (UYUM-BORCU.md); bunlar için sunucu testi yoktur.
