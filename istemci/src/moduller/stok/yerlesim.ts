import type { Numaralama, RafTuru } from '#paylasilan/sozlesme/stok.ts';

// Önizlemedeki depo geometrisi (saf). Rafın kendi ekseni: derinlik x'te [-dep/2, dep/2], bölmeler -z yönünde [0, -L];
// (x, z) rafın ilk bölmesinin kenarının ortası; açı saat yönünün tersine (üstten bakınca), derece.
export interface YerRafi { kod: string; tur: RafTuru; numaralama: Numaralama; ilkBolme: number; bolmeSayisi: number; katSayisi: number; bolmeGenislikM: number; derinlikM: number; katAraligiM: number; xM: number; zM: number; aci: number; onYuzTers: boolean }
export interface Bina { x0: number; x1: number; z0: number; z1: number }
export interface Kabul { x: number; z: number; genislik: number; derinlik: number }
export interface Nokta { x: number; z: number }

export const RAF_TIPLERI: Record<RafTuru, { ad: string; kisa: string; aciklama: string; bw: number; dep: number; lh: number; enCokKat: number; renk: string }> = {
  palet: { ad: 'Palet rafı', kisa: 'Palet', aciklama: 'Selektif; bir gözde 3 euro palet', bw: 2.7, dep: 1.1, lh: 1.5, enCokKat: 8, renk: 'var(--done)' },
  celik: { ad: 'Hafif çelik raf', kisa: 'Çelik raf', aciklama: 'Kasa, koli ve küçük parça', bw: 1.0, dep: 0.5, lh: 0.45, enCokKat: 10, renk: 'var(--idle)' },
  konsol: { ad: 'Konsol raf', kisa: 'Konsol', aciklama: 'Profil, boru, uzun malzeme', bw: 1.5, dep: 1.0, lh: 0.6, enCokKat: 6, renk: 'var(--hold)' },
  zemin: { ad: 'Zemin istif alanı', kisa: 'Zemin', aciklama: 'Rafsız blok istif', bw: 1.3, dep: 1.3, lh: 1.6, enCokKat: 1, renk: 'var(--hazard-ink)' },
};
export const KORIDOR = { genis: 3.4, sirt: 0.3 } as const;

export const harf = (i: number): string => String.fromCharCode(65 + i);
export const sutunAdi = (i: number): string => (i < 26 ? harf(i) : harf(Math.floor(i / 26) - 1) + harf(i % 26));
export const bolmeNo = (r: Pick<YerRafi, 'numaralama' | 'ilkBolme'>, k: number): number =>
  r.numaralama === 'tek' ? 2 * k + 1 : r.numaralama === 'cift' ? 2 * k + 2 : (r.ilkBolme || 1) + k;
const iki = (n: number): string => String(n).padStart(2, '0');
export const gozKodu = (kod: string, bolme: number, kat: number): string => `${kod}-${iki(bolme)}-${iki(kat)}`;
export const rafUzunlugu = (r: Pick<YerRafi, 'bolmeSayisi' | 'bolmeGenislikM'>): number => r.bolmeSayisi * r.bolmeGenislikM;
export const onYuz = (r: Pick<YerRafi, 'onYuzTers'>): number => (r.onYuzTers ? -1 : 1);

export function dunyaya(r: Pick<YerRafi, 'xM' | 'zM' | 'aci'>, lx: number, lz: number): Nokta {
  const t = (r.aci * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: r.xM + lx * c + lz * s, z: r.zM - lx * s + lz * c };
}
export function koseler(r: YerRafi, pay = 0): Nokta[] {
  const L = rafUzunlugu(r), d = r.derinlikM / 2;
  return ([[-d - pay, pay], [d + pay, pay], [d + pay, -L - pay], [-d - pay, -L - pay]] as const).map(([a, b]) => dunyaya(r, a, b));
}
// Ayrılan eksen sınaması (SAT): iki dönmüş dikdörtgen, A'ya `pay` kadar şişirilerek, çakışıyor mu.
export function carpisir(a: YerRafi, b: YerRafi, pay = 0): boolean {
  const A = koseler(a, pay), B = koseler(b);
  const izdus = (P: Nokta[], e: Nokta): [number, number] => { let mn = Infinity, mx = -Infinity; for (const p of P) { const v = p.x * e.x + p.z * e.z; mn = Math.min(mn, v); mx = Math.max(mx, v); } return [mn, mx]; };
  const eksenler = [A, B].flatMap((P) => [0, 1].map((k) => { const dx = P[k + 1]!.x - P[k]!.x, dz = P[k + 1]!.z - P[k]!.z, l = Math.hypot(dx, dz) || 1; return { x: -dz / l, z: dx / l }; }));
  return !eksenler.some((e) => { const p = izdus(A, e), q = izdus(B, e); return p[1] <= q[0] + 0.01 || q[1] <= p[0] + 0.01; });
}
export function cakisanlar<T extends YerRafi>(raflar: readonly T[], anahtar: (r: T) => string): Set<string> {
  const c = new Set<string>();
  for (let i = 0; i < raflar.length; i++) for (let j = i + 1; j < raflar.length; j++) if (carpisir(raflar[i]!, raflar[j]!)) { c.add(anahtar(raflar[i]!)); c.add(anahtar(raflar[j]!)); }
  return c;
}
const kabulRafi = (k: Kabul): YerRafi => ({ kod: '', tur: 'zemin', numaralama: 'sirali', ilkBolme: 1, bolmeSayisi: 1, katSayisi: 1, bolmeGenislikM: k.derinlik, derinlikM: k.genislik, katAraligiM: 1, xM: k.x, zM: k.z + k.derinlik / 2, aci: 0, onYuzTers: false });
// Boş yer bulma (önizlemedeki place): istenen noktaya en yakın, bina içinde, kabul alanına ve öteki raflara koridor payıyla değmeyen yer.
export function bosYerBul(r: YerRafi, digerleri: readonly YerRafi[], bina: Bina, kabul: Kabul, yakinX: number, yakinZ: number): Nokta | null {
  const adaylar: [number, number, number][] = [];
  for (let z = bina.z0 + 1; z <= bina.z1 - 1; z += 0.5) for (let x = bina.x0 + 1; x <= bina.x1 - 1; x += 0.5) adaylar.push([x, z, Math.hypot(x - yakinX, z - yakinZ)]);
  adaylar.sort((a, b) => a[2] - b[2]);
  const kr = kabulRafi(kabul);
  for (const [x, z] of adaylar) {
    const d = { ...r, xM: x, zM: z };
    if (koseler(d).some((p) => p.x < bina.x0 + 0.5 || p.x > bina.x1 - 0.5 || p.z < bina.z0 + 0.5 || p.z > bina.z1 - 0.5)) continue;
    if (carpisir(d, kr, 0.5) || digerleri.some((o) => carpisir(d, o, d.tur === 'zemin' || o.tur === 'zemin' ? 0.8 : 1.6))) continue;
    return { x, z };
  }
  return null;
}
export function sonrakiKod(raflar: readonly { kod: string }[]): string {
  const kullanilan = new Set(raflar.map((r) => r.kod));
  for (let i = 0; i < 26; i++) if (!kullanilan.has(harf(i))) return harf(i);
  for (let i = 1; i < 999; i++) if (!kullanilan.has(`R${i}`)) return `R${i}`;
  return 'X';
}
export function yeniRaf(tur: RafTuru, x: number, z: number, kod: string): YerRafi {
  const t = RAF_TIPLERI[tur];
  return { kod, tur, numaralama: 'sirali', ilkBolme: 1, xM: Math.round(x * 10) / 10, zM: Math.round(z * 10) / 10, aci: 0, onYuzTers: false,
    bolmeSayisi: tur === 'zemin' ? 4 : tur === 'celik' ? 6 : 7, katSayisi: tur === 'zemin' ? 1 : tur === 'celik' ? 5 : 4, bolmeGenislikM: t.bw, derinlikM: t.dep, katAraligiM: t.lh };
}
// Hiç yerleştirilmemiş (hepsi 0,0) raflar için ilk yerleşim: önizlemedeki koridor düzeni (sırt sırta çiftler, aralarında koridor).
export function yerlesmemisMi(raflar: readonly Pick<YerRafi, 'xM' | 'zM'>[]): boolean {
  return raflar.length > 0 && raflar.every((r) => r.xM === 0 && r.zM === 0);
}
export function ilkYerlesim<T extends YerRafi>(raflar: readonly T[], bina: Bina): T[] {
  let x = bina.x0 + 3;
  return raflar.map((r, i) => {
    const sag = i % 2 === 1;
    const yeni = { ...r, xM: Math.round((x + r.derinlikM / 2) * 10) / 10, zM: Math.round((bina.z1 - 8) * 10) / 10, aci: 0, onYuzTers: sag };
    x += r.derinlikM + (sag ? KORIDOR.sirt : KORIDOR.genis);
    return yeni;
  });
}
export function adresAraligi(r: YerRafi): [string, string] {
  return [gozKodu(r.kod || '?', bolmeNo(r, 0), 1), gozKodu(r.kod || '?', bolmeNo(r, r.bolmeSayisi - 1), r.tur === 'zemin' ? 1 : r.katSayisi)];
}
