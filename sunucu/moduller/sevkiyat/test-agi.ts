// Testler için uydurma yol ağı: düz bir ızgara (gerçek harita verisi değildir).
import type { HaritaDosyasi, HaritaKaynagi, HaritaPaketi } from './servis.ts';
import { yolAgiKur } from './yol-agi.ts';
import type { YolVerisi } from './yol-agi.ts';

export const IZGARA_SINIRI: [number, number, number, number] = [32.70, 39.90, 32.86, 40.02];
const OLCEK = 100000, ADIM = 0.01; // ~0,85 km boylam, ~1,1 km enlem

// boyut x boyut düğüm; yatay yollar 'primary', dikeyler 'secondary'; ortadaki dikey yol tek yön (güneye).
export function izgaraYolVerisi(boyut = 12): YolVerisi {
  const [bati, guney] = IZGARA_SINIRI, nodes: number[] = [], edges: number[] = [], geom: number[] = [];
  const dugum = (i: number, j: number) => i * boyut + j;
  for (let i = 0; i < boyut; i++) for (let j = 0; j < boyut; j++) nodes.push(Math.round(j * ADIM * OLCEK), Math.round(i * ADIM * OLCEK));
  const kenar = (a: number, b: number, sinif: number, tekYon: number, ad: number) => {
    const geometriBasi = geom.length / 2;
    geom.push(nodes[2 * a]!, nodes[2 * a + 1]!, nodes[2 * b]!, nodes[2 * b + 1]!);
    const boylamFarki = (nodes[2 * a]! - nodes[2 * b]!) / OLCEK * 111320 * Math.cos((39.96 * Math.PI) / 180), enlemFarki = (nodes[2 * a + 1]! - nodes[2 * b + 1]!) / OLCEK * 110540;
    edges.push(a, b, sinif, tekYon, Math.round(Math.hypot(boylamFarki, enlemFarki)), ad, 0, geometriBasi, 2);
  };
  for (let i = 0; i < boyut; i++) for (let j = 0; j < boyut - 1; j++) kenar(dugum(i, j), dugum(i, j + 1), 0, 0, i % 2 ? 0 : 1);
  for (let i = 0; i < boyut - 1; i++) for (let j = 0; j < boyut; j++) kenar(dugum(i + 1, j), dugum(i, j), 1, j === Math.floor(boyut / 2) ? 1 : 0, -1);
  return { bbox: [bati, guney, IZGARA_SINIRI[2], IZGARA_SINIRI[3]], q: OLCEK, classes: ['primary', 'secondary'], nodes, edges, geom, names: ['Deneme Bulvarı', 'Örnek Caddesi'] };
}

export function izgaraKaynagi(): HaritaKaynagi {
  const yol = izgaraYolVerisi();
  const harita: HaritaDosyasi = { bbox: yol.bbox, q: yol.q, roads: { rail: [], minor: [] }, water: [], green: [], urban: [], industrial: [], airport: [], places: [['Deneme Semti', 2000, 3000, 'suburb', 11]] };
  const paket: HaritaPaketi = { harita, yol, ag: yolAgiKur(yol), arama: null };
  return () => Promise.resolve(paket);
}
