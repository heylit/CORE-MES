// Talimat adımının aşaması (2098-1 a): üretim öncesi hazırlık başka iş sürerken, hazırlık ayarda, üretim işin kendisidir; bitiş (3338-4 a) iş bitince yapılır. Eski adımlar üretimdir.
// Ayrı dosyadadır: rota ve uretim-emirleri sözleşmeleri birbirini ithal ettiğinden ortak sabit ikisinin dışında durur.
export const TALIMAT_ASAMALARI = ['on_hazirlik', 'hazirlik', 'uretim', 'bitis'] as const;
export const VARSAYILAN_TALIMAT_ASAMASI = 'uretim';
export type TalimatAsamasi = (typeof TALIMAT_ASAMALARI)[number];
