# Başka modül istekleri: markalama

1. cizimler: `istemci/src/moduller/belge-merkezi/disari.ts` `modelOku`, `birak`, `ModelBicimi` dışa açılsın (tek satır; bu teslimin ilk yaması, markalama ile birlikte girer).
2. durus-nedenleri: `GET /hurda-nedenleri` okuma listesine `sayfa.markalama` (UYUM-BORCU 6).
3. cizimler: malzeme belgeleri ve dosya okumasına `sayfa.markalama` ya da rolde `belge-merkezi.oku` (UYUM-BORCU 7).
4. arkon: markalama paneli seriyi `POST /markalama/birimler/markala` ile alsın (UYUM-BORCU 4).
5. Çekirdek: `api`'ye ikili okuma; markalama ve cizimler aynı yardımcıyı ayrı tutuyor.
