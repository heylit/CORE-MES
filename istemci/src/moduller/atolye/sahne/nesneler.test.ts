import { describe, expect, it } from 'vitest';
import { Box3, Group, Mesh, Texture } from 'three';
import type { Object3D } from 'three';
import { andon, andonKolonu, gozCephesi, istasyonGovdesi, modelBolgesi, netKatlar, rafYukleri, malzemeleriKur, palet, rafGovdesi } from './nesneler.ts';
import type { GozYuku, Malzemeler, YukBicimi } from './nesneler.ts';
import { paletOku } from './renkler.ts';

// Gerçeklik denetimi: her parça zemine ya da zemine bağlı bir parçaya değer (havada duran kol, kafa, panel yok)
// ve gövde ayak izinin dışına taşmaz. Ölçü, parçanın köşelerinden değil köşe noktalarından hesaplanır (dönük parça da).

const DEGME = 0.012;

function kopuklar(kok: Object3D): string[] {
  kok.updateMatrixWorld(true);
  const parcalar: { ad: string; kutu: Box3 }[] = [];
  kok.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const kutu = new Box3().setFromObject(o, true);
    const b = kutu.getSize(o.position.clone());
    const c = kutu.getCenter(o.position.clone());
    parcalar.push({ ad: `${b.x.toFixed(2)}x${b.y.toFixed(2)}x${b.z.toFixed(2)} @ ${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}`, kutu });
  });
  const bagli = new Set<number>();
  const kuyruk: number[] = [];
  parcalar.forEach((p, i) => { if (p.kutu.min.y <= DEGME) { bagli.add(i); kuyruk.push(i); } });
  while (kuyruk.length) {
    const i = kuyruk.pop() as number;
    const a = parcalar[i]?.kutu.clone().expandByScalar(DEGME);
    if (!a) continue;
    parcalar.forEach((p, j) => {
      if (!bagli.has(j) && a.intersectsBox(p.kutu)) { bagli.add(j); kuyruk.push(j); }
    });
  }
  return parcalar.filter((_, i) => !bagli.has(i)).map((p) => p.ad);
}

function tasanlar(kok: Object3D, g: number, d: number, pay = 0.06): string[] {
  kok.updateMatrixWorld(true);
  const sonuc: string[] = [];
  kok.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const k = new Box3().setFromObject(o, true);
    if (k.min.x < -g / 2 - pay || k.max.x > g / 2 + pay || k.min.z < -d / 2 - pay || k.max.z > d / 2 + pay) {
      sonuc.push(`${k.min.x.toFixed(2)}..${k.max.x.toFixed(2)} x ${k.min.z.toFixed(2)}..${k.max.z.toFixed(2)}`);
    }
  });
  return sonuc;
}

const malzeme = (): Malzemeler => malzemeleriKur(paletOku(), new Texture(), new Texture());

const ISTASYONLAR: [string, string, number, number][] = [
  ['talasli', 'Dik işleme merkezi', 3.5, 3.3],
  ['talasli', 'Dik işleme merkezi', 2.6, 2.4],
  ['talasli', '5 eksen işleme', 3.8, 3.5],
  ['talasli', 'CNC torna', 3.9, 2.5],
  ['markalama', 'Fiber lazer', 6, 3],
  ['markalama', 'Fiber lazer', 9.5, 3.4],
  ['kalite', 'CMM ölçüm', 4.2, 2],
  ['montaj', 'Montaj istasyonu', 3, 1.4],
  ['boya', 'Boya kabini', 3.5, 3.5],
  ['depo', 'Depo', 3, 2],
];

describe('sahne nesneleri gerçeklik denetimi', () => {
  it.each(ISTASYONLAR)('istasyon %s (%s, %s x %s): parçalar birbirine bağlı, ayak izi içinde', (tip, ad, g, d) => {
    const m = malzeme();
    const p = paletOku();
    const h = istasyonGovdesi(tip, ad, g, d, p, m, new Texture());
    andon(h.grup, p, m, new Texture(), ...h.andonYeri);
    expect(kopuklar(h.grup)).toEqual([]);
    expect(tasanlar(h.grup, g, d)).toEqual([]);
  });

  it.each([
    ['palet', 3, 4, 2, 2.7, 1.1, 5],
    ['kucuk_parca', 4, 5, 3, 1, 0.6, 2.2],
    ['konsol', 3, 4, 1, 1.6, 1.2, 3.5],
    ['zemin', 3, 1, 1, 1.5, 3, 0.25],
  ] as const)('raf %s: parçalar birbirine bağlı, ölçü içinde', (tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik) => {
    const r: Group = rafGovdesi({ tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik }, malzeme());
    expect(kopuklar(r)).toEqual([]);
    expect(tasanlar(r, bolme * bolmeGenisligi, derinlik, 0.1)).toEqual([]);
  });

  it.each([
    ['palet', 3, 4, 2, 2.7, 1.1, 5, ['koli', 'kasa', 'sac', 'cubuk']],
    ['kucuk_parca', 4, 5, 3, 1, 0.6, 2.2, ['parca', 'koli']],
    ['konsol', 3, 4, 1, 1.6, 1.2, 3.5, ['cubuk', 'sac']],
    ['zemin', 3, 1, 1, 1.5, 3, 0.25, ['sac']],
  ] as const)('raf %s dolu: her yük rafa ya da zemine oturur, raftan taşmaz', (tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik, bicimler) => {
    const olcu = { tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik };
    const m = malzeme();
    const yukler: GozYuku[] = [];
    let i = 0;
    for (let b = 1; b <= bolme; b++) for (let k = 1; k <= kat; k++) for (let g = 1; g <= goz; g++) {
      yukler.push({ bolme: b, kat: k, goz: g, bicim: bicimler[i % bicimler.length] as YukBicimi, doluluk: [1, 0.5, 0.1][i % 3] ?? 1 });
      i += 1;
    }
    const r = rafGovdesi(olcu, m);
    const yuk = rafYukleri(olcu, yukler, m);
    expect(yuk.children.length).toBeGreaterThan(0);
    r.add(yuk);
    expect(kopuklar(r)).toEqual([]);
    expect(tasanlar(r, bolme * bolmeGenisligi, derinlik, 0.1)).toEqual([]);
  });

  it.each([
    ['palet', 3, 4, 2, 2.7, 1.1, 5],
    ['kucuk_parca', 4, 5, 3, 1, 0.6, 2.2],
    ['konsol', 3, 4, 1, 1.6, 1.2, 3.5],
    ['zemin', 3, 1, 1, 1.5, 3, 0.25],
  ] as const)('raf %s: model bölgesi gözün içinde, taşıyıcının üstünde; modelli yükte yalnız palet çizilir', (tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik) => {
    const olcu = { tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik };
    const boy = bolme * bolmeGenisligi;
    for (let b = 1; b <= bolme; b++) for (let k = 1; k <= kat; k++) for (let g = 1; g <= goz; g++) {
      const z = modelBolgesi(olcu, { bolme: b, kat: k, goz: g });
      expect(z).not.toBeNull();
      if (!z) continue;
      expect(z.x - z.g / 2).toBeGreaterThanOrEqual(-boy / 2 - 1e-6);
      expect(z.x + z.g / 2).toBeLessThanOrEqual(boy / 2 + 1e-6);
      expect(Math.abs(z.z) + z.d / 2).toBeLessThanOrEqual(derinlik / 2 + 0.06);
      expect(z.g).toBeGreaterThan(0.1);
      expect(z.h).toBeGreaterThan(0.1);
    }
    expect(modelBolgesi(olcu, { bolme: bolme + 1, kat: 1, goz: 1 })).toBeNull();
    const yuk = rafYukleri(olcu, [{ bolme: 1, kat: 1, goz: 1, bicim: 'model', doluluk: 1 }], malzeme());
    expect(yuk.children.length).toBe(tur === 'palet' ? 1 : 0);
  });

  it('raf dışındaki ya da boş göz çizilmez', () => {
    const olcu = { tur: 'palet', bolme: 1, kat: 2, goz: 1, bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 3 };
    const yuk = rafYukleri(olcu, [{ bolme: 2, kat: 1, goz: 1, bicim: 'koli', doluluk: 1 }, { bolme: 1, kat: 1, goz: 1, bicim: 'koli', doluluk: 0 }], malzeme());
    expect(yuk.children.length).toBe(0);
  });

  it('andon kolonu zemine oturur, parçaları bağlı', () => {
    const g = new Group();
    const a = andonKolonu(g, paletOku(), malzeme(), new Texture(), 0, 0, 2);
    expect(kopuklar(g)).toEqual([]);
    expect(a.ust).toBeGreaterThan(2.5);
  });

  it('palet zemine oturur', () => {
    expect(kopuklar(palet(malzeme(), 1.2, 0.8))).toEqual([]);
  });
});

describe('göz ön yüzü (bölmeye karşıdan bakış)', () => {
  const olcu = (tur: string, bolme = 3, kat = 4, goz = 2) => ({ tur, bolme, kat, goz, bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 5 });
  it('gözler bölmeyi boşluksuz ve taşmadan böler; kat sırası aşağıdan yukarı', () => {
    for (const tur of ['palet', 'kucuk_parca', 'konsol', 'zemin']) {
      const r = olcu(tur, 3, tur === 'zemin' ? 1 : 4, 2);
      for (let b = 1; b <= r.bolme; b++) {
        const g1 = gozCephesi(r, { bolme: b, kat: 1, goz: 1 });
        const g2 = gozCephesi(r, { bolme: b, kat: 1, goz: 2 });
        expect(g1 && g2).toBeTruthy();
        if (!g1 || !g2) continue;
        expect(g2.x - g1.x).toBeCloseTo((g1.g + g2.g) / 2, 5);
        const sol = -(r.bolme * r.bolmeGenisligi) / 2 + (b - 1) * r.bolmeGenisligi;
        expect(g1.x - g1.g / 2).toBeGreaterThanOrEqual(sol - 1e-6);
        expect(g2.x + g2.g / 2).toBeLessThanOrEqual(sol + r.bolmeGenisligi + 1e-6);
      }
      if (r.kat > 1) {
        const alt = gozCephesi(r, { bolme: 1, kat: 1, goz: 1 });
        const ust = gozCephesi(r, { bolme: 1, kat: 2, goz: 1 });
        expect(alt && ust && ust.y >= alt.y + alt.h - 0.2).toBe(true);
        const tepe = gozCephesi(r, { bolme: 1, kat: r.kat, goz: 1 });
        expect(tepe && tepe.y + tepe.h).toBeLessThanOrEqual(r.yukseklik + 1e-6);
      }
    }
    expect(gozCephesi(olcu('palet'), { bolme: 4, kat: 1, goz: 1 })).toBeNull();
    expect(gozCephesi(olcu('palet'), { bolme: 1, kat: 1, goz: 3 })).toBeNull();
  });
});

describe('kat kat net ölçü', () => {
  const NET = [
    ['palet', 3, 4, 2, 2.7, 1.1, 5, [1.5, 1.4, 1.3, 1.2]],
    ['kucuk_parca', 4, 5, 3, 1, 0.6, 2.2, [0.35, 0.35, 0.35, 0.35, 0.35]],
    ['konsol', 3, 4, 1, 1.6, 1.2, 3.5, [0.8, 0.7, 0.7, 0.6]],
    ['zemin', 3, 1, 1, 1.5, 3, 0.25, [0.5]],
  ] as const;

  it.each(NET)('raf %s: gövde ve dolu gözler bağlı, ölçü içinde', (tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik, katlar) => {
    const olcu = { tur, bolme, kat, goz, bolmeGenisligi, derinlik, yukseklik, katlar, gozGenisligi: bolmeGenisligi / goz - 0.2, gozDerinligi: derinlik - 0.2 };
    const m = malzeme();
    const yukler: GozYuku[] = [];
    for (let b = 1; b <= bolme; b++) for (let k = 1; k <= kat; k++) for (let g = 1; g <= goz; g++) yukler.push({ bolme: b, kat: k, goz: g, bicim: 'koli', doluluk: 1 });
    const r = rafGovdesi(olcu, m);
    r.add(rafYukleri(olcu, yukler, m));
    expect(kopuklar(r)).toEqual([]);
    expect(tasanlar(r, bolme * bolmeGenisligi, derinlik, 0.1)).toEqual([]);
  });

  it('model bölgesi ölçülen net boşluktur: taşıyıcının üstünde, bir üst taşıyıcının altında', () => {
    const p = { tur: 'palet', bolme: 3, kat: 4, goz: 2, bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 5, katlar: [1.5, 1.4, 1.3, 1.2], gozGenisligi: 1.2, gozDerinligi: 1 };
    const z = modelBolgesi(p, { bolme: 1, kat: 2, goz: 1 });
    // Kat 2: zemin + 1,50 net + 0,12 kiriş; paletin üstü +0,14.
    expect([z?.y, z?.h, z?.g, z?.d].map((v) => Math.round((v ?? 0) * 1000) / 1000)).toEqual([1.76, 1.26, 1.2, 1]);
    const k = modelBolgesi({ ...p, tur: 'konsol', goz: 1, bolmeGenisligi: 1.6, derinlik: 1.2, katlar: [0.8, 0.7, 0.7, 0.6], gozGenisligi: null, gozDerinligi: null }, { bolme: 1, kat: 2, goz: 1 });
    expect([k?.y, k?.h].map((v) => Math.round((v ?? 0) * 1000) / 1000)).toEqual([1.32, 0.7]);
    const kp = modelBolgesi({ ...p, tur: 'kucuk_parca', kat: 5, katlar: [0.35, 0.35, 0.35, 0.35, 0.35] }, { bolme: 1, kat: 3, goz: 1 });
    expect([kp?.y, kp?.h].map((v) => Math.round((v ?? 0) * 10000) / 10000)).toEqual([0.8625, 0.35]);
    expect(modelBolgesi({ ...p, tur: 'zemin', kat: 1, katlar: [0.5] }, { bolme: 1, kat: 1, goz: 1 })?.h).toBe(0.5);
  });

  it('ölçü girilmeyen ya da kat sayısıyla uyuşmayan dizi bugünkü hesabı değiştirmez', () => {
    const p = { tur: 'palet', bolme: 3, kat: 4, goz: 2, bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 5 };
    const once = modelBolgesi(p, { bolme: 2, kat: 3, goz: 1 });
    expect(modelBolgesi({ ...p, katlar: null, gozGenisligi: null, gozDerinligi: null }, { bolme: 2, kat: 3, goz: 1 })).toEqual(once);
    expect(modelBolgesi({ ...p, katlar: [1, 1] }, { bolme: 2, kat: 3, goz: 1 })).toEqual(once);
    expect(netKatlar({ ...p, katlar: [1, 1] })).toBeNull();
    expect(gozCephesi({ ...p, katlar: null }, { bolme: 1, kat: 2, goz: 1 })).toEqual(gozCephesi(p, { bolme: 1, kat: 2, goz: 1 }));
  });
});
