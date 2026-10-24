import type { Kullanici } from '#paylasilan/kullanici.ts';
import { ornekDepo, SIMDI } from '../ornek-veri.ts';
import { json } from '../test-ortak.tsx';
import type { Depo, PortalKullanicisi } from '../tipler.ts';
import type { Talep } from './ortak.tsx';

// Müşteri teklifleri testlerinin sentetik verisi. Firma, kişi ve ürün adları uydurmadır.

const gun = (n: number): string => {
  const d = new Date(SIMDI + n * 864e5);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const an = (n: number): string => new Date(SIMDI + n * 864e5).toISOString();

export const SATICI_KISI: Kullanici = { id: 8, ad: 'Deneme Satışçı', islemler: ['kisiler.rol-yonet', 'portal.oku', 'portal.yaz'] };
export const SATICI: PortalKullanicisi = {
  id: 'tmi-8', surum: 1, partyId: 'firm', name: 'Deneme Satışçı', role: 'Satış', tmiIzinler: ['sales'], tmiRoller: ['Satış'],
};
// Satış izni olmayan portal kullanıcısı (ornek-veri: tmi-6 kalite).
export const KALITECI_KISI: Kullanici = { id: 6, ad: 'Deneme Kaliteci', islemler: ['kisiler.rol-yonet', 'portal.oku', 'portal.yaz'] };

const kalemler = [
  { name: 'Deneme braket', qty: 10, unit: 'adet', spec: '', price: null },
  { name: 'Deneme pim', qty: 4, unit: 'adet', spec: '', price: null },
];

export function talepKur(k: Partial<Talep> & Pick<Talep, 'id' | 'status'>): Talep {
  return {
    surum: 1, no: `TKL-2026-${k.id}`, customerId: 'c1', title: `Deneme talep ${k.id}`, currency: 'TRY', neededBy: gun(20),
    createdAt: an(-5), items: kalemler, versions: [], history: [], ...k,
  };
}

const surum = (v: number, gecerlilik: number, k: Partial<NonNullable<Talep['versions']>[number]> = {}) => ({
  v, prices: [100, 50], discount: 0, deliveryDays: 21, payment: '30 gün vadeli', validUntil: gun(gecerlilik), createdAt: an(-4), ...k,
});

export function teklifDeposu(): Depo {
  const d = ornekDepo();
  const talepler: Talep[] = [
    talepKur({ id: 'q1', status: 'new', createdAt: an(-1) }),
    talepKur({ id: 'q2', status: 'quoted', createdAt: an(-6), versions: [surum(1, 5)] }),
    talepKur({ id: 'q3', status: 'quoted', createdAt: an(-7), versions: [surum(1, -1)] }),
    talepKur({ id: 'q4', status: 'accepted', createdAt: an(-8), acceptedVersion: 1, versions: [surum(1, 5, { discount: 10 })] }),
    talepKur({ id: 'q5', status: 'rejected', createdAt: an(-9), versions: [surum(1, 5)], rejectNote: 'Fiyat yüksek' }),
    talepKur({ id: 'q6', status: 'ordered', createdAt: an(-10), versions: [surum(1, 5)], orderId: 'o2' }),
  ];
  return {
    ...d,
    users: { ...d.users, [SATICI.id]: SATICI },
    requests: Object.fromEntries(talepler.map((q) => [q.id, q])) as unknown as Depo['requests'],
  };
}

// Yazma uçlarının sahte cevabı: belge yazılır, ek yüklenir.
export function yazmaCevabi(yontem: string, yol: string): Response | null {
  if (yontem === 'POST' && yol === '/portal/belge/yaz') return json(200, { belge: null, damga: 2 });
  return null;
}
