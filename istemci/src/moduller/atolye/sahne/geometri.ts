import type { Alan, Duvar, IstasyonModeli, IstasyonYeri, MakineYeri, MerkezModeli, Raf, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { IstasyonTipi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { sayi } from '../kurallar.ts';

// Çizim geometrisi: kayıtlı yerleşimi ekrana yerleştirir. Kural değildir (kayıt denetimi sunucudadır);
// yürüyüş kipinde gövdenin öğelerin içinden geçmemesi de yalnız gösterimdir.

export interface Dikdortgen {
  x: number;
  z: number;
  donus: number;
  genislik: number;
  derinlik: number;
}

export interface Parca {
  bas: [number, number];
  son: [number, number];
}

export const istasyonKutusu = (y: IstasyonYeri): Dikdortgen => ({
  x: sayi(y.x), z: sayi(y.z), donus: sayi(y.donus), genislik: sayi(y.genislik), derinlik: sayi(y.derinlik),
});
export const makineKutusu = (m: MakineYeri): Dikdortgen => ({
  x: sayi(m.x), z: sayi(m.z), donus: sayi(m.donus), genislik: sayi(m.genislik), derinlik: sayi(m.derinlik),
});

// Haritada gövdesi çizilen nesne: makine yeri, ya da makinesi yerleşmemiş istasyon. Makinesi yerleşik istasyon
// yalnız çerçevedir. Canlı durum nesne anahtarıyla gelir; işlenen parça istasyondan (canliId: istasyon kimliği).
export interface SahneNesnesi {
  anahtar: string;
  kod: string;
  ad: string;
  tip: IstasyonTipi;
  aktif: boolean;
  kutu: Dikdortgen;
  canliId: number | null;
  model: IstasyonModeli | null;
  merkezModeli: MerkezModeli | null;
  merkezSahibi: number | null;
}

export function cerceveIstasyonlari(y: YerlesimCevabi): Set<number> {
  return new Set(y.makineYerleri.flatMap((m) => (m.istasyon ? [m.istasyon.id] : [])));
}

export function sahneNesneleri(y: YerlesimCevabi): SahneNesnesi[] {
  const cerceve = cerceveIstasyonlari(y);
  return [
    ...y.istasyonYerleri.filter((i) => !cerceve.has(i.istasyonId)).map((i): SahneNesnesi => ({
      anahtar: `istasyon:${i.istasyonId}`, kod: i.kod, ad: i.ad, tip: i.tip, aktif: i.aktif, kutu: istasyonKutusu(i), canliId: i.istasyonId,
      model: i.model, merkezModeli: i.merkezModeli, merkezSahibi: i.istasyonId,
    })),
    ...y.makineYerleri.map((m): SahneNesnesi => ({
      anahtar: `makine:${m.makineId}`, kod: m.kod, ad: m.ad, tip: m.istasyon?.tip ?? 'talasli', aktif: m.aktif, kutu: makineKutusu(m),
      canliId: m.istasyon?.id ?? null, model: m.model, merkezModeli: null, merkezSahibi: null,
    })),
  ];
}

export const rafKutusu = (r: Raf): Dikdortgen => ({
  x: sayi(r.x), z: sayi(r.z), donus: sayi(r.donus), genislik: sayi(r.genislik), derinlik: sayi(r.derinlik),
});
export const alanKutusu = (a: Alan): Dikdortgen => ({
  x: sayi(a.x), z: sayi(a.z), donus: sayi(a.donus), genislik: sayi(a.genislik), derinlik: sayi(a.derinlik),
});
export const duvarParcasi = (d: Duvar): Parca => ({ bas: [sayi(d.basX), sayi(d.basZ)], son: [sayi(d.sonX), sayi(d.sonZ)] });

export function koseler(k: Dikdortgen): [number, number][] {
  const a = (k.donus * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => [
    k.x + (sx * k.genislik * c) / 2 - (sz * k.derinlik * s) / 2,
    k.z + (sx * k.genislik * s) / 2 + (sz * k.derinlik * c) / 2,
  ]);
}

// Yerelden dünyaya: (lx, lz) kutunun merkezine göre.
export function dunyaya(k: Dikdortgen, lx: number, lz: number): [number, number] {
  const a = (k.donus * Math.PI) / 180;
  return [k.x + lx * Math.cos(a) - lz * Math.sin(a), k.z + lx * Math.sin(a) + lz * Math.cos(a)];
}

export function icindeMi(k: Dikdortgen, x: number, z: number, pay = 0): boolean {
  const a = (-k.donus * Math.PI) / 180;
  const dx = x - k.x;
  const dz = z - k.z;
  const yx = dx * Math.cos(a) - dz * Math.sin(a);
  const yz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(yx) <= k.genislik / 2 + pay && Math.abs(yz) <= k.derinlik / 2 + pay;
}

export interface OdaOlcusu extends Dikdortgen {
  kapi: { kenar: string; ofset: number; genislik: number } | null;
}

// Odanın dört kenarı; kapı bulunduğu kenarda boşluk bırakır (sunucudaki kayıt kuralıyla aynı yerleşim).
export function odaKenarlari(k: OdaOlcusu): Parca[] {
  const g = k.genislik / 2;
  const d = k.derinlik / 2;
  const kenarlar: { kenar: string; p: [number, number]; q: [number, number] }[] = [
    { kenar: 'arka', p: [-g, -d], q: [g, -d] },
    { kenar: 'sag', p: [g, -d], q: [g, d] },
    { kenar: 'on', p: [g, d], q: [-g, d] },
    { kenar: 'sol', p: [-g, d], q: [-g, -d] },
  ];
  const sonuc: Parca[] = [];
  for (const { kenar, p, q } of kenarlar) {
    const P = dunyaya(k, p[0], p[1]);
    const Q = dunyaya(k, q[0], q[1]);
    if (k.kapi === null || k.kapi.kenar !== kenar) { sonuc.push({ bas: P, son: Q }); continue; }
    const boy = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    const ux = (Q[0] - P[0]) / boy;
    const uz = (Q[1] - P[1]) / boy;
    const yon = kenar === 'on' || kenar === 'sol' ? -1 : 1;
    const orta = boy / 2 + yon * k.kapi.ofset;
    const k1 = orta - k.kapi.genislik / 2;
    const k2 = orta + k.kapi.genislik / 2;
    if (k1 > 0.01) sonuc.push({ bas: P, son: [P[0] + ux * k1, P[1] + uz * k1] });
    if (boy - k2 > 0.01) sonuc.push({ bas: [P[0] + ux * k2, P[1] + uz * k2], son: Q });
  }
  return sonuc;
}

export const odaParcalari = (a: Alan): Parca[] => odaKenarlari({
  ...alanKutusu(a),
  kapi: a.kapi ? { kenar: a.kapi.kenar, ofset: sayi(a.kapi.ofset), genislik: sayi(a.kapi.genislik) } : null,
});

// Yürüyüşte içinden geçilmeyen öğeler: istasyon, raf, palet, duvar ve oda kenarı.
export function katilar(y: YerlesimCevabi): { kutular: Dikdortgen[]; parcalar: Parca[] } {
  const kutular = [
    ...sahneNesneleri(y).map((n) => n.kutu),
    ...y.raflar.map(rafKutusu),
    ...y.alanlar.filter((a) => a.tur === 'palet').map(alanKutusu),
  ];
  const parcalar = [
    ...y.duvarlar.map(duvarParcasi),
    ...y.alanlar.filter((a) => a.tur === 'oda' || a.tur === 'cam_oda').flatMap(odaParcalari),
  ];
  return { kutular, parcalar };
}

export function parcayaUzaklik(px: number, pz: number, p: Parca): number {
  const [ax, az] = p.bas;
  const [bx, bz] = p.son;
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// Oda kapısının merkezi (kayıt koordinatı), kenarın doğrultusu (radyan) ve genişliği; kapı yoksa null.
export function kapiKonumu(a: Alan): { x: number; z: number; aci: number; genislik: number } | null {
  if (!a.kapi) return null;
  const k: OdaOlcusu = { ...alanKutusu(a), kapi: { kenar: a.kapi.kenar, ofset: sayi(a.kapi.ofset), genislik: sayi(a.kapi.genislik) } };
  const g = k.genislik / 2;
  const d = k.derinlik / 2;
  const kenarlar: Record<string, { p: [number, number]; q: [number, number] }> = {
    arka: { p: [-g, -d], q: [g, -d] }, sag: { p: [g, -d], q: [g, d] }, on: { p: [g, d], q: [-g, d] }, sol: { p: [-g, d], q: [-g, -d] },
  };
  const e = kenarlar[a.kapi.kenar];
  if (!e || !k.kapi) return null;
  const P = dunyaya(k, e.p[0], e.p[1]);
  const Q = dunyaya(k, e.q[0], e.q[1]);
  const boy = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  const yon = a.kapi.kenar === 'on' || a.kapi.kenar === 'sol' ? -1 : 1;
  const orta = boy / 2 + yon * k.kapi.ofset;
  const ux = (Q[0] - P[0]) / boy;
  const uz = (Q[1] - P[1]) / boy;
  return { x: P[0] + ux * orta, z: P[1] + uz * orta, aci: Math.atan2(uz, ux), genislik: k.kapi.genislik };
}
