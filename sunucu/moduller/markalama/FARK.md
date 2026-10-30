# FARK: markalama (kart #806, dal 806-markalama)

Taban: `main` 11b9d00. Yeni modül; depoda önceki hali yok. Göç `20261027070000_markalama_tablolar.sql` (yalnız yeni tablolar, dolu tabloya dokunmaz).

## Eklenen
- Tablolar: `markalama_tanimi`, `markalama_alani`, `markalama_sayaci`, `markalama_birimi`, `markalama_birim_olayi` (olay defteri yalnız eklenir).
- Sözleşme `paylasilan/sozlesme/markalama.ts`; işlemler `markalama.tanim-yaz`, `markalama.seri-ver`, `markalama.durum-yaz`; sayfa `sayfa.markalama` ve ikinci menü (tanımlar, istasyon, seri izleme).
- Sunucu: `kurallar.ts` (MRK-01..05, saf), `sorgular.ts`, `servis.ts` (MRK-06..08), `uclar.ts` (12 uç). `disari.ts` yok: başka modüle bir şey vermiyor.
- İstemci `istemci/src/moduller/markalama/`: tanım düzenleyici ve 3B yer seçimi (`/markalama`), istasyon (`/markalama/istasyon`), seri izleme (`/markalama/izleme`).
- Toplayıcı satırları (`paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`) ayrı commit'te.

## Başka modüle dokunan
- `istemci/src/moduller/cizimler/disari.ts`: `modelOku`, `birak`, `ModelBicimi` dışa açıldı (ayrı dal `806-cizimler-disari`, tek satır; bu yamadan önce birleşir).
- `paylasilan/islem-adlari.ts`: üç işlem adı ve modül adı; #811 birleşince ayrı küçük yama (DEVIR'de sıra).

## Onaylı kararlar (kullanıcı, 27.10.2026, beşi öneriyle)
1a ayrı modül; 2a seri sunucuda sayaçtan, tekil kısıt, sayaç malzeme başına (kapsam malzeme / emir / yıl); 3a seri markalamada doğar;
4a birim durumu (sağlam, red, rework, hurda) bu modülde, KM NCR bağı Aşama 2; 5a tanım rota adımına (malzeme + op no) bağlı, 3B yer Çizim Merkezi model revizyonuna bağlı.

## Kart 1295: yazı derinliği, yazı tipi, ondalık giriş
- Göç `20261029147000_markalama_yazi_derinligi_tipi.sql`: `markalama_alani`'na boş olabilen `yazi_derinligi_mm` (0-10 mm) ve `yazi_tipi` (liste) eklenir; var olan satır değişmez.
- Yükseklik ve derinlik ayrı ölçüdür, ikisi de boş olabilir. Boş yazı tipi makinenin varsayılanıdır.
- Ekran ölçü kutularında yazılan metni tutar (0,5 girilebilir); kayıt öncesi hata markanın sırası ve alan adıyla gösterilir. Op no ve ölçülerin
  sunucu iletisi alan adını taşır. İstasyon markanın yazı ölçülerini gösterir.
- VARSAYIM: yazı tipi listesi (gotik, ISO 3098, tek çizgi, nokta matris 5x7, OCR-A, OCR-B, DIN 1451) savunma ve havacılık çizimlerinde sık istenen
  biçimlerdir; standartlardan doğrulanmadı. Yükseklik ve derinlik için standart sınırı eklenmedi (doğrulanmadı); sınırlar yalnız akla yatkınlık içindir.
