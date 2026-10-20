// Örnek fabrika: uydurma bir ofis mobilyası atölyesi. Belge prototipin `recete-rota-motoru-v1` durumudur ve prototipin
// normalize kuralıyla okunur; tarihler koşu gününe göre kurulur. Gerçek ürün, müşteri ya da kişi adı yoktur.
import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { ANAHTAR_ONEKI } from '#paylasilan/sozlesme/recete-rota.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { kayitGetir } from './sorgular.ts';
import { yaz } from './servis.ts';

const KAYDEDEN = 'ornek.planlama';
const ONAYLAYAN = 'Ornek Mudur';

type Hafta = Record<number, string[]>;
interface Takvim { shifts: unknown[]; holidays: string[] }
interface IsMerkezi { id: string; code: string; name: string; week: Hafta }

const gunEkle = (tarih: string, n: number): string => {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const resmiTatiller = (yil: number): string[] => ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'].map((m) => `${yil}-${m}`);
const haftaKur = (vardiyaIdleri: string[], gunler: number[]): Hafta => {
  const h: Hafta = {};
  for (let d = 0; d < 7; d++) h[d] = gunler.includes(d) ? [...vardiyaIdleri] : [];
  return h;
};
const isGunuMu = (tarih: string, takvim: Takvim, merkezler: IsMerkezi[]): boolean => {
  if (takvim.holidays.includes(tarih)) return false;
  const gun = new Date(`${tarih}T00:00:00Z`).getUTCDay();
  return merkezler.some((m) => (m.week[gun] ?? []).length > 0);
};
// n. iş günü (0 = başlangıçtan sonraki ilk iş günü).
const isGunu = (baslangic: string, n: number, takvim: Takvim, merkezler: IsMerkezi[]): string => {
  let d = baslangic;
  let sayac = -1;
  for (let i = 0; i < 400; i++) {
    if (isGunuMu(d, takvim, merkezler)) { sayac += 1; if (sayac === n) return d; }
    d = gunEkle(d, 1);
  }
  return baslangic;
};

const mal = (id: string, code: string, name: string, type: 'ham' | 'yari' | 'mamul', unit: string, cost: number, stock: number, min: number) =>
  ({ id, code: `ORN-${code}`, name: `Ornek ${name}`, type, unit, cost, stock, min });
// Çevrim = işlem + değişim; değişim boş olabilir (sıfır uydurulmaz).
const sure = (proc: number, chg: number | null) => ({ proc, chg, cycle: proc + (chg ?? 0) });
const gercek = (taban: string, d: { islem: number; degisim: number | null }) => ({
  taban,
  deger: { hazirlik: null, islem: d.islem, degisim: d.degisim },
  kaynak: { hazirlik: null, islem: 'elle', degisim: d.degisim === null ? null : 'elle' },
  terminal: { hazirlik: null, islem: null, degisim: null },
});
const girdi = (id: string, itemId: string, qty: number, scrap = 0) => ({ id, itemId, qty, scrap });

// Rota adımı: hazırlık (setup) dakikadır; cycle işlem ile değişim süresinin toplamıdır (adet başına dakika).
function adimKur(opdefler: Array<{ id: string; stationId: string; setup: number; proc: number; chg: number | null; cycle: number }>) {
  return (id: string, seq: number, opId: string, ins: unknown[], ek: Record<string, unknown> = {}) => {
    const d = opdefler.find((x) => x.id === opId);
    if (!d) throw new Error(`Örnek operasyon tanımı yok: ${opId}`);
    return {
      id, seq, opId, stationId: d.stationId, setup: d.setup, proc: d.proc, chg: d.chg, cycle: d.cycle, transfer: 0, ins, outs: [], alts: [], split: 'tek', minLot: 0, resetup: true, ...ek,
    };
  };
}

export function ornekBelge(gun: string, an: Date): Record<string, unknown> {
  const t0 = an.getTime();
  const yil = Number(gun.slice(0, 4));
  const vardiyalar = [
    { id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [{ id: 'b0', name: 'Cay molasi', start: '10:00', end: '10:15' }, { id: 'b1', name: 'Yemek molasi', start: '12:00', end: '12:30' }] },
    { id: 'v2', name: '2. vardiya', start: '16:00', end: '00:00', breaks: [{ id: 'b2', name: 'Yemek molasi', start: '20:00', end: '20:30' }] },
    { id: 'v3', name: '3. vardiya', start: '00:00', end: '08:00', breaks: [{ id: 'b3', name: 'Yemek molasi', start: '04:00', end: '04:30' }] },
  ];
  const cal: Takvim = { shifts: vardiyalar, holidays: [...resmiTatiller(yil), ...resmiTatiller(yil + 1)] };
  const haftaIci = [1, 2, 3, 4, 5];
  const wcs: IsMerkezi[] = [
    { id: 'w1', code: 'ORN-IM-10', name: 'Ornek Metal kesim ve bukum', week: haftaKur(['v1', 'v2'], haftaIci) },
    { id: 'w2', code: 'ORN-IM-20', name: 'Ornek Kaynakhane', week: haftaKur(['v1', 'v2'], haftaIci) },
    { id: 'w3', code: 'ORN-IM-30', name: 'Ornek Boyahane', week: { ...haftaKur(['v1'], haftaIci), 6: ['v1'] } },
    { id: 'w4', code: 'ORN-IM-40', name: 'Ornek Ahsap isleme', week: haftaKur(['v1'], haftaIci) },
    { id: 'w5', code: 'ORN-IM-50', name: 'Ornek Montaj ve sevkiyat', week: haftaKur(['v1', 'v2'], haftaIci) },
  ];

  const items = [
    mal('rm1', 'HM-101', 'Celik profil 40x40', 'ham', 'm', 85, 800, 300), mal('rm2', 'HM-102', 'MDF levha 18 mm', 'ham', 'm2', 420, 150, 80),
    mal('rm3', 'HM-103', 'Toz boya', 'ham', 'kg', 160, 60, 25), mal('rm4', 'HM-104', 'Baglanti vida seti', 'ham', 'set', 12, 300, 100),
    mal('rm5', 'HM-105', 'PVC kenar bandi', 'ham', 'm', 9, 600, 300), mal('rm6', 'HM-106', 'Ambalaj kolisi', 'ham', 'adet', 35, 100, 50),
    mal('rm7', 'HM-107', 'Kaynak teli', 'ham', 'kg', 95, 30, 10), mal('by1', 'HM-108', 'Celik hurdasi', 'ham', 'kg', 12, 0, 0),
    mal('by2', 'HM-109', 'MDF talasi', 'ham', 'kg', 2, 0, 0), mal('rm8', 'HM-110', 'DKP sac 1,5 mm', 'ham', 'm2', 310, 60, 80),
    mal('rm9', 'HM-111', 'Kilit ve mentese seti', 'ham', 'set', 95, 60, 40), mal('rm10', 'HM-112', 'Ayarli ayak pabucu', 'ham', 'adet', 6, 800, 400),
    mal('rm11', 'HM-113', 'Raf pimi', 'ham', 'adet', 0.8, 2000, 500),
    mal('sf1', 'YM-201', 'Kesilmis profil seti', 'yari', 'set', 0, 0, 0), mal('sf4', 'YM-202', 'Bukulmus profil seti', 'yari', 'set', 0, 0, 0),
    mal('sf2', 'YM-203', 'Kaynakli ayak cercevesi', 'yari', 'adet', 0, 20, 0), mal('sf3', 'YM-204', 'Ebatli tabla', 'yari', 'adet', 0, 0, 0),
    mal('sf5', 'YM-205', 'Dolap govdesi (kaynakli)', 'yari', 'adet', 0, 0, 0), mal('sf6', 'YM-206', 'Dolap kapagi', 'yari', 'adet', 0, 30, 0),
    mal('sf7', 'YM-207', 'Toplanti masasi ayagi', 'yari', 'adet', 0, 0, 0), mal('sf8', 'YM-208', 'Toplanti tablasi 240x120', 'yari', 'adet', 0, 0, 0),
    mal('fg1', 'MM-301', 'Ofis masasi 140x70', 'mamul', 'adet', 0, 0, 0), mal('fg2', 'MM-302', 'Metal dosya dolabi', 'mamul', 'adet', 0, 6, 0),
    mal('fg3', 'MM-303', 'Toplanti masasi 240x120', 'mamul', 'adet', 0, 0, 0),
  ];

  const ist = (id: string, code: string, name: string, wcId: string, cost: number, eff: number, count: number, opPer = 1) =>
    ({ id, code: `ORN-${code}`, name: `Ornek ${name}`, wcId, cost, eff, count, opPer });
  const stations = [
    ist('s11', 'IS-11', 'Fiber lazer', 'w1', 1200, 90, 1), ist('s12', 'IS-12', 'Abkant pres', 'w1', 650, 85, 1),
    ist('s13', 'IS-13', 'Plazma kesim', 'w1', 700, 90, 1), ist('s21', 'IS-21', 'Kaynak robotu', 'w2', 900, 80, 2, 0.5),
    ist('s31', 'IS-31', 'Toz boya hatti', 'w3', 1100, 90, 1), ist('s41', 'IS-41', 'CNC router', 'w4', 950, 85, 1),
    ist('s42', 'IS-42', 'Kenar bantlama', 'w4', 700, 90, 1), ist('s43', 'IS-43', 'CNC router (eski)', 'w4', 800, 75, 1),
    ist('s51', 'IS-51', 'Montaj tezgahi', 'w5', 500, 95, 3), ist('s52', 'IS-52', 'Paketleme masasi', 'w5', 350, 95, 1),
    ist('s53', 'IS-53', 'Kalite kontrol masasi', 'w5', 300, 100, 1),
  ];
  const mak = (id: string, code: string, name: string, stationId: string, status = 'aktif', note = '') =>
    ({ id, code: `ORN-${code}`, name: `Ornek ${name}`, stationId, status, note });
  const machines = [
    mak('m1', 'LZR-01', 'fiber lazer 3 kW', 's11'), mak('m2', 'ABK-01', 'abkant pres 135 t', 's12'), mak('m12', 'PLZ-01', 'plazma kesim tezgahi', 's13'),
    mak('m3', 'KR-01', 'kaynak robotu 1', 's21'), mak('m4', 'KR-02', 'kaynak robotu 2', 's21'), mak('m5', 'BYH-01', 'toz boya kabini ve firin', 's31'),
    mak('m6', 'CNC-01', 'CNC router 2100x3100', 's41'), mak('m13', 'CNC-02', 'CNC router 1300x2500', 's43'), mak('m7', 'BNT-01', 'kenar bantlama makinesi', 's42'),
    mak('m8', 'MT-01', 'montaj tezgahi 1', 's51'), mak('m9', 'MT-02', 'montaj tezgahi 2', 's51'), mak('m10', 'MT-03', 'montaj tezgahi 3', 's51', 'bakim', 'Vida tabancasi degisimi'),
    mak('m11', 'PKT-01', 'paketleme masasi', 's52'), mak('m14', 'KK-01', 'kalite masasi', 's53'),
  ];
  const opdef = (id: string, code: string, abbr: string, name: string, stationId: string, setup: number, proc: number, chg: number | null) =>
    ({ id, code: `ORN-${code}`, abbr, name: `Ornek ${name}`, stationId, setup, ...sure(proc, chg) });
  const opdefs = [
    opdef('d1', 'OP-010', 'KES', 'Lazer kesim', 's11', 30, 3.5, 0.5), opdef('d2', 'OP-020', 'BUK', 'Bukum', 's12', 20, 2.6, 0.4),
    opdef('d3', 'OP-030', 'KAY', 'Kaynak', 's21', 15, 10, 2), opdef('d4', 'OP-040', 'BOY', 'Toz boya', 's31', 45, 5, null),
    opdef('d5', 'OP-050', 'EBT', 'Ebatlama', 's41', 25, 5, 1), opdef('d6', 'OP-060', 'BNT', 'Kenar bantlama', 's42', 10, 3, null),
    opdef('d7', 'OP-070', 'MON', 'Montaj', 's51', 10, 8, 1), opdef('d8', 'OP-080', 'PAK', 'Paketleme', 's52', 5, 2.5, null),
    opdef('d9', 'OP-090', 'KAL', 'Kalite kontrol', 's53', 0, 1.5, null), opdef('d10', 'OP-100', 'ETK', 'Etiket ve dokuman', 's52', 0, 0.5, null),
  ];

  const P = adimKur(opdefs);
  const plazma = { alts: ['s13'], altTimes: { s13: { cycle: 6, setup: 10 } } };
  const routes = {
    sf2: { base: 1, steps: [
      P('p1', 10, 'd1', [girdi('n1', 'rm1', 4.2, 3)], { outItem: 'sf1', ...plazma }),
      P('p2', 20, 'd2', [], { outItem: 'sf4', dep: 'ortulu', depQty: 10 }),
      P('p3', 30, 'd3', [girdi('n2', 'rm7', 0.15)], { split: 'bol' }),
      P('p4', 40, 'd4', [girdi('n3', 'rm3', 0.35, 5)]),
    ] },
    sf3: { base: 1, steps: [
      P('p5', 10, 'd5', [girdi('n4', 'rm2', 1, 8)], { alts: ['s43'], altTimes: { s43: { cycle: 7.5 } } }),
      P('p6', 20, 'd6', [girdi('n5', 'rm5', 4.2, 2)], { dep: 'ortulu', depQty: 1 }),
    ] },
    fg1: { base: 1, steps: [
      P('p7', 10, 'd7', [girdi('n6', 'sf2', 1), girdi('n7', 'sf3', 1), girdi('n8', 'rm4', 1, 1)], { split: 'bol', minLot: 20 }),
      P('p8', 20, 'd8', [girdi('n9', 'rm6', 1)], { dep: 'ortulu', depQty: 5 }),
    ] },
    sf5: { base: 1, steps: [
      P('q1', 10, 'd1', [{ ...girdi('r1', 'rm8', 2.6, 6), status: 'ONY' }], plazma),
      P('q2', 20, 'd2', []), P('q3', 30, 'd3', [girdi('r2', 'rm7', 0.1)], { split: 'bol' }), P('q4', 40, 'd4', [girdi('r3', 'rm3', 0.6, 5)]),
    ] },
    sf6: { base: 1, steps: [P('q5', 10, 'd1', [girdi('r4', 'rm8', 0.9, 6)], plazma), P('q6', 20, 'd2', []), P('q7', 30, 'd4', [girdi('r5', 'rm3', 0.2, 5)])] },
    fg2: { base: 1, steps: [
      P('q8', 10, 'd7', [girdi('r6', 'sf5', 1), girdi('r7', 'sf6', 2), girdi('r8', 'rm9', 1), girdi('r9', 'rm11', 8)], { ...sure(12, 2), split: 'bol', minLot: 10 }),
      P('q8b', 20, 'd10', [], { dep: 'bagimsiz' }),
      P('q9', 30, 'd9', [], { rejectPct: 2, outStatus: 'KKO' }),
      P('q10', 40, 'd8', [girdi('r10', 'rm6', 1)], { ...sure(4, null), dep: 'ortulu', depQty: 1 }),
    ] },
    sf7: { base: 1, steps: [P('q11', 10, 'd1', [girdi('r11', 'rm1', 6.5, 3)]), P('q12', 20, 'd3', [girdi('r12', 'rm7', 0.2)], { split: 'bol' }), P('q13', 30, 'd4', [girdi('r13', 'rm3', 0.5, 5)])] },
    sf8: { base: 1, steps: [
      P('q14', 10, 'd5', [girdi('r14', 'rm2', 2.9, 8)], { ...sure(12, 2), alts: ['s43'], altTimes: { s43: { cycle: 18 } } }),
      P('q15', 20, 'd6', [girdi('r15', 'rm5', 7.3, 2)], { ...sure(5, 1), dep: 'ortulu', depQty: 1 }),
    ] },
    fg3: { base: 1, steps: [
      P('q16', 10, 'd7', [girdi('r16', 'sf7', 2), girdi('r17', 'sf8', 1), girdi('r18', 'rm4', 2, 1), girdi('r19', 'rm10', 4)], { ...sure(22, 3) }),
      P('q17', 20, 'd9', [], { ...sure(5, null), rejectPct: 1 }),
      P('q18', 30, 'd8', [girdi('r20', 'rm6', 2)], { ...sure(5, 1), dep: 'ortulu', depQty: 1 }),
    ] },
  };

  // Revizyonlar: her ürünün yürürlükte revizyonu var; ayrıca eski onaylı, onay bekleyen ve taslak örnekleri.
  const kopya = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const rev = (id: string, itemId: string, no: string, status: string, data: unknown, note: string, gunOnce: number) => {
    const t = t0 - gunOnce * 86_400_000;
    return { id, itemId, no, status, data: kopya(data), note, created: t, updated: t, ...(status === 'taslak' || status === 'onay' ? {} : { approvedAt: t, approver: ONAYLAYAN }) };
  };
  const hizli = (r: typeof routes.fg1, adimId: string, alan: Record<string, unknown>) => {
    const k = kopya(r);
    Object.assign(k.steps.find((s) => s.id === adimId) ?? {}, alan);
    return k;
  };
  const routeRevs = [
    rev('rv-sf2-a', 'sf2', 'A', 'onayli', hizli(routes.sf2 as typeof routes.fg1, 'p3', sure(12, 2)), 'Ilk kayit', 40),
    rev('rv-sf2-b', 'sf2', 'B', 'yururlukte', routes.sf2, 'Kaynak suresi kisaltildi', 12),
    rev('rv-sf3-a', 'sf3', 'A', 'yururlukte', routes.sf3, 'Ilk kayit', 40),
    rev('rv-fg1-a', 'fg1', 'A', 'yururlukte', routes.fg1, 'Ilk kayit', 40),
    rev('rv-fg1-b', 'fg1', 'B', 'taslak', hizli(routes.fg1, 'p7', sure(7, 1)), 'Montaj 9 -> 8 dk', 2),
    rev('rv-fg2-a', 'fg2', 'A', 'yururlukte', routes.fg2, 'Ilk kayit', 25),
    rev('rv-fg2-b', 'fg2', 'B', 'onay', hizli(routes.fg2 as typeof routes.fg1, 'q9', { rejectPct: 1 }), 'Kalite kontrol fire orani 2 -> 1', 3),
    rev('rv-fg3-a', 'fg3', 'A', 'yururlukte', routes.fg3, 'Ilk kayit', 20),
    rev('rv-sf5-a', 'sf5', 'A', 'yururlukte', routes.sf5, 'Ilk kayit', 25),
    rev('rv-sf6-a', 'sf6', 'A', 'yururlukte', routes.sf6, 'Ilk kayit', 25),
    rev('rv-sf7-a', 'sf7', 'A', 'yururlukte', routes.sf7, 'Ilk kayit', 20),
    rev('rv-sf8-a', 'sf8', 'A', 'yururlukte', routes.sf8, 'Ilk kayit', 20),
  ];

  const baslangic = isGunu(gun, 0, cal, wcs);
  const W = (n: number): string => isGunu(baslangic, n, cal, wcs);
  const no = (n: number): string => `UE-${yil}-${String(n).padStart(3, '0')}`;
  const emir = (id: string, n: number, itemId: string, qty: number, basN: number, bitN: number, priority: number, status: string, tur: string, note: string) =>
    ({ id, no: no(n), itemId, qty, start: W(basN), due: W(bitN), priority, status, tur, note, created: t0 + n });
  const orders = [
    emir('o1', 1, 'fg1', 150, 0, 7, 2, 'uretimde', 'seri', 'Ornek bayi siparisi'),
    emir('o2', 2, 'fg1', 120, 2, 13, 3, 'serbest', 'seri', 'Ornek kurumsal proje'),
    emir('o3', 3, 'sf2', 60, 0, 5, 1, 'uretimde', 'seri', 'Yedek parca, acil'),
    emir('o4', 4, 'fg1', 300, 5, 22, 3, 'taslak', 'seri', 'Teklif asamasinda'),
    emir('o5', 5, 'fg2', 80, 1, 11, 3, 'serbest', 'seri', 'Ornek ihale siparisi'),
    emir('o6', 6, 'fg3', 3, 0, 9, 2, 'serbest', 'prototip', 'Yeni masa ayagi prototipi'),
    emir('o7', 7, 'fg2', 5, 4, 16, 4, 'serbest', 'numune', 'Ornek musteri numunesi'),
    emir('o8', 8, 'sf6', 100, 0, 2, 3, 'tamam', 'seri', 'Gecen haftadan kalan kapak partisi'),
    emir('o9', 9, 'fg2', 2, 3, 8, 2, 'serbest', 'fai', 'Ilk parca onayi (FAI)'),
  ];

  const kisi = (id: string, no: number, role: string, wcId: string, shiftId: string, cost: number, skills: string[]) =>
    ({ id, code: `ORN-P-${String(no).padStart(3, '0')}`, name: `Ornek ${role} ${String(no).padStart(2, '0')}`, role, wcId, shiftId, cost, skills, active: true });
  const people = [
    kisi('h1', 1, 'Operator', 'w1', 'v1', 210, ['s11', 's12', 's13']), kisi('h2', 2, 'Operator', 'w1', 'v1', 200, ['s12']),
    kisi('h3', 3, 'Operator', 'w1', 'v2', 215, ['s11']), kisi('h4', 4, 'Usta', 'w1', 'v2', 260, ['s11', 's12', 's13']),
    kisi('h5', 5, 'Operator', 'w2', 'v1', 220, ['s21']), kisi('h6', 6, 'Operator', 'w2', 'v2', 220, ['s21']),
    kisi('h7', 7, 'Operator', 'w3', 'v1', 205, ['s31']), kisi('h8', 8, 'Operator', 'w3', 'v1', 195, ['s31']),
    kisi('h9', 9, 'Operator', 'w4', 'v1', 215, ['s41', 's42', 's43']), kisi('h10', 10, 'Operator', 'w4', 'v1', 200, ['s42', 's43']),
    kisi('h11', 11, 'Usta', 'w5', 'v1', 240, ['s51']), kisi('h12', 12, 'Operator', 'w5', 'v1', 195, ['s51']),
    kisi('h13', 13, 'Operator', 'w5', 'v1', 190, ['s52', 's51']), kisi('h14', 14, 'Operator', 'w5', 'v2', 200, ['s51']),
    kisi('h15', 15, 'Operator', 'w5', 'v2', 200, ['s51', 's52']), kisi('h16', 16, 'Kalite', 'w5', 'v1', 230, ['s53']),
  ];

  const gunMs = 86_400_000;
  return {
    version: 7,
    ornek: true,
    name: 'Ornek fabrika: ofis mobilyasi',
    items, wcs, stations, opdefs, routes, cal, machines, people, orders, routeRevs,
    settings: {
      orderItem: 'fg1', orderQty: 250, start: baslangic, due: W(7), useStock: true, peopleLimit: true, freezeDays: 2,
    },
    moves: [
      { id: 'mv1', t: t0 - 3 * gunMs, itemId: 'rm8', qty: 100, note: 'Ornek satin alma girisi', batch: null },
      { id: 'mv2', t: t0 - 2 * gunMs, itemId: 'rm2', qty: 60, note: 'Ornek satin alma girisi', batch: null },
      { id: 'mv3', t: t0 - 2 * gunMs, itemId: 'sf6', qty: 30, note: `${no(8)} uretim girisi`, batch: null },
      { id: 'mv4', t: t0 - gunMs, itemId: 'rm3', qty: -8, note: 'Sayim duzeltmesi', batch: null },
    ],
    opStatus: { 'o1|root>n6|p1': 'tamam', 'o1|root>n6|p2': 'calisiyor', 'o3|root|p1': 'tamam' },
    opProg: { 'o1|root>n6|p2': 40 },
    assign: { 'o1|root>n6|p1': { personId: 'h1' }, 'o1|root>n6|p2': { personId: 'h2', resId: 'm2' } },
    statusCards: [{ id: 'c1', itemId: 'fg2', status: 'KKO' }, { id: 'c2', itemId: 'fg3', status: 'RET' }],
    statusStock: { rm8: { ONY: 120, KRN: 40 }, sf5: { 'step:q2': 25 } },
    // Gerçekleşen süre adıma bağlı ayrı kayıttır: p1 gerçekleşen tabanda (plan onu kullanır), p3 ve q8 yalnız kayıtlı (taban teorik).
    gercekSure: {
      p1: gercek('gerceklesen', { islem: 3.1, degisim: 0.4 }),
      p3: gercek('teorik', { islem: 11, degisim: 2.5 }),
      q8: gercek('teorik', { islem: 13.5, degisim: null }),
    },
    savedAt: t0,
  };
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'recete-rota',
  gerekir: ['kisiler'],
  // Yalnız ana durum anahtarına bakılır: kayıt (örnek ya da gerçek) varsa üstüne yazılmaz.
  yukluMu: async (db) => (await kayitGetir(db, ANAHTAR_ONEKI)) !== null,
  yukle: async (db, baglam) => {
    const kisiId = await kisiNoKullaniciAdindan(db, KAYDEDEN);
    const kullanici = kisiId === null ? null : await kullaniciYukle(db, kisiId);
    if (kullanici === null) throw new Error(`Recete ve rota ornek verisi ${KAYDEDEN} hesabini bulamadi (kisiler ornek verisi once yuklenmeli).`);
    if ((await kayitGetir(db, ANAHTAR_ONEKI)) !== null) return;
    await yaz(db, kullanici, { anahtar: ANAHTAR_ONEKI, bicim: 'json', deger: ornekBelge(baglam.gun, baglam.an), beklenenSurum: null });
  },
});
