# Zamanlanmis is: yazim listesi (kart #208 kararlari Z1-Z5)

Salt okuma; depoya yazilmadi. Okunan: `origin/main` 1a7892e (Merge pull request #289). ADR taslagi: `zamanlanmis-is-adr-taslagi.md` (ayni klasor).
Kullanici kararlari: Z1 a, Z2 a, Z3 a, Z4 a (not: kisi pasif ya da yetkisiz ise yineleme reddedilir, satir "hatali", neden listede), Z5 b. Giden kutusu Logo ile bekler.
Yazim "yaz" onayindan sonra baslar.

## Kart ve dal (kullanicidan istenir)
- Z3 a geregi #208 bolunur: kalip + Arkon yineleyici icin YENI KART gerekir; numarasi verilmedi. Dal adlari: `<kart>-zamanlayici` (cekirdek), `<kart>-arkon-yineleyici` (Arkon).
- #208 BEKLEMEDE kalir ve yalniz giden kutusunu tasir. Karta yazilacak yorum: "Z1-Z5 kararlari (08.10.2026) uygulandi; kalip ve Arkon yineleyici <yeni kart>'ta. Bu kart yalniz giden kutusu, Logo irsaliye ve SMARTES okumasi icin, Logo baglantisiyla."
- Sira: A (cekirdek) birlesir, sonra B (Arkon) guncel ana daldan baslar. B, A'nin `isTanimi` imzasina baglidir.

## A. Cekirdek (sunucu cekirdegi + paylasilan seridi, `cekirdek-yazari`, tam yol)

| No | Dosya | Degisiklik |
|---|---|---|
| A1 | `belgeler/adr/0008-zamanlanmis-is.md` (yeni) | Taslaktaki ADR; durum "kabul". |
| A2 | `sunucu/cekirdek/zamanlayici.ts` (yeni) | `isTanimi({ ad, aralikMs, calis(db) })` (ad tekil, aralik en az 1 sn, tanim hatasi aninda); `modulIsleriniKesfet(klasor)` (`moduller/*/isler.ts`, `modulBasinaUclar` kalibi, dizi vermeyen dosya hata); `zamanlayiciKur({ vt, gunluk, isler })` -> `{ baslat(), durdur(beklemeMs) }`; her tur `vt.tx` + `pg_try_advisory_xact_lock(hashtext('is-'+ad))`, kilit yoksa "atlandi"; tur bitince sonraki `setTimeout`; hata gunluge ve duruma, surec dusmez; `isDurumlari()` (bellekte: ad, sonBaslama, sonBitis, sonSonuc tamam/hata/atlandi, sonHata ozeti `vtHataIzi` ile); `isiBirKezCalistir(vt, tanim)` testler icin. |
| A3 | `sunucu/cekirdek/zamanlayici.test.ts` (yeni) | Asagidaki A testleri. |
| A4 | `sunucu/ana.ts` | Kesif `uygulamaKur`dan sonra; `baslat()` `app.listen`den sonra; `kapat` icinde `app.close()`dan once `durdur(10 sn)`. Kalip hatasi (bozuk `isler.ts`) sunucuyu acilista durdurur, uc kesfindeki gibi. |
| A5 | `paylasilan/sozlesme/saglik.ts` | `ayrintiCevabi`na `isler: { ad, sonBaslama, sonBitis, sonSonuc, sonHata }[]` (zamanlar ISO metin ya da null; veri yoksa null). |
| A6 | `sunucu/moduller/saglik/servis.ts`, `uclar.ts`, `saglik.test.ts` | `ayrintiTopla` `isDurumlari()`ni ekler; yetki degismez (`saglik.ayrinti-oku`). |
| A7 | `istemci/src/moduller/sistem/SistemDurumu.tsx`, `SistemDurumu.test.tsx` (istemci seridi, ayri commit) | Sistem durumu ekranina "Zamanlanmis isler" tablosu (ad, son calisma, sonuc, hata). Bos listede "Is yok". |
| A8 | `kurulum/devir.md` | Tek satir: zamanlanmis isler sunucu surecinde koşar, ayri servis yok; durum Sistem durumunda. |

A testleri (her kural icin izinli ve reddedilen):
- Tanim: gecerli tanim kabul / yinelenen ad, 1 sn alti aralik, bos ad tanimda hata.
- Kesif: `isler.ts` olan modul bulunur, olmayan atlanir / dizi vermeyen `isler.ts` hata.
- Tek calisma: kilit bossa tur koşar / ayni ad icin kilit baska islemde tutulurken tur "atlandi" olur ve `calis` cagrilmaz.
- Hata: `calis` hata atinca durum "hata" ve ozet yazilir, sonraki tur yine koşar / ozet ham ileti ve deger tasimaz.
- Ust uste binme: yavas tur bitmeden ikinci tur baslamaz.
- Islem: turun yazdigi satir tur basarili ise kalir / tur hata atinca geri alinir.
- Kapanis: `durdur` sonrasi yeni tur kurulmaz, suren tur beklenir / bekleme suresi dolarsa `durdur` yine doner.
- Saglik: `saglik.ayrinti-oku` olan kullanici `isler` listesini gorur / islemsiz kullanici 403 (bugunku test kalir).

Komutlar: `npm run tip`, `lint`, `sinir -- --modul saglik`, `test:modul -- saglik`, cekirdek testi; tam `kontrol` cekme isteginde.
Audit: tam yol (cekirdek), `denetci` + dar ikinci tur.

## B. Arkon (Arkon konusu, `modul-yazari`, A birlestikten sonra)

| No | Dosya | Degisiklik |
|---|---|---|
| B1 | `sunucu/moduller/arkon/isler.ts` (yeni) | `isTanimi({ ad: 'arkon-yansima-yineleyici', aralikMs: 15_000, calis: servis.bekleyenleriYinele })`. |
| B2 | `sunucu/moduller/arkon/servis.ts` | `bekleyenleriYinele(db)` disa acilir: bugunku `bekleyenleriSupur(db, bos kume)`. Kayit istegindeki supurme kalir. Z4: `bekleyeniIsle` bir `ilkDeneme` bilgisi alir (yalniz satiri yazan istegin kendi denemesi true). Ilk deneme degilse kisi yok (pasif, kullanici degil) ya da TMI `YETKI_YOK` (kapsam disi dahil) -> satir "hatali", neden sabit metin. Ilk denemede bugunku "reddedildi" kalir. Bastaki aciklama yorumu yeni davranisa gore guncellenir. |
| B3 | `sunucu/moduller/arkon/kurallar.ts` | Saf kural: `yetkiRetSonucu(ilkDeneme)` -> 'reddedildi' / 'hatali'; neden sabiti `YETKI_KAYBI` ("Yetki yok: kaydi baslatan kisi pasif ya da yetkisi kaldirildi."). |
| B4 | `sunucu/moduller/arkon/sorgular.ts` | `yansimaSonuclandir` sonuc tipine 'hatali' eklenir (sema degismez; 'hatali' bugun de gecerli deger). |
| B5 | `sunucu/moduller/arkon/yansima.test.ts`, `kurallar.test.ts` | Asagidaki B testleri; var olan "yeniden denemede ... pasifse reddedildi" testi "hatali" bekleyecek sekilde degisir (davranis degisikligi, FARK'a). |
| B6 | `UYUM-BORCU.md` | Sinir (f) KAPANDI (yineleyici is turu); "Arka plan yineleyici yok" satiri kapanir; Z4 notu (koordinatore gore Arkon konusu zaten yaziyor; tekrar yazilmaz, KAPANDI isareti eklenir). |
| B7 | `CEKIRDEK-ISTEKLERI.md` | Madde 5 KAPANDI (<yeni kart>). |
| B8 | `FARK.md`, `KURAL-TEST.md`, `GUVENLIK-DENETIMI.md` | FARK: yineleyici ve Z4 davranisi; KURAL-TEST: iki yeni satir; GUVENLIK-DENETIMI: "is: arkon-yansima-yineleyici; uc degil; yazim kaydi baslatan kisinin guncel yetkisiyle" satiri. |

B testleri (izinli / reddedilen):
- Yineleyici: bekleyen satir hic yeni kayit gelmeden `isiBirKezCalistir` ile TMI'ye yazilir / araligi dolmamis satira dokunulmaz.
- Kilit: kilidi baska islemde tutulan emir atlanir, satir bekler / kilit birakilinca sonraki turda yazilir.
- Sira: emrin ondeki bekleyeni sonuclanmadan ardindaki yazilmaz (bugunku kural, is turunda da).
- Z4 pasif: kisi pasife alinip tur koşunca satir "hatali", neden `YETKI_KAYBI`, "TMI'ye yazilamayanlar" listesinde gorunur / aktif kiside "yazildi".
- Z4 yetki: `terminal.uret` kaldirilinca turda "hatali" / ilk istekte yetkisiz kiside "reddedildi" kalir (bugunku test).
- Yeniden dene: "hatali" satir yetki geri verilince `yeniden-dene` ile yazilir / yetki yokken yine "hatali".

Komutlar: `npm run tip`, `lint`, `sinir -- --modul arkon`, `test:modul -- arkon` (Linux'ta 0 test sorunu varsa `CEKIRDEK-ISTEKLERI.md` madde 4'teki dogrudan komut).
Audit: tam yol (uretim kaydi), `denetci` + dar ikinci tur.

## Varsayimlar (geri alma maliyetiyle)
- V1 ADR numarasi 0008: ucuz (dosya adi).
- V2 Arkon araligi 15 sn, tur basina en cok 10 emir (bugunku `SUPURME_EMIR_SAYISI`): ucuz (sabit).
- V3 Denetim: arka plan isinin TMI'ye yazdigi komut icin `denetim_kaydi` satiri yazilmaz; iz `arkon_tmi_yansima`'dadir (kisi, sonuc, neden, deneme, son deneme). Bugun de istek icindeki supurme, komutu istegi yapanin uc denetimi altinda kaydediyor (kayit sahibi degil). Itiraz edilirse: zamanlayici `denetle`'yi is turuna da verir; tablo degismez, orta maliyet.
- V4 Z4 "hatali" yalniz yeniden denemede: satiri yazan istegin kendi denemesindeki yetki reddi bugunku gibi "reddedildi" kalir (o an kisi yetkisizdir, "kaybetmis" degildir). Ucuz (tek kural).
- V5 Yeni ortam degiskeni yok: zamanlayiciyi yalniz `ana.ts` kurar, testler kurmaz. Ucuz.
- V6 `harita` ve `sinir` araclarina is sutunu eklenmez (araclara yalniz isi durduran hatada dokunulur). Ucuz.
- V7 `yapi-kaliplari` skill'i `isler.ts` dosyasini bilmez; `.claude` sef isi oldugu icin istek olarak birakilir.

## Dogrulanmadi
- Windows servisinde `setTimeout` dongusu ve SIGTERM kapanisi (canli kurulum #44'te denenecek).
- 10 baglantilik havuzda is turunun istek trafigine etkisi olculmedi (tur tek baglanti kullanir).
