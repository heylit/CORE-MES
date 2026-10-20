# Zamanlanmis is (kart #208) - yalniz liste

Salt okuma. Kod yok, depoda degisiklik yok. Okunan: `origin/main` dd7fd6c (docs(ortak): FARK and a note on Esc in full screen (#172)).
Kart #208 bugun BEKLEMEDE: "Simdi KOD YAZILMAZ" (#205 karar 6); #213 yorumu kapsami Logo + SMARTES'e genisletti.

## 1. Bugun bekleyen ihtiyaclar

| # | Ihtiyac | Bugun nasil | Kanit | Aciliyet |
|---|---|---|---|---|
| I1 | Arkon yansima yineleyici: `bekliyor` kalan `arkon_tmi_yansima` satirlarini TMI emrine yeniden yazmak | Yalniz yeni Arkon kaydi gelince denenir (o istegin emirleri + en eski 10 bekleyen emir). Hic kayit gelmezse satir bekler; "TMI'ye yazilamayanlar" ekraninda gecikmeli gorunur. | DOGRULANDI: `sunucu/moduller/arkon/UYUM-BORCU.md` sinir (f) "yeniden deneme yalniz kayit istegi geldiginde calisir ... Kapanis: cekirdekte zamanlayici ... gelince yineleyici eklenir"; `CEKIRDEK-ISTEKLERI.md` madde 5; `servis.ts` `bekleyenleriSupur`, `SUPURME_EMIR_SAYISI = 10` | Simdi (tek somut kullanici) |
| I2 | Logo giden kutusu isçisi: siparis, malzeme karti, firma karti, sarf ve uretimden giris fisini kopru servisine sirayla, bekleyerek gondermek | Yok. Yalniz alanlar hazirlanir. | DOGRULANDI: kart #208 govdesi; #205 kararlari 1-6 ("baglanti ... kabul edildikten SONRA yazilir") | Ileride; Logo baglantisi acilinca |
| I3 | Logo irsaliye okuma (mal kabulde esleme) | Yok | DOGRULANDI: #205 karar 4; #208 yorumu | Ileride |
| I4 | SMARTES gerceklesen okuma (sayim, durus), tarih araligiyla, kaldigi yer saklanarak; is emrinin SMARTES'e gonderimi giden kutusundan | Yok | DOGRULANDI: #213 kararlari 2-6 ve #208 yorumu (07.10.2026) | Ileride |

Zamanlanmis is GEREKMEYENLER (bugunku cozum yeterli):
- Istek kimligi ve giris denemesi temizligi: her komutta/denemede koşar. DOGRULANDI: `istek-kimligi/servis.ts` "Zamanlanmis is yok; temizlik yeni anahtar yazan her komutta koşar", `oturum/servis.ts` ayni not.
- Kalibrasyon vadesi: okuma aninda hesaplanir (`kalibrasyon/kurallar.ts` vade/kalanGun). Bildirim istenirse ayri karar.
- Arkon sureye bagli kurallar (cagri yukseltme, firin suresi): #92 soru 2'de "turetilebilen okuma aninda" secildi. VARSAYIM: bu kalip altinda ileride sunucu tarafina tasinabilir, simdilik kapsam disi.
- Yedekleme: depoda yedek isi yok (BILMIYORUM: yedegin isletim sisteminde mi yapildigi). Veritabani yedegi uygulama icinden degil, isletim sistemi tarafinda kalmali (VARSAYIM).

## 2. Engel: onayli kararla celiski

- #70 karar 5: "toplayici ve arka plan isi yazilmaz" (makine verisi baglaminda). #92 soru 2: sureli kurallar icin arka plan isi yerine okuma aninda hesap secildi.
- #208 govdesi bu kararin Logo baglantisi icin ADR ile degistirilmesini kapsar. Bu yuzden yazimdan once Z1 sorulur.

## 3. En kucuk tasarim (oneri)

Yeni paket yok (cron kutuphanesi yok); yalniz Node `setTimeout` ve PostgreSQL danisma kilidi.

1. Cekirdek kalibi `sunucu/cekirdek/zamanlayici.ts`:
   - `isTanimi({ ad, aralikMs, calis(db) })`. Modul isini kendi `isler.ts` dosyasinda verir; cekirdek `uclar.ts` gibi kesfeder (`modulBasinaUclar` kalibi, `uygulama.ts`).
   - Her is kendi dongusunde: bitince `setTimeout` ile bir sonraki kurulur (`setInterval` degil: ust uste binme yok).
   - Her calisma ayri `vt.tx` icinde, basta `pg_try_advisory_xact_lock(hashtext('is-<ad>'))`; kilit yoksa o tur atlanir (ikinci surec ya da test ayni veritabanina baglansa da tek calisir). Kalip depoda var: `arkon/sorgular.ts` emir kilidi, `oturum/sorgular.ts`.
   - Hata sureci dusurmez: `app.log`'a yazilir, sonraki tur denenir. Calisma suresi siniri var (cekirdek `db.ts` sure siniri).
   - Kapanis: `ana.ts` `kapat` icinde `app.close()`'dan once zamanlayici durdurulur ve suren tur beklenir (sinirli sure).
   - Testte kapali; test isi `isiBirKezCalistir(ad, db)` ile dogrudan cagirir, saat beklenmez.
   - Durum bellekte tutulur (son calisma, son hata, sure); tablo yok. Gorunurluk Z4.
2. Arkon baglanmasi (I1): `arkon/isler.ts` -> `bekleyenleriSupur` (bugunku fonksiyon; kullaniciya ihtiyac duymaz, komutu kayit anindaki kisi yapar). Aralik 15 sn (VARSAYIM: geri cekilme zaten 5 sn x 2^deneme, en cok 1 saat; satir kendi araligi dolmadan secilmez). Kayit isteginde suren supurme kalir (VARSAYIM: gecikmeyi kisaltir, zarari yok).
3. Giden kutusu (I2-I4, yalniz ihtiyac olarak; Logo kodu yazilmaz): baglanti modulunun kendi tablosu (satir basina durum, deneme, sonraki deneme, tekrar anahtari), is `FOR UPDATE SKIP LOCKED` ile satir alir, sirayla gonderir, sonucu satira yazar. Okumalar (irsaliye, SMARTES) "kaldigi yer" satiriyla kucuk araliklarla.

Tek sunucuda calisma: is, web sureciyle ayni Node surecinde koşar; ayri servis, isletim sistemi gorev zamanlayicisi ya da kurulum adimi gerekmez. Sunucu kapaliyken is de durur; acilinca bekleyenler tablodan surer (Arkon icin DOGRULANDI: UYUM-BORCU "Sunucu yeniden baslasa bekleyenler tablodan surer"). Havuz 10 baglanti (`db.ts` `HAVUZ_BOYUTU`); is ayni anda tek baglanti kullanir (VARSAYIM: yeterli; olculmedi).

Dogrulanmadi: Windows'ta servis olarak calisan Node surecinde `setTimeout` donguleri ve SIGTERM kapanisi bu kodla denenmedi (devir.md satir 34 Windows'ta yetim surec uyarisi tasiyor).

## 4. Sorulacak kararlar

Z1. Onayli kararin degismesi
- Soru: Cekirdekte sunucu icinde calisan zamanlanmis is kalibina izin verilsin mi?
- Neden: #70 karar 5 ve #92 "arka plan isi yazilmaz" diyor; Arkon yineleyici ve Logo/SMARTES bu kalip olmadan yazilamaz.
- Secenekler: (a) evet, yalniz cekirdek kalibi, ADR 0007 ile; makine verisi toplayicisi yasagi (#213 karar 1) aynen kalir. (b) hayir; Arkon istekle tetiklenmeye devam eder, Logo gelince yeniden sorulur.
- Oneri: (a).

Z2. Isin calistigi yer
- Soru: Zamanlanmis is web sureciyle ayni surecte mi, ayri bir surecte mi calissin?
- Neden: kurulum ve isletme yukunu belirler; sonradan degistirmek kurulum belgesini ve sunucu ayarini degistirir.
- Secenekler: (a) ayni surec (ek kurulum yok). (b) ayri isçi sureci (`npm run isci`), ikinci Windows servisi. (c) isletim sistemi gorev zamanlayicisi komutu calistirir.
- Oneri: (a); yuk buyurse (b)'ye gecis kalip degismeden olur.

Z3. Kartin bolunmesi ve zamanlama
- Soru: #208'in yalniz cekirdek kalibi ve Arkon yineleyici kismi simdi yazilsin mi, giden kutusu Logo ile beklesin mi?
- Neden: kart bugun tumuyle BEKLEMEDE (#205 karar 6); Arkon borcu (f) bu yuzden acik kaliyor.
- Secenekler: (a) bol: kalip + Arkon simdi (yeni kart), giden kutusu #208'de beklemede. (b) hepsi Logo ile birlikte.
- Oneri: (a).

Z4. Arka plan isinin kimligi
- Soru: Arka plan isinin yazdigi kayitta kisi kim olsun?
- Neden: yetki modeli; "sistem" kisisi tum yetki denetimlerine yeni bir istisna acar.
- Secenekler: (a) sistem kullanicisi yok; is, kaydi baslatan kisinin adina ve onun guncel yetkisiyle yazar (Arkon bugun boyle). (b) `kisiler`'de "sistem" kisisi ve ona ozel islemler.
- Oneri: (a). Logo giden kutusunda kisi = gonderimi isteyen.

Z5. Is durumunun gorunurlugu
- Soru: Islerin son calisma ve hata durumu kime, nerede gorunsun?
- Neden: yeni islem ve rol satiri demek (yetki modeli).
- Secenekler: (a) yalniz sunucu gunlugu. (b) var olan `/saglik/ayrinti` ucunda (`saglik.ayrinti-oku` islemi olana; DOGRULANDI `saglik/uclar.ts`), yeni islem yok. (c) yeni ekran ve yeni islem (ornek `cekirdek.is-oku`), mudure de.
- Oneri: (b); Logo gelince giden kutusu kendi ekranini getirir.

## 5. Varsayimlar (geri alma maliyetiyle)
- Tablo yok, durum bellekte: ucuz (sonra tablo eklenir, dolu tabloya dokunmaz).
- Arkon araligi 15 sn: ucuz (sabit).
- Danisma kilidiyle tek calisma: ucuz.
- Yeni ortam degiskeni gerekirse `TMIV2_` onekli olur (ornek kapatma anahtari): ucuz.
