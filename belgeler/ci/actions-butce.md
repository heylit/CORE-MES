# GitHub Actions bütçesi: ölçüm ve öneri (2026-10-16)

Kaynak: `gh api repos/heylit/TMICOREV2/actions/runs` (gün gün, page=) ve her koşunun `jobs` listesi; 2.096 koşu, 10-16 Ekim.
Faturalanan dakika = her işin süresi dakikaya yukarı yuvarlanarak toplandı (GitHub özel depoda işi tek tek yuvarlar).
Bu bir tahmindir: fatura sayfası bu oturumdan okunamadı (`users/heylit/settings/billing/*` 403, oturum yalnız depo uçlarına bağlı). DOĞRULANDI değil, VARSAYIM.

## 1. Günlük toplam (faturalanan dk, tahmini)

| Gün | Koşu | Dk | PR | main push | PR iptal | Kırmızı |
|---|---|---|---|---|---|---|
| 10 Eki | 141 | 1.242 | 775 | 380 | 87 | 0 |
| 11 Eki | 325 | 3.191 | 2.184 | 717 | 170 | 120 |
| 12 Eki | 402 | 4.975 | 3.689 | 625 | 416 | 245 |
| 13 Eki | 361 | 5.560 | 3.915 | 1.071 | 439 | 135 |
| 14 Eki | 379 | 10.378 | 5.363 | 3.812 | 727 | 476 |
| 15 Eki | 215 | 6.985 | 3.551 | 3.210 | 224 | 0 |
| 16 Eki (07:15'e kadar) | 133 + 107 başlamayan | 4.661 | 2.372 | 1.887 | 302 | 100 |

Toplam 7 günde ~37.000 dk. 16 Ekim 02:34-05:13 arası 107 koşu `startup_failure` ile hiç başlamadı (iş yok, dakika yok).
Nedeni API'den okunamadı; VARSAYIM: harcama sınırı doldu, sonra sınır yükseltildi.

## 2. Neden arttı

1. Koşu başına dakika üç katına çıktı (DOĞRULANDI, başarılı koşuların ortalaması): 10 Eki 9,2 dk; 13 Eki 16,8; 14 Eki 28,7; 15 Eki 32,7; 16 Eki 35,2.
   Neden: #1219/#1220 ile tek iş 10 paralel işe bölündü. Duvar süresi 21 dk'dan ~5 dk'ya indi ama her iş ayrı makinede
   `npm ci` + kurulum (~0,5-0,8 dk) yapıyor ve her iş ayrı ayrı dakikaya yuvarlanıyor. #1521 ile `ekran` (5,4 dk) eklendi, şimdilik 8 koşuda görüldü; her koşuya eklenecek.
2. Ana dala her birleşme tam koşu başlatıyor (DOĞRULANDI): 15 Eki 00:00'dan beri 152 main koşusu, 5.097 dk. 15 Ekim'de toplamın %46'sı.
   Concurrency main için her commit'e ayrı grup açıyor, hiçbiri iptal edilmiyor (`kontrol.yml`: `group: kontrol-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}`).
3. PR başına koşu az (ortalama 2,2 koşu/dal); aynı dala art arda push zaten iptal ediliyor, iptal edilen koşuların payı %6.
4. Yalnız belge değiştiren PR'ların payı küçük: ~340 dk, %1.

İş başına (15-16 Eki başarılı koşular, faturalanan / gerçek dk):
tip 2,0/1,4 · denetim 2,9/2,5 · istemci-test 1: 3,7/3,3, 2: 4,5/4,1 · sunucu-test 1-4: 4,7-5,5/4,2-5,0 · ekran 5,4/4,7 · kontrol (toplayıcı) 1,0/0,1. Toplam ~38 dk/koşu (ekranla).

## 3. Seçenekler (15 Ekim günü, 6.985 dk üzerinden tahmini tasarruf)

| # | Seçenek | Tasarruf | Bedel |
|---|---|---|---|
| A | main koşularında `cancel-in-progress`: üst üste birleşmede yalnız sonuncu koşar | 6 dk içinde gelen birleşmeler iptal: 15-16 Eki main dakikasının ~%70'i; günde ~2.000-2.300 dk (~%30) | Kırmızı olunca suçlu birleşme tek değil, son yeşilden bu yana birleşenler arasında; Birleştirici "her birleşmeden sonra izle" yerine "son koşuyu izle" der. Tek satır, paket yok. |
| B | Kapsama göre atla: yalnız istemci değişen PR'da sunucu-test, yalnız sunucu değişende istemci-test koşmaz; `kontrol` "atlandı"yı yeşil sayar | PR dakikasının ~%16'sı, günde ~600 dk (~%9) | Yanlış sınıflama hata kaçırabilir (main koşusu yakalar); kontrol.yml'de değişiklik işi + toplayıcı mantığı; paket gerekmez (git diff) |
| C | İşleri birleştir: tip+denetim tek iş, istemci tek parça, sunucu 2 parça | koşu başına ~38'den ~34 dk, ~%12 | Duvar süresi ~5'ten ~9 dk'ya çıkar |
| D | Yalnız belge değişince ağır işleri atla (main'de zaten var) | ~%1 | Değmez |
| E | Kendi makinede koşturucu (self-hosted) | dakika ücreti sıfır | Sürekli açık makine, yönetici yetkisi ve güvenlik işi gerekir; bugün yok |

Merge queue bu depoda yok (VARSAYIM: kişisel hesabın özel deposunda sunulmuyor, doğrulanmadı).
Fiyat: Linux 2 çekirdek dakikası ~0,006-0,008 USD (doğrulanmadı); 7.000 dk/gün ≈ 40-55 USD/gün.

## 4. Öneri

Önce A (tek satır, en büyük kazanç). Sonra istenirse B. Birlikte günde ~%40 (15 Ekim ölçeğinde ~7.000'den ~4.100 dk'ya).
Asıl çarpan birleşme sayısıdır (31 saatte 152 birleşme); A bunu doğrudan hedefler.

A için değişiklik (`.github/workflows/kontrol.yml`):

```yaml
concurrency:
  group: kontrol-${{ github.ref }}
  cancel-in-progress: true
```

PR'larda davranış aynı kalır (grup yine PR ref'i); main'de yeni birleşme eski koşuyu iptal eder.
