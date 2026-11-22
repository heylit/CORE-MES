import { kisitBul, kisitDegistir, parametreDegeri, parametreYaz, type ParametreYeri } from '../ic/veri/kurallar.ts';
import { MALZEME_KURALLARI } from '../ic/veri/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';

// Planlama ayarları (3282 1b, 3561): Kokpit'in motorunun okuduğu çalışma ayarları tek yerde; Planlama ayarları sayfası ve Kokpit'in yön seçicisi kullanır. Kural, amaç, bölme ve acil pay motor ayarındadır
// (sunucu calismayaMotorAyari çalışmanınkini ezer); panel onları yalnız gösterir. Saf.

export type AyarAlani =
  | { tur: 'sayi'; yer: ParametreYeri; k: string; etiket: string; ipucu: string; birim: string; min: number; max: number; adim: number; varsayilan?: number }
  | { tur: 'acik'; yer: ParametreYeri; k: string; etiket: string; ipucu: string }
  | { tur: 'sec'; yer: ParametreYeri; k: string; etiket: string; ipucu: string; secenekler: readonly (readonly [string, string])[]; varsayilan?: string; ipucuSecim?: Readonly<Record<string, string>> };

// Sınırlar Kısıtlar sayfası ve Hesaplar'la aynıdır (ic/veri/kurallar.ts KATALOG, ic/hesap mesai bütçesi 0-60).
// Yön ve geri tamponu (3282 1c) motorun girdi.js stKur'unda okunur; yazılmamışsa ileri ve 0'dır.
export const AYAR_ALANLARI: readonly AyarAlani[] = [
  { tur: 'sec', yer: 'w', k: 'yon', etiket: 'Planlama yönü', ipucu: 'Geri: terminli iş, termine yetişecek en geç saatte başlar; erken bitip beklemez.', secenekler: [['ileri', 'İleri: hemen başla'], ['geri', 'Geri: teslimden geriye']], varsayilan: 'ileri' },
  { tur: 'sayi', yer: 'param', k: 'geriTamponGun', etiket: 'Geri planlama tamponu', ipucu: 'Geriye planlanan iş termininden bu kadar gün önce bitecek şekilde dizilir.', birim: 'gün', min: 0, max: 30, adim: 1, varsayilan: 0 },
  { tur: 'sayi', yer: 'w', k: 'dondurma', etiket: 'Dondurulmuş bölge', ipucu: 'Bu süre içinde başlayan işler plan yeniden dizilirken yerinden oynamaz.', birim: 'sa', min: 0, max: 72, adim: 1 },
  { tur: 'acik', yer: 'w', k: 'gerideTasinir', etiket: 'Saati geçmiş, başlamamış iş taşınabilsin', ipucu: 'Kapalıyken başlama saati geçmiş ama başlamamış iş çalışıyor sayılır: yerinde kalır, onu kaydıracak taşıma reddedilir. Açıkken böyle iş elle taşımada öteki adımlarla birlikte şimdiden sonraya kayar. Gerçekten başlamış iş hiçbir durumda taşınmaz.' },
  { tur: 'acik', yer: 'param', k: 'tampon', etiket: 'Arıza payı ve termin tamponu', ipucu: 'Tezgâhın arıza geçmişinden süreye pay, süre sapmasından termin tamponu.' },
  { tur: 'sayi', yer: 'param', k: 'tamponZ', etiket: 'Tampon katsayısı (z)', ipucu: 'Büyüdükçe tampon uzar; termin daha güvenli, plan daha seyrek.', birim: '', min: 0, max: 3, adim: 0.05 },
  { tur: 'sayi', yer: 'param', k: 'mesaiHafta', etiket: 'Haftalık ek mesai bütçesi', ipucu: 'Motorun bir haftada önerebileceği en çok ek mesai. 0 sınırsızdır.', birim: 'sa', min: 0, max: 60, adim: 1 },
  { tur: 'sayi', yer: 'param', k: 'maxChg', etiket: 'Değişiklik bütçesi', ipucu: 'Onarımda canlı plana göre en çok bu kadar iş yer değiştirir.', birim: 'iş', min: 0, max: 500, adim: 1 },
  { tur: 'sayi', yer: 'param', k: 'chgTL', etiket: 'Değişiklik bedeli', ipucu: 'Olay toparlamasında yeri değişen her iş için maliyete eklenen bedel.', birim: 'TL', min: 0, max: 100000, adim: 1 },
  { tur: 'sayi', yer: 'w', k: 'famK', etiket: 'Aynı aile katsayısı', ipucu: 'Aynı aileden iş arka arkaya gelince ayar süresi bu oranla kısalır. 1: kısalma yok.', birim: '', min: 0, max: 1, adim: 0.05 },
  { tur: 'sayi', yer: 'ayarlar', k: 'tasimaSaat', etiket: 'Adımlar arası taşıma süresi', ipucu: 'Bir adım bitince sonraki adım bu süreden önce başlamaz.', birim: 'sa', min: 0, max: 24, adim: 0.25 },
  { tur: 'sayi', yer: 'ayarlar', k: 'transferOran', etiket: 'Transfer partisi', ipucu: 'Örtüşmeli geçişte sonraki adım, partinin bu oranı bitince başlar.', birim: 'oran', min: 0.05, max: 1, adim: 0.05 },
  { tur: 'sayi', yer: 'ayarlar', k: 'programSaat', etiket: 'NC programı hazırlama süresi', ipucu: 'Programı hazır olmayan adım bu süre dolmadan başlamaz.', birim: 'sa', min: 0, max: 72, adim: 1 },
  { tur: 'sayi', yer: 'ayarlar', k: 'faiSaat', etiket: 'İlk parça onay süresi', ipucu: 'İlk parça onayı isteyen adımda ayardan sonra beklenen süre.', birim: 'sa', min: 0, max: 24, adim: 0.5 },
  { tur: 'sec', yer: 'w', k: 'mat', etiket: 'Malzeme kuralı', ipucu: 'Stok tamsa iş serbesttir.', secenekler: MALZEME_KURALLARI,
    ipucuSecim: {
      karma: 'Stok tamsa iş serbesttir. Stok eksik ya da kısmiyse iş, satın almanın termin tarihinden önce başlamaz; termini olmayan eksikte iş başlar, uyarı verilir.',
      uyari: 'Malzeme işi bekletmez; stok ya da satın alma yetmiyorsa yalnız uyarı verilir.',
      sert: 'Stok tamsa iş serbesttir. Eksikte iş malzeme gelene kadar başlamaz; termini olmayan eksik malzemeyi bekleyen iş yerleşmez.',
    } },
];
// Panelde açılıp kapanan kısıtlar: motorun kapatabildiği bütün kısıtlar (katalogda g işaretli). Tezgâhta aynı anda tek iş ve gerçekten
// başlamış iş aç kapa değildir; panel nedenini yazar.
export const PANEL_KISITLARI = [
  'calismaGunu', 'tvardiya', 'tatil', 'ariza', 'rota', 'personel', 'ayarci', 'yetkin', 'devam', 'aparat', 'kalibrasyon', 'program', 'fai',
  'malzeme', 'serbest', 'tasima', 'fasonGun', 'fasonKap', 'ayar',
] as const;
// Ad Kısıtlar sayfasıyla aynıdır (tek katalog).
export const panelKisitAdi = (k: (typeof PANEL_KISITLARI)[number]): string => kisitBul(k)?.ad ?? k;

export type AyarDegeri = string | number | boolean | null;
export interface AyarTaslagi { alan: Record<string, AyarDegeri>; acik: Record<string, boolean> }
export const alanAnahtari = (a: AyarAlani): string => `${a.yer}.${a.k}`;
const anahtar = alanAnahtari;

function deger(c: PlanlamaCalismasi, a: AyarAlani): AyarDegeri {
  const v = parametreDegeri(c, a.yer, a.k);
  if (a.tur === 'acik') return Boolean(v);
  if (a.tur === 'sayi') return typeof v === 'number' && Number.isFinite(v) ? v : (a.varsayilan ?? null);
  return typeof v === 'string' ? v : (a.varsayilan ?? null);
}
export function ayarTaslagi(c: PlanlamaCalismasi): AyarTaslagi {
  return {
    alan: Object.fromEntries(AYAR_ALANLARI.map((a) => [anahtar(a), deger(c, a)])),
    acik: Object.fromEntries(PANEL_KISITLARI.map((k) => [k, !c.kapali.includes(k)])),
  };
}
export const alanDegeri = (t: AyarTaslagi, a: AyarAlani): AyarDegeri => t.alan[anahtar(a)] ?? null;
export const alanYaz = (t: AyarTaslagi, a: AyarAlani, v: AyarDegeri): AyarTaslagi => ({ ...t, alan: { ...t.alan, [anahtar(a)]: v } });
export const kisitYaz = (t: AyarTaslagi, k: string, acik: boolean): AyarTaslagi => ({ ...t, acik: { ...t.acik, [k]: acik } });

// Sayı alanının girdisi: boş ya da sınır dışı hatadır.
export function sayiOku(a: Extract<AyarAlani, { tur: 'sayi' }>, girdi: string): { deger: number } | { hata: string } {
  const v = Number(girdi.replace(',', '.'));
  if (girdi.trim() === '' || !Number.isFinite(v) || v < a.min || v > a.max) return { hata: `${a.min} ile ${a.max} arasında olmalı.` };
  return { deger: v };
}

export const alanYazisi = (a: AyarAlani, v: AyarDegeri): string => {
  if (v === null) return '—';
  if (a.tur === 'acik') return v ? 'açık' : 'kapalı';
  if (a.tur === 'sec') return a.secenekler.find(([d]) => d === v)?.[1] ?? String(v);
  return `${String(v).replace('.', ',')}${a.birim ? ` ${a.birim}` : ''}`;
};
// Çalışmadakiyle taslak arasındaki farklar, kişinin okuyacağı satırlar ("Dondurulmuş bölge: 4 sa → 8 sa").
export function farklar(c: PlanlamaCalismasi, t: AyarTaslagi): string[] {
  const simdi = ayarTaslagi(c);
  const alan = AYAR_ALANLARI.filter((a) => alanDegeri(simdi, a) !== alanDegeri(t, a))
    .map((a) => `${a.etiket}: ${alanYazisi(a, alanDegeri(simdi, a))} → ${alanYazisi(a, alanDegeri(t, a))}`);
  const kisit = PANEL_KISITLARI.filter((k) => simdi.acik[k] !== t.acik[k])
    .map((k) => `${panelKisitAdi(k)}: ${t.acik[k] ? 'kapalı → açık' : 'açık → kapalı'}`);
  return [...alan, ...kisit];
}

// Taslağı çalışmanın kopyasına yazar; değişen yoksa false.
export function ayarlariYaz(c: PlanlamaCalismasi, t: AyarTaslagi): boolean {
  let degisti = false;
  for (const a of AYAR_ALANLARI) {
    const v = alanDegeri(t, a);
    if (v !== null && v !== deger(c, a)) degisti = parametreYaz(c, a.yer, a.k, v) || degisti;
  }
  for (const k of PANEL_KISITLARI) {
    const acik = t.acik[k];
    if (acik !== undefined && acik === c.kapali.includes(k)) { kisitDegistir(c, k, acik); degisti = true; }
  }
  return degisti;
}

// Planın özeti (motor: ağırlıklı gecikme saati, geciken iş, iş sayısı); yoksa null.
export interface PlanOzeti { wT: number; late: number; n: number | null }
export function ozetOku(plan: unknown): PlanOzeti | null {
  const o = typeof plan === 'object' && plan !== null ? (plan as { ozet?: unknown }).ozet : null;
  if (typeof o !== 'object' || o === null) return null;
  const { wT, late, n } = o as Record<string, unknown>;
  return typeof wT === 'number' && Number.isFinite(wT) ? { wT, late: typeof late === 'number' ? late : 0, n: typeof n === 'number' ? n : null } : null;
}
// Etki satırları: önce → sonra; biri yoksa yalnız sonra.
export function etkiSatirlari(once: PlanOzeti | null, sonra: PlanOzeti): { ad: string; once: string | null; sonra: string; yon: 'iyi' | 'kotu' | 'ayni' }[] {
  const yon = (a: number | undefined, b: number): 'iyi' | 'kotu' | 'ayni' => (a === undefined || Math.abs(a - b) < 0.05 ? 'ayni' : b < a ? 'iyi' : 'kotu');
  const sa = (x: number) => `${x.toFixed(1).replace('.', ',')} sa`;
  const is = (o: PlanOzeti) => (o.n === null ? String(o.late) : `${String(o.late)} / ${String(o.n)}`);
  return [
    { ad: 'Geciken iş', once: once ? is(once) : null, sonra: is(sonra), yon: yon(once?.late, sonra.late) },
    { ad: 'Ağırlıklı gecikme', once: once ? sa(once.wT) : null, sonra: sa(sonra.wT), yon: yon(once?.wT, sonra.wT) },
  ];
}

// Emrin yönü (3282 1c): çalışmanın w.yonEmir'inde emir kimliğiyle durur; yoksa planın yönü geçerlidir (motor girdi.js stKur).
export type EmirYonu = 'plan' | 'ileri' | 'geri';
const yonEmri = (c: PlanlamaCalismasi): Record<string, unknown> => {
  const v = (c.w as Record<string, unknown>)['yonEmir'];
  return typeof v === 'object' && v !== null ? v as Record<string, unknown> : {};
};
export const planYonu = (c: PlanlamaCalismasi): 'ileri' | 'geri' => ((c.w as Record<string, unknown>)['yon'] === 'geri' ? 'geri' : 'ileri');
export function emirYonu(c: PlanlamaCalismasi, id: string): EmirYonu {
  const v = yonEmri(c)[id];
  return v === 'geri' || v === 'ileri' ? v : 'plan';
}
export function emirYonuYaz(c: PlanlamaCalismasi, id: string, y: EmirYonu): boolean {
  if (emirYonu(c, id) === y) return false;
  const { [id]: _, ...kalan } = yonEmri(c);
  (c.w as Record<string, unknown>)['yonEmir'] = y === 'plan' ? kalan : { ...kalan, [id]: y };
  return true;
}
export const yonAdi = (y: 'ileri' | 'geri'): string => (y === 'geri' ? 'geri (teslimden)' : 'ileri');
