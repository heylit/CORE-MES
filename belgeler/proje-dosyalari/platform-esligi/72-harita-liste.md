# Kart #72: harita "sahibi belirsiz" (rol_islemi), yazim oncesi liste

Ana dal 1b74736. Dal: `72-harita-rol-islemi`, guncel ana daldan (#277 dalindan ayri). Goc dosyalarina dokunulmaz.

## Durum (DOGRULANDI)
- `npm run harita` (ana dal): "Sahibi belirsiz tablolar (1): rol_islemi, 20261006011806_yetki_islem_ve_giris.sql, okuyan: kisiler".
- `rol` zaten kisiler'de gorunuyor; belirsiz olan yalniz `rol_islemi`.
- Neden: `araclar/harita.ts` `sahipligiCoz` iki kurala bakiyor: tabloya yazan tek `sorgular.ts` varsa o, yoksa kuran goc modul adi tasiyorsa o. `rol_islemi`'ne hicbir `sorgular.ts` yazmiyor (kisiler yalniz okuyor) ve kuran goc modul adi tasimiyor.
- `rol_islemi`'ne yazan goclerin 7'sinden 6'si `kisiler_` adli (INSERT/UPDATE/DELETE); yedincisi tabloyu kuran adsiz goc.

## Oneri (yaz denirse bu yazilir)
1. Ucuncu kural: sorguda yazan yoksa ve kuran goc modul adi tasimiyorsa, tabloya yazan modul adli goclerin hepsi tek modulun adini tasiyorsa sahip o moduldur. Kaynak etiketi yeni: `goc-yazan`. Iki modulun adli gocu yaziyorsa sahip uydurulmaz, belirsiz kalir.
   Neden genel kural: K2 karari depoda zaten gocun adiyla yazili (rol x islem satirlari `kisiler_` gocleriyle giriyor); arac bunu okur, tablo adini koda gommeye gerek kalmaz.
   Varsayim: ileride baska bir tablo da bu kuralla sahiplenebilir; bugun yalniz `rol_islemi` degisiyor (harita ciktisiyla gosterilir). Geri alma: dusuk (tek kural).
   Alternatif: `araclar/` icinde sabit "karar listesi" (`rol_islemi -> kisiler`, kart #72). Daha dar ama karar koda gomulur, gerekcesi yeni tabloda tekrar yazilmak zorunda kalir.
2. Testler (`araclar/harita.test.ts`): izinli (yalniz bir modulun adli gocu yaziyor, sahip o) ve reddedilen (iki modulun adli gocu yaziyor, belirsiz kalir).
3. `araclar/NOTLAR.md` "Harita (onay bekliyor)" satiri ucuncu kurali ve K2'yi anacak sekilde guncellenir.

## Dokunulacak
`araclar/harita.ts`, `araclar/harita.test.ts`, `araclar/NOTLAR.md`. Dokunulmaz: `sunucu/gocler`, moduller, `package.json`, `.github`.

## Dogrulama
`npm run harita` (belirsiz listesi bos), `tip`, `lint`, `sinir`, araclar testleri; PR'da `kontrol`. Windows'ta dogrulanmadi (davranis platformdan bagimsiz, yine de yazilir).
