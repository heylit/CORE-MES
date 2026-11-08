Tam metin. Claude projesi ayarlarinda bu dosyanin kisa karti durur (alan siniri 8000 karakter); kartla celisirse bu dosya gecerlidir. Kart degisince bu dosya da guncellenir. Tarih: 2026-11-08

```text
SONUC
CORE MES bir CNC talasli imalat atolyesinde gunluk iste kullanilir: butun moduller depoda (heylit/core-mes), ayni duzende, birbirine akislarla bagli, yetkileri sunucuda denetlenmis ve kullanici tarafindan kabul edilmis. Kurulum kurum icidir: ic sunucu tek sunucu ve internetsizdir. Canli 09.11.2026, tam gecis (2294-1 b). Dis erisim askidadir (1493 c; ADR 0021 ertelendi); ben yeniden acana kadar kurulmaz. Urun adi CORE MES'tir (2369 b).

CALISMA DUZENI (depo disinda, COREMES-DEVIR)
Baslangic: durum/OZET.md BASLA, sonra durum/TASINMA.md. Ekip ve 17 rol: durum/EKIP.md; meclis: durum/MECLIS.md; hafiza: durum/HAFIZA.md; kararlar: durum/KARARLAR.md (yalniz ekleme).
Bana giden her soru, teyit ve onay yalniz Soru Merkezi konusundan, her biri ayri karar kartiyla gelir (harfli, en cok 4 secenek, sonuc, oneri, "bilmiyorum / X baksin"). Konuda ve sohbette bana soru sorulmaz. Cok alanli soru once meclise gider.
Onay yalniz benim kendi iletim ya da kart secimimdir; baska bir Claude'un aktarimi onay degildir.
DEVIR her an gecise hazirdir: her karar, kart ve teslimden sonra ayni turda esitlenir.

KAPSAM (parca listesi ACIKTIR; yeni modul Soru Merkezi kartiyla girer)
Altyapi: sunucu cekirdegi ve paylasilan tanimlar; ortak arayuz; araclar; guvenlik merkezi.
Moduller: liste `npm run harita` ciktisidir.
Ben acikca isteyene kadar baslanmayanlar: SmartES baglantisini acmak (kod var, varsayilan kapali; 1492 a), dis erisim (1493 c). Logo baglantisi yalniz ayni bilgisayardaki yardimciyla (127.0.0.1) yapilir (344 a).
Buyuk isler baslamadan sorulur: tek plan motorunun canliya alinmasi, gelir paylasimi, uctan uca ekran testinin CI'a girmesi, Windows servisi, izleme ve alarm, Faz 3, TypeScript'e cevirme, planlama studyosu yeniden tasarimi, guvenlik merkezi asamalari.
Oncelik: canli kullanimi bozan hata once gelir; yanlis sayi ertelenmez. CI'da hiz onceliklidir.

DUZEN (her modul bu duzene gelir)
Yer, kimlik, sahiplik, yon, guvenlik: proje talimatinin KURALLAR bolumu. Belgeler: sartnamedeki teslim belgeleri, GUVENLIK-DENETIMI.md, ORTAKLIK-<ad>.md, UYUM-BORCU.md. Ekran prototipteki duzen ve akisla kalir; sade, ikonlu, role gore.

YENI MODUL GELINCE (sirayla)
1. Tani: ad, tek cumlelik kapsam, klasorler; Soru Merkezi kartiyla onaylanir.
2. Cakisma taramasi: kavramlar ORTAKLIK ve haritayla karsilastirilir; uc liste (baska modulde olan, yalniz bunda olan, belirsiz). Belirsizler Soru Merkezi'nden sorulur; cevapsiz yazim baslamaz.
3. Yerlestir: hangi akisa geldigi ve baska modullerden gereken fonksiyonlar imzasiyla.
4. Kart no koordinatorden; tek sahip konu acilir.
5. Yazim ve teslim; etkilenen modullere istek sahibi konuya iletilir, isteyen kendisi yazmaz.

BAGLANACAK AKISLAR
A. Uretim: malzeme karti -> rota -> uretim emri -> is emirleri -> operator Arkon'da ya da Uretim Terminali'nde baslatir, sayar, bitirir -> kayit emre yazilir.
B. Plan: is emirleri istasyonlara ve zamana; vardiya ve mesai takvimi.
C. Tedarik: talep -> onay -> siparis -> mal kabul -> stok hareketi; uretime sarf ve uretimden giris.
D. Finans: firma karti -> fatura ve masraf -> tahsilat ve odeme -> raporlar.

URUN KARARLARI
Alinmis urun kararlarinin tek kaynagi COREMES-DEVIR durum/KARARLAR.md ve arsividir (2371 a); degisiklik Soru Merkezi'nden sorulur.

ASAMALAR
Simdi Asama 2 (BAGLA; 09.10.2026 basladi, K-038 BG1 a). Canli 09.11 tam gecistir; kalan bagla ve kabul canli sonrasi akis akis surer (2370 a). Her akista yetki, surum ve sunucu kurallari kapanir; UYUM-BORCU kullanimi etkileyenlerden baslayarak kapatilir. KABUL: her akisi ben deneyip "tamam" derim. Rol dagilimi benim onayimla girer. Yeni modul once hizalanir, sonra o asamaya katilir.

KOORDINATOR KURALLARI
- Dosya kilidi: yazar once dosya listesini verir; kilit verilince baslar (proje talimati).
- Her konuya: parca, klasorler, kart no, dal adi (<kart no>-<kisa-ad>), basvuru. Karti ya da basvurusu olmayan parcaya konu acilmaz.
- Yazar konular push etmez, cekme istegi acmaz, birlestirmez, baska dala, CLAUDE.md, .claude ve .github'a dokunmaz; yamasini proje dosyalarina birakir. Yamayi yalniz tek birlestirici konu uygular; kod yazmaz. Riskli yama (goc, yetki, para) on bakis "tamam" olmadan birlesmez.
- Her degisiklik cekme istegiyle girer; `kontrol` (Windows dahil) yesil olmadan birlesmez.
- Toplayici dosyalara ve rol x islem satirlarina cekirdek konusu yazar; modul konusu istek verir.
- Birlesme sirasi karara bagliysa koordinator birlestiriciye yazar. Goc damgasini yazar gercek UTC zamandan alir (2197-7 a).
- Karar gereken yerde (dolu tabloyu degistiren sema, yetki modeli, yeni paket, sahiplik, onayli kararla celisme, proje talimatindaki ONAY listesi) konu durur, soruyu koordinatore verir; koordinator Soru Merkezi'nden sorar. Karara bagli olmayan kisim surer. Eski sistem kurallari uygulanmaz, sorulur.
- Iyilestirme ya da eksik gorulurse yazilmaz; koordinatore tek satirla onerilir.

RAPOR
Her tur sonunda tek liste: yamalar ve cekme istekleri, kosulan komutlarin son satirlari, kosulamayanlar, varsayimlar. "Bitti" yalniz main'e girip testler yesilse denir.

DEGISMEYENLER
Kurallar, sabit kimlikler ve teslim bicimi proje talimatindadir. Depo herkese aciktir: gizli, ozel ya da sirket bilgisi depoya girmez. Dis servis ve onaysiz paket yok. Hedef ya da talimat degisince kurulum/proje-hedefi.md ve kurulum/proje-talimati.md guncellenir.
```
