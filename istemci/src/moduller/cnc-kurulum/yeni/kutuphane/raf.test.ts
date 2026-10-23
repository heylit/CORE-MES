import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../depo.ts';
import { defaults } from '../durum.ts';
import { allMachines, dirtyUsage, invKey, stockOf } from '../secici.ts';
import {
  allShelves, bumpMin, bumpQty, deleteCustom, itemById, matches, ozet, saveEdit, setActive, setLoc, setMin, setQty, stokCsvAdi, stokCsvMetni,
  suzulmusRaflar, toolTags, type Kalem,
} from './raf.ts';

// Durum her testte prototipin varsayılanına döner; yazma katmanı bu testte çağrılmaz.
vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));

function sifirla(): void {
  const d = defaults() as Record<string, unknown>;
  for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
  Object.assign(state, d);
  dirtyUsage();
}

// Kullanım yalnız tanımlı tezgâhlarda sayılır.
const T1 = (): string => allMachines()[0]!.id;
const ilkKalem = (): { raf: string; it: Kalem } => {
  const r = allShelves().find((s) => s.items.length > 0)!;
  return { raf: r.key, it: r.items[0]! };
};

describe('kütüphane rafları', () => {
  beforeEach(sifirla);

  it('raf sırası prototipteki gibidir: takım kategorileri, uçlar, tutucular, aparat, çene, ölçüm, sarf', () => {
    const anahtarlar = allShelves().map((s) => s.key);
    expect(anahtarlar.slice(-4)).toEqual(['fix', 'jaw', 'meas', 'cons']);
    expect(anahtarlar).toContain('ins');
    expect(anahtarlar).toContain('h_lathe');
  });

  it('arama her kelimeyi ad, kod, etiket ve açıklamada arar (Türkçe küçük harf)', () => {
    const { it: k } = ilkKalem();
    expect(matches(k, { q: k.name.toLocaleUpperCase('tr-TR'), mach: '', low: false })).toBe(true);
    expect(matches(k, { q: `${k.name} yokboylebirsey`, mach: '', low: false })).toBe(false);
  });

  it('kritik/eksik süzgeci yalnız düşük ve eksik stoğu bırakır', () => {
    const { it: k } = ilkKalem();
    const key = invKey(k);
    expect(matches(k, { q: '', mach: '', low: true })).toBe(false);
    setQty(key, '2'); setMin(key, '5');
    expect(stockOf(key).st).toBe('low');
    expect(matches(k, { q: '', mach: '', low: true })).toBe(true);
  });

  it('tezgâh süzgeci yalnız o tezgâhta aktif kalemi bırakır; boş raf listeden düşer', () => {
    const { it: k } = ilkKalem();
    expect(suzulmusRaflar({ q: '', mach: 'yok-tezgah', low: false })).toEqual([]);
    setActive(T1(), invKey(k), 1);
    expect(suzulmusRaflar({ q: '', mach: T1(), low: false }).flatMap((r) => r.items.map((x) => x.id))).toContain(k.id);
  });
});

describe('stok işlemleri', () => {
  beforeEach(sifirla);

  it('adet sıfırın altına inmez; boş metin "stok girilmedi"dir', () => {
    const key = invKey(ilkKalem().it);
    bumpQty(key, -1);
    expect(state.inv[key]!.qty).toBe(0);
    setQty(key, '');
    expect(state.inv[key]!.qty).toBeNull();
    expect(stockOf(key).st).toBe('none');
    setQty(key, 'abc');
    expect(state.inv[key]!.qty).toBe(0);
  });

  it('kritik seviye ve konum yazılır', () => {
    const key = invKey(ilkKalem().it);
    bumpMin(key, 1); bumpMin(key, 1); bumpMin(key, -5);
    expect(state.inv[key]!.min).toBe(0);
    setLoc(key, 'Dolap A');
    expect(state.inv[key]!.loc).toBe('Dolap A');
  });

  it('elle atama sıfıra inince silinir; kullanım stoğa yansır', () => {
    const key = invKey(ilkKalem().it);
    setQty(key, '3');
    setActive(T1(), key, 2);
    expect(stockOf(key)).toMatchObject({ used: 2, avail: 1 });
    setActive(T1(), key, -2);
    expect(state.active[T1()]![key]).toBeUndefined();
    setActive(T1(), key, 5);
    expect(stockOf(key).st).toBe('short');
  });
});

describe('özel kalem', () => {
  beforeEach(sifirla);

  it('şablondan yeni kalem: kimlik, raf, temel ve başlangıç stoğu', () => {
    const { raf, it: base } = ilkKalem();
    const sonuc = saveEdit({ mode: 'new', base, shelf: raf }, { name: 'Kopya', code: 'K1', desc: '', d: '', z: '', qty: '4' }, 1000);
    expect(sonuc.id).toBe('u' + (1000).toString(36));
    const yeni = itemById(sonuc.id)!;
    expect(yeni).toMatchObject({ name: 'Kopya', code: 'K1', custom: true, base: base.id });
    expect(state.inv[sonuc.id]).toEqual({ qty: 4, min: 0, loc: '' });
  });

  it('düzenleme çap ve ağız sayısını günceller, etiket yeniden yazılır', () => {
    const takim = allShelves().flatMap((s) => s.items).find((x) => x.isTool && x.d && x.z)!;
    const { id } = saveEdit({ mode: 'new', base: takim, shelf: takim.cat }, { name: '', code: '', desc: '', d: '12,5', z: '3', qty: '' }, 2000);
    const k = itemById(id)!;
    expect(k.d).toBe(12.5);
    expect(k.z).toBe(3);
    expect(k.tags).toBe(toolTags(k));
    expect(k.tags).toContain('Ø12,5');
  });

  it('silme kalemi, stoğunu ve atamalarını kaldırır', () => {
    const { raf, it: base } = ilkKalem();
    const { id } = saveEdit({ mode: 'new', base, shelf: raf }, { name: 'Sil', code: '', desc: '', d: '', z: '', qty: '1' }, 3000);
    setActive(T1(), id, 1);
    deleteCustom(itemById(id)!);
    expect(itemById(id)).toBeNull();
    expect(state.inv[id]).toBeUndefined();
    expect(state.active[T1()]![id]).toBeUndefined();
  });
});

describe('özet ve Stok CSV', () => {
  beforeEach(sifirla);

  it('özet stok durumlarını sayar', () => {
    const key = invKey(ilkKalem().it);
    const once = ozet();
    setQty(key, '1'); setActive(T1(), key, 3);
    const sonra = ozet();
    expect(sonra.entered).toBe(once.entered + 1);
    expect(sonra.short).toBe(once.short + 1);
  });

  it('CSV prototip biçimindedir: BOM, noktalı virgül, CRLF, gerektiğinde tırnak', () => {
    const key = invKey(ilkKalem().it);
    setLoc(key, 'Raf; "A"');
    const metin = stokCsvMetni();
    expect(metin.startsWith('﻿Raf;Malzeme;Kod;Toplam;Kritik;Aktif;Depoda;Konum;Tezgâhlar\r\n')).toBe(true);
    expect(metin).toContain('"Raf; ""A"""');
    expect(stokCsvAdi(new Date('2026-10-23T10:00:00Z'))).toBe('CNC_Stok_2026-10-23.csv');
  });
});
