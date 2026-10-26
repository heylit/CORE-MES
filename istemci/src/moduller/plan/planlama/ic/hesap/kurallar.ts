import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { EKIP_ADIM, sayiYaz } from '../../motor/kurallar.ts';

// "Nasıl hesaplandı" (bugünkü sayfa: cerceve/planlama/parca/i-studyo.betik sStudyo, h-cozuculer.betik ekip): son ekip çözümünün kaydı
// (`calisma.ekipSon`) okunur ve grafiğe çevrilir. Ekip çözümü bu ekranda koşmaz (motor sunucuda; 357 b); kayıt yoksa ekran boş halini gösterir.

const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const metin = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export const KARAR_DURUM = {
  alindi: ['Alındı', 'tamam'], alinmadi: ['Alınmadı', 'bilgi'], butce: ['Bütçe aşar', 'uyari'], haric: ['Hariç', 'uyari'], yok: ['Yok', 'pasif'],
} as const satisfies Record<string, readonly [string, 'tamam' | 'bilgi' | 'uyari' | 'pasif']>;
export type KararDurumu = keyof typeof KARAR_DURUM;
export const KARAR_SIMGE: Record<string, SimgeAdi> = { motor: 'cpu', cpsat: 'layers', mesai: 'clock' };
export const KARAR_ROL: Record<string, string> = { motor: 'Motor', cpsat: 'CP-SAT', mesai: 'HiGHS' };
export const EKIP_DURUM: Record<string, string> = { tamam: 'tamam', alindi: 'alındı', alinmadi: 'alınmadı', yok: 'yok', red: 'tutmadı', calisiyor: 'çalışıyor', bekliyor: 'bekliyor' };
export const EKIP_TON: Record<string, 'tamam' | 'hata' | 'uyari' | 'pasif' | 'bilgi'> = {
  tamam: 'tamam', alindi: 'tamam', alinmadi: 'bilgi', yok: 'pasif', red: 'hata', calisiyor: 'uyari', bekliyor: 'pasif',
};
export const SURELER = [5, 10, 20, 40] as const;
// Motorun varsayılan haftalık mesai bütçesi (engine.betik W0.mesaiHafta), Kısıtlar sayfasıyla aynı.
export const MESAI_HAFTA0 = 8;

export interface EkipKarari { id: string; ad: string; tur: string; durum: KararDurumu; dW: number | null; neden: string }
export interface EkipSonu {
  adim: Record<string, string>; lb: number; ms: number; zaman: number | null; bas: number; wT: number; gecti: boolean;
  kararlar: EkipKarari[]; basamak: { id: string; ad: string; wT: number }[]; iz: { t: number; wT: number; adim: string | null }[];
  J: Record<string, [number | null, number | null]>;
}

// Kayıttaki son ekip çözümü; biçimi bozuksa ya da yoksa null (sıfır uydurulmaz).
export function ekipSonOku(c: PlanlamaCalismasi | null): EkipSonu | null {
  const s = c?.ekipSon;
  if (!nesne(s)) return null;
  const wT = sayi(s.wT), bas = sayi(s.bas), lb = sayi(s.lb);
  if (wT === null || bas === null || lb === null) return null;
  const adim: Record<string, string> = {};
  if (nesne(s.adim)) for (const [k, v] of Object.entries(s.adim)) { const d = nesne(v) ? metin(v.durum) : null; if (d) adim[k] = d; }
  const kararlar: EkipKarari[] = (Array.isArray(s.kararlar) ? s.kararlar : []).filter(nesne).flatMap((k) => {
    const id = metin(k.id), durum = metin(k.durum);
    if (!id || !durum || !(durum in KARAR_DURUM)) return [];
    return [{ id, ad: metin(k.ad) ?? id, tur: metin(k.tur) ?? '', durum: durum as KararDurumu, dW: sayi(k.dW), neden: metin(k.neden) ?? '' }];
  });
  const basamak = (Array.isArray(s.basamak) ? s.basamak : []).filter(nesne).flatMap((b) => {
    const w = sayi(b.wT); const id = metin(b.id);
    return w === null || !id ? [] : [{ id, ad: metin(b.ad) ?? id, wT: w }];
  });
  const iz = (Array.isArray(s.iz) ? s.iz : []).filter(nesne).flatMap((x) => {
    const t = sayi(x.t), w = sayi(x.wT);
    return t === null || w === null ? [] : [{ t, wT: w, adim: metin(x.adim) }];
  });
  const J: EkipSonu['J'] = {};
  if (nesne(s.J)) for (const [j, v] of Object.entries(s.J)) if (Array.isArray(v)) J[j] = [sayi(v[0]), sayi(v[1])];
  return { adim, lb, ms: sayi(s.ms) ?? 0, zaman: sayi(s.zaman), bas, wT, gecti: s.gecti === true, kararlar, basamak, iz, J };
}

// Ekip ayarı (h-cozuculer ekipAyar): CP-SAT her zaman kapalı; ek mesai ve alt sınır varsayılan açık.
export function ekipAyari(c: PlanlamaCalismasi): { mesai: boolean; sinir: boolean } {
  const a = nesne(c.ekipAyar) ? c.ekipAyar : {};
  return { mesai: a.mesai !== false, sinir: a.sinir !== false };
}
export const mesaiButcesi = (c: PlanlamaCalismasi): number => sayi(c.param.mesaiHafta) ?? MESAI_HAFTA0;
export const ekipSuresi = (c: PlanlamaCalismasi): number | null => sayi(c.w.sure);
export const hariclar = (c: PlanlamaCalismasi): string[] => (Array.isArray(c.ekipHaric) ? c.ekipHaric.filter((x): x is string => typeof x === 'string') : []);

// Hariç tutulan kararın adı: son çözümde varsa onun adı, yoksa kimliğinden.
export function kararAdi(son: EkipSonu | null, id: string): string {
  const k = son?.kararlar.find((x) => x.id === id);
  return k ? k.ad : id === 'cpsat' ? 'CP-SAT önerisi' : id.replace('mesai:', 'Ek mesai ').replace(/\|/g, ' ');
}

// Çalışmanın ek alanına yazar (ExtraAlanlar salt okunur imzalıdır; yazma yalnız komutun taslağında).
export function alanYaz(t: object, k: string, v: unknown): void { (t as Record<string, unknown>)[k] = v; }

export const oran = (v: number, max: number): number => Math.max(0, Math.min(1, v / (max || 1)));

// Ekip adımları ve her adımın gecikmeye kattığı (zincir): önceki basamağa göre fark, yarım saatin altı yazılmaz.
export function zincir(son: EkipSonu | null): { id: string; rol: string; is: string; durum: string; fark: number | null }[] {
  return EKIP_ADIM.map(([id, rol, is]) => {
    const i = son ? son.basamak.findIndex((x) => x.id === id) : -1;
    const b = son && i >= 0 ? son.basamak[i] : undefined; const once = son && i > 0 ? son.basamak[i - 1] : undefined;
    const d = b && once ? once.wT - b.wT : null;
    return { id, rol, is, durum: son ? son.adim[id] ?? 'bekliyor' : 'bekliyor', fark: d !== null && Math.abs(d) > 0.05 ? d : null };
  });
}

export type SelaleTuru = 'toplam' | 'azal' | 'art' | 'sifir';
export interface SelaleKolonu { ad: string; alt: number; ust: number; tur: SelaleTuru; deger: string }
// Şelale (selale): başlangıçtan sonuca, her basamağın kattığı; üst sınır en büyük değerin %10 fazlası.
export function selale(son: EkipSonu): { kol: SelaleKolonu[]; max: number } {
  const b = son.basamak;
  const max = Math.max(...b.map((x) => x.wT), son.wT, son.lb) * 1.1 || 1;
  const kol: SelaleKolonu[] = [];
  const ilk = b[0];
  if (ilk) kol.push({ ad: ilk.ad, alt: 0, ust: ilk.wT, tur: 'toplam', deger: sayiYaz(ilk.wT, 1) });
  for (let i = 1; i < b.length; i++) {
    const o = b[i - 1], x = b[i]; if (!o || !x) continue;
    const d = o.wT - x.wT; const sifir = Math.abs(d) < 0.05;
    kol.push({ ad: x.ad, alt: Math.min(o.wT, x.wT), ust: Math.max(o.wT, x.wT), tur: sifir ? 'sifir' : d > 0 ? 'azal' : 'art', deger: sifir ? '0' : `${d > 0 ? '−' : '+'}${sayiYaz(Math.abs(d), 1)}` });
  }
  kol.push({ ad: 'Sonuç', alt: 0, ust: son.wT, tur: 'toplam', deger: sayiYaz(son.wT, 1) });
  return { kol, max };
}

const ADIM_AD: Record<string, string> = { motor: 'Motor', cpsat: 'CP-SAT', mesai: 'Ek mesai', son: 'Sonuç' };
// Yakınsama (yakinsama): 600 x 200 birimlik alanda basamaklı çizgi, adım sınırları, eksen etiketleri. İz iki noktadan azsa null.
export function yakinsama(son: EkipSonu) {
  const iz = son.iz; if (iz.length < 2) return null;
  const T = Math.max(0.1, ...iz.map((x) => x.t));
  const ymax = Math.max(...iz.map((x) => x.wT)) * 1.06; const ymin = Math.max(0, Math.min(son.lb, ...iz.map((x) => x.wT)) * 0.9);
  const X = (t: number) => (t / T) * 600, Y = (w: number) => 200 - ((w - ymin) / (ymax - ymin || 1)) * 190;
  const ilk = iz[0] as { t: number; wT: number };
  let yol = `M${X(ilk.t).toFixed(1)},${Y(ilk.wT).toFixed(1)}`;
  for (const x of iz.slice(1)) yol += ` H${X(x.t).toFixed(1)} V${Y(x.wT).toFixed(1)}`;
  const sinirlar = iz.filter((x) => x.adim).map((x) => ({ x: X(x.t), ad: ADIM_AD[x.adim ?? ''] ?? x.adim ?? '' }));
  const dilimler = iz.slice(1).map((x, i) => { const o = iz[i] as { t: number }; return { x: X(o.t), w: Math.max(2, X(x.t) - X(o.t)), ipucu: `${sayiYaz(x.t, 1)} sn: ${sayiYaz(x.wT, 1)} sa` }; });
  const y = [ymax, (ymax + ymin) / 2, ymin].map((v) => ({ v: sayiYaz(v, 0), y: Y(v) / 200 }));
  const son0 = iz[iz.length - 1] as { wT: number };
  return { yol, sinirlar, dilimler, y, lb: son.lb >= ymin ? Y(son.lb) : null, T, bas: ilk.wT, bit: son0.wT };
}

// Değerlendirilen kararlar (kararListesi): alınanlar önce, sonra kazanca göre; çubuk en büyük mutlak değere göre yarım genişlik.
export function kararSirasi(son: EkipSonu): { k: EkipKarari; w: number }[] {
  const l = [...son.kararlar].sort((a, b) => Number(b.durum === 'alindi') - Number(a.durum === 'alindi') || (b.dW ?? -1e9) - (a.dW ?? -1e9));
  const max = Math.max(1, ...l.map((k) => Math.abs(k.dW ?? 0)));
  return l.map((k) => ({ k, w: k.dW == null ? 0 : (Math.abs(k.dW) / max) * 0.5 }));
}
export const kararDegeri = (d: number): string => (Math.abs(d) < 0.05 ? '0' : `${d > 0 ? '−' : '+'}${sayiYaz(Math.abs(d), 1)} sa`);

// Sipariş etkisi (siparisEtkisi): gecikmesi önce ya da sonra yarım saat üstü olan en çok 14 sipariş, büyükten küçüğe.
export function siparisEtkisi(son: EkipSonu): { l: { j: string; a: number; b: number }[]; max: number } {
  const l = Object.entries(son.J).map(([j, [a, b]]) => ({ j, a: a ?? 0, b: b ?? 0 })).filter((x) => x.a > 0.05 || x.b > 0.05)
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b)).slice(0, 14);
  return { l, max: Math.max(0, ...l.map((x) => Math.max(x.a, x.b))) * 1.05 };
}

// Fark yazısı (c-masa fark): yeni ile eski arasındaki fark; küçükse boş. `iyi`: azalma iyidir.
export function farkYazisi(yeni: number | null, eski: number | null, basamak = 1): { m: string; iyi: boolean } | null {
  if (yeni == null || eski == null || Math.abs(yeni - eski) < (basamak ? 0.05 : 0.5)) return null;
  return { m: `${yeni > eski ? '+' : '−'}${sayiYaz(Math.abs(yeni - eski), basamak)}`, iyi: yeni < eski };
}
export const zamanYazi = (ms: number | null): string => (ms == null ? '—' : new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
