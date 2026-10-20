# Uygula (plan, taban c2c9871)

1. Önce rota teslimi (teslim-rota-c2c9871.zip) ve BASKA-MODUL-ISTEKLERI'ndeki uretim-emirleri fonksiyonları; CEKIRDEK-ISTEKLERI 1-2.
2. Kopyala: `sunucu/gocler/20261008100000_plan_tablolar.sql`, `sunucu/moduller/plan/*`, `paylasilan/sozlesme/plan.ts`, `paylasilan/islemler/plan.ts`.
   Plan ekranları rota istemcisindedir (P2); bu teslimle birlikte güncel rota zipi verildi (PlanEkrani, KanbanEkrani, PlanStudyosuEkrani,
   `beklenen/plan.ts` kaldırıldı).
3. Rol x işlem göçü kullanıcı onayıyla (CEKIRDEK-ISTEKLERI 3).
4. Koş: `npm run tip`, `npm run lint`, `npm run sinir -- --modul plan`,
   `node --import ./araclar/ortam-yukle-goc.ts --test "sunucu/moduller/plan/**/*.test.ts"`, `CI=true npm run kontrol`.
