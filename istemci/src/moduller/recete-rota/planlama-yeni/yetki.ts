import type { BenCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from '../planlama-menusu.ts';

// Ekranın yetkisi oturumun işlemlerinden ve /recete-rota/ben'den kurulur. Ekran yalnız gizler; denetim uçtadır.
// Sayfanın kendi rol modeli (veri.yaz, plan.yaz, plan.kilitle, plan.canliya-al) bugün TMI'de hep yöneticidir; ortak matrise eşlemesi
// (soru 223, okuma teyidi bekliyor) kesinleşene dek her bayrak doğrudan ortak işlemden okunur.
export interface PlanlamaYetkisi {
  planlamaOku: boolean;
  maliyetOku: boolean;
  planYaz: boolean;
  planKilitle: boolean;
  planStudyo: boolean;
  planCanliyaAl: boolean;
  bedelAyari: boolean;
  // Reçete ve Rota kaydına yazma (ben.yazabilir). Soru 222 cevaplanana dek görünümler kullanmaz.
  kayitYazabilir: boolean;
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
  };
}
