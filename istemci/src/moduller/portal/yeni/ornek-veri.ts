import { bosDepo, type Depo, type Koleksiyonlar, type KoleksiyonAdi, type Onay, type PortalKullanicisi, type Siparis } from './tipler.ts';

// Testlerin sentetik deposu. Firma, kişi ve ürün adları uydurmadır; gerçek veri girmez.

// Pazartesi sabahı, yerel saat: vade ve gecikme hesapları saate bağlı kalmaz.
export const SIMDI = new Date(2026, 2, 16, 9, 0, 0).getTime();
const gun = (n: number): string => {
  const d = new Date(SIMDI + n * 864e5);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const an = (n: number): string => new Date(SIMDI + n * 864e5).toISOString();

export const GECERLI_IBAN = 'TR960006100000000000000001';

export const SATINALMACI: PortalKullanicisi = {
  id: 'tmi-5', surum: 1, partyId: 'firm', name: 'Deneme Satınalmacı', role: 'Satın alma müdürü', unvan: 'Satın alma müdürü',
  tmiIzinler: ['purchase', 'receive', 'approve', 'reports'], tmiRoller: ['Satın alma müdürü'],
};
export const KALITECI: PortalKullanicisi = {
  id: 'tmi-6', surum: 1, partyId: 'firm', name: 'Deneme Kaliteci', role: 'Kalite', tmiIzinler: ['quality'], tmiRoller: ['Kalite'],
};
export const GENEL_MUDUR_KULLANICISI: PortalKullanicisi = {
  id: 'tmi-7', surum: 1, partyId: 'firm', name: 'Deneme Müdür', role: 'Genel müdür', tmiIzinler: ['*'], tmiRoller: ['Genel müdür'],
};

export function siparis(k: Partial<Siparis> & Pick<Siparis, 'id' | 'type'>): Siparis {
  return {
    surum: 1, no: `SP-2026-${k.id}`, partyId: k.type === 'purchase' ? 'p1' : 'c1', title: 'Deneme flanş', createdAt: an(-30),
    items: [{ name: 'Deneme flanş', qty: 10, unit: 'adet', price: 100 }], promisedDate: gun(10), ...k,
  };
}

export function onay(k: Partial<Onay> & Pick<Onay, 'id'>): Onay {
  return {
    surum: 1, no: `ON-2026-${k.id}`, kind: 'po', refCol: 'orders', refId: 'o1', title: 'Deneme sipariş onayı', amount: 50000,
    requestedBy: 'tmi-9', at: an(-1), steps: [{ role: 'Satın alma müdürü', status: 'pending' }, { role: 'Genel müdür', status: 'pending' }],
    status: 'pending', ...k,
  };
}

const kimlikle = <T extends { id: string }>(liste: readonly T[]): Record<string, T> => Object.fromEntries(liste.map((x) => [x.id, x]));

export function ornekDepo(): Depo {
  const d = bosDepo() as { [K in KoleksiyonAdi]: Record<string, Koleksiyonlar[K]> };
  d.users = kimlikle([SATINALMACI, KALITECI, GENEL_MUDUR_KULLANICISI]);
  d.parties = kimlikle([
    { id: 'p1', surum: 1, name: 'Deneme Tedarikçi', type: 'supplier' as const },
    { id: 'c1', surum: 1, name: 'Deneme Müşteri', type: 'customer' as const },
  ]);
  d.orders = kimlikle([
    // Onaylanmış, sevk yok, termini 5 gün geçmiş: gecikmede.
    siparis({ id: 'o1', type: 'purchase', confirmedAt: an(-20), promisedDate: gun(-5), history: [{ at: an(-2), by: 'p1', text: 'Sipariş onaylandı' }] }),
    siparis({ id: 'o2', type: 'sales', promisedDate: gun(20) }),
  ]);
  d.approvals = kimlikle([onay({ id: 'a1' })]);
  d.ncrs = kimlikle([
    { id: 'n1', surum: 1, no: 'KK-2026-0001', kind: 'supplier' as const, partyId: 'p1', defect: 'Deneme çapak', status: 'open' as const, createdAt: an(-3) },
  ]);
  return d;
}
