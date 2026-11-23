import { gerideEmirleri } from './degisiklikler.ts';
import type { KokpitModeli } from './kurallar.ts';
import type { SiraKarti } from './yerlestirme.ts';
import { yenidenPlanlanacaklar } from './yol.ts';

// Baştan kur penceresinin saf kuralları (3600): kapsam, ne yerinde kalır, ne dizilir, düğmenin yazısı ve pasif nedeni.
// Seçilmeyen siparişler yerinde kalır (sunucuda `!hepsi` kilidi); burada yalnız istenen emirlerin kimlikleri ve sayıları çıkar.
export type BastanKurKapsami = 'tum' | 'geride' | 'secili';
export interface BastanKurIstegi { kapsam: BastanKurKapsami; secili: readonly string[]; kilitDiz: boolean }
export interface BastanKurOzeti {
  // Komuta giden emir kimlikleri; bütün planda tek '*'.
  isler: string[];
  siparis: number;
  // Dizilecek iş: başlamamış, fason olmayan; kilitli iş kilit anahtarı kapalıysa dizilmez.
  diz: number;
  // Başlamamış elle kilitli iş sayısı; kilit anahtarı açıksa bu kadar kilit onayda kalkar.
  kilitli: number;
  kalkacakKilit: number;
  // Yerinde kalan başlamış iş (kalanı bu sürümde dizilmez).
  baslamis: number;
}

export const kartAdi = (k: Pick<SiraKarti, 'siparis' | 'emirler' | 'kok'>): string => k.siparis?.no ?? k.emirler[0]?.no ?? k.kok;

type Model = Pick<KokpitModeli, 'isler' | 'simdi' | 'emirler'>;

export function gerideKartlari(m: Model, kartlar: readonly SiraKarti[]): SiraKarti[] {
  const emirler = new Set(gerideEmirleri(m).emirler);
  return kartlar.filter((k) => k.emirler.some((e) => emirler.has(e.id)));
}

export function bastanKurOzeti(m: Model, kartlar: readonly SiraKarti[], i: BastanKurIstegi): BastanKurOzeti {
  const secili = new Set(i.secili);
  const kartlarda = i.kapsam === 'secili' ? kartlar.filter((k) => secili.has(k.kok)) : i.kapsam === 'geride' ? gerideKartlari(m, kartlar) : [...kartlar];
  const emirKumesi = i.kapsam === 'geride' ? new Set(gerideEmirleri(m).emirler) : null;
  const emirler = kartlarda.flatMap((k) => (i.kapsam === 'secili' ? yenidenPlanlanacaklar(m, k) : k.emirler.map((e) => e.id).filter((id) => emirKumesi === null || emirKumesi.has(id))));
  const kume = new Set(emirler);
  let diz = 0, kilitli = 0, baslamis = 0;
  for (const x of Object.values(m.isler)) {
    if (!kume.has(x.job) || x.fason || x.bitti === true) continue;
    if (x.basladi) { baslamis++; continue; }
    if (x.kilitli) kilitli++;
    diz++;
  }
  const kalkacakKilit = i.kilitDiz ? kilitli : 0;
  return {
    isler: i.kapsam === 'tum' ? ['*'] : emirler,
    siparis: kartlarda.length,
    diz: diz - (i.kilitDiz ? 0 : kilitli),
    kilitli, kalkacakKilit, baslamis,
  };
}

// Düğme kapsamı söyler (Arayüz Y7a): kapsam ekran dışında kalsa da kişi neyi kuracağını bilir.
export function bastanKurDugmesi(kapsam: BastanKurKapsami, siparis: number): string {
  if (kapsam === 'tum') return 'Bütün planı baştan kur';
  return kapsam === 'geride' ? `Geride kalan ${String(siparis)} siparişi baştan kur` : `${String(siparis)} siparişi baştan kur`;
}

export const PLAN_YOK_NEDENI = 'Henüz plan yok; önce planı kurun.';
// Pasif düğmenin nedeni; null: kurulabilir.
export function bastanKurNedeni(planYok: boolean, kapsam: BastanKurKapsami, o: Pick<BastanKurOzeti, 'siparis' | 'isler'>): string | null {
  if (planYok) return PLAN_YOK_NEDENI;
  if (kapsam === 'secili' && o.siparis === 0) return 'Önce en az bir sipariş seçin.';
  if (kapsam === 'geride' && o.isler.length === 0) return 'Geride kalan sipariş yok.';
  if (kapsam === 'secili' && o.isler.length === 0) return 'Seçili siparişlerin planda yeri yok; önce yerleştirin.';
  return null;
}

const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
// Arama sipariş no, emir no, ürün ve müşteriyle bulur.
export function kartAra(kartlar: readonly SiraKarti[], ara: string): SiraKarti[] {
  const q = kucuk(ara.trim());
  if (q === '') return [...kartlar];
  return kartlar.filter((k) => kucuk([kartAdi(k), k.siparis?.musteri ?? '', ...k.emirler.flatMap((e) => [e.no, e.urun])].join(' ')).includes(q));
}

// Menüden "Seçili siparişi baştan kur" ile açılışta başlangıç seçimi: seçili kart varsa o, yoksa boş.
export function ilkSecim(kapsam: BastanKurKapsami, seciliKart: SiraKarti | null): { kapsam: BastanKurKapsami; secili: string[] } {
  return { kapsam, secili: kapsam === 'secili' && seciliKart ? [seciliKart.kok] : [] };
}

export const BASTAN_KUR_SATIRI_EN_COK = 6;
