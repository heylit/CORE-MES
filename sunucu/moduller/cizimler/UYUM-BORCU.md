# UYUM BORCU: cizimler (kart #708, dal 708-cizimler)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI (kod ya da komut), VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak
1. TUTAN. Rol x işlem satırı yok: `sayfa.cizimler`, `cizimler.oku`, `cizimler.yaz`, `cizimler.yayinla` yalnız yöneticide (Aşama 1 kuralı).
   Uyum: ortak yetki matrisinden rol dağılımı (öneri: okuma herkese, yazma teknik ofis, yayınlama kalite ya da üretim şefi).
2. TUTAN. `cizimler_bag.hedef_id` doğrulanmıyor: merkez malzemeler modülünü ithal etmez (ADR 0006; malzemeler merkezi ithal edecek, döngü olur).
   Var olmayan kart numarasına bağ kurulabilir. DOĞRULANDI: `servis.ts` `bagEkle`. Uyum: Aşama 2'de yabancı anahtar ya da malzemelerin kendi ucundan bağ.
3. TUTAN. Kullanan ekranlar henüz merkezden okumuyor: malzeme kartı, istasyon, atölye, Arkon, kalibrasyon. `disari.ts` hazır
   (`kaydaBagla`, `kaydaBagliBelgeler`, `kayittakiBelgeDosyasi`, `kayittanKaldir`); istekler `BASKA-MODUL-ISTEKLERI.md`.
4. ETKİLEYEN. Arkon (`draws`, `pkgs` dosyaları) ve atölye krokileri tek seferlik göçle kopyalandı (kart #746,
   `20261012110000_cizimler_eski_dosyalar.sql`); kaynak tablolar değişmedi, kaynak modüller hâlâ kendi kopyasını okur. Atölye 3B
   modelleri (`atolye_model`) taşınmadı: GLB tutar, `dosya` GLB almaz (çekirdek isteği C1). Arkon belgesine bağ yok (kimliği metin,
   `cizimler_bag.hedef_id` sayı). Uyum: bağlamada kaynak modüller merkezden okur, kendi dosya tabloları kalkar; C1 gelince modeller ayrı göçle.
5. SONRA. `cizimler_revizyon.dosya_turu` dosya satırındaki türün kopyası (liste sorgusu `dosya` tablosunu okumasın diye). Dosya değişmez
   olduğu için kopya bozulmaz; tetikleyici değiştirmeyi reddeder.
6. SONRA. SHA-256, base64 ve ikili okuma istemcide atölyedekinin kopyası (`dosya-aktarimi.ts`); `api` ikili GET vermiyor. Görüntüleyici
   atölye önizlemesine benzer. Uyum: ortak parçaya taşıma (çekirdek isteği C3, C4).
7. SONRA. `occt-import-js` tipinin STEP kısmı atölyedeki `occt-import-js.d.ts`'te; merkez yalnız IGES'i ekler. Atölye dosyası taşınırsa tanım ortak yere gider.
8. SONRA (KISMEN KAPANDI). Yayındaki STEP/IGES revizyon için tarayıcıda üretilen PNG önizleme kareleri artık saklanıyor
   (`cizimler_onizleme`, `disari.ts` `yayindakiOnizleme`); sunucuda dönüşüm yok. Kalan: merkezin kendi görüntüleyicisi kareleri kullanmaz,
   büyük dosyada (yüz MB) dosyanın tamamını indirir; 25 MB üstü modelde kare üretilmez. VARSAYIM: atölye dosyaları çoğunlukla birkaç MB.
   Uyum: görüntüleyici büyük modelde önce kareleri gösterir, "3B aç" ile dosyayı indirir.
9. TUTAN (kart #688). Küçük resim kareleri tarayıcıda önbelleğe girmez (C6). Uyum: çekirdek ikili cevaba önbellek seçeneği verince kare ucuna kısa ömür.
10. TUTAN (kart #688). Üretim emirleri liste ve ayrıntısında küçük resim gösterimi bu dalda yok: `uretim-emirleri` dosyaları başka işlerde kilitli. Hazır parça: istemci `cizimler/disari.ts` `useKucukResimler('malzemeler', kartNolar)` ve `KucukResimKutusu`.
11. TUTAN (kart #688). Kart resim no ve revizyonu malzemeler `disari.malzemeResimAnahtarlari` ile okunur; bu fonksiyon 688-malzemeler-resim dalındadır, o dal birleşmeden bu dal derlenmez.
12. SONRA (kart #688). PDF ve foto karesi tarayıcıda üretilir; sunucu içeriğin belgeye benzediğini denetleyemez (CZ-15 ile aynı). Kare üretmeyen eski tarayıcıda belge resimsiz kalır, "Resim üret" ile yeniden denenir.
