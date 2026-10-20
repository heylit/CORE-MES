# Kart #44 icin yorum metni (DS8)

Asagidaki metin #44'e yorum olarak eklenecek; yorum yazilmadi.

---

Dosya saklama karari (kart #82, DS8 a, 2026-10-08): dosyalar (malzeme belgeleri, kalibrasyon sertifikalari, Arkon teknik resim, 3B model ve turevleri) PostgreSQL icinde saklanir ve veritabani yedegine girer; ayri dosya yedegi yoktur.

Yedege etkisi:
- Depo toplami en cok 50 GB (`TMIV2_DOSYA_DEPO_BAYT`, Arkon'daki onayli kota). Veritabani yedegi buna kadar buyuyebilir; bugunku tablolarin boyutu bunun yaninda kucuktur (VARSAYIM, olculmedi).
- Onceki karar (07.10.2026): yedek ayni makinede ayri diske, gecelik. Yedek diski en az birkac kusak tam yedek tasimali: tutulacak gece sayisi x (veritabani boyutu, en cok yaklasik 50 GB). Ornek: 7 kusak icin yaklasik 350 GB (VARSAYIM: sikistirmasiz ust sinir; PDF ve gorsel az sikisir, STEP metni iyi sikisir; pg_dump sikistirma orani belgeden ya da denemeden dogrulanmadi).
- Yedek suresi dosya boyutuyla buyur. Gecelik yedek 50 GB'ta Arkon ve uretimin calismadigi saate sigmali; sure kurulum makinesinde denenerek olculmeli (BILMIYORUM: makine ve disk hizi).
- Geri yukleme suresi de ayni oranda uzar; canli oncesi bir kez tam geri yukleme denenmeli.

Kurulumda karar verilecekler:
1. Kac gece yedek tutulacak ve yedek diskinin boyutu.
2. Yedek bicimi ve araci (pg_dump tam yedek ya da surekli arsiv); yeni arac gerekiyorsa onayla.
3. Yedek saati ve 50 GB'ta olculen sure.
4. Gecelik tam yedek uzarsa dosyalar icin ayri, daha seyrek yedek (DS8 b) yeniden tartilir.
