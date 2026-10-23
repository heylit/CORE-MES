# Güvenlik denetimi (rota)

Bütün uçlar `uc()` ile tanımlıdır: şema doğrulaması, oturum ve işlem denetimi, kayıt noktası ve denetim kaydı çekirdekten gelir.
Yazma uçlarında kişi ve zaman sunucudan yazılır (istemciden alınmaz); her yazma uç adından belli ayrı bir komuttur, genel kaydet ucu yoktur
(`kaydet` yalnız taslak revizyonun içeriğini, okunan sürümle yazar). Test adları: U = `sunucu/moduller/rota/rota.test.ts`,
K = `kurallar.test.ts`, E = `istemci/src/moduller/rota/Rotalar.test.tsx`.

| Yol | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /rota/urunler, /rota/urunler/:urunId, /rota/revizyonlar/:id(?miktar), /fark, /agac, /talimatlar/:opNo, /rota/secenekler, /rota/malzeme-kullanimi, /rota/malzeme-ara, /rota/menu-sayaclari | oturum | Oturumsuz 401; okuma yan etkisizdir | U RT-22 (okuma oturumla açılır); U malzeme arama; U ikinci menü sayacı | U RT-22 (oturumsuz değil, rolsüz okur; yazma reddi aşağıda) |
| GET /rota/revizyon-ozeti | oturum (ürün listesiyle aynı) | Yalnız iki sayı (açık revizyonu olan ve açık revizyonu onay bekleyen ürün); okuma yan etkisizdir | U "ana sayfa revizyon özeti" (listeden sayılanla aynı) | aynı test (oturumsuz 401) |
| POST /rota/urunler/:urunId/taslak-ac | rota.yaz | Yalnız kullanımdaki mamul/yarımamul (RT-57); tek açık revizyon (RT-02, kısmi tekil dizin); istek kimliği (RT-65) | U RT-07, RT-05, RT-65 | U RT-22 (operatör, kalite, CAM 403); U RT-02 (409, mamul olmayan kart 422); U RT-65 (kimliksiz 400) |
| İş: rota-karttan-taslak (uç değil, 60 sn) | yok (istek değil) | Uç denetimi uygulanmaz; yalnız kullanımdaki, kodlu operasyonu olan ve hiç revizyonu olmayan mamul/yarımamul kartına karttan taslak açar; açan kartı onaylayan kişidir; kart başına kayıt noktası (#688) | U "#688: onaylanan kartın ilk taslağı iş taramasıyla kendiliğinden açılır" | aynı test: taslaktaki kart, operasyonsuz kart ve iptal edilmiş taslaklı kart açılmaz |
| POST /rota/revizyonlar/:id/kaydet | rota.yaz | Durum taslak (RT-19, tetikleyici); sürüm (RT-20, eski sürüm 409); OP numarası defteri (RT-30..32); kaynak var ve kullanımda (RT-38); aday kuralları (RT-39); bileşen kullanımdaki kart, kendisi değil (RT-52, RT-55) | U RT-20/30/31/32; U RT-37/39 | U RT-20 (eski sürüm 409); U RT-37/39 (bilinmeyen tip, kendi makinesi aday 400); U RT-08/09/38 (bilinmeyen makine 400); U RT-04/19 (onay bekleyen 409, SQL ile de yazılamaz) |
| POST /rota/revizyonlar/:id/onaya-gonder | rota.yaz | Adım, süre, kullanımda tip ve kaynak (RT-08, RT-09, RT-38); alt ürünün yürürlükte rotası, döngü (RT-56, RT-57) | U RT-08/09/38 (kaynaksız adımla gider) | U RT-08/09/38 (süresiz 422, pasifleşen makine 422); U RT-52..57 (döngü 422) |
| POST /rota/revizyonlar/:id/iptal | rota.yaz | Yalnız taslak; silinmez (RT-14, RT-03, RT-15, tetikleyici) | U RT-14 | U RT-14 (iptal revizyon değişmez) |
| POST /rota/revizyonlar/:id/kopyala | rota.yaz | Hedefte açık revizyon yok (RT-16); kullanılmış numara yenilenir; istek kimliği (RT-65) | U RT-16 | U RT-16 (409) |
| POST /rota/revizyonlar/:id/geri-gonder | rota.onayla | Yalnız onay bekleyen (durum geçişi) | U RT-04/19/13 | U RT-22 (planlama 403 — onay işlemleri) |
| POST /rota/revizyonlar/:id/onayla | rota.onayla | Dört göz: gönderen ve düzenleyen onaylayamaz (RT-18, tetikleyici `rota_revizyonu_dort_goz`); ayar kapalıyken işaretlenir (RT-17) | U RT-18/22/17 (müdür onaylar) | U RT-18/22/17 (kalite 403, gönderen yönetici 403) |
| POST /rota/revizyonlar/:id/yururluge-al | rota.onayla | Yalnız onaylı; tek yürürlükte (RT-10..12, kısmi tekil dizin) | U RT-10/11/12/01 | U RT-10/11/12/01 |
| POST /rota/urunler/:urunId/talimat-yaz | rota.talimat-yaz | Okunan sürüm (RT-63); adımı olan numara (RT-62); revizyonu değiştirmez (RT-61) | U RT-60..63 (CAM yazar) | U RT-60..63 (eski sürüm 409, adımsız numara 422) |
| POST /rota/revizyonlar/:id/emre-kopyala | rota.emre-kopyala | Yalnız yürürlükteki, adımlı rota (RT-66); kart kullanımda; istek kimliği (RT-65); yazımı üretim emirleri komutu yapar | U RT-66/68 | U RT-66/68 (operatör 403, kimliksiz 400, taslak 422) |
| GET /rota/revizyonlar/:id/sureler(?makineId) | oturum | Okuma yan etkisizdir; plan için yalnız elle ve kabul satırı (RT-73, S4 a); terminal satırı yalnız `oneri` alanında (RT-77) | U RT-73/74 (operatör okur); U RT-76 (öneri makinede ve makinesiz görünümde) | U RT-73 (terminal satırı etkin süreye girmez); U RT-76 (başka makinenin görünümünde öneri yok) |
| POST /rota/adimlar/:id/gerceklesen-sure | rota.yaz | Kişi ve zaman sunucudan; okunan son satır (eski 409, kilit altında); işlem sıfır olamaz (RT-75); fason adıma girilmez; bilinmeyen makine 409; istek kimliği; defter yalnız eklenir (`rota_gerceklesen_sure_degismez`) | U RT-73/74 (planlama yazar, teoriğe döner) | U RT-75 (sıfır 400, operatör/kalite/CAM 403, eski okunan 409, bilinmeyen adım 404, fason 422, yinelenen istek tek satır, UPDATE reddi) |
| POST /rota/adimlar/:id/gerceklesen-sure/kabul | rota.yaz | Kişi ve zaman sunucudan, değer önerinin satırından (istemci süre göndermez); yalnız bu adımın bu türdeki terminal satırı, makineye özgü kabulde başka makinenin ölçümü değil (RT-77); okunan son satır (eski 409, kilit altında); fason adıma girilmez; istek kimliği; defter yalnız eklenir | U RT-77 (planlama kabul eder, plan kabulü kullanır, elle giriş kabulü geçer) | U RT-77 (operatör/kalite/CAM 403; başka adım, başka tür, elle satır, başka makine 422; bilinmeyen öneri ve adım 404; eski okunan 409; yinelenen istek tek satır) |
| Olay: emir bitti -> rota (uç değil; bağ `kablolama.ts`) | yok (komutun işlemi: `terminal.uret`) | Emir bitirme komutuyla aynı işlemde; yazan kişi bitiren, değer uretim-emirleri `isEmriSureOzeti`'nden; yalnız rotada olan OP, makine ya da kişi iş emri; iş emri başına bir kez; eksik veri reddedilmez, atlanır (ret bitirmeyi geri alırdı) | U RT-76 | U RT-76 (ikinci çağrı satır yazmaz) |

Kullanıcı metni (adım adı, açıklama, talimat, revizyon notu) düz metindir: ekranda React metni olarak basılır (kaçırılır); HTML ve SVG
yorumlanmaz, `dangerouslySetInnerHTML` kullanılmaz. Kapsam: rota verisi iş merkezi kısıtlı değildir (iş merkezi kısıtı rota okuma ve
yazmasına uygulanmaz; VARSAYIM, ON-PAKET V6).

## Yalnız ekranda kalan kurallar

- Seçim listelerinde pasif kaynağın ve kapalı operasyon tipinin gösterilmemesi (sunucu yine de yeni seçimi reddeder).
- İlk değişiklikte taslağın kendiliğinden açılması ve geri al / yinele geçmişi (oturumluk; sunucu her kaydı ayrı komut ve sürümle alır).
- "Taslağı ilk revizyona çevir": ekran iptal ve taslak aç komutlarını sırayla gönderir (sunucuda tek komut değil).
- Akış şemasının çizimi, yakınlaştırma, tahta ve yüzen kart.
