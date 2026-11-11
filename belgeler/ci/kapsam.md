# CI kapsam süzgeci ve eski koşunun iptali (2640 c)

Kod: `araclar/ci-kapsam.sh` (karar), `.github/workflows/kontrol.yml` `kapsam` işi (fark), `araclar/ci-kapsam.test.ts` (eşleme denemesi).
Değişen dosya listesi `git diff --name-only --no-renames` ile alınır (taşımada eski ve yeni yol birlikte gelir); paket yoktur. Süzgeç `kapsam` işinin içindedir, `on.paths`'e taşınmaz:
dal koruması `kontrol` işini bekler, yol süzgeciyle hiç açılmayan koşu birleşmeyi kilitler.

Süzgeç yalnız üç ağır işi daraltır: `sunucu-test` (Windows işi de buna bağlı), `istemci-test`, `ekran`. `tip`, `denetim`, `lint`
ve `kontrol` her koşuda koşar.

## Eşleme (çekme isteği; yukarıdan aşağı ilk eşleşen satır geçerlidir)

| Değişen yol | sunucu | istemci | ekran |
|---|---|---|---|
| `belgeler/`, `kurulum/` | - | - | - |
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

## Daraltılmayan durumlar

- Ana dala gönderim: her iş koşar, yalnız belge değişse de. Önceki birleşmenin ağır işleri iptal edilmiş olabilir; onların testlerini bu koşu taşır (2705 a).
- Elle koşu (`workflow_dispatch`) ve boş fark: her iş koşar.

## Eski koşunun iptali

- Çekme isteği: koşunun tamamı iptal edilir. `concurrency.group` ref'tir; `cancel-in-progress` yalnız `pull_request` olayında açıktır.
- Ana dal (2705 a): koşu bütünüyle iptal edilmez. Koşu düzeyindeki grup commit sha'sıdır. `kapsam`, `tip`, `denetim` (göç damgası dahil), `lint` ve `kontrol` her birleşmede koşar.
- Ağır işler (`istemci-test`, `sunucu-test`, `ekran`, `windows`) iş düzeyinde `kontrol-<iş>-<parça>-refs/heads/main` grubundadır. Yeni birleşme bu işlerin eski koşusunu iptal eder; matris parçaları birbirini iptal etmez.
- İptal edilen ağır işi olan koşuda `kontrol` kırmızıdır ve "testleri sonraki koşuda" iletisini yazar. O commit'in sonucu ana daldaki sonraki koşudur.
- Bedel: ana dal kırmızıya dönerse bozan birleşme, son yeşil koşudan bu yana birleşenlerin arasındadır; tek commit'e inmez. Birleştirici her birleşmeden sonra değil, son koşuya bakar.
- Elle koşuda grup koşuya özgüdür ve hiçbir şey iptal edilmez.
- Ana dalda yalnız son koşu yeniden koşulur. Eski bir koşunun yeniden denenmesi de push olayıdır ve aynı gruba girer; yeni koşunun ağır işlerini iptal eder. Eski commit'i denemek gerekiyorsa elle koşu (`workflow_dispatch`) kullanılır.

## Windows yeşili etiketi (2964)

- Ana dalda (gönderim ya da elle koşu) `windows` ve `kontrol` işleri yeşil biterse `windows-yesil` işi o commit'e kalıcı etiket koyar: `windows-yesil/<commit zamanı UTC, YYYYAAGG-SSDD>-<sha ilk 8>`. Etiket açıklamasında koşunun bağlantısı vardır.
- İptal edilen ya da kırmızı koşuda iş atlanır, etiket konmaz. Etiketi olmayan commit "Windows yeşili değil ya da koşusu iptal edildi" demektir; onun testleri sonraki koşudadır.
- Etiket commit başına ayrıdır ve taşınmaz: zorla gönderme ya da silme yoktur. Aynı commit'in yeniden koşusu ikinci etiket açmaz.
- Son Windows yeşili: `git fetch --tags && git describe --tags --abbrev=0 --first-parent --match 'windows-yesil/*' origin/main`. Hepsi: `git tag -l 'windows-yesil/*'` (ad sırası zaman sırasıdır). Canlı ve güncelleme paketi yalnız etiketli commit'ten çıkar.
- Dosyanın üst düzey yetkisi yalnız okumadır (`contents: read`, `pull-requests: read`); yazma (`contents: write`) yalnız bu iştedir.
