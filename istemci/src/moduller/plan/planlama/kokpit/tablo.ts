import { sureYaz, type KokpitEmri, type KokpitIsi } from './kurallar.ts';

// 3533: Kokpit Emirler gözünün sol tablosu. Sütun tanımı, iki sıralama, fark ve tamamlanma hesabı ve tarayıcıda saklanan ayar burada, saf.
// Tablo yalnız görünümdür: sıralama plan sırasına ya da önceliğe yazmaz (Risk B2).

export type SutunKimligi = 'emir' | 'urun' | 'adet' | 'termin' | 'bitis' | 'fark' | 'ilerleme';
// en: sütunun px cinsinden ağırlığı (ızgarada fr olarak kullanılır, bölme daralınca oranla küçülür); adimAdi: açık emrin adım satırında aynı yerin başlığı.
export interface SutunTanimi { id: SutunKimligi; ad: string; en: number; sayi: boolean; adimAdi: string }
// Fark en uzun yazıyı ("4 gün 17 sa 45 dk erken") en çok iki satırda kesmeden taşıyacak ende; ürün adı uzunsa üç noktayla kısalır, tamamı ipucundadır.
export const SUTUNLAR: readonly SutunTanimi[] = [
  { id: 'emir', ad: 'Emir', en: 140, sayi: false, adimAdi: 'Adım' },
  { id: 'urun', ad: 'Ürün', en: 112, sayi: false, adimAdi: 'Tezgâh' },
  { id: 'adet', ad: 'Adet', en: 52, sayi: true, adimAdi: '' },
  { id: 'termin', ad: 'Termin', en: 100, sayi: false, adimAdi: 'Başlangıç' },
  { id: 'bitis', ad: 'Plan bitiş', en: 100, sayi: false, adimAdi: 'Süre' },
  { id: 'fark', ad: 'Fark', en: 140, sayi: true, adimAdi: '' },
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

// Ölçülen sütunlar: sabit px ağırlık, yazı büyüdüğünde (tarayıcı yakınlaştırması dışında yazı boyu ayarı, yedek yazı tipi) içeriği keser.
// Tahta her sütunun içerik enini ölçer (tek satır, kesilmeden); sütun o kadar açılır. Uzun ad sütunları (Ürün, Ad) ve Emir tavanla
// sınırlıdır, tamamı ipucundadır. Yer daralınca Ürün ve Ad iki satıra kırılır (en dar hali içeriğin yarısı ya da başlığın iki katı), Fark
// rozeti iki satıra kırılır; Emir, tarih ve sayı sütunları kısalmaz. Bölme elle bundan da dar çekilirse sağdaki sütunlar kenarda kırpılır.
export interface SutunOlcumu {
  // Sütunun en geniş hücresi (başlık dahil), px.
  en: Readonly<Record<string, number>>;
  // Sütun başlığının eni (esnek sütunun en dar hali en az bunun iki katı).
  baslik: Readonly<Record<string, number>>;
  // Fark rozetinin iki satıra sığdığı en dar hücre eni (bkz. farkEnAz); rozet yoksa null.
  fark: number | null;
}
export const SUTUN_TAVANI: Readonly<Record<string, number>> = { emir: 360, urun: 240, ad: 240 };
const ESNEK = new Set(['urun', 'ad']);
// Emir sütunu tam numara için açılır (tavan SUTUN_TAVANI), ama bölme dar kalırsa yanındaki sütunları ezmesin: bu eninin altına inmez,
// ötesi boş yer kadar açılır (numara kısalır: ön ek, sonra sıra parçası gider; en az "26-11-030" kalır).
export const EMIR_EN_AZ = 130;
// İki satıra kırılan adın en dar hali: tek satır eninin bu oranı (sözcük sınırında kırıldığı için yarıdan biraz geniş).
const IKI_SATIR = 0.6;
export function olcuSablonu(l: readonly { id: string }[], o: SutunOlcumu | null): { sablon: string; dogal: number; enAz: number } | null {
  if (o === null || l.length === 0 || l.some((s) => !((o.en[s.id] ?? 0) > 0))) return null;
  const parca = l.map((s) => {
    const en = Math.ceil(Math.min(o.en[s.id] ?? 0, SUTUN_TAVANI[s.id] ?? Infinity));
    if (s.id === 'fark') { const az = Math.ceil(Math.min(en, o.fark ?? en)); return { en, az, yazi: `minmax(${String(az)}px, ${String(en)}px)` }; }
    if (s.id === 'emir' && en > EMIR_EN_AZ) return { en, az: EMIR_EN_AZ, yazi: `minmax(${String(EMIR_EN_AZ)}px, ${String(en)}px)` };
    if (!ESNEK.has(s.id)) return { en, az: en, yazi: `${String(en)}px` };
    const az = Math.ceil(Math.min(en, Math.max((o.baslik[s.id] ?? 0) * 2, en * IKI_SATIR)));
    return { en, az, yazi: `minmax(${String(az)}px, ${String(en)}fr)` };
  });
  return { sablon: parca.map((p) => p.yazi).join(' '), dogal: parca.reduce((t, p) => t + p.en, 0), enAz: parca.reduce((t, p) => t + p.az, 0) };
}
// Aynı satır kümesine yeni satırlar gelince (sipariş odağı, açılan emir) yeni ölçü öncekiyle birleşir: sütun yalnız genişler, arama ya
// da sıralamayla gidip gelirken zıplamaz.
export function olcumBirlestir(a: SutunOlcumu, b: SutunOlcumu): SutunOlcumu {
  const enBuyuk = (x: Readonly<Record<string, number>>, y: Readonly<Record<string, number>>): Record<string, number> => {
    const z: Record<string, number> = { ...x };
    for (const [k, v] of Object.entries(y)) z[k] = Math.max(z[k] ?? 0, v);
    return z;
  };
  return { en: enBuyuk(a.en, b.en), baslik: enBuyuk(a.baslik, b.baslik), fark: a.fark === null ? b.fark : b.fark === null ? a.fark : Math.max(a.fark, b.fark) };
}
// Fark rozeti en çok iki satır olsun: yan yana iki kırılmaz parça ("17 sa 45 dk") sığmalı. parcalar: parçaların eni (rozet sırasıyla),
// bosluk: parça arası boşluk, kenar: rozetin ve hücrenin iç payı ile çerçevesi.
export function farkEnAz(parcalar: readonly number[], bosluk: number, kenar: number): number {
  if (parcalar.length === 0) return kenar;
  let en = Math.max(...parcalar);
  for (let i = 0; i + 1 < parcalar.length; i++) en = Math.max(en, (parcalar[i] ?? 0) + bosluk + (parcalar[i + 1] ?? 0));
  return Math.ceil(en + kenar);
}

// Bölme eni: ayarlanmamışsa sütunların doğal eni; hep görünen alanın oranıyla sınırlı (gantt sıkışıp kaybolmasın).
export const EN_ENAZ = 200, EN_ENCOK_ORAN = 70, OTOMATIK_ORAN = 65, EN_PAYI = 160;
// Bölmenin kendi çerçevesi (ayraç kenarlığı) sütunlara düşmez; en dar toplamın üstüne eklenir.
const BOLME_KENARI = 2;
// enAz: sütunların en dar halinin toplamı; kendiliğinden eni bunun altına inmez (sağdaki sütun bölmeden taşmasın, 3660), oranı aşan pay en çok 70cqw'ye kadardır (Gantt sıkışıp kaybolmasın).
export const bolmeEni = (dogal: number, ayar: number | null, enAz = 0): string => (ayar === null ? (enAz > 0 ? `min(${String(dogal)}px, max(${String(OTOMATIK_ORAN)}cqw, min(${String(enAz + BOLME_KENARI)}px, ${String(EN_ENCOK_ORAN)}cqw)))` : `min(${String(dogal)}px, ${String(OTOMATIK_ORAN)}cqw)`) : `min(${String(Math.round(ayar))}px, ${String(EN_ENCOK_ORAN)}cqw)`);
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

// Fark yazısının kırılmaz parçaları: sayı birimiyle ("4 gün", "17 sa"), sonra "geç" ya da "erken"; "tam zamanında" tek parça.
export const farkParcalari = (yazi: string): string[] => yazi.match(/\d+ \S+|\S+( zamanında)?/g) ?? [yazi];
// Sıkı satırda rozet tek satırdır ve dar sütuna sığar: yalnız en büyük birim kalır ("4 gün geç"); tam yazı ipucunda ve ekran okuyucuda.
export const farkKisaParcalari = (yazi: string): string[] => { const p = farkParcalari(yazi); return p.length > 2 ? [p[0] ?? '', p[p.length - 1] ?? ''] : p; };

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
