# Kural -> test: denetim

Sahip: çekirdek konusu (altyapı parçası, kullanıcı kararı 08.10.2026). Her kural için kabul eden ve reddeden test; testi olmayan kural
"test yok" yazar ve `UYUM-BORCU.md`'ye girer. Test adları dosyadaki adın başıdır.

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| Başarılı her yazma komutu, komutla aynı transaction içinde kaydedilir | `oturum.test.ts` `denetim: giriş komutu parolasız kaydedilir; ...` | `denetim.test.ts` `denetimsiz uç: komut koşar, deftere satır düşmez; ...` (kip `yok` satır bırakmaz) |
| Kayıt değiştirilemez, silinemez, boşaltılamaz | test yok (yalnız ret ölçülür; eklemenin kendisi her yazma testinde) | `oturum.test.ts` `denetim: ... kayıt değiştirilemez ve silinemez`; `denetim.test.ts` `kayıt ucun modülünü ... sonradan doldurulamaz` |
| Gizli adlı alan (parola, token, pin, secret) gövdede ve parametrede maskelenir | `kurallar.test.ts` `parola alanları iç içe yapıda da gizlenir; diğer alanlar aynen kalır` | `kurallar.test.ts` `token ve pin alanları sözcük olarak maskelenir; adı onları yalnız içeren alan açık kalır`; `denetim.test.ts` `yol parametresi de maskelenir: ...` |
| Kişisel alan (TCKN, SGK no, IBAN, maaş, ücret geçmişi, kan grubu, engel durumu, adres, telefon, doğum tarihi) serbest sözlükte de maskelenir; eski satır okurken kapanır | `kurallar.test.ts` `IBAN, maaş, ücret geçmişi, ...` | aynı test: `engel`, `engelli`, `adresler`, `dogumYeri` açık kalır; `okuma.test.ts` `eski satırdaki IBAN, maaş, ...` (ham satır değişmez) |
| Gövdesiz uçta gövdenin yerine maskelenmiş gövdenin boyutu ve özeti girer | `denetim.test.ts` `gövdesiz uç: satır yazılır, gövde yerine yalnız boyut ve özet girer; ...` | `denetim.test.ts` `gövdesiz uç: özet maskelenmiş gövdeden alınır, ham gövdenin özeti deftere girmez; ...` |
| Seçicili gövdesiz uçta yalnız seçilen alanlar girer, seçimde de maskeleme | `denetim.test.ts` `gövdesiz uç seçiciyle: özetin yanına yalnız seçilen alanlar girer, ...` | aynı test: gövdenin gerisi ve gizli değer satırda yok |
| Tekrar korumalı uçta yinelenen istek ikinci satır yazmaz | `denetim.test.ts` `gövdesiz ve tekrar korumalı uç: ...` (ilk istek bir satır) | aynı test: ikinci istek satır yazmaz |
| Kayıt ucun modülünü ve yetki işlemini taşır; uç dışından yazılan ve eski kayıtta ikisi de boş | `denetim.test.ts` `kayıt ucun modülünü ve yetkisini taşır; ...` (kalibrasyon ve oturum uçları) | aynı test: modülsüz uçta modül boş, uç dışı kayıtta ikisi boş, sonradan doldurma reddedilir |
| Denetim eki yalnız denetlenen yazma komutunda bir kez; en çok 100 satır, satır başına 8 alan ve 512 bayt | `uc-denetim-eki.test.ts` `sınırdaki ek geçer: ...` | `uc-denetim-eki.test.ts` `sınırı aşan ya da biçimsiz ek ...`; `ek okuma ucunda, denetimsiz uçta ve ikinci çağrıda ...` (yakalanan hata da geri alınır) |
| Ek gövdede `_ek` olarak maskeli yazılır; yalnız `denetim.govde-oku` görür, liste göstermez | `okuma.test.ts` `denetim eki: ...` (yönetici görür) | aynı test: müdür gövde ucunda 403, liste satırında yok, parola maskeli |
| Liste `denetim.oku` ister | `okuma.test.ts` `liste: denetim.oku taşıyan müdür görür; ...` | aynı test: operatör 403, oturumsuz 401 |
| Gövde ve bütün parametreler `denetim.govde-oku` ister; hiçbir rolde yok | `okuma.test.ts` `gövde ucu: ... yönetici gövdeyi ve bütün parametreleri okur` | aynı test: müdür 403, operatör 403 |
| Liste satırı gövde ve parametre taşımaz (şemada alan yok) | `okuma.test.ts` `şema: ... gövde ucunun şemasında vardır` | `okuma.test.ts` `şema: liste cevabında gövde ve parametre alanı yoktur; ...` |
| DNT-01 listede yalnız tam sayı değerli `id` / `...Id` yol parametresi döner | `kurallar.test.ts` `DNT-01 ...`; `okuma.test.ts` `liste satırı gövde ve parametre taşımaz; ...` | `kurallar.test.ts` `DNT-01 ...` (metin, gizli adlı ve kimlik biçiminde olmayan parametre düşer) |
| Okumada maskeleme yeniden uygulanır | `okuma.test.ts` `gövde ucu: ...` (maskesiz eski satır maskeli döner) | test yok (maskesiz dönen bir yol sınanmıyor; aynı test maskeli sonucu ölçüyor) |
| Süzgeç kişi, tarih aralığı (iki uç dahil), komut; sayfalama | `okuma.test.ts` `süzgeç: ...`, `sayfalama: ...` | `okuma.test.ts` `süzgeç: ...` (ters tarih aralığı ve sınır dışı kişi kimliği 400) |
| Okuma ucu deftere satır yazmaz | `okuma.test.ts` `süzgeç seçenekleri: ... okuma ucu deftere satır yazmaz` | aynı test |
| Ekran: içerik yetkisi olmayana "İçerik görme yetkiniz yok", gövde ucu çağrılmaz | `DenetimKaydi.test.tsx` `içerik yetkisi olan gövdeyi maskeli ve düz metin olarak görür` | `DenetimKaydi.test.tsx` `içerik yetkisi olmayan satırı açınca ...` |
| Ekranda yazma düğmesi yok | `DenetimKaydi.test.tsx` `listede zaman, kişi, komut ve kayıt kimliği görünür; ... yazma düğmesi yok` | aynı test |
| Değişiklik defteri: güncellemede yalnız değişen alan eski ve yeni değeriyle, kişiyle; dışarıdaki sütun girmez; jsonb nesnede üst anahtar düzeyi | `degisiklik.test.ts` `güncellemede yalnız değişen alanlar ...`, `jsonb nesne sütununda ...` | `degisiklik.test.ts` `ekleme kalıpta yoksa yazılmaz; değer değişmeyen güncelleme ... satır yazmaz` |
| Defter ekleme ve silmede bütün dolu sütunları, bileşik anahtarla yazar; kişi değişkeni transaction ile biter, sayı olmayan değer boş sayılır | `degisiklik.test.ts` `yetki kalıbı: ...`, `silmede bütün alanlar ...` | `degisiklik.test.ts` `kişi değişkeni transaction ile biter ...` |
| Anahtar sütunu verilmeyen bağlama yazmayı durdurur; defter uygulama kullanıcısıyla değiştirilemez, silinemez, boşaltılamaz | test yok (izinli yol yukarıdaki satırlar) | `degisiklik.test.ts` `reddedilen: anahtar sütunu ...`, `reddedilen: defter satırı ...` |
| Değişiklik listesi `denetim.oku`, değerler `denetim.govde-oku`; gizli adlı alanın iki değeri maskeli | `degisiklik.test.ts` `liste: ...`, `içerik: ...`; `kurallar.test.ts` `değişiklik alanları ...` | `degisiklik.test.ts` `reddedilen: denetim.govde-oku olmayan ...` |
| Ekran: "Değişiklikler" görünümü, değer yetkisi olmayana uyarı ve içerik ucu çağrılmaz | `DenetimKaydi.test.tsx` `Değişiklikler görünümü: ...` | `DenetimKaydi.test.tsx` `değer yetkisi olmayan değişikliği açınca ...` |
