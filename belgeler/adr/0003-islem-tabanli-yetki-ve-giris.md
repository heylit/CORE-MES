# ADR 0003 — İşlem tabanlı yetki ve giriş beklemesi

Durum: kabul edildi (06.10.2026). ADR 0002'nin 2., 7. ve 8. maddelerini ve 4. maddesindeki kilit
kuralını değiştirir. 4. maddenin okuma uçları için hükmünü ADR 0007 değiştirir.

## Bağlam

Sayfa + düzey + yetenek modeli üç ayrı soruyu tek ölçüye bağlıyordu: menüde ne görünür, hangi veri
okunur, hangi eylem yapılır. Sayfası olmayan ama veri işlemi olan kullanıcı (kayıt giren ama stok
sayfasını görmeyen operatör) tarif edilemiyordu; kişiye özel satırlar rolü eziyordu; yönetici kodda
ayrı bir daldı. Hesap kilidi ise kullanıcı adını bilen herkese o kişiyi 15 dakika dışarıda bırakma
imkânı veriyordu.

## Karar

1. **Yetki birimi işlemdir:** `<modül>.<eylem>` (`saglik.ayrinti-oku`). Modülün işlemleri
   `paylasilan/islemler/<modül>.ts` dosyasındadır; `paylasilan/islemler.ts` hepsini toplar.
2. **Uç üç türden birini bildirir:** kayıtlı bir veri işlemi, `'acik'` (kimlik istemez) ya da
   `'oturum'` (yalnız giriş ister). Kayıtlı olmayan işlem derlenmez ve tanım anında hata verir.
   Yetki denetimi doğrulamadan önce koşar.
3. **Yetki yalnız rollerle verilir.** Bir kişi birden çok rol alır; yetkisi rollerinin birleşimidir.
   Kişiye özel yetki yoktur. Rol-işlem matrisi veritabanındadır (`rol_islemi`); kayıtlı olmayan
   satır yetki vermez.
4. **Menü ayrı işlemdir.** Her sayfa kendi `sayfa.<ad>` işlemini taşır; menü bunlardan süzülür. Veri
   işlemi menüyü, sayfa işlemi veriyi getirmez; uç `sayfa.*` isteyemez. Alt yol üst sayfanın
   işlemine bağlıdır.
5. **Yönetici kodda özel durum değildir.** Roldeki `yonetici` bayrağı "kayıtlı bütün işlemler"
   demektir; işlemler kimlik yüklenirken verilir, `rol_islemi` satırı gerekmez. Yetki denetimi ve
   istemci yalnız işlem listesine bakar. Kayıtlı her işlemin yöneticide olduğunu bir test ölçer.
6. **Girişi olan kişinin en az bir rolü olur;** kural veritabanında tetikleyiciyle tutulur.
   Kullanımdaki rol silinemez.
7. **Hesap kilidi yoktur; bekleme vardır.** Aynı kullanıcı adı ve aynı IP için art arda n hatalı
   denemeden sonra 2^(n-1) saniye beklenir (1, 2, 4, 8…; en çok 60). Bekleme dolmadan gelen deneme
   parolaya bakılmadan 401 ile reddedilir, kalan süreyi söyler; kaydedilmez ve sayılmaz. Doğru giriş
   o çiftin sayacını sıfırlar. Aynı çiftten aynı anda yalnız bir deneme yürür: kilidi alamayan istek
   veritabanı bağlantısı tutarak beklemez, kullanıcıya ve parolaya bakılmadan, kayıt yazılmadan 429
   `COK_ISTEK` döner. Kilit anahtarı kriptografik özettir (çakışan ad üretilemesin diye).
8. **Deneme kayıtları 30 gün sonra silinir;** silme parolaya bakılan giriş denemesi sırasında koşar. `giris_denemesi`
   veritabanında korunur: güncelleme ve boşaltma reddedilir, silme yalnız 30 günden eski satırda
   kabul edilir. `denetim_kaydi` yalnız ekleme kabul etmeyi sürdürür.
9. **İstemci, sunucu iletisi olan her hatada o iletiyi gösterir;** 500'ün iletisi geneldir. Sunucuya
   ulaşılamadığında ekran kendi iletisini gösterir.

## Sonuçlar

- On bir yerleşik rol vardır (06.10.2026): yönetici, müdür, kalite, planlama ve proje, operatör, insan
  kaynakları, satın alma, muhasebe ve finans, idari işler, CAM, depo. Yalnız yönetici bayraklıdır; müdür
  kişi ve rol yönetimi ile sistem ayrıntısı dışındaki var olan işlemleri alır; depo ek rol olarak verilir.
  Onaylı rol x işlem matrisi göçle yüklenir (`20261006092612_kisiler_roller.sql`).
- Yeni işlem modülün işlem dosyasına eklenir; yönetici dışındaki rollere göçle verilir.
- Yetenek dosyası ve sayfa düzeyi kalktı. Eski dört yeteneğin karşılığı olan işlemler, ait oldukları
  modüller yazılırken kaydedilir.
- İstasyona bağlı kullanıcının kapsamı işlem değil veri süzgecidir; ilgili modülle gelir.
- Sunucu vekil arkasındaysa bütün istekler tek IP görünür ve bekleme herkesi birlikte etkiler;
  yayın kurulumunda gerçek istemci adresi sunucuya iletilmelidir.

## Açık konular

- Depocu ve istasyon sorumlusu rolleri ile okuma işlemlerinin birleştirilmesi: stok ve istasyon
  modülleri yazılırken.
- Alan daraltma (role göre gizlenen alan): ilk daraltılacak alanı olan modül yazılırken.
- Rol ve kişi yönetimi uçları ve ekranı; "en az bir yönetici kalır" kuralı onlarla girer.
