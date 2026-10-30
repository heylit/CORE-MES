# Kural -> test (kaynak-izi)

Testler: `kurallar.test.ts` (saf), `kaynak-izi.test.ts` (gerçek PostgreSQL), `istemci/src/moduller/kaynak-izi/Kaynak360.test.tsx`. Kısıt yok (modülün tablosu yok).

| Kural | Test |
|---|---|
| KI-1 (1322 a) Bölüm sahibinin okuma işlemlerinden biriyle görünür; görünmeyenin sorgusu atılmaz | `KI-1 ...`; `KI-U3 ...`; `KI-U4 ...`; ekran `1322 a: yetkisiz bölüm gizlidir` |
| KI-2 Arama kodda ya da adda, Türkçe harf duyarsız; kodu tam tutan, aktif, tür, ad sırası | `KI-2 ...`; `KI-U2 ...` |
| KI-3 OEE penceresi bugün dahil son yedi gün | `KI-3 ...` |
| KI-U1 Uçlar sayfa işlemiyle açılır; olmayan kaynak 404 | `KI-U1 ...` |
| KI-U5 Veri yoksa null ya da boş liste; sıfır uydurulmaz | `KI-U5 ...`; ekran `istasyon: ... veri yoksa çizgi` |
