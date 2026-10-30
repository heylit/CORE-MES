# FARK: istasyonlar sayfasını sadeleştirme, kart 670 (dal 670-istasyonlar)

Kullanıcı kararı 672 a (a-h hepsi, prototip değişikliği onaylı). Yalnız istemci; şema, göç, uç, işlem ve rol değişmedi.
- İş merkezleri ve istasyonlar: istasyon tablosunda "İş merkezi" sütunu kalktı (satır zaten merkezin panelinde; Reçete-Rota Kaynaklar düzeni); taşıma düzenlemede adın altında ve toplu "Taşı"da.
- Operatör / makine hücresi kısa yazar ("1", "1 / 2 tezgâh", "Gerekmez"); uzun anlatım hücrenin ipucunda. Makine çipi kırılmaz; tablo 1280'de taşmaz.
- Araç çubuğu tek satır; "Hepsini aç" ve "Hepsini kapat" tek değişen düğme. Sayısı sıfır olan süzgeç çipi görünmez (seçiliyse kalır).
- Yardım metni "Nasıl çalışır" açılır ayrıntısında; grup başlığında "sa/hafta" ve ikonlu "Vardiyalar" bağlantısı.
- 360: istasyon satırı seçim kutusu, kod ve ad üstte, kalan alanlar iki sütunda. Genel bakış: dört özet kart 1200 ve üstünde tek satır, 768'de iki, telefonda bir.

# FARK: istasyonlar yönetimi kolaylaştırma, kart #1296 (dal 1296-istasyonlar-yonetim)

Kullanıcı kararları (kart #1296): "Düzenle düğmesi", "Hepsi ya da hiçbiri", "Çoklu ekle" (CSV yok). Şema, göç, işlem ve rol değişmedi.

- Sunucu: yedi komut (`istasyonlar.yaz`): makine ve istasyon toplu taşı, toplu aktif / pasif, makine toplu durum, makine ve istasyon çoklu ekle. Tek işlem; biri reddedilirse hiçbiri (IS27).
- Sözleşme: gövdeler `paylasilan/sozlesme/istasyonlar.ts` içinde (`TOPLU_EN_COK` 500, `COKLU_EN_COK` 200).
- Ekran: listeler okuma kipinde, satırda "Düzenle"; makineler tek liste ve sol ağaç (iş merkezi > istasyon, arızalı sayısı); süzgeç çipleri; sıralanır başlık;
  yazdıkça süzülen seçici (istasyon, sorumlu, atama yeri, yetkinlik; son kullanılanlar); satır seçimi ve toplu çubuk; çoklu ekle penceresi (ilk kod + adet, önizleme).
- Personel kartında yetkinlik çip listesi ve aranarak ekleme (her istasyon için düğme kalktı).
- Makineler araç çubuğunda "Haritada göster" (`sayfa.atolye` ile; adres CNC Kurulum yazarıyla anlaşıldı, BASKA-MODUL-ISTEKLERI 16).

# FARK: genel aramada kayıtlar, kart #1221 (dal 1221-hizli-git-uclar)

- Uç ayrı dosyada (`arama/uclar.ts`, SQL `arama/sorgular.ts`, test `arama/arama.test.ts`); `uclar.ts`'te yalnız kayıt satırı. `GET /istasyonlar/ara?q=` (tanım listeleriyle aynı yetki): kod ya da adda geçen en çok 5 istasyon ve makine; sonuç bölümünü açar (`/istasyonlar/is-merkezleri`, `/istasyonlar/makineler`). Sayfa tanımına `aramaUcu` satırı.
- Şema, göç, işlem ve rol değişmedi.

# FARK: istasyonlar, sayfa gözden geçirme (dal 544-istasyonlar-sayfa)

Kart #544 (kullanıcının toplu isteği, madde 6). Modül depoda yazıldı; dış teslim yok, bu dosya dalın main'e göre farkıdır. Önceki turların farkı git geçmişindedir.
Yalnız istemci; sunucu, sözleşme ve göç değişmedi. Bütün okumalar modülün var olan uçlarından.

- Makine çalışma durumu: listede "Çalışma" sütunu (Çalışır, Arıza, Bakımda; satırı yoksa "Girilmemiş"), makine penceresinde ayrı kaydedilen durum ve açıklama.
- Arama, süzgeç ve CSV: istasyon (iş merkezi süzgeci), makine (istasyon süzgeci, istasyonsuz dahil), iş merkezi, ekip (istasyon süzgeci). Ortak üst satır `ListeAraclari`;
  operasyon tipleri de ona geçti. Arama ı ile i'yi eş sayar (ASCII kodlar: "EKIP").
- İstasyon satırında aktif makine ve bugün geçerli kişi sayısı.
- Kişi atamaları yan pencerede tablo yerine kişi başına tek satır; yüzde "%60", "%12,5".
- Boş değer tek biçimde: tablo "yok" yazar; operasyon tiplerindeki "–" kalktı, bilinmeyen kullanım "Bilinmiyor".
- Kart başlığı kalktı (bölüm adı üst başlıkta ve ikinci menüde); bölge adı ekran okuyucu için duruyor.
- Plan ayarı (istasyon penceresi) ve yetkinlik (kişi kısıtları) salt okunur; yazımı Rota > Kaynaklar'da kalır.
- Test: IS21 (dokuz test), kişi paneli ve operasyon tipi testleri yeni görünüme uyarlandı.

## Karar 146 a (19.10.2026, İK başlığı, main 2ace540 tabanı)
- Göç `20261019083000_istasyonlar_yetkinlik_iz.sql`: `istasyonlar_yetkinlik` tablosuna boş olabilen `veren_kisi_id`, `verilme`, `gecerlilik_bitis`,
  `dayanak` ve varsayılanlı `surum`; yeni defter `istasyonlar_yetkinlik_gecmisi` (yalnız ekleme). Var olan satırlar değişmez (veren ve verilme boş, süresiz).
- Liste yazımı silip yeniden yazmaz, farkı uygular; yeni uç `/kisi-yetkinlikleri/:kisiId/istasyonlar/:istasyonId/ayrinti` ve `/gecmis`.
- `disari.ts` `istasyonYetkinlikleri`, `yetkinMi` ve iş merkezi kapsamı yalnız bugün geçerli yetkinliği okur (IS29).
- Personel sekmesi: çipte bitiş ya da "süresi doldu", düzenle düğmesiyle bitiş ve dayanak.


## 563 c ve 563 2 a (26.10.2026, 568 ustune)
- Göç `20261026063600_istasyonlar_makine_yetkinlik.sql`: yeni `istasyonlar_makine_yetkinlik`, defteri `istasyonlar_makine_yetkinlik_gecmisi` (yalnız ekleme, `neden`:
  elle ya da istasyon yetkinliği kalktı) ve `istasyonlar_kisi_tezgah_siniri` (1-20, ortak değişiklik defterine bağlı). Dolu tabloya dokunmaz.
- Makine yetkinliği yalnız kişinin yetkin olduğu istasyonun aktif makinesine verilir; istasyon yetkinliği kalkınca o istasyonun makine kayıtları da kalkar ve deftere düşer.
- Yeni uçlar `/kisi-yetkinlikleri/:kisiId/makineler/belirle` ve `/tezgah-siniri`; toplu uca `makineler`; yetkinlik cevabına `makineIdleri`, `enCok`; geçmişe `makineGecmis`.
- `disari.ts` `makineYetkinlikleri` (yalnız makinenin bugünkü istasyonunda bugün geçerli yetkinlikle) ve `kisiTezgahSinirlari`.
- Personel kartında "Baktığı makineler" ve "Aynı anda en çok"; yetkinlik matrisinde "Düzey: Makine".

## #1318: ortak seçici arama ucu (30.10.2026, dal 1318-tesis-secim-ara)
- `GET /istasyonlar/secim-ara?tur=istasyon|makine&q&istasyonId&pasifler&sayfa`: `{ sonuclar: [{ id, kod, ad, aktif, ust }], dahaVar }`; sayfa 30.
  Ortak `IstasyonSecici` ve `MakineSecici` (kart #1317) bunu çağırır. Şema, göç, işlem ve rol değişmedi.
- Yetki (karar 1321 b, 30.10 10:32): çağıran modüllerin işlemlerinden biri: istasyonlar okuma, `sayfa.arkon`, `sayfa.markalama`, `sayfa.stok`.
  VARSAYIM: çağıranlar bugün istasyon ya da makine seçen modüllerdir (istemci kodunda arandı); A5'te seçiciyi alan modül işlemini `SECIM_OKUMA`'ya ekler.
