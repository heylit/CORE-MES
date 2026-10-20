# Rol matrisi taslagi (N5, salt okuma rapor)

Tarih: 2026-10-08. Depo: heylit/TMICOREV2, main `7c20cef`. Karar kullanicinindir; bu dosya hicbir seyi degistirmez.

## Kaynak ve yontem

- DOGRULANDI: `sunucu/gocler/*.sql` (37 dosya) gecici bir PostgreSQL 16 veritabaninda sirayla kosuldu (`araclar/vt/kurulum.sql` sonrasi, `tmiv2_goc` ile, hatasiz).
  "x" hucreleri o veritabanindaki `rol_islemi` satirlaridir (84 satir). Veritabani silinebilir, depoya dokunulmadi.
- DOGRULANDI: islem listesi `paylasilan/islemler.ts` `ISLEMLER` (49 islem: 32 veri, 17 sayfa). Iki liste karsilastirildi: goclerde olup kodda olmayan islem yok;
  hicbir rolde olmayan 19 islem var (asagida "." satirlari).
- DOGRULANDI: tablo `kurulum/yetki-matrisi.md` ile ayni (o belgeyi `araclar/yetki-matrisi.test.ts` goclerle esler).
- `yonetici` (bayrakli) sutunu yok: satir tasimaz, kayitli her islemi alir (ADR 0003 madde 5).
- Rol x islem degisikligi: yeni `*_kisiler_*` goc + `sunucu/moduller/oturum/oturum.test.ts` `MATRIS` + `kurulum/yetki-matrisi.md` ayni iste (belgenin kurali).

Isaretler: `x` var · `.` yok · `+` onerilen ekleme · `?` tartismali (soru listesinde) · `y` yalniz yonetici kalir (onayli karar).

Roller: MUD mudur · PLN planlama_proje · KAL kalite · CAM cam · OPR operator · BKM bakim · SAT satin_alma · DEP depo · IK insan_kaynaklari · IDR idari_isler · MUH muhasebe_finans

## Tablo

| Islem | MUD | PLN | KAL | CAM | OPR | BKM | SAT | DEP | IK | IDR | MUH | Durum / dayanak | Oneri |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Sayfalar** | | | | | | | | | | | | | |
| `sayfa.uretim-emirleri` | x | x | x | x | . | . | . | . | . | . | x | onayli (#224/#266 dahil) | kalsin |
| `sayfa.terminal` | x | x | x | . | x | . | . | . | . | . | . | onayli | kalsin |
| `sayfa.kuyruk` | x | x | . | . | x | . | . | . | . | . | . | onayli | kalsin |
| `sayfa.cizelge` | x | x | . | . | . | . | . | . | . | . | . | onayli | kalsin |
| `sayfa.matris` | x | x | . | . | . | . | . | . | . | . | . | onayli | kalsin |
| `sayfa.vardiya` | x | x | . | . | . | . | . | . | x | x | . | onayli | kalsin |
| `sayfa.mesai` | x | x | . | . | . | . | . | . | x | x | . | onayli | kalsin |
| `sayfa.stok` | x | x | x | . | . | . | x | x | . | . | x | onayli; stok modulu depoda yok (sayfa yapim asamasinda) | kalsin; stok gelince yeniden bakilir |
| `sayfa.malzemeler` | x | x | x | x | x | . | x | x | . | . | . | onayli | kalsin |
| `sayfa.rota` | x | x | x | x | . | . | . | . | . | . | . | onayli | kalsin |
| `sayfa.istasyonlar` | x | x | . | x | . | . | . | . | . | . | . | onayli | kalsin |
| `sayfa.personel` | x | . | . | . | . | . | . | . | x | x | . | onayli | kalsin |
| `sayfa.arkon` | x | x | x | x | x | x | . | . | . | . | . | onayli (#266) | kalsin |
| `sayfa.satin-alma` | + | ? | + | ? | . | . | + | + | . | . | . | hicbir rolde yok; #162 notu: veri islemiyle birlikte verilmeli (`BASKA-MODUL-ISTEKLERI.md` "satin-alma") | R1 |
| `sayfa.kalibrasyon` | + | . | + | . | . | . | . | . | . | . | . | kullanici karari 08.10: "simdilik yalniz yonetici" (`kalibrasyon/UYUM-BORCU.md` 1) | R2 |
| `sayfa.durus-nedenleri` | y | . | . | . | . | . | . | . | . | . | . | karar #73: yalniz yonetici duzenler; okuma uclari oturumla acik | kalsin |
| `sayfa.ayarlar` | y | . | . | . | . | . | . | . | . | . | . | karar #117 | kalsin |
| **Veri islemleri** | | | | | | | | | | | | | |
| `kisiler.oku` | x | x | . | . | . | . | . | . | x | x | . | onayli | kalsin |
| `kisiler.yaz` | . | . | . | . | . | . | . | . | x | . | . | onayli; ADR 0003: mudur kisi yonetimini almaz | kalsin |
| `kisiler.rol-yonet` | y | . | . | . | . | . | . | . | . | . | . | yalniz yonetici (yetki-matrisi.md) | kalsin |
| `kisiler.parola-degistir` | y | . | . | . | . | . | . | . | . | . | . | yalniz yonetici | kalsin |
| `denetim.oku` | x | . | . | . | . | . | . | . | . | . | . | onayli; D48 bu turda okumayi daraltiyor | kalsin |
| `vardiya.yaz` | x | x | . | . | . | . | . | . | ? | . | . | IK sayfayi gorur, yazamaz | R4 |
| `vardiya.gecmis-yaz` | x | . | . | . | . | . | . | . | . | . | . | onayli | kalsin |
| `uretim-emirleri.yaz` | x | x | . | . | . | . | . | . | . | . | . | onayli; modul sahibi disarida | kalsin |
| `terminal.uret` | x | . | . | . | x | . | . | . | . | . | . | onayli kural: yalniz mudur ve operator | kalsin |
| `malzemeler.yaz` | x | x | x | x | . | . | x | x | . | . | . | onayli | kalsin |
| `malzemeler.onayla` | x | . | x | . | . | . | . | . | . | . | . | onayli | kalsin |
| `malzemeler.tanim-yaz` | x | x | . | . | . | . | . | . | . | . | . | onayli (#229) | kalsin |
| `istasyonlar.yaz` | + | ? | . | . | . | . | . | . | . | . | . | hicbir rolde yok; grant karari bulunamadi (#95 yalniz muafiyeti karara bagladi). ADR 0003 "mudur ... var olan islemleri alir" ilkesiyle celisiyor | R3 |
| `durus-nedenleri.yaz` | y | . | . | . | . | . | . | . | . | . | . | karar #73: yalniz yonetici (ADR 0003 ilkesinden sonraki karar) | kalsin |
| `kalibrasyon.oku` | + | . | + | . | . | . | . | . | . | . | . | karar 08.10: simdilik yalniz yonetici; sayfa islemi okumaya yeter (ADR 0007) | R2 |
| `kalibrasyon.yaz` | . | . | + | . | . | . | . | . | . | . | . | ayni | R2 |
| `ayarlar.yaz` | y | . | . | . | . | . | . | . | . | . | . | karar #117 | kalsin |
| `saglik.ayrinti-oku` | y | . | . | . | . | . | . | . | . | . | . | yalniz yonetici | kalsin |
| `satin-alma.oku` | + | . | . | . | . | . | + | . | . | . | ? | hicbir rolde yok (`satin-alma/UYUM-BORCU.md` 6) | R1, R5 |
| `satin-alma.talep-ac` | + | ? | + | ? | . | . | + | + | . | . | . | ayni | R1 |
| `satin-alma.yaz` | . | . | . | . | . | . | + | . | . | . | . | ayni | R1 |
| `satin-alma.onayla` | + | . | . | . | . | . | . | . | . | . | . | ayni; dort goz kurali (SAT-30) | R1 |
| `satin-alma.teslim-al` | . | . | . | . | . | . | . | + | . | . | . | ayni; teslim ucu fiyatsiz (SAT-37) | R1 |
| `satin-alma.ayar` | . | . | . | . | . | . | + | . | . | . | . | ayni (kurlar, onay limitleri) | R1 |
| `arkon.yonetici` | y | . | . | . | . | . | . | . | . | . | . | yalniz yonetici | kalsin |
| `arkon.planlama` | . | x | . | . | . | . | . | . | . | . | . | onayli (#266) | kalsin |
| `arkon.hazirlik` | . | . | . | x | . | . | . | . | . | . | . | onayli | kalsin |
| `arkon.kalite` | . | . | x | . | . | . | . | . | . | . | . | onayli | kalsin |
| `arkon.bakim` | . | . | . | . | . | x | . | . | . | . | . | onayli | kalsin |
| `arkon.amir` | x | . | . | . | . | . | . | . | . | . | . | onayli | kalsin |
| `arkon.operator` | . | . | . | . | x | . | . | . | . | . | . | onayli | kalsin |
| `arkon.yansima-oku` | x | x | . | . | . | . | . | . | . | . | . | onayli (#243, #272) | kalsin |
| **Bu turda gelecek (henuz kodda yok)** | | | | | | | | | | | | | |
| Arkon yeniden kuyruga alma (N2, adi yazarda) | + | + | . | . | . | . | . | . | . | . | . | kullanici karari bu tur: mudur ve planlama_proje | cekirdek istegi olarak gelir |
| `denetim.govde-oku` (D48) | y | . | . | . | . | . | . | . | . | . | . | kullanici karari bu tur: hicbir role verilmez | kalsin |
| `sayfa.denetim` (D48m) | + | . | . | . | . | . | . | . | . | . | . | `/mnt/project-files/denetim/48-liste.md`: verilmezse mudur menude gormez | D48m istegiyle |

Satin alma satirlarindaki `+` hucreleri teslimin kendi onerisidir: `sunucu/moduller/satin-alma/ON-PAKET-satin-alma.md:7-8`
(satin_alma: oku, yaz, talep-ac, ayar; mudur: oku, onayla, talep-ac; depo: teslim-al, talep-ac; kalite: talep-ac; `sayfa.satin-alma` hepsine).
Kalibrasyon ve istasyonlar `+` hucreleri benim onerimdir (VARSAYIM, asagida gerekce).

## Tartismali noktalar ve gerekce

1. Satin alma (R1). DOGRULANDI: alti veri islemi ve sayfa islemi hicbir rolde yok; modul yalniz yoneticide calisiyor. Rol suzmesi sunucuda var:
   `servis.ts` `acilis` tam goreni (`oku`, `yaz`, `onayla`) ayirir, talep eden yalniz kendi talebini fiyatsiz gorur (SAT-53/64/65); teslim ucu fiyatsiz (SAT-37).
   Rollere vermeden once kapanmasi gereken: teklif fiyatinin denetim kaydi (`satin-alma/UYUM-BORCU.md` 13; bu turda N4 ile geliyor). VARSAYIM: N4 birlesmeden
   satin alma rol goci birlesmemeli; sira birlestiriciye yazilmali. Geri alma maliyeti dusuk (rol satiri goc ile geri alinir), ama fiyat degisikligi
   denetimsiz yazilirsa o kayitlar geri gelmez.
   Acik: `talep-ac` en zayif islemle `kaydet`/`sil`/`katalogu/kaydet` uclarini acar, asil yetkiyi servis secer (`UYUM-BORCU.md` 7, V-33); testli (SAT-29/30/37/38/58/59/64), role vermeyi tutmaz.
   Atolyede talebi planlama ve CAM de acar (takim, sarf): VARSAYIM; on pakette yok.
2. Kalibrasyon (R2). Kullanicinin 08.10 karari "simdilik yalniz yonetici". Kalite rolu olcu aletlerini acamiyor; Asama 2'de kalite akisi icin gerekir.
   Oneri: kalite sayfa + yaz, mudur sayfa (okuma ADR 0007 ile sayfadan gelir, `kalibrasyon.oku` ayrica gerekmez; tabloda tamlik icin `+` yazildi).
3. Istasyonlar (R3). `istasyonlar.yaz` tesisi, is merkezlerini ve kisi kisitlarini yazar; bugun yalniz yonetici. ADR 0003 "Sonuclar": mudur kisi/rol yonetimi ve sistem
   ayrintisi disindaki var olan islemleri alir; karari olmadan bu ilkeden ayrilan bosluklardan biri (oteki satin alma). Kisi kisitlari bolumu `kisiler.oku` ister; mudur ve planlama'da var.
4. Vardiya (R4). IK ve idari isler vardiya/mesai sayfasini gorur, yazamaz. Mesai girisini IK mi yapar, planlama mi: BILMIYORUM.
5. Muhasebe (R5). muhasebe_finans'in hicbir veri islemi yok; satin alma fiyatlarini goremez. Finans modulu gelince fatura eslesmesi icin gerekebilir: VARSAYIM.
6. Ilke celiskisi (bilgi): ADR 0003 mudur icin "var olan butun islemler" der; sonraki kararlar (#73 durus nedenleri, #117 ayarlar, 08.10 kalibrasyon, satin alma) bunu daraltti.
   ADR'nin bu cumlesi guncel degil; rol karari girerken ADR'ye not dusulmesi onerilir (belge isi, cekirdek konusu).

## Karar sorulari (kodla cevap: ornek "R1 a, R2 b, R3 a, R4 a, R5 b")

R1. Satin alma rolleri nasil girsin?
   Neden: modul yalniz yoneticide; talep eden ve depo menude sayfayi bile goremiyor.
   a) On paketteki gibi (yukaridaki `+` hucreleri), N4 fiyat denetimi birlestikten sonra. (oneri)
   b) a + planlama_proje ve cam `talep-ac` ve `sayfa.satin-alma`.
   c) Asama 2 baglamasina kalsin.
R2. Kalibrasyon kaliteye acilsin mi?
   Neden: 08.10 karari "simdilik yonetici"; kalite akisi Asama 2'de bunu ister.
   a) kalite: `sayfa.kalibrasyon` + `kalibrasyon.yaz`; mudur: `sayfa.kalibrasyon`. (oneri)
   b) simdilik yonetici kalsin (08.10 karari aynen).
R3. `istasyonlar.yaz` kime?
   Neden: tesis ve is merkezi tanimlarini bugun yalniz yonetici yaziyor; ADR 0003 ilkesi mudure verir.
   a) mudur. (oneri)  b) mudur + planlama_proje.  c) yalniz yonetici kalsin.
R4. Vardiya ve mesaiyi IK yazsin mi?
   Neden: IK sayfayi goruyor, yazamiyor.
   a) kalsin: planlama ve mudur yazar, IK gorur. (oneri)  b) IK'ya `vardiya.yaz`.
R5. Muhasebe satin almayi okusun mu?
   Neden: muhasebe_finans'in hicbir veri islemi yok.
   a) finans modulu baglanirken sorulsun. (oneri)  b) simdi `satin-alma.oku` + `sayfa.satin-alma`.

Sabit kalan (soru degil): durus nedenleri (#73), ayarlar (#117), kisi/rol/parola, saglik ayrintisi, Arkon yoneticisi, `denetim.govde-oku` yalniz yonetici.
