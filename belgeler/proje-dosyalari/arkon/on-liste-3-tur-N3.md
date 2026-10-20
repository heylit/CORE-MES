# Arkon 3. tur, N3: oturum uçları ve /arkon/kisiler (ön liste, kod yazılmadı)

Kart #199 (borç: "Uçlar `yetki: 'oturum'`", "`/arkon/kisiler` `kisiler.oku` aramıyor"). Yazım yalnız onaydan sonra.
uretim-emirleri'ne yazım yok. Şema, göç ve paket yok (seçilen seçeneğe göre yalnız çekirdek isteği çıkar).

## Bugün (DOĞRULANDI: `uclar.ts`, `servis.ts rolGerekli`, `cekirdek/uc.ts:20-38, 197-207`)
- Arkon'un 13 ucu `yetki: 'oturum'`: 7 okuma (ben, kisiler, belgeler x2, kayitlar, dosyalar, iletiler) ve 6 yazma (belge yaz, sil, kayıt ekle, eksik dosya, dosya parçası, ileti gönder).
  Arkon rolü her uçta serviste `rolGerekli` ile çözülür; rolsüz kişi 403 alır (arkon.test.ts "her uç" testi 13 ucu tek tek ölçüyor).
  İki yansıma ucu zaten işlemle tanımlı (`arkon.yansima-oku`, `arkon.yansima-yeniden`).
- Çekirdek `uc({ yetki })` tek işlem ya da `{ biri: [...] }` alır; işlem listesi YALNIZ okuma ucunda geçerli (`uc.ts:198` "İşlem listesi yalnız okuma ucunda verilebilir").
  Arkon'a girmek 7 rol işleminden herhangi birini istediği için yazma uçları bugün tek işlemle tanımlanamaz.
- `/arkon/kisiler`: Arkon rolü olan HER kişiye (operatör dahil) Arkon rolü olan bütün aktif kişileri ad, rol ve iş merkezi kodlarıyla döner. `kisiler.oku` aranmaz.
  Kişi başına ayrı `kullaniciYukle` sorgusu var (kişi sayısı kadar sorgu).
- Arkon ekranında listeyi kullanan iki yer var (DOĞRULANDI: `arkon/web/src/app/giris-ayarlar-spc.ts:18`, `:392`):
  Arkon'un kendi giriş ve kullanıcı değiştirme ekranı (`LoginApp`) ve Ayarlar > Kişiler düzenleyicisi.
  VARSAYIM: TMI içinde ikisi de iş görmüyor; giriş köprüde 403 ("Giriş TMI'den yapılır"), kişi yazımı 403. Tarayıcıda denenmedi.

## Soru 1: uçların yetkisi uç tanımına taşınsın mı?
Neden: yetki modeli değişikliğidir (CLAUDE.md "sorulur"). Bugün servis denetimi çalışıyor ve testli; fark görünürlüktedir (uç listesinde ve denetim aracında yetki "oturum" görünüyor).
- a. Önce çekirdek isteği: `{ biri: [...] }` yazma uçlarında da kabul edilsin. Sonra 13 uç tek seferde `biri: <7 Arkon rol işlemi>` olur; servis denetimi rol çözümü için kalır. **Öneri.**
- b. Yalnız 7 okuma ucu şimdi `biri` ile taşınır; 6 yazma ucu çekirdek isteğine kadar `oturum` kalır (iki aşamalı, ara durumda karışık).
- c. Yeni tek işlem `arkon.kullan` (Arkon'a giriş), 7 rolün hepsine göçle verilir; 13 uç onu ister. Rol göçü çekirdekte, dolu rol tablosuna yazar.
- d. Olduğu gibi kalsın; borçta "kalıcı karar" diye yazılır.

## Soru 2: /arkon/kisiler kimin neyi görmesine açık olsun?
Neden: kişi adı, rolü ve iş merkezi kişisel veridir; bugün operatör de bütün listeyi alıyor.
- a. Bütün liste yalnız `kisiler.oku` olana; ötekine yalnız kendi kaydı döner. **Öneri** (TMI'nin kendi kişi listesi kuralıyla aynı).
- b. Kapsamla süzülsün: iş merkezi kısıtlı kişi yalnız kendi iş merkezlerindeki kişileri görür; kısıtsız kişi hepsini.
- c. Olduğu gibi kalsın.

## Sorulmadan yapılacak teknik iş (seçimden bağımsız)
- Kişi başına sorgu kalkar: rol işlemleri tek sorguyla okunur. `kisiler/disari.ts`'te toplu okuma işlevi yoksa BASKA-MODUL-ISTEKLERI'ne yazılır, bugünkü döngü kalır.

## Testler (seçilen seçeneğe göre)
- Soru 1 a/b/c: "her uç" testi aynen geçer (rolsüz 403, oturumsuz 401, rollü 200); ek olarak uç kaydında yetkinin `oturum` olmadığı ölçülür.
- Soru 2 a: `kisiler.oku` olan bütün listeyi alır; operatör yalnız kendini alır; rolsüz 403.

## Bu konu şunları varsayacak
1. Arkon'un kendi giriş ve kişi değiştirme ekranı TMI içinde kullanılmıyor (köprü 403 veriyor).
2. Rol çözümü (hangi Arkon rolü) serviste kalır; uç tanımı yalnız "Arkon'a girebilir mi"yi söyler.
