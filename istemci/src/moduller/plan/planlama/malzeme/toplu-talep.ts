import { kovaBasi, sonrakiKova, type PlanSatiri } from './kurallar.ts';

// 3485 a: malzeme satın alma planının günlük tüketimi ve toplu talep taslağı (saf). Zaman kurallar.ts'deki gibi planın başlangıç günü
// 00:00'dan (UTC) saattir; gün anahtarı günün başıdır (kovaBasi 'gun').

const ESIK = 1e-9;
const GUN = 24;
// Aralık sınırı: uzak bir bitiş tarihi tabloyu binlerce sütuna bölmesin (kurallar.ts AZAMI_KOVA gibi).
export const AZAMI_GUN = 400;
// Bu kadar günü geçen aralıkta sütunlar haftalık toplanır (Arayüz ön bakışı 4).
export const HAFTALIK_ESIGI = 21;

export interface GunHucresi {
  // Planın o gün başlayan işlerinin malzemesi (stoktan, açık siparişten ve yeni alımdan karşılanan toplamı).
  tuketim: number;
  // Yeni alım gereken kısım, açık talep düşülmüş.
  eksik: number;
  // Açık siparişten karşılanan kısım.
  siparisten: number;
  // Günün sonunda kalan serbest stok; stok bilinmiyorsa null.
  kalan: number | null;
}
export interface TuketimSatiri {
  kod: string;
  gunler: Map<number, GunHucresi>;
  toplam: number;
  eksik: number;
  // Açık talepten düşülen (aralıktan bağımsız, en erken eksikten başlayarak).
  talepte: number;
  // Eksik günlerin işleri (emir numaraları için ham iş kimlikleri).
  isler: Map<number, string[]>;
}
export interface GunlukTuketim { gunler: number[]; satirlar: TuketimSatiri[] }

export interface GunlukTuketimGirdisi {
  satirlar: readonly PlanSatiri[];
  taban: number;
  simdi: number;
  // Aralığın ilk ve son günü (saat, gün başı); son dahil.
  bas: number;
  bit: number;
  stok: (kod: string) => number | null;
  // Malzemenin siparişi verilmemiş açık talep miktarı (bilinmiyorsa 0).
  talep: (kod: string) => number;
}

const gunu = (taban: number, t: number): number => kovaBasi(taban, 'gun', t);

export function aralikGunleri(taban: number, bas: number, bit: number): number[] {
  const l: number[] = [];
  for (let g = gunu(taban, bas); g <= bit && l.length < AZAMI_GUN; g = sonrakiKova(taban, 'gun', g)) l.push(g);
  return l;
}

// Tüketim yalnız işe bağlı satırdır (j dolu); açık siparişin stoğa giden kalanı tüketim değildir. Geçmiş tarihli satır bugüne düşer
// (kurallar.ts kovala "Hemen" kovası gibi). Açık talep en erken eksikten başlayarak düşülür; düşülen kısım aralık dışında da olabilir.
export function gunlukTuketim(g: GunlukTuketimGirdisi): GunlukTuketim {
  const bugun = gunu(g.taban, g.simdi);
  const gunler = aralikGunleri(g.taban, g.bas, g.bit);
  const kodlar = new Map<string, PlanSatiri[]>();
  for (const s of g.satirlar) {
    if (s.j === null || !(s.q > ESIK)) continue;
    const l = kodlar.get(s.kod);
    if (l) l.push(s); else kodlar.set(s.kod, [s]);
  }
  const satirlar: TuketimSatiri[] = [];
  for (const [kod, l] of kodlar) {
    const tum = new Map<number, GunHucresi & { stoktan: number; isler: Set<string> }>();
    for (const s of l) {
      const gun = Math.max(bugun, gunu(g.taban, s.ihtiyac));
      const h = tum.get(gun) ?? { tuketim: 0, eksik: 0, siparisten: 0, kalan: null, stoktan: 0, isler: new Set<string>() };
      h.tuketim += s.q;
      if (s.tur === 'yeni') { h.eksik += s.q; if (s.j !== null) h.isler.add(s.j); }
      else if (s.tur === 'acik') h.siparisten += s.q;
      else h.stoktan += s.q;
      tum.set(gun, h);
    }
    let talepKalan = Math.max(0, g.talep(kod));
    let talepte = 0;
    const stok = g.stok(kod);
    let kalan = stok;
    const sirali = [...tum.keys()].sort((a, b) => a - b);
    for (const gun of sirali) {
      const h = tum.get(gun)!;
      const dus = Math.min(talepKalan, h.eksik);
      h.eksik -= dus;
      talepKalan -= dus;
      talepte += dus;
      if (kalan !== null) kalan = Math.max(0, kalan - h.stoktan);
      h.kalan = kalan;
    }
    const icerde = new Map<number, GunHucresi>();
    const isler = new Map<number, string[]>();
    let toplam = 0;
    let eksik = 0;
    for (const gun of gunler) {
      const h = tum.get(gun);
      if (!h) continue;
      icerde.set(gun, { tuketim: h.tuketim, eksik: h.eksik, siparisten: h.siparisten, kalan: h.kalan });
      toplam += h.tuketim;
      eksik += h.eksik;
      if (h.eksik > ESIK) isler.set(gun, [...h.isler]);
    }
    if (icerde.size === 0) continue;
    satirlar.push({ kod, gunler: icerde, toplam, eksik, talepte, isler });
  }
  satirlar.sort((a, b) => (b.eksik > ESIK ? 1 : 0) - (a.eksik > ESIK ? 1 : 0) || a.kod.localeCompare(b.kod, 'tr'));
  return { gunler, satirlar };
}

// Talebi topla (3485 a, kart cevabı b): eksik günler malzeme başına seçilen düzende kaleme döner. Teslim tarihi grubun ilk eksik günüdür
// (malzeme ihtiyaçtan önce gelsin); miktar grubun toplamıdır, yukarı yuvarlanır (satın alma planı Math.ceil gibi).
export type TopluDuzen = 'gunluk' | 'haftalik' | 'aylik' | 'herN' | 'tek';
export const TOPLU_DUZENLER: readonly [TopluDuzen, string][] = [
  ['gunluk', 'Günlük'], ['haftalik', 'Haftalık'], ['aylik', 'Aylık'], ['herN', 'Her N günde'], ['tek', 'Tek teslim'],
];
export interface Teslim { gun: number; miktar: number; isler: string[] }

export function grupAnahtari(taban: number, duzen: TopluDuzen, n: number, bas: number, gun: number): number {
  if (duzen === 'gunluk') return gun;
  if (duzen === 'haftalik') return kovaBasi(taban, 'hafta', gun);
  if (duzen === 'aylik') return kovaBasi(taban, 'ay', gun);
  if (duzen === 'tek') return 0;
  const adim = Math.max(1, Math.floor(n)) * GUN;
  return Math.floor((gun - gunu(taban, bas)) / adim);
}

export function teslimler(s: TuketimSatiri, taban: number, duzen: TopluDuzen, n: number, bas: number): Teslim[] {
  const gruplar = new Map<number, Teslim>();
  for (const gun of [...s.gunler.keys()].sort((a, b) => a - b)) {
    const h = s.gunler.get(gun)!;
    if (!(h.eksik > ESIK)) continue;
    const k = grupAnahtari(taban, duzen, n, bas, gun);
    const t = gruplar.get(k);
    const isler = s.isler.get(gun) ?? [];
    if (t) { t.miktar += h.eksik; t.isler = [...new Set([...t.isler, ...isler])]; }
    else gruplar.set(k, { gun, miktar: h.eksik, isler: [...isler] });
  }
  return [...gruplar.values()].map((t) => ({ ...t, miktar: Math.ceil(t.miktar - ESIK) }));
}

// Talep formunun beklediği tarih (YYYY-AA-GG, UTC gün).
export function isoGun(taban: number, t: number): string {
  return new Date(taban + t * 3_600_000).toISOString().slice(0, 10);
}

// Satın almanın ön talep hesabındaki gibi (kurallar.ts planOnTalepAdaylari): talep yalnız kartın stok biriminde olanlarla düşülür.
export function acikTalepler(
  takip: readonly { tur: string; malzemeNo: number | null; birim: string | null; karsilayanlar: readonly { tur: string; miktar: string | null; birim: string }[] }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of takip) {
    if (s.tur !== 'malzeme' || s.malzemeNo === null) continue;
    const q = s.karsilayanlar.filter((k) => k.tur === 'talep' && (s.birim === null || k.birim === s.birim)).reduce((a, k) => a + (Number(k.miktar) || 0), 0);
    if (q > 0) m.set(String(s.malzemeNo), (m.get(String(s.malzemeNo)) ?? 0) + q);
  }
  return m;
}

// Tablonun sütunları: aralık HAFTALIK_ESIGI günü geçince hafta başına bir sütun (günler o sütunda toplanır, kalan stok son günündür).
export interface Sutun { bas: number; gunler: number[] }
export function sutunlar(taban: number, gunler: readonly number[]): Sutun[] {
  if (gunler.length <= HAFTALIK_ESIGI) return gunler.map((g) => ({ bas: g, gunler: [g] }));
  const m = new Map<number, number[]>();
  for (const g of gunler) {
    const k = kovaBasi(taban, 'hafta', g);
    const l = m.get(k);
    if (l) l.push(g); else m.set(k, [g]);
  }
  return [...m].map(([, l]) => ({ bas: l[0]!, gunler: l }));
}
export function sutunHucresi(s: TuketimSatiri, sutun: Sutun): GunHucresi | null {
  let h: GunHucresi | null = null;
  for (const g of sutun.gunler) {
    const x = s.gunler.get(g);
    if (!x) continue;
    h = h === null ? { ...x } : { tuketim: h.tuketim + x.tuketim, eksik: h.eksik + x.eksik, siparisten: h.siparisten + x.siparisten, kalan: x.kalan };
  }
  return h;
}
