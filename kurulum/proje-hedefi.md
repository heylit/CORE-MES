Tam metin. Claude projesi ayarlarinda bu dosyanin kisa karti durur (alan siniri 8000 karakter); kartla celisirse bu dosya gecerlidir. Kart degisince bu dosya da guncellenir. Tarih: 2026-11-08

```text
SONUC
CORE MES bir CNC talasli imalat atolyesinde gunluk iste kullanilir: butun moduller depoda (heylit/core-mes), ayni duzende, birbirine akislarla bagli, yetkileri sunucuda denetlenmis ve kullanici tarafindan kabul edilmis. Kurulum kurum icidir: ic sunucu tek sunucu ve internetsizdir. Canli 09.11.2026, tam gecis (2294-1 b). Dis erisim askidadir (1493 c; ADR 0021 ertelendi); ben yeniden acana kadar kurulmaz. Urun adi CORE MES'tir (2369 b).

KAPSAM (parca listesi ACIKTIR; yeni modul Soru Merkezi kartiyla girer)
Altyapi: sunucu cekirdegi ve paylasilan tanimlar; ortak arayuz; araclar; guvenlik merkezi.
Moduller: liste `npm run harita` ciktisidir.
Ben acikca isteyene kadar baslanmayanlar: SmartES baglantisini acmak (kod var, varsayilan kapali; 1492 a), dis erisim (1493 c). Logo baglantisi yalniz ayni bilgisayardaki yardimciyla (127.0.0.1) yapilir (344 a).
Buyuk is baslamadan sorulur: sarmalayicili gercek Windows servisi (2385 a).

ONCELIK
Canli kullanimi bozan hata once gelir; yanlis sayi ertelenmez. CI'da hiz onceliklidir (2388 a).

DUZEN (her modul bu duzene gelir)
Yer, kimlik, sahiplik, yon, guvenlik: proje talimatinin KURALLAR bolumu. Belgeler: sartnamedeki teslim belgeleri, GUVENLIK-DENETIMI.md, ORTAKLIK-<ad>.md, UYUM-BORCU.md. Ekran prototipteki duzen ve akisla kalir; sade, ikonlu, role gore.

BAGLANACAK AKISLAR
A. Uretim: malzeme karti -> rota -> uretim emri -> is emirleri -> operator Arkon'da ya da Uretim Terminali'nde baslatir, sayar, bitirir -> kayit emre yazilir.
B. Plan: is emirleri istasyonlara ve zamana; vardiya ve mesai takvimi.
C. Tedarik: talep -> onay -> siparis -> mal kabul -> stok hareketi; uretime sarf ve uretimden giris.
D. Finans: firma karti -> fatura ve masraf -> tahsilat ve odeme -> raporlar.

ASAMALAR
Simdi Asama 2 (BAGLA; 09.10.2026 basladi, K-038 BG1 a). Canli 09.11 tam gecistir; kalan bagla ve kabul canli sonrasi akis akis surer (2370 a). Her akista yetki, surum ve sunucu kurallari kapanir; UYUM-BORCU kullanimi etkileyenlerden baslayarak kapatilir. KABUL: Test rolu her akisi test eder ve kabul kaydini yazar; para, yetki ya da stok degistiren akislari (Finans, Tedarik, rol dagilimi) ben kendim deneyip 'tamam' derim (2377 a). Rol dagilimi benim onayimla girer. Yeni modul once hizalanir, sonra o asamaya katilir.
GUNCELLEME (2384 a): main'e giren is canliya guncelleme penceresiyle cikar. Paketi Isletim hazirlar; belirli gun ve saatte cikar. Her pencere icin Soru Merkezi'ne tek kart gelir: icerik ozeti, goc var mi, geri donus yolu. Canliyi bozan hatanin duzeltmesi pencere disinda, yine tek kartla cikar.

SUREC
Surec: kurulum/proje-talimati.md, DEVIR EKIP ve SISTEM (2386 a). Bana giden her soru Soru Merkezi'nden karar kartiyla gelir; yalniz geri almasi pahali kararlar sorulur (CLAUDE.md TEMEL KURAL 2; 2379 a). Bana yalniz sonuc ve ikonlu Bekleyen listesi gelir (2383 a).
```
