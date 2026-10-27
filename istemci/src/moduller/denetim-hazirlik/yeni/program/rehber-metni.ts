// Rehber sekmesinin yalnız P1'in kullandığı metinleri (prototip DAY_STD, DAY_EY, bulgu örneği). Metin prototiptekiyle aynıdır.

// [saat, başlık, açıklama, ipucu]
export type GunSatiri = readonly [string, string, string, string];

export const DENETIM_GUNU: readonly GunSatiri[] = [
 ["09:00","Açılış toplantısı","Denetçi kapsamı, planı ve kuralları anlatır; üst yönetim katılır.","Katılım listesini hazır tutun. Planda değişiklik gerekiyorsa burada söyleyin."],
 ["09:30","Saha turu","Atölye, depo, karantina alanı ve ölçüm odası gezilir; denetçi gördüklerini not alır.","Denetçi: “Bu kırmızı kasadaki parçalar ne?” · Güçlü cevap: “Uygunsuz ürün. Etiketinde DÖF no 2026-14 yazıyor, kaydı burada.”"],
 ["10:30","Süreç denetimleri","Süreç sahipleriyle görüşülür, kayıtlar örneklenir, bir sipariş baştan sona izlenir.","Denetçi: “Bu ölçümü hangi cihazla yaptınız?” · Zayıf: “Kumpasla, kalibreli olması lazım.” · Güçlü: “OC-012 ile. Etiketi burada, Mart 2027'ye kadar geçerli; sertifikası sistemde.”"],
 ["12:30","Öğle arası","Denetçi notlarını toparlar.","Eksik kayıtları bulup hazırlayın; ama geriye tarihli kayıt üretmeyin, bu tek başına ciddi bulgudur."],
 ["13:30","Liderlik ve yönetim","Politika, hedefler, YGG, iç denetim ve DÖF etkinliği; üst yönetimle görüşme.","Genel müdür hedefleri ve son YGG kararlarını kendisi anlatabilmeli; KYS sorumlusuna yönlendirmek zayıf görünür."],
 ["15:30","Denetçi değerlendirmesi","Bulgular sınıflandırılır: majör, minör, gözlem.","Ulaşılabilir olun. Yanlış anlaşılma varsa kanıtla düzeltin."],
 ["16:30","Kapanış toplantısı","Bulgular okunur; düzeltici faaliyet süresi ve sonraki adımlar konuşulur.","İtirazınız varsa kanıtla yapın. Kabul ettiğiniz bulgular için hemen DÖF açın ve süreyi not alın."]];

export const EYDEP_GUNU: readonly GunSatiri[] = [
 ["09:00","Açılış ve firma sunumu","Heyet programı açıklar, firma kendini tanıtır.","Sunum kısa ve veriye dayalı olsun: savunma cirosu, referanslar, yatırımlar."],
 ["10:00","Saha ve altyapı turu","Tezgâh parkı, ölçüm odası, depo ve güvenlik önlemleri görülür.","Heyet: “Kapasite kullanım oranınız nedir?” · Güçlü cevap: ERP'den son 6 ayın verisini açmak."],
 ["11:00","Alan görüşmeleri","Heyet alanlara ayrılır: kurumsallık, personel, finans, kalite, üretim, teknik alan.","Her alan için bir sorumlu hazır olsun; sorular çoğunlukla “sistemden gösterin” biçimindedir."],
 ["13:30","Teknik alan ve örnek işler","Malzeme, tolerans ve örnek parça kabiliyetine bakılır.","En zor işinizin parçasını ve ölçüm raporunu hazır tutun."],
 ["15:30","Heyet değerlendirmesi","Alanlar puanlanır, gelişim alanları belirlenir.","Eksik belge varsa ne zaman tamamlanacağını netleştirin."],
 ["16:30","Kapanış","Genel izlenim ve gelişim alanları paylaşılır; rapor ve puan sonra bildirilir.","Gelişim alanlarını not alın; olumsuz sonuçta 1 yıl sonra yeniden başvurulabilir."]];

// Bulgu yazma ve cevaplama örneği (prototip rehberExtra).
export const BULGU_ORNEGI = {
  seviye: 'Minör bulgu',
  madde: 'ISO 9001 · 7.1.5.2',
  satirlar: [
    ['Şart', 'Ölçüm cihazları belirlenen aralıklarla, izlenebilir standartlara göre kalibre edilmelidir.'],
    ['Kanıt', "CNC-2 tezgâhında kullanılan OC-014 kumpasının kalibrasyon süresi 12.08.2026'da dolmuş; cihaz 19.09.2026 tarihli 3381 nolu iş emrinin son muayenesinde kullanılmış."],
    ['Uygunsuzluk', 'Kalibrasyon süresi geçmiş bir ölçüm cihazı ürün kabulünde kullanılmaktadır.'],
  ] as const,
  neden: 'Neden minör: takip sistemi var, tek bir cihazda aksamış. Kalibrasyon takibi hiç olmasaydı majör olurdu.',
  zayif: '“Kumpas kalibrasyona gönderildi. Operatöre eğitim verildi.”',
  zayifNeden: ['Kök neden yok; “eğitim verildi” sorunun sebebini açıklamaz.', 'Diğer cihazlar kontrol edilmemiş; sorun başka yerde de olabilir.', 'Bu kumpasla ölçülüp sevk edilen parçalar değerlendirilmemiş.', 'Tekrar etmeyeceğine dair bir kanıt yok.'],
  guclu: [
    ['Düzeltme (hemen)', 'OC-014 kullanımdan çekildi ve kalibre edildi; uygun çıktı. 3381 nolu iş emrindeki parçalar başka bir kumpasla yeniden ölçüldü: uygun.'],
    ['Yayılım kontrolü', '42 cihazın tamamı listeyle karşılaştırıldı; süresi geçmiş başka cihaz yok.'],
    ['Kök neden (5 Neden)', "Süresi geçmiş kumpas kullanıldı → neden? Sürenin dolduğu fark edilmedi → neden? Takip Excel'de, hatırlatma yok → neden? Sorumlu izindeydi, vekili tanımlı değildi. Kök neden: takipte hatırlatma ve vekâlet düzeninin olmaması."],
    ['Düzeltici faaliyet', 'Takip kalibrasyon sistemine alındı; 14 gün önceden hatırlatma kuruldu; vekil atandı; etiket kontrolü kontrol planına eklendi. Sorumlu: kalibrasyon sorumlusu, termin: 31.10.2026.'],
    ['Etkinlik doğrulama', "3 ay sonra: süresi geçmiş cihaz sayısı 0; iç denetimde örneklenen 10 cihazın 10'u uygun."],
  ] as const,
  son: 'Belgelendirme kuruluşu kök neden ve düzeltici faaliyet planını belirli bir sürede ister; süreyi kapanış toplantısında teyit edin. Takvimde sonucu girerken bulguları maddesiyle kaydederseniz Performans sayfası kör noktaları gösterir.',
};

export const AS9100_GUN_NOTU = "AS9100'de denetçi bir ürünü veya siparişi süreçler boyunca izler ve her sürecin etkinliğini AS9101'e göre değerlendirir (PEAR formu). Teslimat ve kalite performansınızı veriyle göstermeye hazır olun.";
