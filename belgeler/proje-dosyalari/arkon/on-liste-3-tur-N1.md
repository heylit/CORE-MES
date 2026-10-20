# Arkon 3. tur, N1: ön liste (kod yazılmadı)

Dal: `199-arkon-3`, güncel ana daldan (7c20cef). Kart #199 (ileti kapsamı #215 borcu, svg #215 borcu). N2 ve N3 aynı dalda sırayla, her biri ayrı listeyle.
uretim-emirleri ve durus-nedenleri dosyalarına yazım yok. Her madde ayrı commit; her birinde izinli ve reddedilen test. Şema değişmez, yeni göç ve paket yok.

## 0. UE5 kararının işlenmesi (yalnız belge)
`BASKA-MODUL-ISTEKLERI.md` madde 4: "Arkon paketi İŞ EMRİNE bağlanır (operatör iş emrinde çalışır; üretim emri ürün içindir). Kullanıcı kararı 08.10.2026."
Açık soru satırı kaldırılır. `tmi-ue-<id>` bağının iş emri kimliğine geçişi yeni model gelince yapılır; o zamana dek bugünkü bağ kalır.

## 1. İleti kapsam süzmesi
Bugün (DOĞRULANDI: `servis.ts` `iletiler`, `sorgular.ts` `iletiler`): her ileti Arkon rolü olan herkese gider. İş merkezi kısıtlı kişi başka
iş merkezinin çağrısını (makine, not, çağıranın adı), numune isteğini, paket ve ilerleme iletisini alır.

Değişiklik:
- Gönderimde iletinin konumu çözülür: `machine` ya da `st` (istasyon kodu), `wc`, `mc`, `id`/`reqId` (paket ya da numune isteği, kayıt kuralındaki gibi `tmi-ue-` ve paket konumu).
  Çözülen kodlar ileti gövdesinde sunucu anahtarı `$konum` altında saklanır (yeni sütun ve göç yok); okumada bu anahtar istemciye gitmez.
- Okuma: kısıtsız kişi bugünkü gibi hepsini alır. Kısıtlı kişi, konumu kapsamında olan ve konum alanı hiç taşımayan iletileri alır
  (`cfg`, `$log`, kimliksiz `pkg-draft` gibi). Konum alanı taşıyıp çözülemeyen ileti kısıtlı kişiye gitmez (kayıt listesi kuralı).
- Gönderim: kısıtlı kişi kapsamı dışındaki konuma ileti gönderemez (403), kayıt yazımındaki kural gibi.
- Kalite, bakım ve lojistik rolleri kısıtsızdır (onaylı kural); bu rollere giden çağrılar değişmez.
- Sunucunun ürettiği `$db` iletisi (belge değişti) belgenin konumuyla damgalanır; `$merged` tabletin kendi iletisidir, sunucudan geçmez.
- Testler: M1'e kısıtlı operatör M2'nin çağrısını almaz, kendi makinesininkini alır; kısıtsız kişi ikisini alır; `cfg` herkese gider;
  kısıtlı operatörün M2 için çağrısı 403; okunan iletide `$konum` yok.
- Varsayım: kişinin kapsamı her okumada (2 saniyede bir) çözülür; ek yük tek sorgu kümesidir. Geri alma ucuz (şema yok).
- Varsayım: iletinin konumu gönderim anındaki tesis yapısıyla saklanır; 15 dakika içinde istasyon taşınırsa eski konum geçerlidir.

## 2. svg denetimi (yazımda var; kalanlar)
Bugün (DOĞRULANDI: `kurallar.ts` `svgAlanlari`, `svg.ts`): yazılan her belgede her `svg` anahtarı beyaz listeden geçer. Açık kalanlar:
- a. PCD çemberi dalı (en az 3 delik) fikstürde yok. `cizim-fiksturu.ts`'e Arkon üretecinin PCD dalından üretilmiş fikstür eklenir; yayın 200 ölçülür.
  Reddedilen test: aynı fikstüre `onload` eklenince 400.
- b. Önceden yazılmış belgeler denetlenmedi. Okumada denetim: belge okunurken `svg` alanı beyaz listeden geçmiyorsa o alan boş döner
  (belge döner, güvensiz çizim dönmez) ve denetim kaydına tek satır düşer. Testler: veritabanına doğrudan yazılmış güvensiz svg okumada boş, güvenli svg aynen.
  BİLMİYORUM: hazır sonucu (`derived[...].D.svg`) boş gelen paketi operatör tableti çekirdekle yeniden üretir mi; yazmadan önce `operator.ts` ve `hazirlik.ts`'ten doğrulanır.
  Üretmiyorsa o paket operatör tabletinde çizimsiz açılır; bu durumda yalnız sayım raporu (salt okuma) önerilir.
- c. Kök `<svg>` zorunluluğu eklenmez (Arkon'un gerçek çıktısı kök etiketsiz parçadır); borçta kalır.

## 3. Çerçeve `sandbox`: yalnız etki listesi (yazım yok)
Çerçeve TMI ile aynı köken. Bugünkü bağ şunlara dayanıyor (DOĞRULANDI: `ArkonCercevesi.tsx`, `baglanti.ts`, `arkon/web/index.html`):
- Arkon sayfası açılırken `window.parent.__tmiArkonBagla(window)` çağırır; TMI çerçeve penceresinin `fetch` ve `EventSource` işlevlerini değiştirir.
- TMI ikinci menü için çerçevenin `location.hash`ini okur ve yazar.
- Arkon IndexedDB (`arkon-mes`) ve `localStorage` kullanır; `confirm()`, `window.open` (rapor yazdırma), dosya indirme ve kamerayla QR okuma kullanır.

Seçeneklerin etkisi:
- `sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads allow-forms"`: her şey çalışır, ama aynı kökende betik ve köken izni birlikte
  verilince çerçeve kendi `sandbox`'ını kaldırabilir (tarayıcı belgesindeki uyarı; tarayıcıda doğrulanmadı). Koruma pratikte yok.
- `allow-same-origin` olmadan: IndexedDB, `localStorage` ve köprü çalışmaz; Arkon açılmaz.
- Ayrı köken (ayrı port ya da alt alan): gerçek yalıtım. Köprü `postMessage`'a yeniden yazılır, ikinci menü bağı ve oturum çerezi yeniden kurulur, sunucuya yeni köken ayarı gelir. Büyük iş; çekirdek ve kurulum işi.
- Alternatif: Arkon sayfasına içerik güvenliği ilkesi (CSP, satır içi betikler özetle). Enjekte edilen betiği keser, bağı bozmaz.
  Arkon'un satır içi betikleri var (`index.html`), özetleri derlemede üretilmeli; rapor penceresi (`window.open` + `document.write`) ayrıca denenmeli. Tarayıcıda denenmedi.
