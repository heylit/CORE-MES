# Akis A deneme hazirligi (tur 1, salt okuma)

Okunan agac: `origin/main` 27cf5bd + sirayla #267 (ad58498), #268 (37aadba), #266 (4b5c3dc), #269 (1cf2037), #265 (bc2394a); yerel gecici birlesim 6825d58, bes birlesme de cakismasiz. Goc sirasi 36, son `20261008013200_kisiler_malzemeler_tanim_islemi.sql`.
Depoda dosya degismedi, commit ve dal yok. Node v24.21.0, PostgreSQL 16 (yerel).

## Sonuc
Dar akis (planlamaci emir acar -> Arkon'da baslat, say, bitir -> kayit emirde) birlesik agacta SUNUCU TARAFINDA CALISIYOR.
DOGRULANDI: gecici bir test (gecici agacta, silindi) gercek rol satirlariyla (planlama_proje, cam, operator; gecici rol yok) su adimlari kosturdu:
emir acma 200; operator taslak paketi goruyor; cam paketi yayinladi 200; running, good 12, scrap 2 (HR-1), done -> dort yansima da `yazildi`;
planlamaci emri okudu: `durum: bitti`, `saglamAdet: 12`, `canli.hurda: 2`. Ayni testte planlamaci ve operator `GET /arkon/tmi-yansimalari` -> 403.
Tarayicidaki ekran akisi (Arkon cercevesi, tablet) denenmedi: calistirilmadi.

## Senaryo (kim, ne yapar)
0. Hazirlik, yonetici: is merkezi + talasli istasyon (Arkon'a yalniz is merkezine bagli istasyon gider: `sunucu/moduller/arkon/kurallar.ts:137`); en az bir durus ve hurda nedeni (kodlu). TMI'de neden yoksa Arkon kendi varsayilan kodlarini kullanir ve durdur/hurda `eslenemedi` olur (`arkon/servis.ts` `tmiAyari`, `tmiKomutuYurut`). Uc kullanici: planlama_proje, cam, operator. Kisilere is merkezi kisiti vermeyin ya da istasyonu kapsamlarina koyun.
1. Planlamaci (planlama_proje, `uretim-emirleri.yaz`): Uretim emirleri > emir ac: parca no, ad, adet, istasyon. Emir `planli`.
2. CAM (cam, `arkon.hazirlik`): Arkon > Hazirlik'ta `tmi-ue-<id>` taslak paketini acar. Yayin icin zorunlular: operasyon alani dolu (TMI'den bos gelir), talasli istasyonda ana teknik resim (PDF ya da model) ve en az bir kontrol noktasi (`arkon/web/src/app/hazirlik.ts:42-45`). Yayinlar. Deneme resmi uydurma olmali (gercek cizim girmez). Kalite onayi varsayilan kapali (`ortak-ayarlar.ts:75` `approval: false`).
3. Operator (operator, `arkon.operator` + `terminal.uret`): tablette istasyon secili olmali (`ortak-ayarlar.ts:33`; secilmemisse listedeki ilk istasyon). Yalniz yayinlanmis ve bu istasyonun paketi gorunur (`operator.ts:53`). Baslatir -> TMI emri `basladi`.
4. Operator: saglam ve hurda (neden kodlu) sayar -> emre yansir. Sayim baslatmadan once gelirse bekler, baslayinca yazilir (#269).
5. Operator: bitirir -> emir `bitti`; eksik adetle de biter (12/20 kabul edildi).
6. Planlamaci: emir ayrintisinda durum, saglam, hurda, zamanlar (`istemci/src/moduller/uretim-emirleri/EmirAyrintisi.tsx:83-84`).

## Calismayan ya da eksik olan
1. KULLANIMI TUTAN: `arkon.yansima-oku` hicbir role verilmedi (goclerde yok; yalniz `paylasilan/islemler/arkon.ts:12`). #266 Arkon'u rollere aciyor ama "TMI'ye yazilamayanlar" listesini mudur ve planlama goremiyor (403). Bu, #243'teki "Arkon rollere acilmadan once gorunsun" kararina aykiri; istek `sunucu/moduller/arkon/CEKIRDEK-ISTEKLERI.md:3`.
2. KULLANIMI ETKILEYEN: Arkon'da baska ise gecmek (`queued`) TMI'de eski emri `basladi` birakir; ayni istasyonda ikinci emir baslatilamaz (`arkon/UYUM-BORCU.md` sinir d, #241 kalani). Denemede istasyon basina tek emir.
3. ETKILEYEN: yansima yeniden denemesi yalniz yeni kayit gelince calisir; bekleyen sayim sonraki kayda kadar emirde gorunmez (sinir f).
4. ETKILEYEN: Arkon kayit zamani TMI'ye tasinmaz; cevrimdisi gec gelen sayim gelis aninda yazilir (sinir a). Hurda eksi duzeltme yansimaz (sinir b).
5. ETKILEYEN: TMI terminal ekrani (Arkon disi yol) duraklamis emir kuralini bilmiyor (`uretim-emirleri/NOTLAR.md`); denemede Arkon kullanilmali.
6. ETKILEYEN: TMI'den gelen paket bos operasyon, resim ve kontrol planiyla gelir; her emirde CAM doldurmadan operator isi gormez (adim 2).
7. BUGUN KODDA YOK: tam akis A (malzeme karti -> rota -> uretim emri -> is emirleri): `uretim_emri.parca_no` serbest metin, malzeme kartina bag yok; rota modulu depoda yok (`sunucu/moduller` listesi); is emri katmani yok. Uretim-emirleri disarida yaziliyor.

## Denemeden once birlesmesi gerekenler
- #266 (zorunlu): Arkon rol satirlari (`20261008012100_kisiler_bakim_rolu_arkon_islemleri.sql`); main'de operatorde `sayfa.arkon` yok.
- #269 (zorunlu, #266'dan sonra): sayim ertelemesi (`SAYIM_ERTELEME` main'de yok), ret bildirimi, Arkon cercevesi.
- Ek istek (cekirdek): `arkon.yansima-oku` icin mudur ve planlama_proje rol satiri (madde 1).
- #265, #267, #268 akis A icin gerekli degil (VARSAYIM: farklari kendi klasorlerinde ve istasyon goclerinde; birlesik agacta akis yesil).

## Kosulan komutlar (birlesik agac 6825d58)
- `npm run test:modul -- uretim-emirleri`: tests 97, pass 97, fail 0; istemci 33/33.
- `npm run test:modul -- arkon`: tests 118, pass 118, fail 0; istemci 16/16.
- `npm run test:modul -- istasyonlar`: 33/33; `kisiler`: 79/79.
- `npm run tip`: cikis 0. `npm run derle:istemci` (Arkon dahil): built.
- Calistirilmadi: tam `kontrol`, `sinir`, `lint`, tarayicida ekran denemesi.

Yan bulgu (madde 1 konusu icin): `arkon/guvenlik.test.ts` "kisitli kiside kod dolanmalari kapalidir ... pasif makine" testi bu birlesik agacta (#265 ve #269 birlikte) GECIYOR.
