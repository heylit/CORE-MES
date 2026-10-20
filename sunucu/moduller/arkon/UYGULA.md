# UYGULA: Arkon dalını denemek

1. `npm ci`, `npm run goc` (yeni göç yok; bu turda şema değişmedi).
2. Sunucu testleri (`test:modul` Linux'ta 0 test koşuyor, bkz. CEKIRDEK-ISTEKLERI 4):
   `node --import ./araclar/ortam-yukle-goc.ts --test "sunucu/moduller/arkon/**/*.test.ts"`
3. İstemci: `npx vitest run --config istemci/vite.config.ts src/moduller/arkon/`
4. `npm run tip`, `npm run lint`, `npm run sinir -- --modul arkon`, `npm run derle:arkon`
5. Elle: yönetici ile Arkon ikinci menüsü > Takip > "TMI'ye yazılamayanlar". Hazırlıkta planlı bir emrin paketine
   önce sayım, sonra başlat kaydı gönderin; listede sayım "Bekliyor" görünür, başlat gelince listeden düşer.
6. Rol dağılımı (sayfa.arkon, arkon.*) çekirdeğin R1 işiyle gelir. O birleşmeden önce akış A yalnız yöneticiyle koşulur.
