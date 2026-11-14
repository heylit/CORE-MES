import { adimDali, adimOnculleri, fasonMu, sirali, type Adim } from './kurallar.ts';

// 3248: yatay hat ve süre şeridi. Rota soldan sağa akar; ana hat ve her dal kendi şeridindedir. Veri ve öncül kuralı değişmez
// (paylasilan/sozlesme/rota-dal-kurali.ts); yerleşim ve zaman her çizimde hesaplanır.

export const ANA_HAT = '';

// Tek hatlı rotada öncül sıradaki bir önceki adımdır; dallı rotada türetilmiş öncüllerdir (boş dizi: hiçbir adımı beklemez).
export function hatOnculleri(adimlar: readonly Adim[]): Map<string, Adim[]> {
  const l = sirali(adimlar);
  const onc = adimOnculleri(l);
  return new Map(l.map((a, i) => [a.id, onc[i] ?? (i > 0 ? [l[i - 1]].flatMap((x) => x ?? []) : [])]));
}

// Şeritler: ana hat önce, dallar ilk göründükleri sırayla.
export const hatSeritleri = (adimlar: readonly Adim[]): string[] =>
  [ANA_HAT, ...new Set(sirali(adimlar).flatMap((a) => adimDali(a) ?? []))];

export interface HatYerlesimi { kolon: Map<string, number>; kolonSayisi: number; seritler: string[]; onculler: Map<string, Adim[]> }

// Adımın sütunu kendi şeridindeki önceki adımdan ve bütün öncüllerinden sonradır: dal ayrıldığı adımın sağında başlar, birleştiren adım
// birleşen dalların sağına düşer. Hiçbir şeyi beklemeyen dal (bağımsız ya da rotanın başından) soldan başlar.
export function hatYerlesimi(adimlar: readonly Adim[]): HatYerlesimi {
  const l = sirali(adimlar);
  const onculler = hatOnculleri(l);
  const kolon = new Map<string, number>();
  const son = new Map<string, number>();
  for (const a of l) {
    const s = adimDali(a) ?? ANA_HAT;
    const c = Math.max((son.get(s) ?? -1) + 1, ...(onculler.get(a.id) ?? []).map((p) => (kolon.get(p.id) ?? -1) + 1));
    kolon.set(a.id, c);
    son.set(s, c);
  }
  return { kolon, kolonSayisi: Math.max(0, ...[...kolon.values()].map((c) => c + 1)), seritler: hatSeritleri(l), onculler };
}

// Adımın süre girdisi (dakika). dk null: süre hesaplanamadı (istasyon yok); şeritte sıfır uzunlukta durur, uydurulmaz.
export interface SureGirdisi { dk: number | null; hazirlikDk: number; parcaDk: number }
export interface AdimZamani { bas: number; bit: number; altSira: number; kritik: boolean; fason: boolean; sureYok: boolean }
export interface ZamanCizelgesi { zaman: Map<string, AdimZamani>; bitis: number; kritikDk: number; altSatir: Map<string, number>; fasonPayi: number }

// Fason takvim günüdür, atölye saatiyle toplanmaz: şeritte atölye süresinin bu oranı kadar sabit genişlikte kesik çubuk olur.
export const FASON_ORANI = 0.12;

// Başlangıç: bağımlı adım öncülü bitince, örtülü adım (aynı şeritte) öncülün ilk devir adedi çıkınca, bağımsız adım öncülle birlikte
// başlar. Birleştiren adım birleşen dalların hepsini bekler. Örtülü adım öncülünden önce bitemez: en erken öncülün bitişi + bir parça.
// Kritik yol: en geç biten adımdan geriye, başlangıcı belirleyen öncül izlenir.
export function zamanCizelgesi(adimlar: readonly Adim[], sure: (a: Adim) => SureGirdisi): ZamanCizelgesi {
  const l = sirali(adimlar);
  const onculler = hatOnculleri(l);
  const tekHat = adimOnculleri(l).every((x) => x === null);
  const girdi = new Map(l.map((a) => [a.id, sure(a)]));
  const atolye = l.reduce((t, a) => t + (fasonMu(a) ? 0 : girdi.get(a.id)?.dk ?? 0), 0);
  const fasonPayi = Math.max(60, atolye * FASON_ORANI);
  const zaman = new Map<string, AdimZamani>();
  const baglayan = new Map<string, string | null>();
  for (const a of l) {
    const g = girdi.get(a.id) ?? { dk: null, hazirlikDk: 0, parcaDk: 0 };
    const fason = fasonMu(a);
    const uzunluk = fason ? fasonPayi : g.dk ?? 0;
    let bas = 0; let enAz = 0; let bag: string | null = null;
    for (const p of onculler.get(a.id) ?? []) {
      const t = zaman.get(p.id);
      if (!t) continue;
      const ayni = (adimDali(p) ?? ANA_HAT) === (adimDali(a) ?? ANA_HAT);
      const pg = girdi.get(p.id);
      let s = t.bit;
      if (ayni && a.dep === 'ortulu' && !t.fason && pg) {
        s = Math.min(t.bit, t.bas + pg.hazirlikDk + pg.parcaDk * Math.max(1, a.depQty ?? 1));
        enAz = Math.max(enAz, t.bit + g.parcaDk);
      } else if (ayni && a.dep === 'bagimsiz' && tekHat) s = t.bas;
      if (s >= bas) { bas = s; bag = p.id; }
    }
    baglayan.set(a.id, bag);
    zaman.set(a.id, { bas, bit: Math.max(bas + uzunluk, enAz), altSira: 0, kritik: false, fason, sureYok: !fason && g.dk === null });
  }
  let x = l.reduce<Adim | null>((m, a) => (m === null || (zaman.get(a.id)?.bit ?? 0) > (zaman.get(m.id)?.bit ?? 0) ? a : m), null);
  let kritikDk = 0;
  while (x) {
    const t = zaman.get(x.id);
    if (!t) break;
    t.kritik = true;
    if (!t.fason) kritikDk += girdi.get(x.id)?.dk ?? 0;
    const b = baglayan.get(x.id) ?? null;
    x = b === null ? null : l.find((y) => y.id === b) ?? null;
  }
  // Aynı şeritte zamanı çakışan adım bir alt satıra iner: çubuklar hep tam yükseklikte ve hizalı kalır.
  const altSatir = new Map<string, number>();
  for (const s of hatSeritleri(l)) {
    const bitisler: number[] = [];
    for (const a of l.filter((y) => (adimDali(y) ?? ANA_HAT) === s)) {
      const t = zaman.get(a.id);
      if (!t) continue;
      let r = bitisler.findIndex((b) => b <= t.bas + 1e-6);
      if (r < 0) r = bitisler.length;
      bitisler[r] = Math.max(t.bit, t.bas + 1e-6);
      t.altSira = r;
    }
    altSatir.set(s, Math.max(1, bitisler.length));
  }
  return { zaman, bitis: Math.max(1, ...[...zaman.values()].map((t) => t.bit)), kritikDk, altSatir, fasonPayi };
}
