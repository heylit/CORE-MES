import { satirKimligi, type KokpitModeli } from './kurallar.ts';

// 3602: adım sürüklenirken öteki adımların başlangıç ve bitiş hizası görünür, yakına gelince hafifçe yakalanır.
// Yakalama yalnız imlecin ürettiği saati değiştirir; geçerlilik, itme, onay ve taşıma komutu bu dosyanın dışındadır (kilit yaratmaz).
// Eşikler ekran pikselidir (ölçekten bağımsız): görünme, yakalama, yakalamadan çıkma.
export const HIZA_GORUNUR = 24;
export const HIZA_YAKALA = 8;
export const HIZA_CIK = 12;
// Bu kadar saat (36 sn) içindeki fark hizalı sayılır; çeyrek saate yuvarlama referansı kaçırırsa "hizalı" yazılmaz.
const HIZALI_ARALIK = 0.01;

export type HizaTuru = 'bas' | 'bit' | 'simdi';
export interface HizaNoktasi { saat: number; ad: string; tur: HizaTuru }
export type Kenar = 'bas' | 'bit';
export interface Yakalanan { saat: number; kenar: Kenar }
export interface HizaCizgisi { kenar: Kenar; saat: number; ad: string; hizali: boolean }

// Referanslar: hedef satırdaki (tezgâh görünümünde aynı tezgâh, emir görünümünde aynı emir) öteki adımlar, taşınan adımın emrindeki
// önceki adımın bitişi ve sonraki adımın başlangıcı, "şimdi". Başka satırlardaki alakasız adımlar yok.
export function hizaNoktalari(m: KokpitModeli, id: string, hedefSatir: string, tezgahGorunumu: boolean, haric: ReadonlySet<string> = new Set()): HizaNoktasi[] {
  const x = m.isler[id];
  if (!x) return [];
  const l: HizaNoktasi[] = [];
  const ekle = (ad: string, s: number, c: number): void => { l.push({ saat: s, ad, tur: 'bas' }, { saat: c, ad, tur: 'bit' }); };
  const goruldu = new Set<string>();
  for (const y of Object.values(m.isler)) {
    if (y.id === id || haric.has(y.id) || y.bitti) continue;
    const ayni = tezgahGorunumu ? satirKimligi(y) === hedefSatir : y.job === x.job;
    if (ayni) { ekle(y.ad, y.S, y.C); goruldu.add(y.id); }
  }
  const e = m.emirler.find((q) => q.id === x.job);
  const i = e ? e.adimlar.findIndex((a) => a.id === id) : -1;
  if (e && i >= 0) {
    const onceki = m.isler[e.adimlar[i - 1]?.id ?? ''], sonraki = m.isler[e.adimlar[i + 1]?.id ?? ''];
    if (onceki && !goruldu.has(onceki.id) && !haric.has(onceki.id)) l.push({ saat: onceki.C, ad: onceki.ad, tur: 'bit' });
    if (sonraki && !goruldu.has(sonraki.id) && !haric.has(sonraki.id)) l.push({ saat: sonraki.S, ad: sonraki.ad, tur: 'bas' });
  }
  l.push({ saat: m.simdi, ad: 'Şimdi', tur: 'simdi' });
  return l;
}

// Ham başlangıç saati S (imlecin verdiği) ve süre sure için yakalama: iki kenar (başlangıç, bitiş) her referansa bakılır, en yakını seçilir.
// Daha önce yakalanmışsa 12 px'e kadar bırakılmaz (titremeyi önler). Dönen saat yuvarlanmamıştır; çeyrek saate oturtmak çağıranın işidir.
export function hizalaYakala(S: number, sure: number, noktalar: readonly HizaNoktasi[], px: number, onceki: Yakalanan | null): { S: number; yakalanan: Yakalanan | null } {
  if (px <= 0) return { S, yakalanan: null };
  const kenarS = (k: Kenar): number => (k === 'bas' ? S : S + sure);
  if (onceki) {
    const d = Math.abs(kenarS(onceki.kenar) - onceki.saat) * px;
    if (d <= HIZA_CIK) return { S: onceki.kenar === 'bas' ? onceki.saat : onceki.saat - sure, yakalanan: onceki };
  }
  let en: { d: number; kenar: Kenar; saat: number } | null = null;
  for (const kenar of ['bas', 'bit'] as const) {
    for (const n of noktalar) {
      const d = Math.abs(kenarS(kenar) - n.saat) * px;
      if (d <= HIZA_YAKALA && (!en || d < en.d)) en = { d, kenar, saat: n.saat };
    }
  }
  if (!en) return { S, yakalanan: null };
  return { S: en.kenar === 'bas' ? en.saat : en.saat - sure, yakalanan: { saat: en.saat, kenar: en.kenar } };
}

// Çizilecek çizgiler: son yerleşime (yuvarlanmış S) göre her kenar için görünme eşiği içindeki en yakın referans; en çok 2 çizgi.
export function hizaCizgileri(S: number, sure: number, noktalar: readonly HizaNoktasi[], px: number): HizaCizgisi[] {
  if (px <= 0) return [];
  const l: HizaCizgisi[] = [];
  for (const kenar of ['bas', 'bit'] as const) {
    const k = kenar === 'bas' ? S : S + sure;
    let en: HizaNoktasi | null = null, enD = Infinity;
    for (const n of noktalar) {
      const d = Math.abs(k - n.saat);
      if (d * px <= HIZA_GORUNUR && d < enD) { en = n; enD = d; }
    }
    if (en) l.push({ kenar, saat: en.saat, ad: en.ad, hizali: enD <= HIZALI_ARALIK });
  }
  return l;
}
