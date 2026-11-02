# İK modülü notları

Ekran 1614 ile `istemci/src/moduller/ik/yeni/`dir (TS); çerçeve, köprü ve uygulama paketi kalktı. Çerçeveyi anlatan maddeler kayıttır.

- Ekran yol A: uygulama (ik-modulu paketi) değiştirilmeden çerçevede açılır. Menüyü kabuk çizer; uygulama gömülü kipte kendi
  yan menüsünü ve alt şeridini gizler, aramayı üst çubuğa alır. Görünüm adı = ikinci menü madde anahtarı = uygulamanın görünümü.
- Çerçeve srcDoc'tur ve yalıtılmıştır (YalitilmisCerceve, opak köken; kullanıcı kararı 12.10.2026), içerik politikası dışarıya her isteği kapatır. Veri `tmi-ik-veri` iletileriyle kabuğa gider; köprü
  (istemci/src/moduller/ik/kopru.ts) isteği doğru uca yönlendirir: izin yazamayan kişinin izni talep/karar ucuna, pozisyon
  yazamayan onaycının açılışı onayla ucuna, personel yazamayan kişinin kendi kaydı iletişim ucuna, bordro kesinleştirmeye.
- Bordro kaydını istemci kurmaz: yalnız girdiler (brüt, gün, ek, mesai, tatil, kesinti) gelir; vergi, SGK, net sunucuda
  motorla hesaplanır. Motor (motor/*.ts) ekrandakinin kopyasıdır; ik-modulu src/core değişince ikisi birlikte güncellenir,
  yoksa ekran ile sunucu farklı sonuç verir.
- Değişiklik geçmişini sunucu yazar (ik_kayit_gecmisi, yalnız ekleme). Uygulamanın kendi günlük kaydı kapalıdır (audit: false);
  köprü 'log' türlü kaydı göndermez. Ekrandaki "geri al" ve "geri getir" normal yazma uçlarından geçer, yetki aynıdır.
- v2 şema: her tür kendi tablosunda, her alan bir sütun (sema.ts tek kaynak). Göç sema.ts'ten üretildi; tanım değişirse yeni göç
  yazılır ve sema.test.ts ikisini karşılaştırır. Eşleyici (eslesme.ts, ayar-eslesme.ts) kaydı satırlara ayırır ve geri kurar.
- Kişi ile personel kaydı personel kartındaki "TMI kullanıcısı" alanıyla eşleşir (IK-25, tekil kısıt).
- İş merkezi kapsamı (IK-27): personel ve pozisyonda zorunlu; bağlı kayıtlar kapsamı personelden ya da pozisyondan alır.
- Silme yoktur: iptal edilen kayıt satırında kalır ve listeden düşer; geçmişin "geri getir" düğmesi aynı kimlikle yeniden yazar.
- Ayar hiç kaydedilmemişken motorun varsayılan parametre dönemleri geçerlidir; ilk kayıtta onlar yazılır. Kilitli varsayılan
  dönemi silen ilk kayıt da reddedilir (IK-20).
- Paketi yeniden üretmek: ik-modulu klasöründe `npm run build` (esbuild --minify ile global paket), sonra dist/ik-modulu.global.js
  içeriği `</script` ve U+FFFD kaçışlanarak istemci/src/moduller/ik/uygulama/paket.ts içine JSON metni olarak yazılır.
- Tema değişince çerçeve yeniden kurulur (malzemeler ile aynı): açık form varsa kaybolur.
- v3 (Mesailerim, bordro onayı): `paket.ts` ik-modulu kaynağından değil, derlenmiş paketin üstüne `yama/ik_v3_uygulama_yamasi.py` ile
  yamalandı (kaynak bu teslimde yok). ik-modulu kaynağı yeniden derlenirse aynı değişiklik kaynağa yapılmalı; yoksa Mesailerim ve
  onay düğmesi kaybolur. `istemci/src/moduller/ik/uygulama.test.ts` bunu yakalar (dört test kırmızıya döner).
- Bordro onayı `ik_bordro_onayi` defterindedir (yalnız ekleme). Onay bordronun kesinleştirme sayısına bağlıdır: bordro kaydı
  yalnız kesinleştirmede yazılır ve `surum` her yazmada bir artar (`ik_kayit_koru`), bu yüzden kesinleştirme sayısı = `surum`.
  Ay yeniden kesinleşince eski onay geçersiz olur (IK-43); defterde durur, okuma cevabına girmez.
- Okuma cevabında onay, bordro kaydına `gordum` alanı (zaman) olarak eklenir; uygulama yazdığında bu alan gönderilmez, çünkü
  bordroyu uygulama yazmaz (yalnız kesinleştirme yazar).
- Puantaj (kart #1571): ekran kodu `istemci/src/moduller/ik/uygulama/yama/ik_puantaj_ekran.js`, pakete
  `ik_puantaj_yamasi.py` ile girer (tek geçen çapalar; çapa bulunmazsa yama durur). Paket yeniden derlenirse önce v3, sonra bu yama
  uygulanır. Puantaj verisi paketin kayıt deposunda değildir: köprünün `puantaj-oku` iletisiyle ay ay okunur, yazınca önbellek boşalır.
