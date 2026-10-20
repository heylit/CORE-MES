# Arkon KD-001 ve KD-002: doğrulama ve düzeltme listesi

Yazım yok; "yaz" denince başlar. Kaynak: /mnt/project-files/denetim/KOD.md.

## KD-001: tablet sayımı sunucu 5xx dönünce kaybolur
DOĞRULANDI (kod): `arkon/web/src/data/store.ts` `Log.add` içinde `catch (e) { if (e.offline) await queue(...) }`. Yalnız ağ yoksa kuyruğa girer; 5xx, 401 ve 4xx yutulur, operatöre ileti çıkmaz. Kayıt yalnız tabletin yerel kopyasında kalır, TMI emrine yazılmaz.
Karşılaştırma: kuyruk boşaltma (`flush`, aynı dosya) 5xx, 401 ve durumsuz hatada öğeyi kuyrukta tutar, 4xx reddinde `arkon-rejected` olayı yayar. Doğrudan yol bu kuralı izlemiyor.
Düzeltme:
1. `Log.add` hatası `flush` ile aynı kuralla ayrılır: ağ yok, durum yok, 401 ya da 5xx ise kuyruğa alınır; 4xx reddinde `arkon-rejected` yayılır (operatör görür). Kural tek yerde, saf fonksiyon (`arkon/web/src/data/` altında), `flush` da onu kullanır.
2. Test: eşitlik testi sunucu `kurallar.test.ts`'te (sınır kuralı d), 5xx/401/ağ yok -> kuyruk, 400/403/409 -> red. Mutasyonla kırmızı gösterilir.
VARSAYIM: sunucu aynı `cid`'i ikinci kez yazmaz (`ON CONFLICT (tur, cid) DO NOTHING`, DOĞRULANDI sorgular.ts), bu yüzden 5xx'te sunucu yazmış olsa bile kuyruktan yeniden gönderim çift sayım yapmaz.
Kapsam dışı (not): `Docs.put/del` 5xx'te hatayı çağırana atar, kuyruğa almaz; yerelde yazılmış belge sonra eşleşmez. İsterseniz aynı turda.

## KD-002: boşta ileti yoklaması bütün paketleri okur
DOĞRULANDI (kod): `sunucu/moduller/arkon/servis.ts` `iletiler()` yeni ileti olmasa da kısıtlı kişide `kapsamSiniri()` (iş merkezi, istasyon, makine okuması) ve `paketleriOnYukle()` koşar; ikincisi `SELECT kimlik, govde->>'machine', govde->>'mc' FROM arkon_belge WHERE depo = 'pkgs'` (sorgular.ts) ile bütün paket gövdelerini açar. İstemci 2 saniyede bir yoklar (`istemci/src/moduller/arkon/baglanti.ts` `ILETI_ARALIGI_MS = 2000`).
VARSAYIM: veritabanı yükü raporda hesaplanan ölçüde; ölçülmedi.
Düzeltme:
1. Yeni ileti yoksa kapsam ve paket okumadan döner (asıl yük).
2. İleti süzgecinde bütün paketler önceden yüklenmez; yalnız iletilerin andığı paketler okunur (tek sorgu, kimlik listesiyle).
3. Test: sorgu sayacıyla boş yoklamada paket ve tesis okuması olmadığı; kapsam dışı ileti yine süzülür. Mutasyonla kırmızı.

## Kart önerisi
Tek yeni kart: "Arkon: tablet sayımı sunucu hatasında kuyruğa alınmıyor; boş ileti yoklaması paket tablosunu okuyor (KD-001, KD-002)". Tam yol (üretim kaydı): denetçi ve dar ikinci tur. İki iş ayrı commit, tek dal.

## Karar (kullanıcı, 09.10.2026)
- Belge yazımı (`Docs.put`/`del`) 5xx'te kuyruğa alınmama durumu bu tura girer, aynı kuralla (a).
