import type { BenCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from '../planlama-menusu.ts';

// Ekranın yetkisi oturumun işlemlerinden ve /recete-rota/ben'den kurulur. Ekran yalnız gizler; denetim uçtadır.
// Sayfanın kendi rol modeli ortak matrise 223 a ile eşlenir: veri.yaz kalkar (veri sahibinden girer, 222 a); plan.yaz ve sayfa içi plan.kilitle
// ortak plan.yaz'dır; plan.canliya-al ortak plan.canliya-al; fiyat ve maliyet görünümü finans.maliyet-oku.
export interface PlanlamaYetkisi {
  planlamaOku: boolean;
  maliyetOku: boolean;
  planYaz: boolean;
  // Sunucudaki iş emri kilidi uçları (/plan/is-emirleri/:id/kilitle); sayfa içi kilit değildir.
  planKilitle: boolean;
  planStudyo: boolean;
  planCanliyaAl: boolean;
  bedelAyari: boolean;
  // Sunucunun kayıt yazma izni (ben.yazabilir, recete-rota.yaz).
  kayitYazabilir: boolean;
  // Çalışmayı (tercih, ağırlık, karar, sayfa içi kilit) değiştirebilir: ortak plan.yaz ve kayıt yazma izni birlikte.
  calismaYazabilir: boolean;
}

export function yetkiKur(islemler: readonly string[], ben: Pick<BenCevabi, 'yazabilir'>): PlanlamaYetkisi {
  const var_ = (i: string): boolean => islemler.includes(i);
  return {
    planlamaOku: var_(PLANLAMA_ISLEMI),
    maliyetOku: var_(MALIYET_ISLEMI),
    planYaz: var_('plan.yaz'),
    planKilitle: var_('plan.kilitle'),
    planStudyo: var_('plan.studyo'),
    planCanliyaAl: var_('plan.canliya-al'),
    bedelAyari: var_('plan.bedel-ayari'),
    kayitYazabilir: ben.yazabilir,
    calismaYazabilir: var_('plan.yaz') && ben.yazabilir,
  };
}
