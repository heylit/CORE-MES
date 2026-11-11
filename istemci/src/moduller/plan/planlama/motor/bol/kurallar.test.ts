import { describe, expect, it } from 'vitest';
import { saatiSabitle } from '../../test-saati.ts';
import { derle, girdiKur, planOku, plandanBitenler } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { ikiTezgahli } from './test-veri.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  BOL_BASLAMIS, BOL_KILITLI, BOL_TEK_TEZGAH, bolDenetle, bolDurumu, bolKaldir, bolunmus, bolYaz, elleBolOku, enCokPay, esitPaylar, ilkTezgahlar, kokKimlik,
} from './kurallar.ts';

saatiSabitle(() => ornekCalisma());

const kur = (c: PlanlamaCalismasi = ikiTezgahli()) => {
  const p = planOku(c); if (!p) throw new Error('plan');
  const cx = derle(girdiKur(c, plandanBitenler(c, p)));
  const r = Object.values(p.ops).find((x) => !x.act && !x.fas && !c.locks[x.id] && bolDurumu(c, cx, p, x).adaylar.length >= 2);
  if (!r) throw new Error('bölünebilir adım yok');
  return { c, p, cx, r };
};

describe('elle bölme kuralları (2524 b)', () => {
  it('pay kimliğinin kökü, eşit paylar ve üst sınır', () => {
    expect(kokKimlik('3.20~2')).toBe('3.20');
    expect(kokKimlik('3.20')).toBe('3.20');
    expect(esitPaylar(10, 3)).toEqual([4, 3, 3]);
    expect(esitPaylar(9, 3)).toEqual([3, 3, 3]);
    const c = ornekCalisma();
    expect(enCokPay(c)).toBe(3);
    expect(enCokPay({ ...c, param: { ...c.param, bolmeMaks: 1 } })).toBe(3);
  });

  it('denetim: pay sayısı, adet, toplam, aday tezgâh ve ayrı tezgâh', () => {
    const d = { adet: 10, adaylar: ['1', '2', '3'], enCok: 3 };
    expect(bolDenetle([{ adet: 6, m: '1' }, { adet: 4, m: '2' }], d)).toBeNull();
    expect(bolDenetle([{ adet: 10, m: '1' }], d)).toBe('En az iki pay olmalı.');
    expect(bolDenetle([{ adet: 3, m: '1' }, { adet: 3, m: '2' }, { adet: 2, m: '3' }, { adet: 2, m: '1' }], d)).toBe('En çok 3 pay olabilir.');
    expect(bolDenetle([{ adet: 0, m: '1' }, { adet: 10, m: '2' }], d)).toBe('Her payın adedi en az 1 olmalı.');
    expect(bolDenetle([{ adet: 5, m: '1' }, { adet: 4, m: '2' }], d)).toBe('Payların toplamı 9; adımın adedi 10.');
    expect(bolDenetle([{ adet: 5, m: '1' }, { adet: 5, m: '9' }], d)).toBe('Pay tezgâhı işi yapabilen tezgâhlardan olmalı.');
    expect(bolDenetle([{ adet: 5, m: '1' }, { adet: 5, m: '1' }], d)).toBe('Her pay ayrı tezgâhta olmalı.');
  });

  it('yazma, okuma ve kaldırma çalışmanın elleBol alanındadır', () => {
    const c = ornekCalisma();
    bolYaz(c, 'A.10', [{ adet: 3, m: '1' }, { adet: 2, m: '2' }]);
    bolYaz(c, 'B.10', [{ adet: 5, m: '1' }]);
    expect(elleBolOku(c)).toEqual({ 'A.10': [{ adet: 3, m: '1' }, { adet: 2, m: '2' }], 'B.10': [{ adet: 5, m: '1' }] });
    bolKaldir(c, 'A.10');
    expect(Object.keys(elleBolOku(c))).toEqual(['B.10']);
    expect(elleBolOku({ ...c, elleBol: { X: [{ adet: 'iki', m: '1' }] } } as PlanlamaCalismasi)).toEqual({});
  });

  it('durum: adet, adaylar ve engeller; sabit ve başlamış iş bölünmez', () => {
    const { c, p, cx, r } = kur();
    const d = bolDurumu(c, cx, p, r);
    expect(d.id).toBe(r.id);
    expect(d.adet).toBeGreaterThan(0);
    expect(d.adaylar.every((m) => !m.startsWith('@'))).toBe(true);
    expect([d.engel, d.bolEngeli, bolunmus(d)]).toEqual([null, null, false]);
    expect(ilkTezgahlar(d, 2)[0]).toBe(r.m);
    const kilitli = { ...c, locks: { ...c.locks, [r.id]: { m: r.m, S: r.S } } };
    expect(bolDurumu(kilitli, cx, p, r).engel).toBe(BOL_KILITLI);
    expect(bolDurumu(c, cx, { ...p, ops: { ...p.ops, [r.id]: { ...r, act: true } } }, r).engel).toBe(BOL_BASLAMIS);
  });

  it('plandaki paylar (adım~2) bölünmüş sayılır; motorun bol uyarısı engel olur; tek tezgâhlı iş bölünmez', () => {
    const { c, p, cx, r } = kur();
    const ops = { ...p.ops, [`${r.id}~2`]: { ...r, id: `${r.id}~2` } };
    const d = bolDurumu(c, cx, { ...p, ops }, { ...r, id: `${r.id}~2` });
    expect([d.id, d.paylar.map((x) => x.id), bolunmus(d)]).toEqual([r.id, [r.id, `${r.id}~2`], true]);
    const uyarili = { ...c, plan: { ...(c.plan as object), warn: [{ t: 'bol', id: r.id, txt: 'Başlamış iş bölünmedi.' }] } } as unknown as PlanlamaCalismasi;
    expect(bolDurumu(uyarili, cx, p, r).engel).toBe('Başlamış iş bölünmedi.');
    const tek = Object.values(p.ops).find((x) => !x.fas && !x.act && bolDurumu(c, cx, p, x).adaylar.length === 1);
    expect(tek && bolDurumu(c, cx, p, tek).bolEngeli).toBe(BOL_TEK_TEZGAH);
  });
});
