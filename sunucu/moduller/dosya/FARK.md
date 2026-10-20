# FARK: dosya (kart #82, dal 82-dosya-saklama; yazan çekirdek konusu)

## Eklenen
- Yeni modül `sunucu/moduller/dosya` ve göç `20261008113000_dosya_tablolar.sql` (beş boş tablo; dolu tablo değişmez).
- Uçlar: `POST /dosyalar/eksikler`, `POST /dosyalar/:ozet/parca` (gövdesiz denetim, DS9 a), `GET /dosyalar/:ozet` (kendi bağsız dosyası).
- `disari.ts`: `dosyaTutamagi(modul)` (`dosyaBagla`, `bagKaldir`, `bagliDosyalar`, `dosyaAkisi`; modül adı tutamakta sabit, #144),
  `eksikDosyalar`, `denetimSatiri`. Serbest `modul` alan eski ihraçlar kalktı.

## Yazım listesinden fark
- Sınırlar ortam değişkeni (`TMIV2_DOSYA_*`) değil `kurallar.ts` sabitidir: modüller ayarı almaz (NOTLAR.md). Değerler aynı.
- İçerik okuma transaction'ında değil, transaction bittikten sonra akar (ADR 0009).
- ADR numarası 0009 (0007 ve 0008 doluydu).
- `sahipsizMi` saf işlevi yazılmadı; süre SQL'de `SAHIPSIZ_GUN` sabitiyle uygulanır.
- Listede olmayan sütun ve tablo: `dosya.bagsiz_zaman` (7 günlük sayım bağ kalkınca başlar, ilk yüklemeden değil) ve `dosya_yukleyeni`
  (bağlama yetkisi; denetçi bulgusu, kullanıcı kararı DSb a).
- Listede `cevap: 'ikili'` ve `parcalar` diye geçen yapı kodda `ikiliCevap` şeması ve `akis` işlevidir.
- Listede "akış süre sınırına takılırsa yazar durur" deniyordu; akış transaction dışına alındı (ADR 0009), durulmadı.
- Uygulama rolüne ayrı yetki satırı yazılmadı: göçlerde GRANT yok, varsayılan yetkiler yeni tablolara geçer.
- Kişi başına bağsız dosya sınırı (2 GiB) ve bütün şerit bayatlığı denetçi bulgusuyla eklendi; listede yoktu.
- Temizlik yüklemede değil zamanlanmış işte (`isler.ts`, `dosya-temizlik`, saatte bir) koşar (#142, UYUM-BORCU madde 1). Süreler ve
  sorgu başına sınır aynı; bir tur her silme sorgusunu en çok `TEMIZLIK_TUR_SORGUSU` kez yineler.
- UYUM-BORCU madde 4 kullanıcının DSb a kararıyla verdiği borç satırıdır (b seçeneği ve Arkon deposunun taşınması).
