# Temel moduller 3. tur: yazim listesi (kart #259, dal 259-temel-moduller-3)

Okunan commit: `7c20cef` (origin/main; #279 `00aa0cf` ile birlesmis). Goc sirasi (harita): 37 goc, ilki `20261005120000_kisiler.sql`, sonu `20261008050300_kisiler_arkon_yansima_okuma.sql`.
"yaz" gelmeden dal acilmaz, commit atilmaz. Klasorler: yalniz kisiler (`sunucu/moduller/kisiler`, `istemci/src/moduller/kisiler`, `paylasilan/sozlesme/kisiler.ts`) ve yeni goc.

## Kararlar
- K3 a: kisi kaydina surum sutunu ve surum denetimi (bu turda).
- Rapor madde 2: `POST /kisiler` tekrar korumasi (bu turda).
- Ek karar: kisiler/disari.ts'ten yetki sormayan yazma komutlari, uretim kodunda cagiran yoksa cikarilir; K3 ile ayni cekme isteginde.

## 1. Surum (K3)
- Goc (dolu tabloyu degistirir, K3 ile onayli): `<damga>_kisiler_kisi_surum.sql`: `ALTER TABLE kisi ADD COLUMN surum integer NOT NULL DEFAULT 1`. Var olan satirlar 1 ile baslar. Satir silinmez, veri degismez. Rol x islem satiri YOK.
- Kalip (`.claude/skills/uc-ekle`, `goc-yaz`): komut govdesinde `beklenenSurum`; servis `surumluGuncelle` (`#cekirdek/surum.ts`); eski surum 409 `eski-surum`; kayit yoksa 404.
- Beklenen surumu tasiyan komutlar (kisi satirini ya da kisinin rollerini degistiren 7 uc): `duzenle`, `pasife-al`, `aktif-yap`, `hesap-ac`, `parola-degistir`, `rol-ata`, `rol-al`.
- Surumu artiran ama beklenen surum sormayan yazmalar: kendi parolasini degistirme (oturum modulu `kendiParolasiniDegistir` ile cagirir; imza degismez), `yoneticiOlustur` (arac).
- Cevap ve liste `surum` verir (`KisiOzeti`'ne alan eklenir; istasyonlar ekrani yalniz okur, ek alan onu bozmaz).
- Istemci (Personel): komutlar satirdaki surumu gonderir; 409 `eski-surum`'da liste yenilenir ve ileti gosterilir.
- Testler: her uc icin izinli (guncel surum 200, surum +1) ve reddeden (eski surum 409, durum degismez); eszamanli iki duzenlemeden biri 409.

## 2. POST /kisiler tekrar korumasi
- `uc({ ..., tekrarKorumali: true })`; istemci `tekrarKorumaliGonder` ile gonderir.
- kisiler testleri `uygulamaKur`'a `tekrar: tekrarDeposu` (`istek-kimligi/disari.ts`, yalniz testte) verir.
- Testler: ayni istek kimligiyle ikinci istek ikinci kisi acmaz, ayni cevabi doner; farkli kimlik ikinci kisiyi acar.

## 3. disari.ts daraltma (ek karar)
Uretim kodunda kisiler disinda cagiran yok (DOGRULANDI, grep). Testlerde durum:
- `hesapAc`, `kisiEkle`, `kisiPasifeAl`, `kisiAktifYap`: baska modulde hic ithal edilmiyor. disari.ts'ten cikarilir.
- `rolAta`, `rolAl`: 8 modulun testleri kurulum icin ithal ediyor: arkon, ayarlar, durus-nedenleri, istasyonlar, kalibrasyon, malzemeler, satin-alma, uretim-emirleri. Sinir araci baska modulun testine yalniz disari.ts ithalini izin veriyor (`araclar/sinir-denetimi.ts` 98-106). Cikarirsak bu testler kirilir. uretim-emirleri dosyalarina hicbir konu yazamaz, digerleri baska konularin klasorleri.
  - Karar kartinda soruldu. Oneri: ikisi kalsin, servis eylemi yapanin `kisiler.rol-yonet` islemini sunucuda denetlesin (yetki soran hale gelir; testler yonetici ile cagirdigi icin degismez).
- Kalanlar degismez: `yoneticiOlustur` (arac ve testler), `kullaniciYukle`, `girisDogrula`, `kendiParolasiniDegistir` (oturum), okuma islevleri.

## Teslim
FARK.md, UYUM-BORCU.md (3. tur maddeleri kapanir), GUVENLIK-DENETIMI.md (surum ve tekrar satirlari), KURAL-TEST.md (yeni kurallar). Rol x islem satiri ve tablo silen goc yok.
Kosulacak: tip, lint, sinir (`--modul kisiler`), `test:modul -- kisiler`, sinir ve test icin istemci; oturum testleri (surum artisi oturumdan da gecer).
