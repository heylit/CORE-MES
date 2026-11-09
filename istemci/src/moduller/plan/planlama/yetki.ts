import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from '../planlama-menusu.ts';

// Ekranın yetkisi oturumun işlemlerinden kurulur. Ekran yalnız gizler; denetim uçtadır.
// Sayfanın kendi rol modeli ortak matrise 223 a ile eşlenir: veri.yaz kalkar (veri sahibinden girer, 222 a); plan.yaz ve sayfa içi plan.kilitle
// ortak plan.yaz'dır; plan.canliya-al ortak plan.canliya-al; fiyat ve maliyet görünümü finans.maliyet-oku.
export interface PlanlamaYetkisi {
  planlamaOku: boolean;
  maliyetOku: boolean;
  planYaz: boolean;
  planStudyo: boolean;
  planCanliyaAl: boolean;
  // Çalışmayı (tercih, ağırlık, karar, sayfa içi kilit) değiştirebilir: yalnız ortak plan.yaz (925 a).
  calismaYazabilir: boolean;
}

export function yetkiKur(islemler: readonly string[]): PlanlamaYetkisi {
  const var_ = (i: string): boolean => islemler.includes(i);
  return {
    planlamaOku: var_(PLANLAMA_ISLEMI),
    maliyetOku: var_(MALIYET_ISLEMI),
    planYaz: var_('plan.yaz'),
    planStudyo: var_('plan.studyo'),
    planCanliyaAl: var_('plan.canliya-al'),
    calismaYazabilir: var_('plan.yaz'),
  };
}
