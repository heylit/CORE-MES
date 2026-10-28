import { describe, expect, it } from 'vitest';
import { AKTol } from './cekirdek.ts';
import { olcuOnerileri, type MetinOgesi, type OlcuOnerisi } from './okuma.ts';

// Okuyucunun teknik resim senaryoları (967 a). Girdiler uydurma yazı parçalarıdır; gerçek resim yoktur. Her parça PDF metin katmanındaki
// gibi ayrı bir öğedir: çerçeve hücreleri, istifli sapmalar ve tablo sütunları ayrı gelir.
const W = 2000, H = 1400, Y = 14;
type Parca = [string, number, number?];
const yazilar = (x: number, y: number, parcalar: readonly Parca[], a = 0): MetinOgesi[] =>
  parcalar.map(([s, dx, h = Y]) => ({ s, x: x + dx * Math.cos(a), y: y + dx * Math.sin(a), h, a, w: s.length * h * 0.6 }));
const oku = (items: MetinOgesi[], ink: Uint8Array | null = null) => olcuOnerileri(items, 'm', { w: W, h: H, ink, auto: 'low' });
const bul = (l: readonly OlcuOnerisi[], parca: string): OlcuOnerisi => {
  const o = l.find((x) => x.raw.includes(parca)); if (!o) throw new Error(parca + ' önerilmedi: ' + l.map((x) => x.raw).join(' ; ')); return o;
};

describe('geometrik tolerans çerçeveleri', () => {
  it('konum çerçevesinin hücreleri (⌀ ve Ⓜ ayrı yazı) tek öneri olur, düz çap sayılmaz', () => {
    const l = oku(yazilar(400, 300, [['⌖', 0], ['⌀0.05Ⓜ', 40], ['A', 120], ['B', 150], ['C', 180]]));
    const o = bul(l, '⌖');
    expect([o.kind, o.l, o.on]).toEqual(['gdt', 'Konum', false]);
    expect(o.tol).toContain('Ⓜ + bonus');
    expect(o.tol).toContain('A|B|C');
    expect(l.some((x) => x.kind === 'diameter')).toBe(false);
  });
  it('Ⓜ ya da Ⓛ ile sıfır konum toleransı okunur; değiştiricisiz sıfır okunmaz', () => {
    expect(bul(oku(yazilar(400, 300, [['⌖', 0], ['⌀0.0Ⓛ', 40], ['H', 120]])), '⌖').max).toBe(0);
    expect(oku(yazilar(400, 300, [['⌖', 0], ['0.0', 40], ['H', 120]])).some((x) => x.kind === 'gdt')).toBe(false);
  });
  it('bileşik çerçevenin iki satırı iki ayrı öneridir', () => {
    const l = oku([...yazilar(400, 300, [['⌖', 0], ['⌀0.5Ⓜ', 40], ['A', 120], ['B', 150], ['C', 180]]), ...yazilar(400, 318, [['⌖', 0], ['⌀0.1', 40], ['A', 120]])]);
    expect(l.filter((x) => x.kind === 'gdt').map((x) => x.max).sort()).toEqual([0.1, 0.5]);
  });
});

describe('sapma ve uyum', () => {
  it('bitişik tek sapma basamak çalmaz: öbür sapma okunmadı diye işaretlenir, güveni düşer', () => {
    const o = bul(oku(yazilar(400, 300, [['Ø6.147+0.1524', 0]])), 'Ø6.147');
    expect([o.min, o.max]).toEqual([6.147, 6.2994]);
    expect(o.note).toContain('okunmadı');
    expect(o.lvl).not.toBe('high');
    expect(o.on).toBe(false);
  });
  it('aynı satırda ayrı yazılmış iki sapma birleşir', () => {
    const o = bul(oku(yazilar(400, 300, [['18', 0], ['+0.1', 30, 10], ['-0.05', 70, 10]])), '18');
    expect([o.min, o.max]).toEqual([17.95, 18.1]);
  });
  it('istifli sapma (üst satır, alt satır) birleşir', () => {
    const o = bul(oku([...yazilar(400, 300, [['Ø40', 0]]), ...yazilar(432, 292, [['+0.025', 0, 9]]), ...yazilar(432, 304, [['0', 0, 9]])]), 'Ø40');
    expect([o.min, o.max]).toEqual([40, 40.025]);
  });
  it('ISO 286 uyumu sınırları tablodan gelir', () => {
    const o = bul(oku(yazilar(400, 300, [['Ø25 H7', 0]])), 'Ø25');
    expect([o.min, o.max]).toEqual([25, 25.021]);
    expect(bul(oku(yazilar(400, 300, [['Ø45 F8', 0]])), 'Ø45').max).toBe(45.064);
  });
  it('IT18 üstü "uyum" uyum sayılmaz; tabloda olmayan uyum sıfır tolerans gibi görünmez', () => {
    expect(oku(yazilar(400, 300, [['78 F81', 0]])).some((x) => x.raw.includes('F81') && x.tol.includes('0 / 0'))).toBe(false);
    const o = bul(oku(yazilar(400, 300, [['Ø25 Z7', 0]])), 'Ø25');
    expect([o.unknown, o.lvl, o.on]).toEqual([true, 'low', false]);
    expect(o.tol).toContain('tablosunda yok');
  });
});

describe('delik çağrıları ve delik tablosu', () => {
  it('düz havşa, spot face, derinlik ve Ø × derinlik notu', () => {
    expect(bul(oku(yazilar(400, 300, [['4× ⌀7 THRU ⌴ ⌀10 ↧ 5', 0]])), '⌀7').note).toBe('THRU havşa Ø10 derinlik 5');
    expect(bul(oku(yazilar(400, 300, [['⌀40 THRU ⌴SF ⌀120 ↧ 8', 0]])), '⌀40').note).toContain('spot face');
    expect(bul(oku(yazilar(400, 300, [['2× ø10.16 × 3.429', 0]])), 'ø10.16').note).toBe('derinlik 3.429');
  });
  it('delik tablosunda satır başına bir delik önerisi gelir; koordinat sütunları gelmez', () => {
    const ink = new Uint8Array(W * H);
    for (const y of [640, 670, 700, 730, 760]) for (let x = 1100; x < 1700; x++) ink[y * W + x] = 1;
    const satir = (y: number, tag: string, cagri: string, x: string, yy: string) => yazilar(1110, y, [[tag, 0], [cagri, 60], [x, 360], [yy, 460]]);
    const items = [...yazilar(1110, 662, [['TAG', 0], ['HOLE', 60], ['X', 360], ['Y', 460]]),
      ...satir(692, 'A1', '⌀10.541 THRU ⌴ ⌀15.88 ↧ 12.7', '285.75', '-57.15'), ...satir(722, 'A2', '⌀10.541 THRU ⌴ ⌀15.88 ↧ 12.7', '19.05', '-57.15'),
      ...satir(752, 'B1', 'M8x1.25-6H', '76.2', '-158.75')];
    const l = oku(items, ink);
    const delik = l.filter((o) => o.l.startsWith('Delik '));
    expect(delik.map((o) => o.l.split(' · ')[0]).sort()).toEqual(['Delik A1', 'Delik A2', 'Delik B1']);
    expect(delik.every((o) => !o.on)).toBe(true);
    expect(l.some((o) => ['285.75', '19.05', '76.2'].includes(o.raw))).toBe(false);
  });
});

describe('açı, pah ve diş', () => {
  it('uzunluk × açı ondalıklı ve küçük açıyla okunur; pahdan ayrı adlandırılır', () => {
    const o = bul(oku(yazilar(400, 300, [['4× 38.1 × 9.46°', 0]])), '38.1');
    expect([o.kind, o.l.startsWith('Uzunluk × açı'), o.nom]).toEqual(['chamfer', true, '4× 38.1 × 9.46°']);
    expect(bul(oku(yazilar(400, 300, [['1x45°', 0]])), '1x45').l.startsWith('Pah')).toBe(true);
    expect(bul(oku(yazilar(400, 300, [['C1', 0]])), 'C1').kind).toBe('chamfer');
  });
  it('metrik diş ve toleransı mastarla ölçülür', () => {
    const o = bul(oku(yazilar(400, 300, [['M10x1.5-6H', 0]])), 'M10');
    expect([o.kind, o.gauge, o.tool]).toEqual(['thread', true, 'Diş mastarı']);
  });
});

describe('resim düzeni', () => {
  it('dik yazılmış ölçü aynı okunur', () => {
    const o = bul(oku(yazilar(400, 600, [['Ø40 H7', 0]], -Math.PI / 2)), 'Ø40');
    expect([o.min, o.max]).toEqual([40, 40.025]);
  });
  it('antet satırları ve ölçek ölçü sayılmaz; genel tolerans sınıfı antetten okunur', () => {
    const antet = [...yazilar(1500, 1250, [['ÖLÇEK', 0], ['1:2', 120]]), ...yazilar(1500, 1280, [['MALZEME', 0], ['C45', 120]]),
      ...yazilar(1500, 1310, [['GENEL TOL.', 0], ['ISO 2768-f', 120]]), ...yazilar(1500, 1340, [['TARİH', 0], ['2026-10-27', 120]])];
    const cls = AKTol.detectClass([...antet, ...yazilar(400, 300, [['64', 0]])].map((o) => o.s).join(' '));
    expect(cls).toBe('f');
    const l = olcuOnerileri([...antet, ...yazilar(400, 300, [['64', 0]])], cls, { w: W, h: H, auto: 'low' });
    expect(l.map((o) => o.raw)).toEqual(['64']);
    expect(l[0]!.tol).toBe('±0.15 (ISO 2768-f)');
  });
});
