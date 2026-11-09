import type { PlanlamaCalismasi } from '../../tipler.ts';
import { adaylar } from '../cizelge/kurallar.ts';
import type { Derleme, OkunanPlan, PlanIslemi } from '../kurallar.ts';

// Elle bölme ve payları birleştirme (2524 b, motor sözleşmesi 2516): çalışmada elleBol[adım] = [{ adet, m }]. İki ya da daha çok eleman
// böler; tek eleman (bütün adet, seçilen tezgâh) birleştirir ve rota "Paralel böl" olsa da motor bölmez; anahtarı silmek elle kararı kaldırır.
// Paylar planda adım, adım~2, adım~3 kimlikleriyle gelir. Kilitli, başlamış ya da sabit işte motor elle kararı yok sayar; ekran komutu açmaz.
export interface BolPayi { adet: number; m: string }
export type ElleBol = Record<string, BolPayi[]>;
export const PAY_EKI = '~';
export const kokKimlik = (id: string): string => { const i = id.indexOf(PAY_EKI); return i < 0 ? id : id.slice(0, i); };
export const VARSAYILAN_EN_COK_PAY = 3;

const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function elleBolOku(c: PlanlamaCalismasi): ElleBol {
  const v = (c as { elleBol?: unknown }).elleBol; const l: ElleBol = {};
  if (!nesne(v)) return l;
  for (const [id, x] of Object.entries(v)) {
    if (!Array.isArray(x)) continue;
    const p = x.filter(nesne).flatMap((y) => (typeof y.m === 'string' && Number.isInteger(y.adet) ? [{ adet: y.adet as number, m: y.m }] : []));
    if (p.length) l[id] = p;
  }
  return l;
}

// Pay sayısının üst sınırı çalışmanın bölme ayarıdır (bolmeMaks); okunamazsa motorun varsayılanı.
export function enCokPay(c: PlanlamaCalismasi): number {
  const n = Number(c.param.bolmeMaks);
  return Number.isInteger(n) && n >= 2 ? n : VARSAYILAN_EN_COK_PAY;
}

export const BOL_KILITLI = 'Sabit iş bölünmez ve birleştirilmez; önce sabitliği kaldırın.';
export const BOL_BASLAMIS = 'Başlamış iş bölünmez ve birleştirilmez.';
export const BOL_FASON = 'Fason iş bölünmez.';
export const BOL_TEK_TEZGAH = 'Bölmek için işi yapabilen en az iki tezgâh gerekir.';

export interface BolDurumu {
  id: string; adet: number; adaylar: string[]; enCok: number;
  // Plandaki payları (tek pay bölünmemiş iştir) ve çalışmadaki elle karar.
  paylar: PlanIslemi[]; elle: BolPayi[] | null;
  // Bölme ve birleştirmeyi kapatan neden; motorun "bol" uyarısı da buraya düşer.
  engel: string | null; bolEngeli: string | null;
}
// Adımın adedi çizelgenin hesabıyla aynı: adım başına girilen adet (opAdet), yoksa siparişin adedi.
function adimAdedi(c: PlanlamaCalismasi, id: string, siparis: number): number {
  const x = nesne(c.D.opAdet) ? c.D.opAdet[id] : undefined;
  return x != null && Number.isFinite(Number(x)) ? Number(x) : siparis;
}
// Motorun elle bölmeyi yok saydığı iş için yazdığı uyarı ({ t: 'bol', id, txt }); okunan planın uyarısı kimliği taşımaz, kayıttan okunur.
function bolUyarisi(c: PlanlamaCalismasi, id: string): string | null {
  const w = nesne(c.plan) && Array.isArray(c.plan.warn) ? c.plan.warn : [];
  const x = w.find((y): y is Record<string, unknown> => nesne(y) && y.t === 'bol' && y.id === id);
  return x && typeof x.txt === 'string' ? x.txt : null;
}
export function bolDurumu(c: PlanlamaCalismasi, cx: Derleme, p: OkunanPlan, r: PlanIslemi): BolDurumu {
  const id = kokKimlik(r.id);
  const paylar = Object.values(p.ops).filter((x) => kokKimlik(x.id) === id).sort((a, b) => a.id.localeCompare(b.id, 'tr', { numeric: true }));
  const sip = c.D.siparisler.find((s) => s.id === r.job);
  const adet = adimAdedi(c, id, Number(sip?.adet) || 0);
  const ad = adaylar(c, cx, id).map((a) => a.m).filter((m) => !m.startsWith('@'));
  const uyari = bolUyarisi(c, id);
  const engel = paylar.some((x) => c.locks[x.id]) ? BOL_KILITLI : paylar.some((x) => x.act) ? BOL_BASLAMIS : paylar.some((x) => x.fas) ? BOL_FASON : uyari;
  return { id, adet, adaylar: ad, enCok: enCokPay(c), paylar, elle: elleBolOku(c)[id] ?? null, engel, bolEngeli: engel ?? (ad.length < 2 ? BOL_TEK_TEZGAH : null) };
}
export const bolunmus = (d: Pick<BolDurumu, 'paylar' | 'elle'>): boolean => d.paylar.length > 1 || (d.elle?.length ?? 0) > 1;

// Eşit paylar; artan adet baştaki paylara birer birer dağılır.
export function esitPaylar(adet: number, n: number): number[] {
  const t = Math.floor(adet / n); const k = adet - t * n;
  return Array.from({ length: n }, (_, i) => t + (i < k ? 1 : 0));
}
// Pay tezgâhları: bugünkü paylarınki, eksikse sıradaki boş adaylar.
export function ilkTezgahlar(d: Pick<BolDurumu, 'adaylar' | 'paylar'>, n: number): string[] {
  const l = [...new Set(d.paylar.map((x) => x.m).filter((m) => d.adaylar.includes(m)))];
  for (const m of d.adaylar) if (l.length < n && !l.includes(m)) l.push(m);
  return l.slice(0, n);
}

export function bolDenetle(paylar: readonly BolPayi[], d: Pick<BolDurumu, 'adet' | 'adaylar' | 'enCok'>): string | null {
  if (paylar.length < 2) return 'En az iki pay olmalı.';
  if (paylar.length > d.enCok) return `En çok ${String(d.enCok)} pay olabilir.`;
  if (paylar.some((x) => !Number.isInteger(x.adet) || x.adet < 1)) return 'Her payın adedi en az 1 olmalı.';
  const top = paylar.reduce((t, x) => t + x.adet, 0);
  if (top !== d.adet) return `Payların toplamı ${String(top)}; adımın adedi ${String(d.adet)}.`;
  if (paylar.some((x) => !d.adaylar.includes(x.m))) return 'Pay tezgâhı işi yapabilen tezgâhlardan olmalı.';
  if (new Set(paylar.map((x) => x.m)).size !== paylar.length) return 'Her pay ayrı tezgâhta olmalı.';
  return null;
}

export const bolYaz = (t: PlanlamaCalismasi, id: string, paylar: readonly BolPayi[]): void => {
  const x = t as { elleBol?: unknown };
  x.elleBol = { ...(nesne(x.elleBol) ? x.elleBol : {}), [id]: paylar.map((y) => ({ adet: y.adet, m: y.m })) };
};
export const bolKaldir = (t: PlanlamaCalismasi, id: string): void => {
  const x = t as { elleBol?: unknown };
  if (!nesne(x.elleBol)) return;
  const { [id]: _sil, ...kalan } = x.elleBol;
  x.elleBol = kalan;
};
export const payMetni = (paylar: readonly BolPayi[]): string => paylar.map((x) => `${String(x.adet)} ad ${x.m}`).join(', ');
