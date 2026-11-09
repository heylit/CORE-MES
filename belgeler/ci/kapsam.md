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

- Ana dala gönderim: yalnız `.md`, `belgeler/` ve `kurulum/` değiştiyse ağır işler atlanır; başka tek dosya bile varsa her iş koşar.
- Elle koşu (`workflow_dispatch`), gönderimden önceki ucun bilinmediği ya da alınamadığı gönderim, boş fark: her iş koşar.

## Eski koşunun iptali

`concurrency.group`: ana dalda commit sha'sı, başka yerde ref. `cancel-in-progress` yalnız `pull_request` olayında açıktır:
çekme isteğine yeni gönderim eski koşuyu iptal eder. Ana dalda iptal kapalıdır ve her commit kendi grubundadır; kırmızıda
bozan birleşme tek commit'e iner.
