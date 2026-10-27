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
