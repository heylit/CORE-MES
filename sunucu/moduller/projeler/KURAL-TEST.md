# Kural -> test: projeler

| Kural | Test |
|---|---|
| PRJ-01 kod büyük harf A-Z, rakam, nokta, alt çizgi; en çok 24; tire yok (kısıt `projeler_proje_kod_bicim`) | `kurallar.test.ts` `PRJ-01 kod: ...`, `projeler.test.ts` `PRJ-01 kod büyük harfe çevrilir; ...` |
| PRJ-02 kod tekil (`projeler_proje_kod_tekil`) | `PRJ-02 kod tekildir: ...` |
| PRJ-03 kod, açan ve açılış zamanı açıldıktan sonra değişmez (tetikleyici) | `PRJ-03 kod açıldıktan sonra değişmez: ...` |
| PRJ-04 bitiş başlangıçtan önce olamaz (`projeler_proje_tarih_sirasi`) | `PRJ-04 bitiş başlangıçtan önce olamaz ...` |
| PRJ-05 müşteri firması finanstan; olmayan ve pasif firma yeni seçilemez, mevcut bağ kalır | `kurallar.test.ts` `PRJ-05 firma: ...`, `projeler.test.ts` `PRJ-05 müşteri firması finanstan: ...` |
| PRJ-06 düzenleme sürüm denetimli (409), olmayan 404 | `PRJ-06 sürüm: ...` |
| PRJ-07 proje yalnız onaylı siparişten açılır; firma siparişten gelir; bir siparişten birden çok proje (176 a) | `kurallar.test.ts` `PRJ-07 sipariş: ...`, `projeler.test.ts` `PRJ-07 proje onaylı siparişten açılır: ...`, `PRJ-07 yetki: ...`, `siparişin projeleri: ...` |
| PRJ-08 siparişe bağlı projede firma değişmez; sipariş bağı değişmez (tetikleyici `projeler_proje_siparis_degismez`) | `kurallar.test.ts` `PRJ-08 ...`, `projeler.test.ts` `PRJ-08 siparişe bağlı projede firma değişmez; ...` |
| PRJ-09 bütçe (198 a): boş olabilir, girilmezse hedef plan maliyeti; tutar ve para birimi birlikte (`projeler_proje_butce_butun`), eksi değil (`projeler_proje_butce_tutar`); yalnız `finans.maliyet-oku` görür ve yazar, görmeyene alan gitmez ve gönderdiği bütçe yok sayılır (180) | `kurallar.test.ts` `PRJ-09 ...`, `projeler.test.ts` `PRJ-09 bütçe: ...`, `PRJ-09 bütçe gizliliği: ...`, `Projeler.test.tsx` `bütçe yalnız maliyet görene görünür ...` |
| PRJ-10 yeni proje sipariş seçilmeden açılmaz (224); firma siparişten gelir, proje formu siparişten açılışla aynı kuralı izler; seçici yalnız onaylı siparişleri verir | `projeler.test.ts` `PRJ-10 ...`, `PRJ-07 ...`, `Projeler.test.tsx` `yazan yeni proje açar: sipariş seçmeden kaydetmez ...` |
| PRJ-11 statü listeden (var ve etkin) seçilir ya da yalnız serbest yazı izni açıkken elle yazılır, ikisi birden olmaz (`projeler_statu_kaydi_tek_kaynak`); güncel statü son kayıttır, geçmiş yalnız eklenir; liste adı tekil (`projeler_statu_ad_tekil`) | `kurallar.test.ts` `PRJ-11 ...`, `proje-yonetimi.test.ts` `PRJ-11 statü: ...`, `PRJ-11 statü listesi: ...`, `ProjeYonetimi.test.tsx` `statü listeden ya da elle yazılır ...` |
| PRJ-12 görev: plan bitişi başlangıçtan önce olamaz, gerçekleşen tarihler sıralı, bitti gerçek bitiş ister ve ilerlemeyi 100 yapar (`projeler_gorev_bitti_butun`), kilometre taşı ve önceki görev aynı projeden, önceki zinciri döngüsüz | `kurallar.test.ts` `PRJ-12 ...`, `proje-yonetimi.test.ts` `PRJ-12 görev: ...`, `ProjeYonetimi.test.tsx` `görev eklenir ...` |
| PRJ-13 kilometre taşı taban tarihi yalnız gerekçeyle yenilenir, eski değer geçmişte kalır; doğrudan değişiklik veritabanında reddedilir (`projeler_kilometre_tasi_taban_donuk`) | `kurallar.test.ts` `PRJ-13 ...`, `proje-yonetimi.test.ts` `PRJ-13 ...`, `ProjeYonetimi.test.tsx` `taban tarih gerekçe ve sürümle yenilenir ...` |
| PRJ-14 proje ilerlemesi: iptal dışındaki görevlerin plan günüyle ağırlıklı ortalaması; görev yoksa null | `kurallar.test.ts` `PRJ-14 ...`, `proje-yonetimi.test.ts` `PRJ-14 ...` |
| PRJ-15 aktif olmayan projeye görev ve kilometre taşı yazılmaz; statü yazılır | `kurallar.test.ts` `PRJ-15 ...`, `proje-yonetimi.test.ts` `PRJ-15 ...`, `ProjeYonetimi.test.tsx` `okuyan statü ve görev yazamaz ...` |
| Yetki: okuma `sayfa.projeler` ya da `projeler.oku`; yazma, firma ve sipariş seçici `projeler.yaz`; görev ve kilometre taşı `projeler.gorev-yaz`, statü `projeler.statu-yaz`, statü listesi ve serbest yazı izni `projeler.statu-ayar` (910 a) | `yetki: yönetici açar ve listeler; ...` |
| Liste süzgeci ve arama (joker kaçırılır) | `liste: arama kod ve adda, ...`, `arama kalıbı: ...` |
| disari.ts sözleşmesi | `disari.ts: kod, özet, seçenekler ...` |
| Ekran: okuyan ekleyemez, kod büyük harfle gider, düzenlemede kod kilitli, sürüm gider | `istemci/src/moduller/projeler/Projeler.test.tsx` (3 test) |
