import { gerideEmirleri } from './degisiklikler.ts';
import type { KokpitModeli } from './kurallar.ts';
import type { SiraKarti } from './yerlestirme.ts';
import { yenidenPlanlanacaklar } from './yol.ts';

// Baştan kur penceresinin saf kuralları (3600): kapsam, ne yerinde kalır, ne dizilir, düğmenin yazısı ve pasif nedeni.
// Seçilmeyen siparişler yerinde kalır (sunucuda `!hepsi` kilidi); burada yalnız istenen emirlerin kimlikleri ve sayıları çıkar.
export type BastanKurKapsami = 'tum' | 'geride' | 'secili';
export interface BastanKurIstegi { kapsam: BastanKurKapsami; secili: readonly string[]; kilitDiz: boolean; baslamisDiz?: boolean }
export interface BastanKurOzeti {
  // Komuta giden emir kimlikleri; bütün planda tek '*'.
  isler: string[];
  siparis: number;
  // Dizilecek iş: fason olmayan; başlamış iş yalnız başlamış anahtarı açıksa, kilitli iş yalnız kilit anahtarı açıksa dizilir.
  diz: number;
  // Elle kilitli iş sayısı (başlamış iş yalnız başlamış anahtarı açıksa sayılır); kilit anahtarı açıksa bu kadar kilit onayda kalkar.
  kilitli: number;
  kalkacakKilit: number;
  // Kapsamdaki başlamış (bitmemiş) iş; anahtar kapalıysa yerinde kalır, açıksa kalanı dizilir.
  baslamis: number;
}

export const kartAdi = (k: Pick<SiraKarti, 'siparis' | 'emirler' | 'kok'>): string => k.siparis?.no ?? k.emirler[0]?.no ?? k.kok;

type Model = Pick<KokpitModeli, 'isler' | 'simdi' | 'emirler'>;

export function gerideKartlari(m: Model, kartlar: readonly SiraKarti[]): SiraKarti[] {
  const emirler = new Set(gerideEmirleri(m).emirler);
  return kartlar.filter((k) => k.emirler.some((e) => emirler.has(e.id)));
}

// Kapsamdaki emir kimlikleri ve kartları; özet ve ikinci pencerenin iş listesi aynı kümeden çıkar.
function kapsam(m: Model, kartlar: readonly SiraKarti[], i: BastanKurIstegi): { kartlarda: SiraKarti[]; emirler: string[] } {
  const secili = new Set(i.secili);
  const kartlarda = i.kapsam === 'secili' ? kartlar.filter((k) => secili.has(k.kok)) : i.kapsam === 'geride' ? gerideKartlari(m, kartlar) : [...kartlar];
  const emirKumesi = i.kapsam === 'geride' ? new Set(gerideEmirleri(m).emirler) : null;
  const emirler = kartlarda.flatMap((k) => (i.kapsam === 'secili' ? yenidenPlanlanacaklar(m, k) : k.emirler.map((e) => e.id).filter((id) => emirKumesi === null || emirKumesi.has(id))));
  return { kartlarda, emirler };
}

export function bastanKurOzeti(m: Model, kartlar: readonly SiraKarti[], i: BastanKurIstegi): BastanKurOzeti {
  const { kartlarda, emirler } = kapsam(m, kartlar, i);
  const kume = new Set(emirler);
  let diz = 0, kilitli = 0, baslamis = 0;
  for (const x of Object.values(m.isler)) {
    if (!kume.has(x.job) || x.fason || x.bitti === true) continue;
    if (x.basladi) { baslamis++; if (i.baslamisDiz !== true) continue; }
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

// İkinci onay penceresinin iş listesi (Arayüz Y5): kalanı dizilecek başlamış işler. yapilan/kalan çalışmanın gercek kaydından (n sayılan, A adet);
// bilinmiyorsa null (sayı uydurulmaz). calisiyor: sunucu işi hâlâ sürüyor diyor; canlıda eski yerinde kalır (3414-7 a).
export interface BaslamisIs { id: string; emirNo: string; ad: string; tezgah: string; yapilan: number | null; kalan: number | null; calisiyor: boolean }
export function baslamisListesi(m: Model, kartlar: readonly SiraKarti[], i: BastanKurIstegi, gercek: Readonly<Record<string, unknown>> | null): BaslamisIs[] {
  const kume = new Set(kapsam(m, kartlar, i).emirler);
  const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return Object.values(m.isler).filter((x) => kume.has(x.job) && x.basladi && !x.fason && x.bitti !== true).map((x) => {
    const g = gercek?.[x.id];
    const a = typeof g === 'object' && g !== null ? g as Record<string, unknown> : null;
    const yapilan = a ? sayi(a['n']) : null, adet = a ? sayi(a['A']) : null;
    return {
      id: x.id, emirNo: m.emirler.find((e) => e.id === x.job)?.no ?? x.job, ad: x.ad, tezgah: x.m,
      yapilan, kalan: yapilan !== null && adet !== null ? Math.max(0, adet - yapilan) : null,
      calisiyor: a !== null && a['S'] != null && a['C'] == null,
    };
  }).sort((p, q) => p.emirNo.localeCompare(q.emirNo, 'tr') || p.id.localeCompare(q.id, 'tr'));
}

// Düğme kapsamı söyler (Arayüz Y7a): kapsam ekran dışında kalsa da kişi neyi kuracağını bilir.
export function bastanKurDugmesi(kapsam: BastanKurKapsami, siparis: number, devam = false): string {
  if (devam) return 'Devam';
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

// Canlıya almanın sıra hatasından (sunucu servis.ts siraIhlali) kilitli adımın emir no ve adım no'su; kilitli değilse null (Arayüz Y8).
export function kilitIhlaliAyir(ileti: string): { emirNo: string; opNo: number } | null {
  const e = /sıraya aykırı adım var: (\S+) OP (\d+) elle kilitli/.exec(ileti);
  return e ? { emirNo: e[1]!, opNo: Number(e[2]) } : null;
}

export const BASTAN_KUR_SATIRI_EN_COK = 6;
