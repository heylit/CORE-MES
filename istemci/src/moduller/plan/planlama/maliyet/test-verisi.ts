import { calismaOku } from '../durum.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';

// Testlerin uydurma çalışması: bir torna, bir freze, bir sipariş (tornalama ve fason kaplama). Ad ve sayılar uydurmadır.
// Plan başlangıcı pazartesidir; vardiya hafta içi 08:00-16:00.
export function ornekDeger(ek: { D?: Record<string, unknown>; ekMesai?: unknown[]; plan?: unknown } = {}): Record<string, unknown> {
  return {
    surum: 2,
    dataVer: 1,
    ekMesai: ek.ekMesai ?? [],
    D: {
      meta: { baslangic: '2026-01-05' },
      vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00', molalar: [] }],
      calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'], cmt: [], paz: [] },
      tezgahlar: [{ id: 'T1', ad: 'Deneme torna', grup: 'TORNA', ucret: 100, verim: 1 }, { id: 'T2', ad: 'Deneme freze', grup: 'FREZE', ucret: null, verim: 1 }],
      urunler: [{
        id: 'U1', ad: 'Deneme mil', netKg: 1,
        rota: [{ k: '10', ad: 'Tornalama', tezgahlar: [{ id: 'T1', cevrim: 60 }] }, { k: '20', ad: 'Kaplama', fason: 'F1', bag: [['10']] }],
      }],
      siparisler: [{ id: 'S1', urun: 'U1', adet: 2, termin: '2026-01-09 16:00', gelir: 1000, malzeme: [{ kod: 'M1', miktar: 1.5 }] }],
      malzemeler: [{ kod: 'M1', ad: 'Deneme çubuk', birim: 'kg', birimFiyat: 10, kalite: 'K1', form: 'Çubuk', stok: 100 }],
      fasoncular: [{ id: 'F1', ad: 'Deneme kaplama', fiyat: 5, sureGun: 2, kapasite: 1 }],
      personel: [{ id: 'P1', ad: 'Deneme Kisi', vardiya: 'V1', gruplar: ['TORNA'] }],
      ...(ek.D ?? {}),
    },
    plan: ek.plan === undefined ? {
      dataVer: 1,
      ops: {
        'S1.10': { id: 'S1.10', job: 'S1', m: 'T1', S: 8, C: 10, su: 0, run: 2 },
        'S1.20': { id: 'S1.20', job: 'S1', m: '@F1', S: 10, C: 58, su: 0, run: 0, fas: true },
      },
      J: { S1: { C: 58, T: 0 } },
    } : ek.plan,
  };
}

export function ornekCalisma(ek: Parameters<typeof ornekDeger>[0] = {}): PlanlamaCalismasi {
  const c = calismaOku(ornekDeger(ek));
  if (!c) throw new Error('örnek çalışma okunamadı');
  return c;
}
