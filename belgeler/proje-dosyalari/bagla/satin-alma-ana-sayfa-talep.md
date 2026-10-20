# Satın alma: ana sayfadan talep açma, liste (yazım yok)

Kaynak: kullanıcı kararı "TALEP AÇMA ANA SAYFADAN" (09.10.2026). Talep, satın almanın talep kaydıdır (`satin_alma_talep`, ayrı tablo yok).
Taban: main 6e04d3e.

## Bugün olan (DOĞRULANDI)
- Talep açma ve düzenleme `satin-alma.talep-ac` işlemiyle (`uclar.ts`: `/satin-alma-talepleri/ac`, `/:id/kaydet`, `/:id/sil`). Gövde, satın alma ekranının
  bütün talep kaydı (kalemler, teklifler, karar dahil); talep eden için sunucu teklif ve karar yazmayı reddeder (`servis.ts` `talepAc`, test SAT-64).
- Talep eden yalnız kendi taleplerini görür: `sorgular.ts` `talepSatirlariOku` (`acan_kisi_id` ya da `talep_eden_kisi_id` = kişi), test SAT-53 SAT-65.
- Ama talep eden bugün SEÇİLEN teklifi fiyatı ve tedarikçisiyle görür (`kurallar.ts` `talepEdenGorunumu` seçilen teklifi olduğu gibi bırakır).
  Açılış verisi talep edene kataloğu ve ayarları da verir (ayarlarda birim bütçeleri, onay limitleri, kurlar) (`servis.ts` `acilis`).
- Kart seçimi: `GET /satin-alma-malzeme-secenekleri` (`satin-alma.talep-ac`) aktif malzeme kartını arar; talep kalemi kataloğa (`katalog_id`) bağlanır, katalog kalemi karta (SA2 b).
- Hizmet türü yok: "yalnız alınan hizmet" malzemelerin hizmet türünü bekler (MH1 a ile geliyor).

## Satın almanın yazacakları (öneri)
1. `GET /satin-alma-taleplerim` (yetki `satin-alma.talep-ac`): yalnız kişinin kendi talepleri; no, başlık, sade durum (açık, teklif toplanıyor, onayda,
   sipariş verildi, teslim alındı, iptal), ihtiyaç tarihi, kalemler (ad, miktar, birim). Fiyat, teklif, tedarikçi, karar yok. Sunucuda süzülür, testli.
2. `POST /satin-alma-talepleri/hizli-ac` (yetki `satin-alma.talep-ac`, tekrar korumalı): gövde { kalemler: [{ malzemeNo | serbestAd, miktar, aciklama }], ihtiyacTarihi, aciklama }.
   Talep eden ve açan kişi oturumdaki kişidir; başkası adına açılmaz. VARSAYIM: talep satın almanın iş kutusuna düşen ilk durumda açılır
   (taslakta kalmaz); hangi durum adı olduğu yazımda `kurallar.ts` geçişlerinden seçilir.
3. Kalem kartı kataloğa bağlı değilse sunucu katalog kalemini kendisi açar (karttan; bugünkü `katalogKaydet` kuralları). Göç gerekmez.
4. Hizmet kartında yalnız alınan hizmet kabul edilir (sunucuda 422, testli); malzemelerin hizmet türü birleşince.
5. Kart isteme yolu: katalogda olmayan ihtiyaç serbest adla yazılır, talep ilerler, kalem "kart bekliyor" görünür; yanında kart sayfasına bağlantı (yeni sekme).
   VARSAYIM: serbest kalem kabul edilir (SA2'de "talep yarım kalmasın" kararı). Geri alma ucuz: sunucuda tek kural.
6. SAT-53 değişir: talep eden seçilen teklifi de görmez (fiyat, tedarikçi yok). Kullanıcının yeni kararı; mevcut test bu yönde güncellenir.
   Açılış verisi (`/satin-alma-acilis`) talep edene ayarları (bütçe, limit) vermez; yalnız ana sayfa uçları kullanılır.
7. Ana sayfa kartı: satın alma kendi kartını bildirir (ortak arayüzün kart yapısına göre); kart yalnız `satin-alma.talep-ac` olana görünür.
   İçerik: "Talep aç" formu (kart arama, miktar, tarih, açıklama) ve "Taleplerim" listesi. Satın alma ekranındaki 7 maddelik menü değişmez.
8. Önce ve sonra görüntüsü: ana sayfanın bugünkü hâli ve taslak (ortak arayüz konusuyla birlikte).

## Bağımlılıklar
- Ortak arayüz: ana sayfada modül kartı yeri (öteki konu).
- Malzemeler: hizmet türü ve yönü (madde 4).
- Rol verme ayrı iş (TEDARİK ROLLERİ): R1-R3, firma bağı finansa bağlandıktan sonra girer.

## Kart
#162 bağlamadır ve PR #366 ile birleşti; bu yeni bir özellik (yeni uç ve ana sayfa). Öneri: yeni kart "ana sayfadan satın alma talebi", #162'ye atıf.

## Kullanıcıya sorulacaklar
1. Hangi roller ana sayfadan talep açabilir?
   Neden: rol matrisine `satin-alma.talep-ac` girecek. Seçenekler: a) planlama_proje, cam, bakim, kalite, depo, mudur, satin_alma; b) a ve operator; c) başka liste.
   Öneri: a; operator ayrı sorulur (makinedeki kişi ihtiyacı ustabaşına söyler varsayımıyla).
2. Talep açmak için yeni bir sayfa işlemi gerekir mi, yoksa `satin-alma.talep-ac` yeter mi?
   Neden: ana sayfa kartının kime görüneceğini bu belirler. Seçenekler: a) `satin-alma.talep-ac` yeter, kart bu işlemi olana görünür; b) yeni `sayfa.talep` işlemi.
   Öneri: a; ayrı işlem rol matrisine madde ekler, ayrım kazandırmaz.
3. Kişinin kendi talepleri ana sayfada mı listelenir?
   Neden: talep eden durumunu nereden izleyecek; "Taleplerim" satın alma menüsüne dönmüyor. Seçenekler: a) ana sayfadaki kartta son talepler ve durumu;
   b) yalnız açma formu, liste yok. Öneri: a (son 10, "tümü" açılır).
