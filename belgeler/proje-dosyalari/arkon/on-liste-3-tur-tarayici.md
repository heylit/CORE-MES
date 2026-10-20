# Arkon 3. tur: tarayıcı bulguları TD, TA1, TA2, TB2, TB (ön liste, kod yazılmadı)

Kart #199. Her madde ayrı dal ve çekme isteği; her madde izinli ve reddedilen testle. uretim-emirleri'ne yazım yok.
Kaynak: `/mnt/project-files/tur3-raporlar/tarayici-denemesi.md` ve kod okuması (origin/main, 08.10.2026).

## TD: sunucu adresi ayarı (kullanımı tutan, güvenlik)

Bugün (DOĞRULANDI):
- Ayar kartı `arkon/web/src/app/giris-ayarlar-spc.ts:377` (`card('Bağlantı', ...)`); Genel sekmesinde koşulsuz, operatörde de görünüyor.
- Kayıt yalnız tarayıcıda: `arkon/web/src/data/store.ts:375` `Server.set` localStorage `arkon:server` yazar, sonra sayfa yenilenir. Sunucuya giden bir ayar ucu YOK; bu yüzden "sunucuda reddet"in yeri yok.
- Köprü (`istemci/src/moduller/arkon/baglanti.ts`): yalnız `/arkon-tmi/api/...` adresine giden isteği TMI'ye çevirir; başka adrese giden isteği olduğu gibi gönderir (`asilFetch`). Yani operatör başka adres yazarsa Arkon o sunucuya gider. CSP `connect-src 'self'` bunu durdururdu, ama ilke rapor kipinde.
- TMI adresi açılışta yeniden yazar (`tohumla`), ama yalnız kişi değişince; çerçeve yenilenince yazılmaz.
- Arkon ekranında "TMI içinde gömülü" bayrağı yok; tek işaret `arkon/web/index.html:15` `window.parent.__tmiArkonBagla`.

Yazılacaklar:
1. Köprü (asıl kapı): TMI içinde Arkon'un yaptığı her istek ya köprüden geçer ya reddedilir. Sanal adres dışındaki adrese (`http://baska-sunucu/...`) giden istek gönderilmez, 403 cevabı döner. Aynı sitenin kendi dosyaları (`/arkon-mes/vendor/...`) serbesttir. Olay akışı (`EventSource`, `baglanti.ts:281`) için de aynı kural.
2. Köprü: `arkon:server` her çerçeve açılışında TMI'nin sanal adresine yeniden yazılır; elle yazılan başka adres kalıcı olmaz.
3. Ekran: TMI içinde gömülüyken "Bağlantı" kartı hiç gösterilmez (yönetici dahil; adres zaten TMI). Gömülü değilken bugünkü gibi yalnız yöneticide.
4. Testler: izinli `GET /arkon-tmi/api/health` köprüden geçer, `/arkon-mes/vendor/...` gider; reddedilen `http://baska-sunucu/api/health` 403 alır ve gerçek `fetch` çağrılmaz. localStorage'a başka adres yazılıp çerçeve yeniden açılınca adres sanal adrese döner.
5. Borç: UYUM-BORCU "TD KAPANDI"; GUVENLIK-DENETIMI'ne satır.

Varsayım: 3. madde `arkon/web` ekran koduna tek koşul ekler (gömülü dış modülün ekranına dokunulur; kullanıcı kararı TD a gereği).

## TA1: iş değiştirmede emrin başlatılmaması (kullanımı tutan)

Neden (DOĞRULANDI, kod; ağ kaydı alınmadı):
- Fark SIRADA. Sunucu testi (`yansima.test.ts:170` "kuyruğa alma (queued) duraklatmadır") ikinci işi başlatmadan önce birinci emre `queued` (duraklat) gönderir; TMI istasyonu boşaltır, ikinci `running` yazılır.
- Ekran iş değiştirirken (`arkon/web/src/app/operator.ts:224, 250, 416`, `setAi`) birinci iş için hiçbir şey göndermez; birinci iş Arkon'da `running` kalır. Ekranda bir işi `queued`'a ya da `paused`'a alan iş değiştirme eylemi yok (`operator.ts:251`).
- TMI ikinci `running`'i "Bu istasyonda başlamış bir iş var" ile reddeder (`uretim-emirleri/servis.ts:204`). Arkon bunu `reddedildi` yazar (`arkon/servis.ts:402`); bekleyen taraması yalnız `bekliyor` satırlarını alır (`sorgular.ts:105`), red bir daha denenmez.
- Sayfa yeniden açılınca ekran etkin işin durumunu yeniden gönderir (`operator.ts:186-192`); birinci emir o arada bittiği için TMI kabul eder. Zamanlama ve paket durumu neden değil.
- Borçtaki "sınır d KAPANDI" satırı yanlış kapanmış: sunucu eşlemesi kapandı, ama ekranın `queued` gönderdiği varsayılmıştı.

Seçenekler:
- a. Ekran (Arkon): iş değiştirirken çalışan eski iş `paused`'a alınır ve olayı gönderilir; Arkon'da da iki iş aynı anda çalışmaz. Sunucu değişmez (`paused` zaten duraklatmaya eşleniyor). **Öneri:** testteki sırayı ekran da üretir; TMI ve Arkon aynı durumu gösterir.
- b. Sunucu (Arkon): "istasyon dolu" ile reddedilen başlatma `bekliyor`da tutulur, istasyon boşalınca (eski emir bitince ya da duraklayınca) yeniden denenir. Eksi: başlama zamanı geç yazılır; Arkon'da iki iş çalışmaya devam eder, sayımlar ikinciye beklemede kalır.
- uretim-emirleri değişikliği gerekmiyor (iki seçenekte de).

Testler (a): izinli: iş değiştirince eski işe `paused`, yeni işe `running` gider, ikisi de `yazildi`. Ret: iş değiştirmeden ikinci `running` yine reddedilir (bugünkü karşı örnek kalır).

## TA2: "TMI'ye yazılamayanlar" ayıklama

Bugün (DOĞRULANDI): listede `yazildi` dışındaki her satır var (`sorgular.ts:300`); ekranda yalnız durum süzgeci var. Neden alanı serbest metin; Arkon'un kendi nedenleri `kurallar.ts`'te sabit, "iş zaten çalışıyor" ise TMI'nin metni.

Gizlenecek satır türleri (kayıtta kalır, silinmez; listenin üstünde tür başına sayıyla tek tek gösterilir, "gizlenenleri göster" ile açılır):
1. Kurulum ve boşta durumu: `eslenemedi` "Durum \"setup\" / \"none\" için TMI karşılığı yok".
2. İş zaten çalışıyor: `reddedildi` "İş zaten çalışıyor; devam edilecek bir duruş yok" (sayfa açılışında yeniden gönderilen durum).
3. Kuyruğa alma değişiklik yapmadı: `eslenemedi` "Emir çalışmıyordu; kuyruğa alma TMI'de değişiklik yapmadı".
4. Sıfır sayım: `eslenemedi` "Sayım farkı sıfır".
5. Kendiliğinden çözülecekler: `bekliyor` "Emir başlamadı" ve "Geçici hata; yeniden denenecek".

Görünür kalanlar: `hatali` (yeniden dene düğmesiyle), öteki bütün TMI retleri, yetki retleri, emir bulunamadı, emir bağı yok, nedeni TMI'de yok, nedensiz duruş ve hurda, hurda azaltma.

Seçenekler:
- a. Şemasız: tür, sonuç ve neden metninden `kurallar.ts`'te tek işlevle çıkarılır (Arkon sabitleri; "iş zaten çalışıyor" için TMI metni aynen). TMI metni değişirse satır görünür olur, yani hata görünür tarafa düşer. **Öneri:** geri alması ucuz, göç yok.
- b. Dolu `arkon_tmi_yansima` tablosuna boş olabilen `neden_kodu` sütunu (göç); eski satırlar kodsuz kalır, görünür. Daha sağlam, ama dolu tabloya şema işi.

Testler: izinli: setup satırı listede yok, gizlenen sayısında 1; `hatali` satır listede. Ret: gizlenen satır silinmedi (tabloda duruyor, "gizlenenleri göster" ile geliyor).

## TB2: çizim stüdyosu örnek dosya düğmeleri

Neden (DOĞRULANDI): düğmeler (`arkon/web/src/app/teknik-resim.ts:15-25` `SAMPLES`, `cizim-studyosu.ts:174-175`, örnekler listesi `teknik-resim.ts` ~397) sayfaya gömülü `smp-*` verisini arıyor (`yukleyici.ts:19` "Gömülü veri yok"). Örnek dosyalar depoda yok (`git ls-files` içinde .step/.stl/.pdf 0) ve derleme bunları üretmiyor. Bağlantı bozuk değil, hedef yok. Karar gereği dosya eklenmez.

Yazılacaklar: örnek düğmeleri, verisi sayfada yoksa gösterilmez (tek koşul: gömülü veri var mı). Arkon'un yerleşik çizimi (dosyasız `demo`) kalır.
Testler: izinli: veri varsa örnek listede; ret: veri yoksa düğme yok.
Ek bulgu: tanıtım paketleri de aynı veriyi istiyor (`istasyonlar.ts:395, 400`, `hazirlik.ts:62`); yalnız tanıtım kipinde çalışır (VARSAYIM, denenmedi). Dokunulmaz, borca yazılır.

## TB: CSP ihlal listesi ve wasm-unsafe-eval

İlke (DOĞRULANDI, `arkon/sun.ts:36-54`): `'wasm-unsafe-eval'` ZATEN `script-src`'de; kip rapor (`sun.ts:33`).

İhlal listesi (tarayıcı denemesi ve kaynak taraması):

| Akış | Tarayıcıda | İhlal | Kaynak |
|---|---|---|---|
| PDF açma, görüntüleme | denendi | 0 | pdfjs'in `new Function` yolu `isEvalSupported: false` ile kapalı |
| OCR (ölçü okuma) | denendi | 0 | tesseract yalnız WebAssembly kullanıyor |
| STL 3B | denendi | 0 | three: eval yok |
| STEP 3B | denendi | **5 satır**, `occt-import-js.js:9` | occt'nin embind kodu çalışma anında `Function` yapıcısı kullanıyor |
| Çizim stüdyosu (ekle, kaydet) | denendi | 0 | |
| Rapor yazdırma, SVG ve CSV indirme, yedek indirme, kamera ile QR | **denenmedi** | bilinmiyor | `giris-ayarlar-spc.ts:156-160`, `teknik-resim.ts:316, 321` |

Sonuç: `wasm-unsafe-eval` STEP'i çözmüyor, çünkü zaten açık ve ihlal sürüyor. `wasm-unsafe-eval` yalnız WebAssembly derlemesini serbest bırakır; `Function(...)` için `unsafe-eval` gerekir (VARSAYIM: CSP belgesine dayanıyor, rapor kanıtıyla uyumlu).

Seçenekler (`unsafe-eval` açılmaz):
- a. STEP okuyucuyu (occt-import-js) betik üretmeden çalışacak biçimde yeniden derlemek (Emscripten `DYNAMIC_EXECUTION=0`). Yeni derleme ve paket kaynağı demek; kullanıcı onayı gerekir. Çalışacağı VARSAYIM, denenmedi. **Öneri:** STEP korunur, ilke dar kalır.
- b. Zorlayıcı kipe STEP olmadan geçmek: STEP 3B kapanır, "bu ilkeyle açılmıyor" uyarısı çıkar; PDF, OCR ve STL sürer.
- c. STEP'i sunucuda çözümlemek: yeni mimari ve yeni paket.
- Hangisi seçilirse seçilsin, zorlayıcı kipe geçmeden önce denenmemiş akışlar tarayıcıda denenir ve senin tarayıcı onayın beklenir.
