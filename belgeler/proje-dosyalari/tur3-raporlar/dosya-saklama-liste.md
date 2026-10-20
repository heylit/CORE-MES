# Dosya saklama (kart #82): liste ve oneri

Salt okuma rapor; kod yok, depoda degisiklik yok. Taban: origin/main `dd7fd6c` (2026-10-08, "docs(ortak): FARK and a note on Esc in full screen (#172)").
`npm run harita` calistirilmadi: okuma agacinda paketler kurulu degil (`fastify` bulunamadi); Goc sirasi satiri bu yuzden yok.
`kurulum/eski-kurallar` okunmadi.

## 1. Kimler bekliyor

| Modul | Bugun | Ne istiyor | Kanit |
|---|---|---|---|
| malzemeler | Belge yukleme kapali; kopru `belge-yukle`/`belge-sil` icin "Bu kurulumda belge saklama yok." firlatir | Kart basina belge: 7 tur (3.1 sertifika, TDS, SDS, DoC, teknik cizim, test raporu, diger); PDF, PNG, JPEG, WEBP; en cok 20 MB; yukle (id doner), ac (`/_blob/<id>` baglantisi), kaldir | DOGRULANDI: `istemci/src/moduller/malzemeler/katalog/katalog.html` "const DOCTIPS", "PDF veya gorsel, en fazla 20 MB", `assetsCap`; `kopru.ts` "case 'belge-yukle'"; `ORTAKLIK-malzemeler.md` "Dosya, ek - yok (belge yukleme kapali)" |
| arkon | Kendi deposu var ve calisiyor (`arkon_dosya`, `arkon_dosya_parcasi`) | Teknik resim PDF, STEP/IGES/STL, islenmis 3B ag ve 16 KB ustu her ikili dizi | DOGRULANDI: `sunucu/gocler/20261007151000_arkon.sql` "CREATE TABLE arkon_dosya"; `arkon/web/src/data/store.ts` "BLOB_MIN = 16384", "{ $blob: h, t: k, n: u.length }" |
| kalibrasyon | Sertifika dosya eki yok, yalniz sertifika no | Sertifika eki (PDF ya da gorsel) | DOGRULANDI: `sunucu/moduller/kalibrasyon/NOTLAR.md` "Sertifika dosya eki yok"; `UYUM-BORCU.md` madde 7 SONRA |
| satin-alma | Dosya eki yok | Kodda istek yok; yalniz JSON ice aktarma var | DOGRULANDI: `istemci/src/moduller/satin-alma/merkez/ui.ts` tek `type="file"` "imp-file" (.json). VARSAYIM: teklif belgesi ve irsaliye eki ileride istenebilir; prototipte yok |
| finans | Depoda yok | BILMIYORUM. Faturanin asil kaydi Logo'da (proje talimati); masraf fisi goruntusu olabilir | - |
| uretim-emirleri (disarida) | Yazilmaz | Emre dosya baglama istegi #80'de (`emirDosyalariniDegistir`); yalniz istek biriktirilir | DOGRULANDI: kart #80 "Baskasindan istenen" |
| stok (mal kabul) | Depoda yok | BILMIYORUM; irsaliye ve 3.1 sertifikasi olasi | - |

## 2. Arkon'un bugunku deposu (DOGRULANDI, kod)

- Tablo: `arkon_dosya(ozet sha256 PK, icerik bytea, boyut, yukleyen_id, zaman)`; tamamlanmamis yukleme `arkon_dosya_parcasi(ozet, yukleyen_id, sira, toplam, icerik)`, kisi basina serit (`20261007205500_arkon_dosya_seridi.sql`).
- Yukleme: `POST /arkon/dosyalar/:ozet/parca`, JSON icinde base64, 512 KB parca (`paylasilan/sozlesme/arkon.ts` "DOSYA_PARCASI = 512 * 1024"; yorum: govde siniri 1 MB). Son parcada SHA-256 denetlenir, tutmazsa serit atilir.
- Sinirlar (kullanici karari): tek dosya 200 MB (`AZAMI_DOSYA`), kisi basina 5 acik yukleme, depo toplami 50 GB; kisi acik bayt 1 GiB VARSAYIM (`kurallar.ts` "DOSYA_KOTASI").
- Okuma: `GET /arkon/dosyalar/:ozet` butun dosyayi tek JSON cevabinda base64 doner (`servis.ts` "toString('base64')"). Yetki: herhangi bir Arkon rolu, herhangi bir ozet; veri kapsami yok (`rolGerekli`).
- Baglanti: ozet `arkon_belge.govde` jsonb icinde `{"$blob": "<ozet>"}` olarak gecer; ayri bag tablosu yok. Tamamlanmis dosya hic silinmez (sunucuda `arkon_dosya`'dan DELETE yok); bayat parca bir gunde silinir.
- Tur bilgisi yok: icerik Arkon'un ikili dizisidir (`t` dizi turu), MIME degil.
- Denetim: uclar `denetim: 'govdesiz'`; icerik denetim kaydina girmez.

Gozlem: 200 MB dosyanin indirilmesi sunucuda yaklasik 270 MB'lik base64 metin uretir (VARSAYIM: hesap, olculmedi). Tek sunucuda bellegi zorlar; tasarimda indirme parcali ya da ikili olmali.

## 3. Onerilen tasarim

Yer ve sahip: cekirdek parcasi `sunucu/cekirdek/dosya.ts` + yeni goc (cekirdek-yazari, sunucu seridi). Modul yalniz cekirdek fonksiyonunu cagirir; tabloyu sorgulamaz.

Tablolar (taslak, adlar karara bagli):
- `dosya(ozet PK, boyut, tur, ilk_yukleyen_id, zaman)`: icerik ozetle tekildir; ayni dosya ikinci kez yuklenirse tek satir kalir.
- `dosya_parcasi(ozet, sira, icerik bytea)`: icerik 1 MB alti parcalar halinde; indirme parca parca okunur, sunucu butun dosyayi bellege almaz.
- `dosya_bagi(ozet, modul, kayit, ad, belge_turu, ekleyen_id, zaman)`: hangi modulun hangi kaydi dosyayi aniyor. Yetki ve temizlik buradan.
- Yukleme serit tablosu Arkon'daki gibi (kisi basina, bir gunde temizlenir).

Islevler (imza taslagi): `dosyaParcasiYaz(db, kullanici, ozet, parca)`, `eksikDosyalar(db, ozetler)`, `dosyaBagla(db, kullanici, { ozet, modul, kayit, ad, belgeTuru })`, `bagKaldir(db, modul, kayit, ozet?)`, `dosyaOku(db, ozet, sira)`.

Icerik ozeti: SHA-256, sunucuda yeniden hesaplanir (bugunku Arkon kurali). Tarayicida hesap `crypto.subtle` ile; yeni paket yok.

Boyut ve tur siniri:
- Genel ust sinir ve depo toplami `TMIV2_DOSYA_AZAMI_BAYT`, `TMIV2_DOSYA_DEPO_BAYT` (Arkon'un 200 MB / 50 GB karari varsayilan).
- Modul kendi tanimiyla daraltir: malzemeler PDF/PNG/JPEG/WEBP 20 MB; kalibrasyon PDF/gorsel; Arkon "ikili" (tur denetimi yok, cunku icerik ikili dizidir).
- Tur denetimi sunucuda ilk baytlardan (PDF `%PDF-`, PNG, JPEG, WEBP, STEP `ISO-10303-21`); istemcinin bildirdigi MIME'a guvenilmez. Saf fonksiyon, paket yok.
- Asim: 413; kota: 429 (Arkon'daki gibi).

Yetki: yeni rol x islem yok. Indirme, dosyayi baglayan modulun okuma islemiyle denetlenir: kisi, bagli modullerden en az birinin okuma islemini tasimali ve o modul kaydi gorebilmeli (modulun verdigi denetci; is merkezi kapsami varsa o). Yukleme oturum + baglayacak modulun yazma islemi. Bagi olmayan dosyayi yalniz yukleyen indirir.

Denetim kaydi: `dosyaBagla` ve `bagKaldir` denetime ozet, ad, boyut ve turle girer; icerik girmez. Parca yuklemesi govdesiz kalir. Indirme denetime girmez (Arkon tableti cok okur).

Sahipsiz dosya: bagi kalmayan dosya bekleme suresinden sonra silinir (oneri 7 gun). Temizlik yukleme sirasinda firsatla calisir (bugunku "eskiParcalariSil" gibi); zamanlanmis is (#208) gelince ona tasinir.

Yedekleme etkisi: dosyalar veritabanindadir, veritabani yedegi dosyalari da alir (tek yedek, tutarli). Yedek boyutu depo toplami kadar buyur (en cok 50 GB). Kurulumda yedek belgesi bulunamadi (`kurulum/`, `belgeler/` icinde "yedek" ve "pg_dump" yok): yedegin nasil alindigi BILMIYORUM. pg_dump'in bytea sikistirmasi belgeden dogrulanmadi.

Ekran: istemcide ortak yukleme bileseni ayri kart (#82 "Neyi degistirecek"); malzemelerin prototip ekrani degismez, kopru `belge-yukle`/`belge-sil` cekirdek uclarina baglanir.

## 4. Arkon'un deposu nasil tasinir

1. Cekirdek gocu: `dosya`, `dosya_parcasi`, `dosya_bagi` acilir (bos tablolar; onay gerektirmez).
2. Veri gocu: `arkon_dosya` satirlari `dosya` ve `dosya_parcasi`'na kopyalanir (ozet ayni kalir). Baglar `arkon_belge.govde` ve `arkon_kayit.govde` icindeki `$blob` degerlerinden cikarilir (modul `arkon`, kayit `depo/kimlik`). Hicbir belgenin anmadigi dosya `arkon` bagiyla "sahipsiz" isaretlenir, hemen silinmez.
3. Arkon servisi: `eksikDosyalar`, `dosyaParcasi`, `dosya` cekirdek fonksiyonlarini cagirir; belge yazilinca govdedeki `$blob` listesine gore baglar guncellenir. `/arkon/dosyalar/*` yollari ayni kalir; `istemci/src/moduller/arkon/baglanti.ts` ve Arkon ekrani degismez. Kotalar cekirdek ayarina gecer.
4. Dogrulama: Akis A tarayici denemesi (teknik resim, cizim, 3B model) yeni depoyla gecer.
5. Dusurme gocu: `arkon_dosya_parcasi` (gecici veri) ve `arkon_dosya` dusurulur. Dolu tabloyu dusuren goc: ayri onayla.
Etki: Arkon tabletindeki yerel onbellek (IndexedDB "blobs") ozetle anildigi icin gecerli kalir.

## 5. Sorulacak kararlar

DS1. Dosyalar nerede saklansin?
Neden: yedek, tutarlilik ve veritabani boyutu buna bagli.
Secenekler: a) PostgreSQL icinde parcali (Arkon'un bugunku yolu; tek yedek, islemle tutarli) / b) sunucuda klasor (`TMIV2_DOSYA_KLASORU`), veritabaninda yalniz kunye (veritabani kucuk kalir; iki parcali yedek, tutarlilik elle).
Oneri: a.

DS2. Indirme nasil olsun?
Neden: bugun butun dosya tek JSON cevabinda base64 doner; 200 MB dosyada bellek sorunu.
Secenekler: a) `uc` ikili cevap destekler, dosya parcalardan akitilir (kart #82 kabul olcutu) / b) JSON base64, parca parca (`/dosyalar/:ozet/parca/:sira`).
Oneri: a. Arkon icin `/arkon/dosyalar/:ozet` bugunku bicimiyle de kalir; baglanti.ts degismez.

DS3. Yukleme nasil olsun?
Neden: govde siniri 1 MB; base64 yuzde 33 sisirir.
Secenekler: a) JSON parcali kalir (Arkon degismez, cekirdek `uc`'ye dokunmaz) / b) `uc` ikili govde de alir.
Oneri: a.

DS4. Hicbir kaydin anmadigi dosya ne olsun?
Neden: kart #82 acik sorusu; Arkon belge degisince eski dosya sahipsiz kalir.
Secenekler: a) 7 gun sonra silinir / b) hemen silinir / c) hic silinmez (bugunku Arkon).
Oneri: a (cevrimdisi tablet ve geri alma icin pay).

DS5. Sinirlar neler olsun?
Neden: depo tek sunucuda; modullerin ihtiyaci farkli.
Secenekler: a) genel 200 MB / depo 50 GB (Arkon karari), modul kendi tur ve boyut sinirini daraltir (malzemeler 20 MB, PDF ve gorsel) / b) tek genel sinir, modul ayrimi yok.
Oneri: a.

DS6. Indirme yetkisi nasil denetlensin?
Neden: bugun herhangi bir Arkon rolu herhangi bir ozeti okuyabiliyor.
Secenekler: a) dosyayi baglayan modulun okuma islemi ve o modulun veri kapsami / b) oturumu olan herkes, ozeti bilen okur.
Oneri: a. Arkon icin bugunku kural (herhangi bir Arkon rolu) baglamaya kadar kalir, UYUM-BORCU'na yazilir.

DS7. Arkon deposu nasil tasinsin?
Neden: `arkon_dosya` dolu tablo; dusurme geri alinamaz.
Secenekler: a) kopyala, Arkon cekirdegi kullansin, deneme gecince ayri gocle dusur / b) Arkon kendi deposunu tutsun, cekirdek yalniz yeni modullere / c) tek gocte tasi ve dusur.
Oneri: a.

DS8. Yedekleme nasil olsun?
Neden: kurulumda yedek belgesi yok; dosyalar yedegi 50 GB'a kadar buyutur.
Secenekler: a) dosyalar veritabani yedegine girer, ayrica bir sey yok / b) dosyalar ayri ve daha seyrek yedeklenir.
Oneri: a (DS1 a ile).

DS9. Denetim kaydina ne girsin?
Neden: belge ekleme ve kaldirma izlenebilir olmali; indirme cok sik.
Secenekler: a) bagla ve kaldir girer (ozet, ad, boyut, tur), indirme girmez / b) indirme de girer.
Oneri: a.

DS10. Sira ne olsun?
Neden: en cok bekleyen malzemeler; Arkon calisiyor.
Secenekler: a) once cekirdek ve malzemeler belge yukleme, sonra kalibrasyon, en son Arkon tasima / b) once Arkon tasima.
Oneri: a.

## 6. Varsayimlar (geri alma maliyetiyle)

- Satin alma bugun dosya istemiyor; istenirse yalniz bag eklenir (ucuz).
- Finans ve stok ihtiyaci bilinmiyor; tasarim modul eklemeye acik (ucuz).
- Bag tablosu yetkinin ve temizligin tek kaynagi; Arkon govdeden bag cikarir (orta: Arkon servisi degisir, ekran degismez).
- Tur denetimi ilk baytlardan; tanimsiz tur reddedilir (ucuz).
