import type { PlanGostergeleri, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { Senaryo } from './kurallar.ts';

// Uydurma taslaklar: canlıya göre biri iyileşir, biri kötüleşir, biri vazgeçilmiş.
const gosterge = (x: Partial<PlanGostergeleri>): PlanGostergeleri => ({
  emirSayisi: 10, isEmriSayisi: 24, yerlesen: 24, geciken: 3, zamanindaYuzde: 70, ortAtolyeGun: 4.5,
  darbogaz: { istasyonId: 1, ad: 'Torna', dolulukYuzde: 92 }, enDoluKaynak: null, personelGun: null, ayarSaat: 12, agirlikliGecikmeSaat: 40, ...x,
});
const senaryo = (x: Partial<Senaryo> & Pick<Senaryo, 'id' | 'ad' | 'durum'>): Senaryo => ({
  aciklama: null, acan: 'Deneme planci', benim: true, acilma: '2026-10-20T08:00:00.000Z', surum: 1, tabanPlanSurumu: 5, canliDegisti: false,
  gostergeler: gosterge({}), degisiklikler: [], etki: null, bekleyenler: [], ...x,
});
export const SENARYOLAR: SenaryolarCevabi = {
  canli: gosterge({}), canliSurum: 5,
  senaryolar: [
    senaryo({
      id: 11, ad: 'Bakım ileri', durum: 'acik', acilma: '2026-10-21T08:00:00.000Z', gostergeler: gosterge({ geciken: 1, agirlikliGecikmeSaat: 22, zamanindaYuzde: 90 }),
      degisiklikler: [{ id: 1, tur: 'kisit', ozet: 'Bakım ileri alındı', yazma: '2026-10-21T08:10:00.000Z' }],
      etki: { tarihiDegisenEmirler: [{ emirNo: 'E-1', canli: '2026-10-22T10:00:00.000Z', senaryo: '2026-10-22T06:00:00.000Z' }], yukuDegisenIstasyonlar: [{ ad: 'Torna', canliYuzde: 92, senaryoYuzde: 80 }], yeniUyarilar: [] },
    }),
    senaryo({
      id: 12, ad: 'Ek mesaisiz', durum: 'onayda', tabanPlanSurumu: 4, canliDegisti: true, gostergeler: gosterge({ geciken: 5, agirlikliGecikmeSaat: 61 }),
      etki: { tarihiDegisenEmirler: [{ emirNo: 'E-2', canli: '2026-10-23T10:00:00.000Z', senaryo: null }], yukuDegisenIstasyonlar: [], yeniUyarilar: ['E-2 yerleşmedi'] },
      bekleyenler: ['Ek mesai kaldırma'],
    }),
    senaryo({ id: 13, ad: 'Eski deneme', durum: 'vazgecildi', acilma: '2026-10-19T08:00:00.000Z' }),
  ],
};
