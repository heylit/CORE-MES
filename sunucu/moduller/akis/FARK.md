# FARK: akis (Akış Süresi) — dal `1338-akis-suresi`, taban `main`

Yeni modül (kart #1338). Depoda önceki sürümü yoktur; eklenen her şey yenidir, değişen ya da silinen yok.
Öneri sayfası: https://claude.ai/artifact/MKTMzQtQHhgrbfPQVB6Sav

## Eklenen
- `sunucu/moduller/akis/`: `kurallar.ts` (AKS-1..AKS-7, saf), `servis.ts`, `sorgular.ts` (yalnız veritabanı saati), `uclar.ts` (iki GET), testler, belgeler.
- `paylasilan/sozlesme/akis.ts`, `paylasilan/sayfalar/akis.ts`; toplayıcıda yalnız akis satırları (`paylasilan/sayfalar.ts`, ayrı commit).
- `istemci/src/moduller/akis/`: emir listesi ve emir yolculuğu ekranı, test.

## Kararlar (kullanıcı, 14.10.2026)
- Yer: ayrı sayfa (kart "Ayrı sayfa"); yalnız okur. Başlama: 1. adım (defter ve emir yolculuğu), kart "Başlasın".
- Hammaddenin geliş zamanı partiden geriye okunur (mal kabul zamanı). Rotada ilk adım her zaman sarf düşmez, yalnız statü
  değişebilir: HM statüsünden çevirme de kullanım sayılır (AKS-5).

## Öneriyle ilerleyenler (itiraz edilirse değişir)
- Modülün tablosu yok: hesap her istekte kaynak kayıtlardan yapılır. Öneri sayfasındaki "emir kapanınca kesinleşen özet" sonraki adımdır.
- Süreler takvim saatiyle; çalışma saati (Vardiya takvimi) sonraki adım.
- Sevk anı: sevkiyat işinin tamamlandığı an ya da bekleme listesinden kaldırıldığı an (AKS-7).
