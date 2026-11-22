import { sureYaz, type KokpitEmri, type KokpitIsi } from './kurallar.ts';

// 3533: Kokpit Emirler gözünün sol tablosu. Sütun tanımı, iki sıralama, fark ve tamamlanma hesabı ve tarayıcıda saklanan ayar burada, saf.
// Tablo yalnız görünümdür: sıralama plan sırasına ya da önceliğe yazmaz (Risk B2).

export type SutunKimligi = 'emir' | 'urun' | 'adet' | 'termin' | 'bitis' | 'fark' | 'ilerleme';
// en: sütunun px cinsinden ağırlığı (ızgarada fr olarak kullanılır, bölme daralınca oranla küçülür); adimAdi: açık emrin adım satırında aynı yerin başlığı.
export interface SutunTanimi { id: SutunKimligi; ad: string; en: number; sayi: boolean; adimAdi: string }
export const SUTUNLAR: readonly SutunTanimi[] = [
  { id: 'emir', ad: 'Emir', en: 140, sayi: false, adimAdi: 'Adım' },
  { id: 'urun', ad: 'Ürün', en: 140, sayi: false, adimAdi: 'Tezgâh' },
  { id: 'adet', ad: 'Adet', en: 52, sayi: true, adimAdi: '' },
  { id: 'termin', ad: 'Termin', en: 100, sayi: false, adimAdi: 'Başlangıç' },
  { id: 'bitis', ad: 'Plan bitiş', en: 100, sayi: false, adimAdi: 'Süre' },
  { id: 'fark', ad: 'Fark', en: 112, sayi: true, adimAdi: '' },
  { id: 'ilerleme', ad: 'İlerleme', en: 76, sayi: true, adimAdi: 'Durum' },
];
export const SUTUN_ADI: Readonly<Record<SutunKimligi, SutunTanimi>> = Object.fromEntries(SUTUNLAR.map((s) => [s.id, s])) as Record<SutunKimligi, SutunTanimi>;
// Tezgâhlar gözünün tablosu (V7: sütun seçimi ve sıralama yok).
export type TezgahSutunu = 'tezgah' | 'ad' | 'yuk' | 'suan';
export const TEZGAH_SUTUNLARI: readonly { id: TezgahSutunu; ad: string; en: number; sayi: boolean }[] = [
  { id: 'tezgah', ad: 'Tezgâh', en: 110, sayi: false },
  { id: 'ad', ad: 'Ad', en: 150, sayi: false },
  { id: 'yuk', ad: 'Yük', en: 110, sayi: true },
  { id: 'suan', ad: 'Şu an', en: 110, sayi: false },
];

// Dar ekranda (tablet) tamamlanma dairesi de varsayılandır: kullanıcının özellikle istediği gösterge her genişlikte görünür.
export const DAR_SUTUNLAR: readonly SutunKimligi[] = ['emir', 'termin', 'fark', 'ilerleme'];
export const varsayilanSutunlar = (dar: boolean): SutunKimligi[] => (dar ? [...DAR_SUTUNLAR] : SUTUNLAR.map((s) => s.id));
// Emir sütunu hep açıktır (açma oku orada); sıra tanım sırasıdır.
export function sutunlariDuzenle(l: Iterable<SutunKimligi>): SutunKimligi[] {
  const k = new Set(l);
  k.add('emir');
  return SUTUNLAR.map((s) => s.id).filter((x) => k.has(x));
}
const kok = (l: readonly { en: number }[]): number => l.reduce((t, s) => t + s.en, 0);
export const sutunToplamEni = (l: readonly SutunKimligi[]): number => kok(l.map((x) => SUTUN_ADI[x]));
export const tezgahToplamEni = (): number => kok(TEZGAH_SUTUNLARI);
// Izgara şablonu: sütunlar bölmenin eniyle orantılı küçülür, taşmaz (minmax(0, …)).
export const sablon = (l: readonly { en: number }[]): string => l.map((s) => `minmax(0, ${String(s.en)}fr)`).join(' ');

// Bölme eni: ayarlanmamışsa sütunların doğal eni; hep görünen alanın oranıyla sınırlı (gantt sıkışıp kaybolmasın).
export const EN_ENAZ = 200, EN_ENCOK_ORAN = 70, OTOMATIK_ORAN = 65, EN_PAYI = 160;
export const bolmeEni = (dogal: number, ayar: number | null): string => (ayar === null ? `min(${String(dogal)}px, ${String(OTOMATIK_ORAN)}cqw)` : `min(${String(Math.round(ayar))}px, ${String(EN_ENCOK_ORAN)}cqw)`);
export const bolmeSinirla = (en: number, kapEni: number): number => Math.round(Math.max(EN_ENAZ, Math.min(Math.max(EN_ENAZ, kapEni - EN_PAYI), en)));

// --- Sıralama (yalnız görünüm) ---
export type Siralama = 'plan' | 'gecikme';
export const SIRALAMA_ADI: Readonly<Record<Siralama, string>> = { plan: 'Plan sırası', gecikme: 'Termine göre gecikme' };

// Emrin bütün adımı bitmiş mi (V8: bitti işareti plan kaydından; süren adım yarım sayılmaz).
export interface Ilerleme { biten: number; toplam: number; oran: number; tam: boolean }
export function ilerleme(e: KokpitEmri, isler: Readonly<Record<string, KokpitIsi>>): Ilerleme | null {
  if (e.durum === 'plansiz' || e.adimlar.length === 0) return null;
  const biten = e.adimlar.filter((a) => isler[a.id]?.bitti === true).length, toplam = e.adimlar.length;
  return { biten, toplam, oran: biten / toplam, tam: biten === toplam };
}
export const ilerlemeYazisi = (i: Ilerleme): string => (i.tam ? `Emir bitti · ${String(i.toplam)}/${String(i.toplam)} adım bitti` : `${String(i.biten)}/${String(i.toplam)} adım bitti`);

// Fark = plan bitişi − termin (KokpitEmri.gecikme). Terminsiz ya da plansız emirde null; sıfır uydurulmaz. İki ton: geç ve zamanında.
export interface Fark { ton: 'gec' | 'zaman'; yazi: string }
export function farkOlustur(e: Pick<KokpitEmri, 'gecikme'>): Fark | null {
  const g = e.gecikme;
  if (g === null) return null;
  if (g > 0.01) return { ton: 'gec', yazi: `${sureYaz(g)} geç` };
  return Math.abs(g) <= 0.01 ? { ton: 'zaman', yazi: 'tam zamanında' } : { ton: 'zaman', yazi: `${sureYaz(-g)} erken` };
}

// Termine göre gecikme: en çok gecikecek emir üstte (eşitlikte termini yakın olan, sonra plan sırası); terminsiz ve plansız emirler plan
// sırasıyla ortada kalır; bitmiş emirler (hiçbir eylem kalmadı) en altta, plan sırasıyla (Arayüz K7). Girdi sırası plan sırasıdır.
export function siralaGecikme(emirler: readonly KokpitEmri[], isler: Readonly<Record<string, KokpitIsi>>): KokpitEmri[] {
  const bitmis = (e: KokpitEmri): boolean => ilerleme(e, isler)?.tam === true;
  const grup = (e: KokpitEmri): number => (bitmis(e) ? 2 : e.gecikme === null ? 1 : 0);
  return emirler.map((e, i) => ({ e, i })).sort((a, b) => {
    const ga = grup(a.e), gb = grup(b.e);
    if (ga !== gb) return ga - gb;
    if (ga === 0) return (b.e.gecikme ?? 0) - (a.e.gecikme ?? 0) || (a.e.termin ?? Infinity) - (b.e.termin ?? Infinity) || a.i - b.i;
    return a.i - b.i;
  }).map((x) => x.e);
}

// Plan sırası (gantt dilim 1, T2): emir ilk planlı adımının başlangıcına göre dizilir; tahta "şelale" olur. Eşitlikte girdi sırası; hiç adımı
// planda olmayan emir girdi sırasıyla en altta. Tablo, tahta ve telefon listesi aynı sırayı okur.
export function siralaPlan(emirler: readonly KokpitEmri[], isler: Readonly<Record<string, KokpitIsi>>): KokpitEmri[] {
  const ilk = (e: KokpitEmri): number => e.adimlar.reduce((en, a) => Math.min(en, isler[a.id]?.S ?? Infinity), Infinity);
  return emirler.map((e, i) => ({ e, i, s: ilk(e) })).sort((a, b) => (a.s === b.s ? a.i - b.i : a.s - b.s)).map((x) => x.e);
}

// Adım satırının durumu: bitti > süren > kilitli > bekliyor; planda yeri olmayan adımın durumu bilinmez (null).
export type AdimDurumu = 'bitti' | 'suruyor' | 'kilitli' | 'bekliyor';
export const ADIM_DURUMU_ADI: Readonly<Record<AdimDurumu, string>> = { bitti: 'Bitti', suruyor: 'Sürüyor', kilitli: 'Kilitli', bekliyor: 'Bekliyor' };
export const adimDurumu = (x: KokpitIsi | undefined): AdimDurumu | null => (x === undefined ? null : x.bitti ? 'bitti' : x.basladi ? 'suruyor' : x.kilitli ? 'kilitli' : 'bekliyor');

// Tarih ve saat tek parça ("23.11 08:00"); zaman() "23.11 Pzt 08:00" biçimindedir.
export const tarihSaat = (zaman: (t: number) => string, t: number): string => { const z = zaman(t); return `${z.slice(0, 5)} ${z.slice(-5)}`; };

// Tezgâhın "şu an" durumu: duruşta, süren iş var, ya da planda şu an süren iş yok. Yeni veri kaynağı yok (plan kaydı ve duruş listesi).
export type SuAn = 'durus' | 'calisiyor' | 'bosta';
export const SU_AN_ADI: Readonly<Record<SuAn, string>> = { durus: 'Duruş', calisiyor: 'Çalışıyor', bosta: 'Boşta' };
export function suAn(isler: readonly KokpitIsi[], tezgah: string, durusta: boolean): SuAn {
  if (durusta) return 'durus';
  return isler.some((x) => x.m === tezgah && x.basladi && x.bitti !== true) ? 'calisiyor' : 'bosta';
}

// --- Tarayıcıda saklanan ayar (V2): yalnız sütun adları ve bölme eni; veri saklanmaz (Risk B3). Sıralama saklanmaz, her açılışta Plan sırasıdır. ---
export interface TabloAyari { sutunlar: SutunKimligi[] | null; en: number | null }
export const AYAR_ANAHTARI = 'coremes.kokpit-tablo';
const BILINEN = new Set<string>(SUTUNLAR.map((s) => s.id));
export function ayarCoz(ham: string | null): TabloAyari {
  try {
    const v: unknown = JSON.parse(ham ?? 'null');
    if (typeof v !== 'object' || v === null) return { sutunlar: null, en: null };
    const o = v as Record<string, unknown>;
    const l = Array.isArray(o['sutunlar']) ? o['sutunlar'].filter((x): x is SutunKimligi => typeof x === 'string' && BILINEN.has(x)) : null;
    const en = typeof o['en'] === 'number' && Number.isFinite(o['en']) && o['en'] >= EN_ENAZ && o['en'] <= 4000 ? Math.round(o['en']) : null;
    return { sutunlar: l && l.length > 0 ? sutunlariDuzenle(l) : null, en };
  } catch { return { sutunlar: null, en: null }; }
}
export function ayarOku(): TabloAyari {
  try { return ayarCoz(localStorage.getItem(AYAR_ANAHTARI)); } catch { return { sutunlar: null, en: null }; }
}
export function ayarYaz(a: TabloAyari): void {
  try {
    if (a.sutunlar === null && a.en === null) localStorage.removeItem(AYAR_ANAHTARI); else localStorage.setItem(AYAR_ANAHTARI, JSON.stringify(a));
  } catch { /* depolama kapalı: ayar bu açılışta kalır */ }
}
