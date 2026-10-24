import type { Kullanici } from '#paylasilan/kullanici.ts';
import { ornekDepo, SIMDI } from '../ornek-veri.ts';
import { json } from '../test-ortak.tsx';
import type { Depo } from '../tipler.ts';
import type { BelgeKaydi } from './gorseller.ts';

// Firma belgeleri testlerinin sentetik verisi. Firma ve kişi adları uydurmadır.

const gun = (n: number): string => {
  const d = new Date(SIMDI + n * 864e5);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const an = (n: number): string => new Date(SIMDI + n * 864e5).toISOString();

const ISLEMLER: Kullanici['islemler'] = ['kisiler.rol-yonet', 'portal.oku', 'portal.yaz'];
// Kalite izni belge görünümünü ve kararı açar (ornek-veri: tmi-6). Satın almacının belge izni yoktur (tmi-5).
export const KALITECI_KISI: Kullanici = { id: 6, ad: 'Deneme Kaliteci', islemler: ISLEMLER };
export const SATINALMACI_KISI: Kullanici = { id: 5, ad: 'Deneme Satınalmacı', islemler: ISLEMLER };

export function belgeKur(k: Partial<BelgeKaydi> & Pick<BelgeKaydi, 'id' | 'partyId' | 'type' | 'status'>): BelgeKaydi {
  return { surum: 1, at: an(-30), no: `B-${k.id}`, issuedAt: gun(-30), photos: [], history: [], ...k };
}

// Tedarikçi p1: vergi levhası süresiz, ISO 9001 20 gün içinde doluyor, imza sirküleri onay bekliyor, KVKK yok.
// Müşteri c1: vergi levhasının süresi 3 gün önce doldu, imza sirküleri yok.
export function belgeDeposu(): Depo {
  const d = ornekDepo();
  const belgeler = [
    belgeKur({ id: 'd1', partyId: 'p1', type: 'Vergi levhası', status: 'approved' }),
    belgeKur({ id: 'd2', partyId: 'p1', type: 'ISO 9001', status: 'approved', expiresAt: gun(20) }),
    belgeKur({ id: 'd3', partyId: 'p1', type: 'İmza sirküleri', status: 'pending', expiresAt: gun(300) }),
    belgeKur({ id: 'd4', partyId: 'c1', type: 'Vergi levhası', status: 'approved', expiresAt: gun(-3) }),
  ];
  return { ...d, docs: Object.fromEntries(belgeler.map((b) => [b.id, b])) };
}

export function yazmaCevabi(yontem: string, yol: string): Response | null {
  if (yontem === 'POST' && yol === '/portal/belge/yaz') return json(200, { belge: null, damga: 2 });
  return null;
}
