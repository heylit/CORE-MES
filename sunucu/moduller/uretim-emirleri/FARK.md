# FARK: ekransız uçlar kaldırıldı ve sayım düzeltme yetkisi, kart #238 (H3, H4; soru 266 a)

- Kaldırılan uçlar: `POST /uretim-emirleri` (iş emirsiz emir açma), `/:id/iptal`, `/:id/baslat`, `/:id/bitir`, `/:id/sayim`, `/:id/devam`, `/:id/durdur`, `/:id/sayim-ayarla`. Hiçbir ekran çağırmıyordu; başlat, devam, durdur, bitir ve sayım Arkon'dan `disari.ts` ile gelir. Çağıranı kalmayan servis işlevleri (`rotasizEmirAc`, `emirIptal`, `terminalSayimi`, `emirSayimAyarla`), `iptalIhlali` kuralı ve uçsuz sözleşmeler (`bitirGovdesi`, `makineSecimiGovdesi`, `emirBaslatCevabi`, `sayimAyarlaGovdesi`, `sayimCevabi`) de gitti.
- İş emirsiz emir artık açılmaz ve iptal edilmez; iptal yalnız iş emirli emirde (`POST /adimli-emirler/:id/iptal`).
- H4: `disari.emirSayim` eksi sayımda, `disari.emirBitir` adet verilince kişinin çalışan adıma katılımını ya da `uretim-emirleri.sayim-duzelt` işlemini ister (185 a). Artı sayım denetlenmez.
- `disari.emirBaslat` dönüş tipi servisin zaten verdiği `uyari` alanını bildirir.
- Şema, göç, işlem ve rol değişmedi.

# FARK: Malzeme · Teslim panelinde Fasona gönder, kart #97 (sorular 92 b, 97 a; dal 97-fasona-gonder)

- Yeni okuma ucu `GET /adimli-emirler/:id/siradaki-fason` (`uretim-emirleri.fason`): emrin sıradaki iş emri fason ise adım, firma ve gidiş özeti (giden, dönen sağlam, hurda, gönderilebilir); değilse, emir taslak ya da açık emir kuralına takılıyorsa `fason: null`. Yan etkisiz, kilit almaz.
- İstemci `istemci/src/moduller/uretim-emirleri/disari.ts` ilk kez açıldı: `FasonaGonder` bölümü. Kart #95'te stok paneli Teslim et altında gösterecek. Gidiş mevcut `POST /adimli-emirler/:id/is-emirleri/:isEmriId/fason-gidis` komutuyla, istek kimliğiyle yazılır; adet sınırı sunucuda.
- Şema, göç, işlem ve rol değişmedi.

# FARK: iş başlatmada yetkinlik, karar 86 b (dal claude/ik-hassas-alan-yetkinlik-heu9ik)

- `emirBaslat`: kapsam denetiminden sonra `yetkinMi` (istasyonlar `disari.ts`) ve `kisiBayrakliMi` (kisiler `disari.ts`); yetkinlik yoksa ya da süresi dolduysa 403 `YETKINLIK_YOK` (UE20). Terminal, makine devralma ve Arkon başlatması bu işlevden geçer.
- Şema, işlem ve rol değişmedi. Örnek veride operatör 1-4 kendi istasyonlarında yetkindir (`istasyonlar/ornek-veri.ts`).

# FARK: genel aramada kayıtlar, kart #1221 (dal 1221-hizli-git-uclar)

- Uç ayrı dosyada (`arama/uclar.ts`, SQL `arama/sorgular.ts`, test `arama/arama.test.ts`); `uclar.ts`'te yalnız kayıt satırı. `GET /uretim-emirleri/ara?q=` (`biri: ADIMLI_OKUMA_ISLEMLERI`, emir listesiyle aynı): emir no, parça no ya da parça adında geçen en çok 5 emir; sonuç `/uretim-emirleri/:id` ayrıntısını açar. Sayfa tanımına `aramaUcu` satırı.
- Şema, göç, işlem ve rol değişmedi.

# Fark (uretim-emirleri, kart #262, T1)

Taban main 6d14403. Başvuru: DEVAM-paketi-rota-plan/ilk-sistem-kodu (adımlı üretim emri), PROMPTLAR görev 1, ON-PAKET-tamamlama sürüm 3.
İlke: ilk sistemin özellik ve işleyişi aynen; onaylı kararlar (K1, K3, P3, P6, S1-S3, fason) üstüne. Bugünkü davranış silinmedi.

## Değişen
- Göç `20261009193500_uretim_emirleri_is_emri.sql`: eski emirlerin hepsi `uretim_emirleri_arsiv`'e kopyalanır (yalnız eklenir); planlı ve başlamış
  iptal, bitmiş bitti kalır; hepsi `arsiv = true`. `uretim_emri` üst kayıt olur: malzeme no (sabit kimlik), kaynak rota revizyonu, öncelik 1-4,
  başlangıç, teslim, açıklama, sürüm; durum listesine `taslak` eklendi; `istasyon_id` boş olabilir (yalnız iş emirli emirde).
- Yeni tablolar: `uretim_emirleri_is_emri` (rota adımının kopyası; kaynak makine | kişi | fason firma, tek kaynak kısıtı), `_is_emri_adayi`,
  `_is_emri_bileseni`, `uretim_emirleri_fason_hareketi` (kullanıcı kararı c: her gidiş ve dönüş ayrı satır, yalnız eklenir).
- Defterler (`uretim_kaydi`, `uretim_sayimi`, `uretim_olayi`) ve kontrol listesi (`emir_adimi`) hangi iş emrine yazıldığını taşır.
- Terminal (bugünkü uçlar, imzalar aynı): başlat sıradaki iş emrini başlatır; bitir çalışan iş emrini bitirir, iş emri kalırsa emir sıradakinin
  istasyonunda yeniden planlı olur (ilk sistem `sonrakiAdimaGec`), son iş emri biterse emir biter. Sayaç, çalışma hâli ve kontrol listesi iş emri
  başınadır. Fason iş emri terminalde başlamaz.
- Yeni uçlar: `GET /adimli-emirler`, `GET /adimli-emirler/:id`, `POST .../plana-al`, `.../iptal`, `.../adim-kaynagi`,
  `.../is-emirleri/:isEmriId/fason-gidis|fason-donus|fason-tamamla`.
- `disari.ts`: `uretimEmriAc`, `isEmirleriniYenile`, `adimliEmirListesi`, `adimliEmirAyrintisi` (rota); `planlanacakIsEmirleri`, `isEmriKaynagiYaz`,
  `emirPlanBilgisiYaz`, `emirPlanaAl`, `emirIptalEt` (plan); `emirNolari`, `isEmriOzeti`, `uretimEmriOzeti`, `fasonHareketiOzeti` (stok).

## Sonradan eklenen (birleşmeden sonra, kart #262)
- Fason gidiş, dönüş ve tamamlama ayrı işlem ister: `uretim-emirleri.fason` (depo, müdür, planlama_proje; kullanıcı kararı 2026-10-09).
  Göç `20261009194000_kisiler_uretim_emri_fason_islemi.sql` yalnız satır ekler; depo iş emirli emri bu işlemle okur.
- `planlanacakIsEmirleri` (plan, kart #415 isteği): her iş emri emrin `oncelik` (1 en acil, 4 en az; varsayılan 3) ve `baslangic` alanlarını
  taşır. `planlanacakIsEmirleri(db, { taslakDahil: true })` taslak emirleri de verir (`durum: 'taslak'`); seçeneksiz çıktı eskisi gibi yalnız
  planlı ve başlamış emirlerdir. Plan ekranındaki "Taslak emirleri de planla" seçeneği bunu kullanır.
- `isEmriKaynagiYaz` (planın iş emrine makine ya da kişi yazması) `plan.canliya-al` işlemini de kabul eder: planı canlıya alan, yazma işlemi
  olmasa da kaynağı yazar (kullanıcı kararı 2026-10-09, "A"). Yalnız bu yol; emir açma ve öbür yazmalar değişmedi.
- `emirMalzemeIhtiyaci(db, emirId)`: emrin kendi iş emri kopyasından brüt malzeme ihtiyacı (rota ağacıyla aynı formül). EK işleri bölündü
  (kullanıcı kararı "Bolerek"): stok hareketleri stokta, sıralama, dondurma, bölme ve önizleme planda (UYUM-BORCU UE-B3).
- `acikEmir(db, id)`: tek açık emri `acikEmirler` biçimiyle verir (Arkon tek paket okuması); açık değilse null.
- `acikEmirler` ve `acikEmir` satırında `malzemeNo` (ürünün malzeme kartı; istasyonlu emirde null; Arkon isteği): Arkon ayrıca iş emirli listeyi okumaz. Alan emir sözleşmesinde isteğe bağlıdır, liste ve terminal cevaplarında da gelir.
- Tekrar koruması (sistem denetimi S-02, S-04; kullanıcı kararı "Yaz", #262): `POST /uretim-emirleri`, `/:id/sayim` ve `/:id/sayim-ayarla` istek kimliği ister; aynı kimlikle yeniden gönderim ikinci emri ya da ikinci sayımı yazmaz. Emir açma formu sonucu bilinmeyen gönderimden sonra aynı kimliği yeniden kullanır. Terminal her sayım dokunuşuna kuyruğa girerken kimlik verir; sonucu bilinmeyen hatada (ağ, süre, 5xx) kuyruğu atmaz, ileti gösterir ve aynı kimliklerle yeniden gönderir. Sunucunun reddinde (4xx) önceki gibi kuyruk atılır. Kuyruk bellektedir; ekran kapanınca gönderilmemiş dokunuşlar düşer (VARSAYIM).
- `uretimEmriOzeti(...).saglamAdet`: bitmiş emirde son iş emrinin sağlamı, diğerlerinde null (stok tamamlaması, #428 isteği). Emir ekranındaki "Stokta tamamla" düğmesi için kullanıcı kararı "Yalnız müdür" (#262).
- Parti bölme ve birleştirme (kullanıcı kararı A, göç onayı 2026-10-10): `POST /adimli-emirler/:id/bol` { adimSira, adet, surum } bölünen
  adımdan sonuna kadar iş emirlerini yeni alt emre taşır (üst emir ve bölünme sırası yeni iki boş sütunda), üstün adedi düşer; alt emir
  yeniden bölünür. `POST /adimli-emirler/:id/birlestir` { kaynakEmirId, surum, kaynakSurum } alt partiyi üstüne ya da aynı adımdan
  bölünmüş kardeşine katar; kaynak iptal olur ve katıldığı emir `birlestigi_emir_id` sütununda tutulur (kullanıcı kararı "Sutun eklensin"). Okumalara `parti` (üst, sıra, alt partiler) ve plana `ustEmirId` eklendi. Varsayımlar #262'de.
  İlk sistemden ayrılan: prototipte bölme tek adımın iki parçasıdır ve plan durumudur; burada kalan adımlarla ayrı emirdir (kullanıcı kararı A).
- Parti kolu (kullanıcı kararları PB-K1..K6, 2026-10-12; göç `20261012093100_uretim_emirleri_parti_kol`): bölme önceki adımlar bitmeden de
  yapılır (bölünen adım ve sonrası başlamamış olmalı); kol, üstte bölündüğü adımdan önceki adım bitmeden başlamaz. `bol` gövdesine
  `birlesmeOpNo` (kolun üste katılacağı adım) ve `ekAdimlar` (rework, tamir, ek) eklendi. Yeni uçlar: `POST /adimli-emirler/:id/ek-adim`,
  `/ek-adim-kaldir`, `/birlesme-plani`. Planlı kol birleşme adımı ve sonrasını taşımaz; son adımı bitince kendiliğinden üste katılır, adedi
  (sağlam ve hurda) üste geçer, hurda kolun iş emirlerinde kalır. Birleşme adımı bekleyen ise kol gelmeden başlamaz, akışlı ise başlar;
  ikisinde de kol gelmeden bitmez. Elle birleştirme, bitmemiş ek adımı olan kolu almaz ve kalan adımları op numarasıyla karşılaştırır.
  Yeni sütunlar: `uretim_emirleri_is_emri.tur` (varsayılan `rota`), `ek_aciklama`, `uretim_emri.birlesme_op_no` (boş olabilir).
  Ek adımlı emre "emirlere uygula" dokunmaz (değişmedi diye bildirir). Arkon aynı komutlardan geçer, kurallar orada da geçerli.
- Emir türü (kart #699; göç `20261012093200_uretim_emirleri_emir_turu`): `uretim_emri.emir_turu` (seri, fai, numune, prototip, stok, rework,
  bakim_deneme, fason; varsayılan seri). `uretimEmriAc` girdisinde ve `bol` gövdesinde isteğe bağlı `emirTuru`; kol verilmezse üstün türünü
  alır. Okumalarda ve `PlanIsEmri`'nde `emirTuru`. Tür yalnız etikettir, kural değiştirmez (VARSAYIM). İş emri adım türünden (`tur`) ayrıdır.
- İlk sistemden ayrılan: prototipte "Tamamla ve stokta" adımlar bitmeden de emri kapatır. Burada emir son iş emri bitince kendiliğinden
  biter (terminal); bitmemiş iş emrine sağlam adet uydurulmaz. Stok, bitmiş emrin sağlam adedini stoğa alır.
- Ana sayfa kartları (kart #483, kullanıcı kararı "yaz" 2026-10-11): yeni okuma ucu `GET /uretim-emirleri/ozet` (oturum; şema değişmedi).
  Planlanacak (taslak) ve açık (planlı, başlamış) iş emirli emir sayısı yalnız iş emirli listeyi okuyabilene verilir, yoksa boş. Kuyruğum: kişiye
  atanmış, bitmemiş iş emirleri (açık emirde). Bugün ürettiğim: kişinin bugünkü (tesis günü) net sağlam sayımı; sayım yoksa boş, sıfır yazılmaz.
  Kartlar `istemci/src/moduller/uretim-emirleri/ana-sayfa.tsx`: planlanacak (`uretim-emirleri.yaz`) ve kuyruğum (`terminal.uret`) "Bana düşen
  işler"de, açık emir (`sayfa.rota`) ve bugün ürettiğim (`terminal.uret`) "Özet"te. Emir kartları `/rota/emirler`'e gider; kişi kartları
  bağlantısızdır (operatör ekranı Arkon'da). "Malzemesi eksik" kartı stoktadır: bu modül stoğu okumaz (ADR 0006).

## İlk sistemden ayrılan (onaylı karar ya da ADR gereği)
| İlk sistem | Burada | Gerekçe |
|---|---|---|
| Adım kaynağı istasyon (+ aday istasyonlar) | Kaynak makine ya da kişi; istasyon kaynaktan türer | K3 |
| `malzeme_id`, yalnız mamul | `malzeme_no` (malzeme_katalog_karti.no), mamul ya da yarı mamul | Sabit kimlik |
| `POST /adimli-emirler` ve `emirlere-uygula` uretim-emirleri'nde, rotayı kendisi okur | Rota çağırır (`uretimEmriAc`, `isEmirleriniYenile`); uçlar rotada (T4) | ADR 0006 yön: rota > uretim-emirleri |
| `rotaDegisti`, revizyon harfi özette | Özette `kaynakRotaRevizyonId`; karşılaştırma rotada | Aynı yön kuralı |
| Okuma uçları `oturum` | `biri: [sayfa.uretim-emirleri, sayfa.rota, uretim-emirleri.yaz, plan.yaz]` | UE15, ADR 0007 |
| Fason yok | Fason iş emri, gidiş/dönüş satırları | UE3, K-049, K-055, kullanıcı kararı c |
| Durum planli/basladi/bitti/iptal | + taslak ("Plana al") | S1 |

## Parti kolu kuralini disaridan sorma (kart #758, 2026-10-12)
- `partiKomutuReddi(db, isEmriId, 'baslat' | 'bitir')` `disari.ts`'ten verilir: terminal kaydi (Arkon) yazilmadan once kol ve birlesme kurali sorulur, ret metni doner. Komut uclari kurali yine kendisi denetler.
- `PlanIsEmri.ekAciklama`: plan ek adimin aciklamasini tasir; rota adiminda null. Goc, uc ve yetki degisikligi yok.

## Emir no biçimi (kart #802, 2026-10-12)
- `emir_no` hesaplanan sütundan düz sütuna geçti (göç `20261012124700`); var olan numaralar değişmedi. Numara verilmeyen eklemede tablo eski biçimi (UE-000123) yazar.
- Yeni biçimi ve sayacı ayarlar modülünün "Numara kuralları" yardımcısı (`numaraAl`, anahtar `uretim-emirleri.emir-no`) verecek; bu modülde sayaç yok. Bağlanana dek yeni emir UE- alır (UE-B10).
- Bölünen kol üst emrin numarasına kaçıncı kol olduğunu ekler (`/1`, `/2`); katılan ya da iptal kol da sayılır, numara yeniden verilmez.
- `uretim_emri.proje_id` (boş olabilir) projeler bağlaması için eklendi.

## Proje süzgeci (kart #810, 2026-10-12)
- `GET /adimli-emirler?projeId=N` yalnız o projeye bağlı arşiv dışı emirleri verir (projeler sayfasındaki liste); özet `projeId` taşır. Bölünen kol üstün projesini alır. Yetki değişmedi.

## Rota uygulama ve parti kolu (kart #823, KD-043, 2026-10-12)
- "Emirlere uygula" kol ya da açık kolu olan üst emri değiştirmez ("Bölünmüş parti değiştirilmedi"); kol katılınca üst yeniden uygulanabilir. Kola bütün rota uygulanırsa bölünmeden önceki ve birleşmeden sonraki adımlar iki kez yapılırdı.

## Dış operasyon listesi (kart #838, #542 U3, 2026-10-12)
- `disari.ts fasonIsEmirleri(db)`: bitmemiş fason iş emirleri (emir iptal, bitti ya da arşivde değil), ilk gidiş, termin (ilk gidiş günü + termin günü, İstanbul), dönüş zamanları ve hareket toplamları. Toplam o yönde hareket yoksa null. VARSAYIM: `planlananGidis` plan bağlanana dek null. Yetki denetlemez; satın alma ucu korur.

## Emir no kuralı bağlandı (kart #802, 2026-10-12)
- `uretimEmriAc` numarayı ayarlar `numaraAl('uretim-emirleri.emir-no')` ile alır: FIRMA malzemeler `firmaKodu`, PROJE projenin kodu, PARCA ürün kodu; boş alan numaradan düşer. Sayaç ayarlardadır, emir eklenmezse geri alınır.
- Emir açma girdisine `projeId` (boş olabilir) eklendi; yalnız aktif proje kabul edilir, değilse 400 "Proje bulunamadı ya da aktif değil.".
- Göç `20261012201935`: `uretim_emri.proje_id` projeler tablosuna yabancı anahtarla bağlandı. UYUM-BORCU UE-B10 kapandı.
- Emir açma formunda proje seçimi rota ekranındadır; istek `BASKA-MODUL-ISTEKLERI.md`de (B11).

## Dış operasyon satırında emir kimliği (kart #957, 2026-10-13)
- `fasonIsEmirleri` satırı `uretimEmriId` taşır: satın almanın Gönderildi/Döndü/Tamamla düğmeleri var olan fason uçlarını (`/adimli-emirler/:id/is-emirleri/:isEmriId/...`) bununla çağırır. Uç, göç ve yetki değişmedi.

## Örnek veri (kart #999, 2026-10-13)
- `ornek-veri.ts`: üç örnek emir rotadan açılır ve terminal komutlarıyla ilerler: Mil 20 bitti, Flanş 50 OP10 bitti OP20 sürüyor, Burç 30 planlı. Gerekir: rota, kisiler, istasyonlar. Göç, uç, yetki yok.
- Rota `disari.ts` ithali yalnız örnek veri dosyasında; döngü hesabı istisnası çekirdekte (#1000).

## Birim süre özeti ve ayar olayı (kart #1045)
- Göç `20261013132212_uretim_emirleri_ayar_olayi.sql`: `uretim_olayi.olay` kısıtına `ayar` eklendi (yalnız genişler; kullanıcı kararı S3 "Üretim emrine", "Yaz").
  Tetikleyici ayarda çalışma hâlini değiştirmez.
- `POST /uretim-emirleri/:id/ayar` (`terminal.uret`): sıradaki işin ayarı başlar; sonraki başlatma ayarı kapatır. `disari.ts` `emirAyar` (Arkon eşlemesi Aşama 2, A7a).
- `GET /adimli-emirler/:id/is-emirleri/:isEmriId/sure-ozeti` ve `disari.ts` `isEmriSureOzeti(db, isEmriId)`: brüt ve net birim süre, gerçekleşen hazırlık,
  1'er giriş dizisi ve ortalaması (dakika). Kayıt listesinde `ayar` olayı görünür.

## Refakat kartı (kart #1061)
- `GET /adimli-emirler/:id/refakat-karti` (adımlı okuma yetkisi): 100x150 kart verisi; QR `UE:<emir id>`, emir no, parça, adet, termin, parti (ana ya da alt parti ve üst emir no),
  op no, iş adı ve istasyon (fasonda firma) sütunlu rota. İptal edilmiş emirde 409. Basım kaydı tutulmaz (VARSAYIM).
- Emir ayrıntısında "Refakat kartı bas" düğmesi ve `/uretim-emirleri/:id/refakat-karti` sayfası: önizleme ile baskı aynı belgedir, sayfa ölçüsü yalnız o belgeye uygulanır.
- QR öneki kod sözlüğünden (`KOD_ONEKI['uretim-emri']`, kart #1059); `kodTuru` kartı emir kimliği olarak tanır.
- Okuma işlem listesi sözleşmede tek yerde (`ADIMLI_OKUMA_ISLEMLERI`); istemcideki kopyası tipten denetlenir.

## Yönetici paneli serileri (kart #1078)
- `GET /uretim-emirleri/gunluk-uretim?gun=30` ve `GET /uretim-emirleri/durus-dagilimi?gun=14` (adımlı okuma yetkisi; gün 1-366, bugün dahil, tesis günü).
  Günlük seri sayım defterinden (düzeltme dahil net); kaydı olmayan gün listede yoktur. Duruş süresi başlangıcı pencerede olan durdurmalardan,
  zamanca sonraki olaya ya da bitirmeye kadar; süren duruş şimdiye kadar. Hurda oranı seriden hesaplanır.
- `/uretim-emirleri/ozet` `asamalar` taşır (liste okuyamayana null): planlanacak (taslak), planda (planlı, iş emri başlamamış), üretimde
  (çalışan ya da adımlar arasında), duraklatılmış (duraklamış ya da durmuş), bu hafta biten (pazartesiden). Kalite bekleyen null: modülde kalite durumu yok.

## Makinede tek iş ve devralma (kart #1143)
- İstasyon kilidi (`uretim_emri_istasyonda_tek_kilitleyen`) kalktı; yerine `uretim_emirleri_makine_kullanimi` (emir, iş emri, istasyon,
  makine, kişi, başlama, bitiş, kapatan). Makinede tek açık satır; makinesiz iş istasyonun makinesiz yerini tutar. Bir kişi birden
  çok makinede iş tutabilir.
- `POST /uretim-emirleri/:id/baslat` ve `/devam` isteğe bağlı `{ makineIdleri }` alır (istasyonda ve çalışır makine); verilmezse
  iş emrinin makinesi, devamda son çalıştığı makineler. Dolu yerde 409, `ayrinti`: `{ kullanimId, makine, emir, kisi, baslama }`.
- `POST /uretim-emirleri/:id/makine-devral` `{ kullanimId }` (`terminal.uret`, istasyon kapsamı): yerdeki işi kapatır, bu işi orada
  başlatır ya da devam ettirir; arada yerde başka iş açıldıysa 409. Öteki işin açık yeri kalmazsa duraklatılır (neden istenmez).
- Davranış farkı: durdurma (nedenli duruş) artık makineyi bırakır; eskiden durmuş emir istasyonu tutuyordu.
- Göç başında sayım `RAISE NOTICE` ile yazılır: istasyon kilidini tutan emir, açılacak makine ve istasyon kullanımı.

## Aynı işe çok kişi katılımı (kart #1144)
- Yeni tablo `uretim_emirleri_katilim` (emir, iş emri, kişi, istasyon, giriş, çıkış, kapanış): kişinin işte kesintisiz çalıştığı aralık.
  Kişi başına emirde tek açık aralık. Var olan tablolar değişmez; sayım zaten kişi ve iş emrine bağlı.
- Uçlar (`terminal.uret`, istasyon kapsamı): `POST /uretim-emirleri/:id/katil` (yalnız çalışan işe; istasyonun aktif ekip üyesi;
  başka çalışan varsa `uyari` döner, reddedilmez), `/katilim/duraklat`, `/katilim/ayril`. `GET /uretim-emirleri/:id/katilimlar`
  (liste okuyan ya da terminaldeki kişi).
- Emir başlatan katılımcı olur (ekip denetimi yok); emrin duraklatılması, durdurulması ve bitirilmesi açık aralıkları kapatır;
  emir devamında devam ettiren işe döner, ötekiler yeniden katılır.

## Anomali okumaları (kart #1145)
- `disari.ts` `aralikAdetleri(db, 'istasyon' | 'kisi', idler, baslangic, bitis)`: kimlik başına [başlangıç, bitiş) aralığındaki net sağlam ve hurda
  (düzeltme dahil); sayımı olmayan kimlik haritada yoktur. `sonGirisler(db, kırılım, idler)`: son sayım girişinin zamanı; girişi olmayan yoktur.
- Göç: `uretim_sayimi (istasyon_id, zaman)` dizini.
- `katilimSureleri(db, kisiIdleri, baslangic, bitis)`: kişi başına [başlangıç, bitiş) içinde katılım aralıklarının süresi (saniye); aynı anda
  iki işte çalışılan süre iki kez sayılır. `makineSureleri(db, makineIdleri, baslangic, bitis)`: makine başına kullanım süresi (saniye).
  Açık aralık transaction anına kadar sayılır; penceresinde kaydı olmayan kimlik haritada yoktur. Göç yok: iki tablonun dizinleri yeter.
- `aralikAdetleri` ve `sonGirisler` `'makine'` kırılımı alır (Arkon isteği 13): sayım satırında makine yoktur; sayım, zamanında emrin o
  makinedeki açık kullanımına (başlama dahil, bitiş dahil) yazılır. Kullanım dışındaki sayım makinesizdir; aynı anda iki makinede süren işin
  sayımı ikisinde de sayılır (VARSAYIM: anomali "makinede üretim yok" sorusuna bakar, bölüştürme uydurulmaz).

## Fabrika haritası okumaları (kart #1121, #1122)
- Canlı emir (`canli`) `isEmri: { id, opNo, ad, makineId }` taşır: yalnız çalışan iş emri (durmuş ya da duraklamış dahil); iş emirsiz emirde,
  adımlar arasında ve bitince null; makine kaynaklı olmayan işte `makineId` null. Alan isteğe bağlıdır, eski istemci kırılmaz.
- `GET /uretim-emirleri/son-olaylar?sonra=<zaman>&sayi=50` (adımlı okuma yetkisi; sayı 1-200): bütün emirlerde başlat, bitir, ayar, duraklat,
  durdur, devam, sağlam sayım, hurda, düzeltme; yeniden eskiye. Her olay emir, iş emri, makine (iş emrinin makinesi), istasyon, kişi, adet,
  duruş nedeni ve zamanı taşır. `sonra` saat dilimli an; verilirse yalnız o andan sonrakiler (yoklama). Arkon olayları burada yok.


## Rotasız emrin adımları Arkon'a (kart #1257)
- `disari.ts rotasizIsEmirleri`: rotasız emrin (B13) açık adımları, `planlanacakIsEmirleri` satırı biçiminde (`kaynakRotaRevizyonId: null`). Plan bunları okumaz; Arkon Hazırlık iş emri paketi açar. İki okuma aynı sorguyu paylaşır (`acikAdimlar`).

## Emirde adımın iç ya da dış üretimi (UE-URY)
- `POST /adimli-emirler/:id/uretim-yeri` (`uretim-emirleri.yaz`): `{ opNo, yer: 'ic' | 'fason', firmaId, terminGun, surum }`. Açık emirde, başlamamış ve fasona gönderimi olmayan adım fasona (firma ve termin 1-365 gün) ya da içeriye alınır; rota değişmez, emrin sürümü artar, emrin satırdaki istasyonu sıradaki adımdan yeniden yazılır.
- Fasona alınca istasyon, makine, kişi ve süreler kalkar (tablonun fason kısıtları). İçeri alınınca son fasona alınıştan önceki makine, kişi, istasyon ve süreler geri yazılır; kayıt yoksa (adım rotadan fason geldiyse) operasyon tipinin varsayılan istasyonu ve süreleri yazılır, kaynak planda atanır.
- Yeni tablo `uretim_emirleri_uretim_yeri_degisimi` (yalnız eklenir): eski kaynak ve süreler, yeni firma ve termin, kişi ve zaman. Ayrıntıda her iş emri `uretimYeriDegisimi` (son değişim: yer, kişi, zaman) taşır.
- `GET /adimli-emirler/fason-firmalari` (`uretim-emirleri.yaz`): aktif fason firmalar; emri yazan müşteri ve tedarikçi yetkisi olmadan firma seçer.
- Ekran: emir ayrıntısında "Operasyon adımları: iç ve dış üretim" tablosu ve değiştirme penceresi.
- Plan: `planlanacakIsEmirleri` fason adımı yine vermez; her iç adım `fasonBekleGun` taşır (hemen önündeki bitmemiş fason adımların termin toplamı, gönderilmiş adımda ilk gidişten geçen gün düşülerek; kural `fasonBeklemesi`). Plan motoru bu kadar takvim günü bekletir, kapasite tüketmez. Emir dilimi adımın `terminGun` değerini de verir; Reçete ve Rota planı emirdeki iç ya da dış seçimini kullanır.

## Sayımda refakat partisi ve bölme kuralı (kart #125, Soru 121 a; dal 125-uretim-parti-bolme)
- Göç `20261022151100`: `uretim_sayimi.refakat_partisi_id` (boş olabilir, artı; yabancı anahtar yok, UYUM-BORCU UE-B10). Dolu tabloya boş sütun; eski satırlar boş kalır.
- `POST /uretim-emirleri/:id/sayim`, `/sayim-ayarla`, `/bitir` gövdesi isteğe bağlı `refakatPartisiId` alır; satıra yazılır. Kalite kararının iki satırı sayımın partisinde kalır (gruplama partiyle). `SaglamSayimOlayi`, `HurdaSayimOlayi`, `KaliteKarariOlayi` `refakatPartisiId` (yoksa null) taşır.
- Bölme (UE-PB1, UE-PB3'ün yerine): bölünen adım çalışıyor olabilir, yalnız orada henüz sayılmamış adet bölünür (`adet <= elde kalan - adımda sayılan`; sayılan: sağlam, hurda, karar bekleyen, red). Bitmiş adımdan bölünmez; sonraki adımlar başlamamış olmalı. Yeni ileti `BOLME_URETILMIS` (400, alan `adet`); `BOLME_BASLAMIS` metni değişti.
- İstemci: Reçete ve Rota `emir-komutlari.ts` ve Rota `PartiPaneli.tsx` `bolunebilirAdimlar` çalışan adımı da verir; birleşme adayı yine yalnız başlamamış adımlar. Ekran değişmedi.

## Refakat kartının adet sınırı (kart #172, Soru 132 ve 136 a; dal 172-kart-siniri)
- `disari.refakatKartiSayimlari(db, uretimEmriId, istasyonId, kartlar[{ id, malzemeNo, verilen }])` -> `Map<kartId, { sayilan, sinir }>`. Stok kartla verilen net miktarı verir; bu modül stoku okumaz (ADR 0006). Uç, göç, yetki değişmedi.
- Adım: istasyonda çalışan iş emri, yoksa istasyonun sıradakisi, yoksa emrin terminaldeki adımı. `sayilan`: kartla o adımda sayılan bütün parça (sağlam, hurda, karar bekleyen, red).
- `sinir`: adımın girdisi kartın malzemesiyse `floor(verilen / parça başı girdi)` (fire eklenmez, stok düşümüyle aynı miktar); değilse önceki adımda bu kartla sayılan sağlam; ilk adımda sarf yoksa null. Sınır yumuşaktır, sayımı durdurmaz (Soru 132).

## Arkon paketi için iki okuma (kart 625b, plan akışı bağlaması)
- `disari.isEmriKontrolListesi(db, isEmriIdleri)` -> `Map<isEmriId, { sira, ad, aciklama }[]>`: emir açılırken iş emrine kopyalanan kontrol listesi (`emir_adimi`); listesi olmayan iş emri haritada yoktur. Arkon BASKA-MODUL-ISTEKLERI 11.
- `PlanIsEmri.istasyonId` (isteğe bağlı, boş olabilir): iş emrine yazılmış istasyon. Arkon BASKA-MODUL-ISTEKLERI 12. Uç, göç, yetki değişmedi; Arkon'un kullanması ayrı dalda.
## Refakat kartları emir ayrıntısında (kart #588, Soru 586)
- Eski emir kartı kalktı: "Refakat kartı bas", "Etiket Merkezi'nde bas" (`tur=refakat`) düğmeleri ve `/uretim-emirleri/:id/refakat-karti` sayfası (QR `UE:<id>`, lotsuz). Kart artık yalnız stokta, depo lotu emre ayırınca açılır (Soru 120 b, 122 a).
- Emir ayrıntısında "Refakat kartları" bölümü (ürün kartı olan emirde, stok okuması olana): kart, malzeme, lot, verilen, durum (açık, lot bekliyor, iptal, birleşti). Açık, lotlu ve birleşmemiş kart `sayfa.etiket-merkezi` olana "Etiket Merkezi'nde bas" ile (`?tur=refakat-partisi`) refakat şablonundan basılır; yetkisi olmayanda düğme yoktur. Kart belgesi kopyalanmaz (tek sahip). Kart burada açılmaz.
- Sunucu, uç, göç, yetki değişmedi: `GET /adimli-emirler/:id/refakat-karti` stoğun ve Etiket Merkezi'nin emir verisi olarak kalır.
- Stok istemcisi ithal edilmez: stok bu modülün `disari.ts`'ini okur, ters ithal modül döngüsü olur (sınır kuralı f). Stok okuma listesi bu yüzden `refakat.ts`'te yazılıdır (tip denetimli).
- Sıra: kart #589 (Etiket Merkezi'nde `tur=refakat` kalkar) aynı turda ya da sonra.

## OEE için zamanlı iki okuma (kart 642, kullanıcı kararları 643 a, 644 a; dal 643-uretim-emirleri-oee-verisi)
- `disari.makineKullanimAraliklari(db, makineIdleri, baslangic, bitis)` -> `Map<makineId, { baslangic, bitis }[]>`: makine kullanımlarının pencereyle kesişen parçaları; açık kullanım okuma anına kadar. Toplamı `makineSureleri` ile aynıdır.
- `disari.makineSayimAnlari(db, makineIdleri, baslangic, bitis)` -> `Map<makineId, { zaman, saglam, hurda, red, standartSaniye, suresizSaglam }[]>`: makine kırılımlı sayım an an; kalite reddi ayrı sütun, karar bekleyen yok. Toplamları `aralikAdetleri` ve `kirilimStandartSureleri` ile aynıdır.
- Ekleyici: mevcut okumalar ve çağıranları değişmedi. Uç, göç, yetki yok.

## Kalite kararı üretim anına (kart 642, kullanıcı kararları 645 a, 652 a; dal 645-onay-uretim-ani)
- Göç `20261026150500`: `uretim_sayimi.karar_zamani` (boş olabilir; yalnız karar satırında, `karar_veren_kisi_id` doluyken). Dolu tabloya boş sütun; var olan satırlar değişmez, eski karar satırının zamanı karar anı olarak kalır.
- `kararliSayimiSonuclandir`: karar bekleyen sayım grubunun son kararla kapanmamış satırları üretim anlarına bölünür (eksi düzeltme en son sayılandan düşer); her an için iki satır (-n karar bekliyor, +n sağlam ya da red) o ana yazılır, kararın anı `karar_zamani`'dadır. Grup toplamı, stok olayı ve kapanış adedi değişmedi.
- Defter (`emirAyrintisi`) ve son olaylar kararı karar anında gösterir; son olaylar imleci kararı karar anıyla süzer.
- Yan etki (davranış): zamana göre sayım okuyan her yer onaylı ve reddedilen parçayı üretildiği ana sayar: OEE, Arkon günlük sayımı ve anomali, saat ekranı, kişi özeti. Önceden karar gününe düşüyordu. Karar beklerken gün kapanmışsa o günün sayısı karar verilince geriye dönük artar.

## Paralel adım: okuma ve komutlar (kart 639c, 639d; kararlar 626 a, 646 a, 647 a, 648 a, 649 a, 654 a; dal 639c-ue-paralel)

- `disari.ts` komutlarına isteğe bağlı `isEmriId`: `emirBaslat`, `emirAyar`, `emirSayim` (seçenekte), `emirDuraklat`, `emirDevam`, `emirDurdur`, `emirBitir`, `makineDevral`, `katil`, `katilimDuraklat`, `katilimAyril`. Verilmezse emrin terminaldeki tek açık adımı, yoksa sıradaki; iki açık adımda 409 "adım seçilmeli". Bugünkü çağrılar aynı çalışır. `emirBitir` artık `uyari` da döner. Yeni okuma `asimlar`.
- Yeni uçlar (`terminal.uret`): `POST /adimli-emirler/:id/is-emirleri/:isEmriId/{ayar, makine-devral, duraklat, katil, katilim/duraklat, katilim/ayril}`; `GET .../asimlar` (`KATILIM_OKUMA`).
- Davranış: sıra dışı başlatma uyarıyla geçer (626 a); akışlı ya da bekleyen adım önceki adım bitmeden bitmez (649 a); adıma girenden fazla sayım reddedilmez, uyarır ve iz bırakır (647 a, denetim #31'in sert sınırı kalktı); eksi bakiyeyle bitiş uyarır (654 a). Bir adım bitince başka adım çalışıyorsa emir başlamış kalır, istasyonu öncü adıma geçer; emrin sağlamı en büyük sıralı adımındır. Kullanım, katılım ve olay adım başına yazılır ve kapanır; aynı emrin öteki adımı makineyi doldurur.
- Okumalar: `Emir.acikAdimlar`, `Emir.baslatilabilirAdimlar`, ayrıntıda `isEmirleri[].eksik`. `adimaGiren` önceki adım bitmemişse o anki sağlamını kullanır.
- Göç yok (639b'de geldi); işlem ve rol değişmedi. Arkon terminali adım göndermediği için sıralı kalır (636 a; 639e, 639f).

## Hatalı parça: kol ya da emre adım, kalite kararı, rework adımı (1033 a, 1034, 1036 a, 4 a, 7 a, 1038 a; dal 1034-hatali-parca)

- Göç `20261028092000`: yeni boş tablo `uretim_emirleri_hatali_kaydi` (emir, adım, hedef emir, kalite, rework ve tekrar adımı, hurda nedeni, adet, not, kişi, zaman; kararı bir kez). Dolu tabloya dokunulmadı.
- Yeni uçlar: `POST /uretim-emirleri/:id/hatali` (`terminal.uret`, istek kimliği zorunlu), `GET /hatali-parcalar` (emri okuyan ya da `kalite-merkezi.oku`), `POST /adimli-emirler/:id/is-emirleri/:isEmriId/rework-adimi` (`uretim-emirleri.yaz`).
- `disari.ts`: `hataliKayitlari`, `hataliKaydi`, `hataliKarariVer` (Kalite Merkezi'nin karar formu; `kalite-merkezi.onayla` burada da aranır).
- Davranış: hatalı parça hatalı adımda sayılmaz. Kalite kararı adımı başlatma denetimiyle terminalden başlamaz. Bölme `kilitliEmriBol` ile planlamanın bölmesiyle aynı kuraldan geçer; `partiyiBol` davranışı değişmedi.
- 1045 b: emrin kendisinde bütün parça hurda ya da red olursa emir durur; sonraki adım başlatma denetimiyle başlamaz (ayrı durum yok, önceki adım bu kararın sağlamsız kalite adımıdır). Adımlı emir ayrıntısında `hataliDurdu` (1064: duran emir yeniden başlamaz, eksik adet için planlama yeni emir açar; kapatma akışı ayrı tasarlanacak).
- İşlem ve rol değişmedi (operatörün kolu açması 1033 a ile verildi; uç `terminal.uret`).
