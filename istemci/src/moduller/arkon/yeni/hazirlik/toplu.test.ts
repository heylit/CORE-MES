import { describe, expect, it } from 'vitest';
import type { Plant } from '../cekirdek/tipler.ts';
import {
  benzerAdaylar, benzerKopya, gelecekler, kopyaAcikMi, gidecekMi, gonderDugmesi, gonderimHali, gonderimSayilari, silinecekler, topluGonderilebilir,
  uyariAnahtari, varsayilanKopya, type KopyaAlani,
} from './toplu.ts';
import type { Pkg } from './tipler.ts';

// 3362: toplu gönderim kapıları ve benzer paketten doldurma. Adlar ve sayılar uydurmadır (ORN-).
const TESIS = { wcs: [{ id: 'TAL', name: 'ORN merkez' }], sts: [{ id: 'ORN-IST', name: 'ORN tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] } as unknown as Plant;
const plan1 = [{ id: 1, nom: '10', lsl: 9.9, usl: 10.1, freq: 'İlk parça', crit: true }] as unknown as Pkg['plan'];
const paket = (ek: Partial<Pkg> = {}): Pkg => ({
  id: 'tmi-ie-1', no: 'ORN-UE-1', opType: 'cnc', st: {}, partNo: 'ORN-P', part: 'ORN parça', rev: 'B', op: 'Op 20 · Freze', machine: 'ORN-IST', target: 40, cycle: 30,
  due: '', priority: 'normal', material: '', note: '', files: [], primary: 'r.pdf', plan: plan1, steps: [{ id: 's1', t: 'Bağla', d: '', r: false }], status: 'draft',
  version: 0, dirty: true, createdAt: 1, updatedAt: 2, by: 'ORN', malzemeNo: 7, tmi: { emirId: 3, isEmriId: 1, opNo: 20 }, ...ek,
} as Pkg);
const ONAYSIZ = { approval: false }, ONAYLI = { approval: true };

describe('3362-1 toplu gönderim kapıları', () => {
  it('gönderilebilir: taslak ya da değişikliği gönderilmemiş, işi bitmemiş paket', () => {
    expect(topluGonderilebilir(paket(), null)).toBe(true);
    expect(topluGonderilebilir(paket({ status: 'published', dirty: true }), { state: 'queued' })).toBe(true);
    expect(topluGonderilebilir(paket({ status: 'published', dirty: false }), null)).toBe(false);
    expect(topluGonderilebilir(paket(), { state: 'done' })).toBe(false);
  });

  it('tek paketteki sırayla: eksik durdurur, plan yok ve plan dışı uyarı ister, kalite onayı gereken kaliteye gider', () => {
    expect(gonderimHali(paket({ primary: null }), TESIS, ONAYSIZ).tur).toBe('engel');
    expect(gonderimHali(paket({ machine: '' }), TESIS, ONAYSIZ)).toMatchObject({ tur: 'engel', neden: expect.stringContaining('İstasyon seçilmedi') });
    expect(gonderimHali(paket(), TESIS, ONAYSIZ)).toEqual({ tur: 'terminal', uyarilar: [] });
    expect(gonderimHali(paket({ plan: [] }), TESIS, ONAYSIZ)).toMatchObject({ tur: 'terminal', uyarilar: [{ tur: 'planYok' }] });
    const disi = paket({ tmi: { emirId: 3, isEmriId: 1, opNo: 20, plan: { canli: false, sira: null, eslesiyor: false } } });
    expect(gonderimHali(disi, TESIS, ONAYSIZ)).toMatchObject({ tur: 'terminal', uyarilar: [{ tur: 'planDisi' }] });
    expect(gonderimHali(paket({ plan: [] }), TESIS, ONAYLI)).toMatchObject({ tur: 'kalite', uyarilar: [{ tur: 'planYok' }] });
    expect(gonderimHali(paket({ apReq: { at: 5, by: 'ORN' } }), TESIS, ONAYLI)).toMatchObject({ tur: 'bekliyor' });
  });

  it('Risk K1: her uyarı ayrı onaylanır; kaliteye gidecek iş hiçbir kutuyla terminale sayılmaz', () => {
    const a = paket({ id: 'a' }), b = paket({ id: 'b', plan: [], tmi: { emirId: 3, isEmriId: 2, opNo: 30, plan: { canli: false, sira: null, eslesiyor: false } } });
    const k = paket({ id: 'k' });
    const l = [{ p: a, h: gonderimHali(a, TESIS, ONAYSIZ) }, { p: b, h: gonderimHali(b, TESIS, ONAYSIZ) }, { p: k, h: gonderimHali(k, TESIS, ONAYLI) }];
    const yalnizPlanYok = new Set([uyariAnahtari('b', 'planYok')]);
    expect(gidecekMi('b', l[1]!.h, yalnizPlanYok)).toBe(false);
    const ikisi = new Set([...yalnizPlanYok, uyariAnahtari('b', 'planDisi')]);
    expect(gidecekMi('b', l[1]!.h, ikisi)).toBe(true);
    expect(gonderimSayilari(l, new Set())).toEqual({ terminal: 1, kalite: 1 });
    expect(gonderimSayilari(l, ikisi)).toEqual({ terminal: 2, kalite: 1 });
    expect(gonderDugmesi({ terminal: 3, kalite: 1 })).toBe('3 işi gönder, 1 işi kaliteye yolla');
    expect(gonderDugmesi({ terminal: 0, kalite: 0 })).toBe('Gönderilecek iş yok');
  });
});

describe('3362-2 benzer paketten doldurma', () => {
  const hedef = paket({ id: 'h', rev: 'C', plan: [], steps: [], primary: null, tmi: { emirId: 9, isEmriId: 90, opNo: 20 }, rules: { q: { firstPiece: false } } });
  const gonderilmis = (ek: Partial<Pkg>) => paket({ status: 'published', dirty: false, publishedAt: 10, ...ek });

  it('aday yalnız gönderilmiş paket; sıra aynı OP, aynı parça başka OP, aynı tür ve istasyon', () => {
    const turdas = gonderilmis({ id: 't', malzemeNo: 8, partNo: 'ORN-Q', publishedAt: 30 });
    const baskaOp = gonderilmis({ id: 'o', tmi: { emirId: 4, isEmriId: 41, opNo: 10 }, publishedAt: 20 });
    const ayniOp = gonderilmis({ id: 's', rev: 'B', tmi: { emirId: 5, isEmriId: 51, opNo: 20 }, publishedAt: 5 });
    const taslak = paket({ id: 'd', tmi: { emirId: 6, isEmriId: 61, opNo: 20 } });
    expect(benzerAdaylar(hedef, [turdas, baskaOp, ayniOp, taslak, hedef]).map((a) => [a.p.id, a.derece])).toEqual([
      ['s', 'ayni-op'], ['o', 'ayni-parca'], ['t', 'ayni-tur'],
    ]);
  });

  it('revizyon farkında resim ve kontrol planı alınmaz; numune ölçüleri hedefin planına göre süzülür', () => {
    const kaynak = gonderilmis({ id: 's', rev: 'B', files: [{ name: 'r.pdf', kind: 'pdf' }] as Pkg['files'], samp: [{ when: 'every', n: 5, who: ['q'], items: [1] }] });
    const alanlar = varsayilanKopya(hedef, kaynak);
    expect([...alanlar].sort()).toEqual(['material', 'rules', 'samp', 'steps']);
    const hepsi = new Set<KopyaAlani>(['steps', 'rules', 'samp', 'material', 'resim', 'plan']);
    const k = benzerKopya(hedef, kaynak, hepsi);
    expect(k.files).toBeUndefined();
    expect(k.plan).toBeUndefined();
    expect(k.samp).toEqual([{ when: 'every', n: 5, who: ['q'], items: 'all' }]);
    const ayniRev = benzerKopya({ ...hedef, rev: 'B' }, kaynak, hepsi);
    expect(ayniRev.files).toHaveLength(1);
    expect(ayniRev.plan).toEqual(plan1);
    expect(ayniRev.samp).toEqual([{ when: 'every', n: 5, who: ['q'], items: [1] }]);
  });

  it('Risk K2: onay, kayıt, kişi ve geçmiş alanları taşınmaz; hedefte kapalı ilk parça kapalı kalır', () => {
    const kaynak = gonderilmis({
      id: 's', rev: 'B', rules: { q: { firstPiece: true, who: 'quality' } }, approval: { ok: true, by: 'ORN', at: 9 }, apReq: { at: 1, by: 'ORN' },
      history: [{ v: 1, rev: 'B', at: 1, by: 'ORN', ap: null, st: 'ORN-IST', planYok: true }] as unknown as Pkg['history'], fpRe: { on: true, key: 'x', why: 'red' },
      yayinImza: { a: '1' },
    });
    const k = benzerKopya(hedef, kaynak, varsayilanKopya(hedef, kaynak));
    expect(Object.keys(k).sort()).toEqual(['material', 'rules', 'samp', 'steps']);
    expect(k.rules).toEqual({ q: { firstPiece: false, who: 'quality' } });
    expect(kaynak.rules).toEqual({ q: { firstPiece: true, who: 'quality' } });
  });

  it('dolu hedefte silinecek ve gelecek alanlar söylenir', () => {
    const dolu = { ...hedef, steps: [{ id: 'a', t: 'x', d: '', r: false }, { id: 'b', t: 'y', d: '', r: false }] } as unknown as Pkg;
    const kaynak = gonderilmis({ id: 's', rev: 'B', steps: [{ id: 'c', t: 'z', d: '', r: false }] as unknown as Pkg['steps'] });
    const k = benzerKopya(dolu, kaynak, new Set<KopyaAlani>(['steps']));
    expect(silinecekler(dolu, k)).toEqual(['2 adım']);
    expect(gelecekler(k)).toEqual(['1 adım']);
  });
});

describe('3362 Test bakışı ekleri', () => {
  const gonderilmis = (ek: Partial<Pkg>) => paket({ status: 'published', dirty: false, publishedAt: 10, ...ek });

  it('T3: malzeme notu başka parçada, resim ve plan hedef revizyonu boşken kapalı; plan Kalite Merkezi bağıyla gelir', () => {
    const hedef = paket({ id: 'h', rev: 'B' });
    const baskaParca = gonderilmis({ id: 'x', malzemeNo: 8, partNo: 'ORN-Q', material: 'ORN-S355' });
    expect(kopyaAcikMi(hedef, baskaParca, 'material')).toBe(false);
    expect(benzerKopya(hedef, baskaParca, new Set<KopyaAlani>(['material'])).material).toBeUndefined();
    const revsiz = paket({ id: 'r', rev: '' });
    expect(kopyaAcikMi(revsiz, gonderilmis({ id: 's', rev: '' }), 'resim')).toBe(false);
    expect(kopyaAcikMi(revsiz, gonderilmis({ id: 's', rev: '' }), 'plan')).toBe(false);
    const k = benzerKopya(hedef, gonderilmis({ id: 's', kmResim: { id: 4, surum: 2 } }), new Set<KopyaAlani>(['plan']));
    expect(k.plan).toEqual(plan1);
    expect(k['kmResim']).toEqual({ id: 4, surum: 2 });
  });

  it('T5: aynı iş emrinin kendi (başka kimlikli) paketi aday olmaz', () => {
    const hedef = paket({ id: 'h' });
    const kendi = gonderilmis({ id: 'h-parca-1' });
    expect(benzerAdaylar(hedef, [kendi])).toEqual([]);
  });
});
