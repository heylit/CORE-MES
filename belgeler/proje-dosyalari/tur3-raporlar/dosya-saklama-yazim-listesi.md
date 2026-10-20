# Dosya saklama (kart #82): yazim listesi

Kullanici kararlari (2026-10-08): DS1-DS10 hepsi a. Yazim N4 (#290) birlestikten sonra cekirdek konusunda baslar; "yaz" onayi bu listeye verilir.
Taban: origin/main `1a7892e` ("Merge pull request #289"). Depoya yazilmadi.

## 0. Ilk rapordan bir duzeltme

Ilk raporda tablolar `sunucu/cekirdek/dosya.ts` altinda yaziyordu. Depodaki kalip baska: cekirdek tablo sorgulamaz, tabloyu tutan cekirdek parcasi bir moduldur (DOGRULANDI: `istek-kimligi` ve `denetim` modulleri kendi tablolarini tutar, `sunucu/uygulama-secenekleri.ts` onlari cekirdege verir; `yapi-kaliplari` SKILL "Cekirdek tablo sorgulamaz"). Bu yuzden:
- Tablolar ve islevler yeni `sunucu/moduller/dosya/` modulunde.
- `sunucu/cekirdek/uc.ts` yalniz ikili cevap destegi alir (DS2 a).
- Indirme ucu dosyayi baglayan modulde durur (ornek `GET /malzeme-katalogu/:id/belgeler/:ozet`, malzemelerin okuma islemiyle). Boylece DS6 a (baglayan modulun okuma islemi ve veri kapsami) `uc({ yetki })` ile saglanir ve `dosya` modulu ust modulleri ithal etmez (ADR 0006 yonu korunur).
- Yeni islem ve rol x islem degisikligi yok.

## Adim 1: cekirdek (kart #82, dal `82-dosya-saklama`, cekirdek-yazari, sunucu seridi)

Sira (katman duzeni): paylasilan, sonra sunucu.

1. `paylasilan/sozlesme/dosya.ts`: `DOSYA_PARCASI` (512 KB), parca govdesi `{ sira, toplam, veri: base64 }`, `eksiklerGovdesi { ozetler }`, ozet semasi (`^[0-9a-f]{64}$`), cevaplar.
2. `sunucu/cekirdek/ayar.ts`: `TMIV2_DOSYA_AZAMI_BAYT` (varsayilan 200 MB), `TMIV2_DOSYA_DEPO_BAYT` (varsayilan 50 GB); `.env.ornek` satirlari. Gecersiz deger acilista durur (mevcut `sureOku` kalibi).
3. `sunucu/cekirdek/uc.ts`: ikili cevap. Tanimda `cevap: 'ikili'`; isleyici `{ tur, ad, boyut, parcalar: AsyncIterable<Buffer> }` doner. Uc katmani `Content-Type`, `Content-Length`, `Content-Disposition: attachment` (ad kacirilarak), `X-Content-Type-Options: nosniff` yazar. Okuma tek gorunumde (`okumaTx`) parca parca akitilir.
   Teknik risk: akis suresince okuma transaction'i acik kalir ve `TMIV2_PG_BOS_TX_SURE_MS` / `TMIV2_PG_SORGU_SURE_MS` sinirlarina takilabilir (DOGRULANDI: `db.ts` "idle_in_transaction_session_timeout"). Yazar parca okumasini ve gonderimi bu sinirlar icinde tutar; tutamazsa durur ve ADR'de secenegi yazar.
4. Goc `sunucu/gocler/<damga>_dosya_tablolar.sql` (yeni bos tablolar; dolu tablo degismez):
   - `dosya(ozet text PK, boyut bigint, tur text, ilk_yukleyen_id int REFERENCES kisi, zaman timestamptz)`; kisitlar `dosya_ozet_bicimi`, `dosya_boyut_pozitif`, `dosya_tur_degeri`.
   - `dosya_icerigi(ozet REFERENCES dosya ON DELETE CASCADE, sira int, icerik bytea, PK (ozet, sira))`; `dosya_icerigi_parca_boyutu` (en cok 1 MB).
   - `dosya_bagi(ozet REFERENCES dosya, modul text, kayit text, ad text, belge_turu text, ekleyen_id int REFERENCES kisi, zaman timestamptz, PK (ozet, modul, kayit))`; dizin `dosya_bagi_kayit_idx (modul, kayit)`.
   - `dosya_yuklemesi(ozet, yukleyen_id REFERENCES kisi, sira, toplam, icerik bytea, zaman, PK (ozet, yukleyen_id, sira))`: Arkon'un kisi seridi kalibi.
   - Uygulama rolune yetki satirlari, mevcut goclerdeki gibi.
5. `sunucu/moduller/dosya/`:
   - `kurallar.ts` (saf): `turBul(ilkBaytlar)` (PDF `%PDF-`, PNG, JPEG, WEBP, STEP `ISO-10303-21`, STL, IGES; tanimsiz `null`), `kotaHatasi` (Arkon `yuklemeKotasiHatasi` kalibi), `sahipsizMi(sonBagZamani, simdi, 7 gun)`, `izinliMi(tur, boyut, modulSiniri)`.
   - `sorgular.ts`, `servis.ts`.
   - `uclar.ts`: `POST /dosyalar/eksikler`, `POST /dosyalar/:ozet/parca` (yetki `oturum`, `denetim: 'govdesiz'`; icerik denetime girmez, DS9 a). Okuma ucu yok: indirme baglayan moduldedir; bagi olmayan dosyayi yalniz yukleyen okur (`GET /dosyalar/:ozet`, yalniz kendi bagsiz yuklemesi).
   - `disari.ts`: `dosyaBagla(db, kullanici, { ozet, modul, kayit, ad, belgeTuru }, sinir: { turler, azamiBayt })` (tur ve boyut modul sinirina gore denetlenir, 413/400), `bagKaldir(db, modul, kayit, ozet?)`, `bagliDosyalar(db, modul, kayit)`, `dosyaAkisi(db, ozet)` (yalniz bagi olan modul cagirir), `eksikDosyalar(db, ozetler)`.
   - Sahipsiz dosya temizligi: yuklemede firsatla (bayat serit 1 gun, bagsiz dosya 7 gun; DS4 a). #208 zamanlanmis is gelince oraya tasinir, borca yazilir.
6. Kural kodlari ve testler (`dosya.test.ts` gercek PostgreSQL, `kurallar.test.ts` saf; her kural icin izinli ve reddeden):
   - DSK-01 ayni icerik iki kez yuklenince tek `dosya` satiri (kart #82 kabul olcutu).
   - DSK-02 ozet tutmazsa serit atilir, 400.
   - DSK-03 genel ust sinir asilinca 413; depo toplami asilinca 429.
   - DSK-04 kisi kotasi (5 acik yukleme): en eski acik yukleme atilir (Arkon davranisi).
   - DSK-05 tur ilk baytlardan; bildirilen MIME'a guvenilmez; modulun izin vermedigi tur 400.
   - DSK-06 baska kisinin seridine yazilamaz ve onu engelleyemez.
   - DSK-07 bagsiz dosyayi yalniz yukleyen okur; baskasi 404.
   - DSK-08 bag kaldirilinca dosya 7 gun kalir, sonra silinir; bagi olan dosya silinmez.
   - DSK-09 ikili cevap: dogru baslik, `nosniff`, ad kacirilmis; cevap semasi disi alan cikmaz.
   - DSK-10 `dosyaBagla` ve `bagKaldir` denetim kaydina ozet, ad, boyut, turle girer; icerik girmez (DS9 a).
   - `uc.ts` ikili cevap icin `uc.test.ts`'e iki test (izinli akis, yetkisiz 403).
7. Belgeler:
   - `belgeler/adr/0007-dosya-saklama.md`: PostgreSQL icinde parcali (DS1), ikili indirme ve JSON parcali yukleme (DS2, DS3), indirme baglayan modulde (DS6), sahipsiz 7 gun (DS4), yedek veritabaniyla (DS8, #44).
   - `sunucu/moduller/dosya/`: `NOTLAR.md`, `GUVENLIK-DENETIMI.md`, `KURAL-TEST.md`, `ORTAKLIK-dosya.md`, `UYUM-BORCU.md` (#208'e tasinacak temizlik).
   - Sef isi, istek olarak: `yapi-kaliplari` SKILL'ine "dosya saklama" satiri ve `uc-ekle`'ye ikili cevap notu (`.claude` sefin dosyasidir).
8. Kosulacaklar: `npm run tip`, `npm run lint`, `npm run sinir -- --modul dosya`, `npm run test:modul -- dosya`; tam `kontrol` cekme isteginde.
Tam yol: denetci, sonra dar ikinci tur (cekirdek ve yetki).

## Adim 2: malzemeler belge yukleme (ayri kart ve dal; modul-yazari)

- Kopru `istemci/src/moduller/malzemeler/kopru.ts` `belge-yukle` / `belge-sil` cekirdek parca ucuna ve malzemelerin yeni bag uclarina baglanir; `katalog.html` degismez.
- Sunucu: kart belgeleri icin `dosyaBagla` / `bagKaldir` cagiran yazma uclari ve `GET .../belgeler/:ozet` (malzemelerin okuma islemi). Sinir: PDF, PNG, JPEG, WEBP; 20 MB (prototip).
- `UYUM-BORCU.md` madde 5'ten belge yukleme kalkar; `ORTAKLIK-malzemeler.md` "Dosya, ek" satiri guncellenir.
- Kart numarasi gerekli.

## Adim 3: kalibrasyon sertifika eki (ayri kart ve dal; modul-yazari)

- Sertifika kaydina dosya bagi; PDF ve gorsel. `NOTLAR.md` ve `UYUM-BORCU.md` madde 7'deki "sertifika dosya eki yok" kalkar.
- Ekran baslangici kalibrasyon prototipine gore; prototipte ek alani yoksa bu adim soru olarak doner (BILMIYORUM: prototipte ek alani var mi, bakilmadi).
- Kart numarasi gerekli.

## Adim 4: Arkon baglantisi (ayri kart ve dal; Arkon konusu)

1. Veri gocu (dolu tablodan kopya, kaynak degismez): `arkon_dosya` -> `dosya` ve `dosya_icerigi`; baglar `arkon_belge.govde` ve `arkon_kayit.govde` icindeki `$blob` degerlerinden (modul `arkon`, kayit `depo/kimlik` ya da kayit kimligi). Hicbir yerde anilmayan dosya `arkon` bagiyla kalir, silinmez.
2. Arkon servisi `eksikDosyalar`, `dosyaParcasi`, `dosya` islevlerini `dosya/disari.ts`'e devreder; belge yaziminda govdedeki `$blob` listesine gore bag guncellenir. `/arkon/dosyalar/*` yollari ve cevap bicimi ayni; `istemci/src/moduller/arkon/baglanti.ts` ve Arkon ekrani degismez.
3. DS6: okuma Arkon ucunda Arkon rolu ve belgenin veri kapsamiyla denetlenir; "ozetini bilen her rol okur" acigi kapanir. O zamana kadar Arkon borcunda "kullanimi etkileyen".
4. Arkon tarayici denemesi (teknik resim, cizim, 3B model) yeni depoyla gecer.
- Kart numarasi gerekli.

## Adim 5: Arkon eski tablolarini dusurme (ayri goc, kullanici onayi)

- `arkon_dosya_parcasi` (gecici veri) ve `arkon_dosya` dusurulur. Dolu tabloyu dusuren goc: Adim 4 denemesi gectikten sonra ayrica sorulur (DS7 a).

## Bagimlilik ve sira

Adim 1 -> (Adim 2 ve Adim 3 paralel) -> Adim 4 -> Adim 5 (DS10 a). Adim 1 N4 (#290) birlesmeden baslamaz.

## Varsayimlar (geri alma maliyeti)

- Tablolar `dosya` modulunde, indirme baglayan modulde (orta: tasimak uc ve testleri degistirir).
- Tur denetimi ilk baytlardan, paket yok (ucuz).
- Ikili cevap okuma transaction'i icinde akitilir; sure sinirina takilirsa yazar durur (orta).
- `kayit` metin anahtardir; Arkon `depo/kimlik` metinleriyle uyusur. Asama 2'de sayi kimligine gecis gerekebilir (orta).
