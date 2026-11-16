# CI kapsam süzgeci ve eski koşunun iptali (2640 c)

Kod: `araclar/ci-kapsam.sh` (karar), `.github/workflows/kontrol.yml` `kapsam` işi (fark), `araclar/ci-kapsam.test.ts` (eşleme denemesi).
Değişen dosya listesi `git diff --name-only --no-renames` ile alınır (taşımada eski ve yeni yol birlikte gelir); paket yoktur. Süzgeç `kapsam` işinin içindedir, `on.paths`'e taşınmaz:
dal koruması `kontrol` işini bekler, yol süzgeciyle hiç açılmayan koşu birleşmeyi kilitler.

Süzgeç yalnız üç ağır işi daraltır: `sunucu-test` (Windows işi de buna bağlı), `istemci-test`, `ekran`; dosya düzeyindeki
seçim aşağıdaki "Dosya seçimi ve parça planı" bölümündedir. `tip`, `denetim`, `lint`
ve `kontrol` her koşuda koşar.

## Eşleme (çekme isteği; yukarıdan aşağı ilk eşleşen satır geçerlidir)

| Değişen yol | sunucu | istemci | ekran |
|---|---|---|---|
| `CLAUDE.md`, `kurulum/*.md` (kural metni boyu testle denetlenir) | evet | - | - |
| `belgeler/`, `kurulum/` (geri kalan) | - | - | - |
| `paylasilan/`, `istemci/src/ortak/`, `sunucu/cekirdek/`, `package.json`, `package-lock.json`, `.github/`, `araclar/` | evet | evet | evet |
| `sunucu/gocler/` | evet | - | evet |
| `ekran-testleri/benzetim/` (test robotu, ADR 0019) | evet | - | - |
| `ekran-testleri/` (geri kalan) | - | - | evet |
| `sunucu/` (geri kalan) | evet | - | evet |
| `arkon/` | evet | evet | evet |
| `istemci/` (sunucunun ithal ettiği klasör) | evet | evet | evet |
| `istemci/` (geri kalan) | - | evet | evet |
| bilinmeyen klasör | evet | evet | evet |
| kökteki `.md` | - | - | - |
| kökteki başka dosya | evet | evet | evet |

Bir değişiklikteki satırların birleşimi koşar. Modül klasöründeki `.md` o klasörün satırına düşer, testleri koşturur.
"Sunucunun ithal ettiği klasör" listesi her koşuda koddan okunur: `sunucu`, `araclar` ve `paylasilan` altındaki `.ts`
dosyalarında `../istemci/src/...` ithali geçen her dosyanın klasörü. Elle liste tutulmaz.

## Dosya seçimi ve parça planı (3310 a)

Kod: `araclar/ci-plan.ts` (`kapsam` işinin `plan` adımı), denemesi `araclar/ci-plan.test.ts`. Yukarıdaki tablo hangi işin açılacağını
söyler; plan, açılan işin hangi dosyaları koşacağını ve kaç parçaya bölüneceğini söyler. Plan `ci-plan` eseri olarak yüklenir;
her parça kendi listesini (`ci-plan/<iş>-<parça>.txt`) indirir. Matris plandan gelir (`<iş>_matris`); seçilen dosya kalmayan iş atlanır.

- Çekme isteği: değişen dosyalardan ithal grafiğinde geriye yürünür (`araclar/etki.ts`, kablolama bağları dahil); yalnız ulaşılan
  sunucu ve istemci testleri koşar. Windows'ta bunların Windows kümesindeki kesişimi koşar. Ekran: değişen ekran testi, etkilenen
  modülün sayfasını açan test (`ac('/<modül>/...')`) ve modüle bağlanamayan test (sayfayı değişkenle açan, modül klasörü olmayan
  yolu açan) koşar. Grafiğin bilmediği değişiklik (paket, yapılandırma, `arkon/`), ekranın ortak dosyası ya da modül dışı istemci
  dosyası etkilenirse ilgili işte bütün dosyalar koşar.
- `.js` betiği (`sunucu/`, `istemci/`, `paylasilan/`, `arkon/` altında; plan motoru gibi dosya okunarak birleştirilen): her iş bütün
  dosyalarını koşar, çünkü okuyanı ithal grafiğinde görünmez. `arkon/` değişikliği de öyle: Arkon testleri `arkon/web/src`
  dosyalarını değişkenle kurulan yoldan ithal eder.
- Göç (`sunucu/gocler/`) bütün şemayı değiştirir: bütün sunucu ve Windows testleri koşar (kısıt listesi gibi şema çapındaki
  denetimler göçü adıyla anmaz). Her sunucu testine `--import` ile giren ön yüklemeye (`araclar/ortam-yukle-goc.ts`,
  `araclar/kablolama-yukle.ts` ve ithal ettikleri; `sunucu/kablolama.ts` üzerinden geçen yol sayılmaz, onu kablolama bağları taşır)
  ulaşan değişiklikte de bütün sunucu ve Windows testleri koşar. Grafikte olmayan başka değişen dosya (kural metni gibi) onu yoluyla
  ya da adıyla anan testi seçer; klasörü `new URL('./<klasör>/', import.meta.url)` ile tarayan test o klasördeki her değişiklikte seçilir.
- Görmediği bağlar: uç üzerinden HTTP çağrısı, SQL ile başka tabloya bakış, dizgeyle kurulan ithal. Bunların kırığı çekme isteğinde
  değil ana dal koşusunda görünür; canlı paket yalnız `windows-yesil` etiketli commit'ten çıktığı için canlıya geçmez.
- Ana dal ve elle koşu: her dosya koşar.
- Bölme: ölçülmüş dosya süresiyle, en uzun dosya en hafif parçaya (LPT); eşitlikte ad sırası, plan her makinede aynıdır. Süreler
  ana dal koşularında ölçülür (sunucu ve Windows: `araclar/test-rapor-github.ts`, ekran: playwright json raporu) ve `sureler`
  işi önbelleğe (`ci-sureler-<koşu>`) yazar; plan en yenisini alır. Ölçüsü olmayan dosya bilinenlerin ortancasıdır; hiç ölçü yoksa
  sayıyla bölünür. İstemci süresi ölçülmez (iş kısa), sayıyla bölünür. Parça sayısının üst sınırı `PARCA`'dadır.

## Daraltılmayan durumlar

- Ana dala gönderim: her iş koşar, yalnız belge değişse de. Önceki birleşmenin ağır işleri atlanmış olabilir; onların testlerini bu koşu taşır (2705 a, 3045 a).
- Elle koşu (`workflow_dispatch`) ve boş fark: her iş koşar.

## Eski koşunun iptali

- Çekme isteği: koşunun tamamı iptal edilir. `concurrency.group` ref'tir; `cancel-in-progress` yalnız `pull_request` olayında açıktır.
- Ana dal (3045 a): hiçbir koşu ve hiçbir iş iptal edilmez. Koşu düzeyindeki grup commit sha'sıdır; iş düzeyinde iptal grubu yoktur. `kapsam`, `tip`, `denetim` (göç damgası dahil), `lint` ve `kontrol` her birleşmede koşar.
- Linux'taki ağır işler (`istemci-test`, `sunucu-test`, `ekran`): `kapsam` koşu açılırken `git ls-remote` ile ana dalın ucuna bakar. Uç bu commit değilse (arkadan birleşme geldiyse) `eski=true` verir ve ağır işler atlanır. Karar açılış anındadır: yeni koşu, ondan da yeni bir birleşme yoksa atlanmaz; eski koşu ucu göremezse iki koşu da tam koşar. İş düzeyindeki iptal grubu kaldırıldı, çünkü sırayı commit'e göre değil gruba giriş anına göre kuruyordu; aynı anda açılan eski koşu yeniyi iptal edebiliyordu (11.11, cfa82dcb).
- `windows` (3018 a) en çok dört parçalıdır ve iptal edilmez: her ana dal commit'inin kendi Windows sonucu vardır. Dosyalar plandan gelir; her parça node'a verdiği dosya listesini günlüğe yazar ve yalnız testleri yeşil bitince yükler; `windows-butunluk` her parçanın listesini arar, birleşimini planla, ana dalda ayrıca aynı desenlerin bulduğu tam kümeyle karşılaştırır (eksik, fazla ya da iki parçada koşan dosya kırmızı). Etiket `windows-butunluk` yeşilken konur. Kırmızı Windows'ta bozan birleşme, son yeşilden sonraki ilk kırmızı koşunun commit'idir; aynı kırmızı parçayı yerelde koşmak için o parçanın günlüğündeki dosya listesi kullanılır.
- Ağır işleri ana dal ilerlediği için atlanan (ya da elle iptal edilen) koşuda `kontrol` kırmızıdır ve "testleri sonraki koşuda" iletisini yazar. O commit'in sonucu ana daldaki sonraki koşudur.
- Bedel: ana dal kırmızıya dönerse bozan birleşme, son yeşil koşudan bu yana birleşenlerin arasındadır; tek commit'e inmez. Birleştirici her birleşmeden sonra değil, son koşuya bakar.
- Elle koşuda grup koşuya özgüdür ve hiçbir şey iptal edilmez.
- Ana dalda yalnız son koşu yeniden koşulur. Eski bir koşu yeniden denenirse `kapsam` ana dalı ilerlemiş bulur ve ağır işleri atlar; yeni koşuya dokunmaz. Eski commit'i denemek gerekiyorsa elle koşu (`workflow_dispatch`) kullanılır.

## Windows yeşili etiketi (2964)

- Ana dalda (gönderim ya da elle koşu) `windows`, `windows-butunluk` ve `kontrol` işleri yeşil biterse `windows-yesil` işi o commit'e kalıcı etiket koyar: `windows-yesil/<commit zamanı UTC, YYYYAAGG-SSDD>-<sha ilk 8>`. Etiket açıklamasında koşunun bağlantısı vardır.
- İptal edilen ya da kırmızı koşuda iş atlanır, etiket konmaz. Etiketi olmayan commit "Windows yeşili değil ya da koşusu iptal edildi" demektir; onun testleri sonraki koşudadır.
- Etiket commit başına ayrıdır ve taşınmaz: zorla gönderme ya da silme yoktur. Aynı commit'in yeniden koşusu ikinci etiket açmaz.
- Son Windows yeşili: `git fetch --tags && git describe --tags --abbrev=0 --first-parent --match 'windows-yesil/*' origin/main`. Hepsi: `git tag -l 'windows-yesil/*'` (ad sırası zaman sırasıdır). Canlı ve güncelleme paketi yalnız etiketli commit'ten çıkar.
- Dosyanın üst düzey yetkisi yalnız okumadır (`contents: read`, `pull-requests: read`); yazma (`contents: write`) yalnız bu iştedir.
