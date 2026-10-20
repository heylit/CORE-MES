/* Kayıtlı çizimi yönetici ve hazırlık siler (sunucu/moduller/arkon/kurallar.ts DEPO_SILICILERI.draws). Planlamacı stüdyoyu kullanır ama
   silemez (124 a yalnız page.draw verdi); silemeyen role Sil düğmesi gösterilmez. Liste sunucudakiyle aynı tutulur (kurallar.test.ts). */
const SILENLER: readonly string[] = ['admin', 'prep'];

export const cizimSilinir = (rol: string | null | undefined): boolean => !rol || SILENLER.includes(rol);
