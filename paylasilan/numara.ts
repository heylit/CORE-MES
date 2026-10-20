// Belge numarası ayardaki kalıptan kurulur. Kalıp düz metin ve süslü ayraçlı alanlardan oluşur:
// {YYYY} dört haneli yıl, {YY} iki haneli yıl, {AA} iki haneli ay, {SAYAC:n} en az n haneli sıra; belgeye özgü alanlar
// (ör. {FIRMA}, {PROJE}, {PARCA}) tanımda bildirilir ve değerini numarayı isteyen modül verir.

export const ZAMAN_ALANLARI = ['YYYY', 'YY', 'AA'] as const;
export const SAYAC_HANE_EN_COK = 9;
export const KALIP_EN_UZUN = 60;

// Alan dışındaki metin: büyük harf, rakam ve ayırıcılar. Küçük harf ve boşluk numarada karışıklık yaratır.
const DUZ_METIN = /^[A-Z0-9\-_/.]*$/;
const ALAN = /\{([A-Z]+)(?::(\d+))?\}/g;

export type NumaraDonemi = 'ay' | 'yil' | 'hep';

interface KalipParcasi { tur: 'metin'; metin: string }
interface AlanParcasi { tur: 'alan'; ad: string; hane: number | null }
type Parca = KalipParcasi | AlanParcasi;

function parcala(kalip: string): Parca[] {
  const parcalar: Parca[] = [];
  let son = 0;
  for (const m of kalip.matchAll(ALAN)) {
    if (m.index > son) parcalar.push({ tur: 'metin', metin: kalip.slice(son, m.index) });
    parcalar.push({ tur: 'alan', ad: m[1] ?? '', hane: m[2] === undefined ? null : Number(m[2]) });
    son = m.index + m[0].length;
  }
  if (son < kalip.length) parcalar.push({ tur: 'metin', metin: kalip.slice(son) });
  return parcalar;
}

// Kalıp doğruysa null, değilse kullanıcıya gösterilecek ileti. Sayaç tek ve zorunludur: dönem içinde numarayı tekil yapan odur.
export function kalipHatasi(kalip: string, belgeAlanlari: readonly string[]): string | null {
  if (kalip.trim() === '') return 'Kalıp boş olamaz.';
  if (kalip.length > KALIP_EN_UZUN) return `Kalıp en çok ${KALIP_EN_UZUN} karakter olabilir.`;
  const parcalar = parcala(kalip);
  for (const p of parcalar) {
    if (p.tur === 'metin') {
      if (p.metin.includes('{') || p.metin.includes('}')) return 'Süslü ayraç yalnız alan adını sarar: {YYYY}, {SAYAC:3} gibi.';
      if (!DUZ_METIN.test(p.metin)) return 'Alan dışında yalnız büyük harf, rakam ve - _ / . kullanılabilir.';
    }
  }
  const alanlar = parcalar.filter((p): p is AlanParcasi => p.tur === 'alan');
  const sayaclar = alanlar.filter((a) => a.ad === 'SAYAC');
  if (sayaclar.length !== 1) return 'Kalıpta tek bir {SAYAC:n} olmalı.';
  const hane = sayaclar[0]?.hane ?? null;
  if (hane === null || hane < 1 || hane > SAYAC_HANE_EN_COK) return `Sayaç hanesi 1 ile ${SAYAC_HANE_EN_COK} arasında olmalı: {SAYAC:3} gibi.`;
  for (const a of alanlar) {
    if (a.ad === 'SAYAC') continue;
    if (a.hane !== null) return `Yalnız sayaç hane alır: {${a.ad}}.`;
    if (!(ZAMAN_ALANLARI as readonly string[]).includes(a.ad) && !belgeAlanlari.includes(a.ad)) return `Bu belgede {${a.ad}} alanı yok.`;
  }
  const adlar = new Set(alanlar.map((a) => a.ad));
  // Ay yılsız yazılırsa sayaç her ay sıfırlanır ve bir yıl sonra aynı numara yeniden çıkar.
  if (adlar.has('AA') && !adlar.has('YY') && !adlar.has('YYYY')) return '{AA} kullanılıyorsa {YY} ya da {YYYY} de olmalı.';
  return null;
}

// Sayaç, kalıpta en küçük zaman alanının döneminde sıfırlanır: ay varsa her ay, yalnız yıl varsa her yıl, yoksa hiç.
export function numaraDonemi(kalip: string): NumaraDonemi {
  const adlar = new Set(parcala(kalip).flatMap((p) => (p.tur === 'alan' ? [p.ad] : [])));
  if (adlar.has('AA')) return 'ay';
  if (adlar.has('YY') || adlar.has('YYYY')) return 'yil';
  return 'hep';
}

// Sayaç satırının dönem anahtarı: aynı dönemde aynı belge aynı sayaçtan sıra alır.
export function donemAnahtari(donem: NumaraDonemi, yil: number, ay: number): string {
  if (donem === 'ay') return `${yil}-${String(ay).padStart(2, '0')}`;
  if (donem === 'yil') return String(yil);
  return '-';
}

export interface NumaraGirdisi {
  yil: number;
  ay: number;
  sira: number;
  // Belgeye özgü alanların değeri; boş (null ya da boş metin) alan numaradan düşer.
  alanlar?: Readonly<Record<string, string | null | undefined>>;
}

// Boş kalan alanın iki yanındaki tire tek tireye iner; baştaki ve sondaki tire düşer.
export function numaraKur(kalip: string, g: NumaraGirdisi): string {
  const metin = parcala(kalip).map((p) => {
    if (p.tur === 'metin') return p.metin;
    if (p.ad === 'SAYAC') return String(g.sira).padStart(p.hane ?? 1, '0');
    if (p.ad === 'YYYY') return String(g.yil);
    if (p.ad === 'YY') return String(g.yil % 100).padStart(2, '0');
    if (p.ad === 'AA') return String(g.ay).padStart(2, '0');
    return (g.alanlar?.[p.ad] ?? '').trim();
  }).join('');
  return metin.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}
