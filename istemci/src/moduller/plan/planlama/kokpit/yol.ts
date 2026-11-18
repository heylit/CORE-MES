import { nedenMetni, type OkunanPlan } from '../motor/kurallar.ts';
import { enCokBekleyen, kismiPlanli, sureYaz, type KokpitEmri, type KokpitModeli } from './kurallar.ts';
import { malzemeNedeni } from './malzeme.ts';
import type { SiraKarti } from './yerlestirme.ts';

// Planlama yolu (3414): kişi her an hangi adımda olduğunu ve yaptığının sonucunu cümleyle görür.
// sec: sipariş seçili değil; oner: açık kartın yeri olmayan emri var; duzelt: seçili siparişin bütün emirleri planda.
export type YolAdimi = 'sec' | 'oner' | 'duzelt';
export const YOL_ADIMLARI = [['sec', 'Seç'], ['oner', 'Sistem önersin'], ['duzelt', 'Düzelt'], ['onay', 'Onayla']] as const;

export function yolAdimi(kart: SiraKarti | null, vurgu: boolean): YolAdimi {
  if (!kart) return 'sec';
  // Plansız kart seçilmeden de açık gelir (sıradaki iş odur); planlı kartta sonuç yalnız kişi kartı seçince yazar.
  if (kart.emirler.some((e) => e.durum === 'plansiz')) return 'oner';
  return vurgu ? 'duzelt' : 'sec';
}

export interface KartSonucu {
  tur: 'iyi' | 'risk' | 'gec';
  baslik: string;
  // Geç ya da riskli siparişte neden; zamanında bitende null.
  neden: string | null;
  // Seçenekleri (hamleleri) gösterilecek emir: en çok geciken. Zamanında bitende null.
  emir: KokpitEmri | null;
}

// Planda yeri olan kartın sonucu: kaç operasyon, ne zaman biter, termine göre nerede ve geçse neden.
// Neden motorun kendi kaydından (işlemin `why`'ı) okunur; istemci neden uydurmaz.
export function kartSonucu(
  m: KokpitModeli, p: OkunanPlan | null, kart: SiraKarti, zaman: (t: number) => string, malzemeBekleyen: Readonly<Record<string, number>> = {},
): KartSonucu {
  const adim = kart.emirler.reduce((n, e) => n + e.adimlar.filter((a) => m.isler[a.id]).length, 0);
  const enKotu = [...kart.emirler].sort((a, b) => (b.gecikme ?? -Infinity) - (a.gecikme ?? -Infinity))[0] ?? null;
  const tur = kart.emirler.some((e) => e.durum === 'gec') ? 'gec' : kart.emirler.some((e) => e.durum === 'risk') ? 'risk' : 'iyi';
  const kim = kart.emirler.length > 1 && enKotu ? `${enKotu.no}: ` : '';
  const yer = !enKotu || enKotu.bitis === null ? '' : enKotu.termin === null || enKotu.gecikme === null
    ? ` Bitiş ${zaman(enKotu.bitis)}; termin girilmemiş.`
    : ` ${kim}Bitiş ${zaman(enKotu.bitis)}, termin ${zaman(enKotu.termin)}: ${enKotu.gecikme > 0.01 ? `${sureYaz(enKotu.gecikme)} geç` : `${sureYaz(enKotu.gecikme)} erken`}.`;
  const baslik = `${String(adim)} operasyon planda.${yer}`;
  if (tur === 'iyi' || !enKotu) return { tur, baslik, neden: null, emir: null };
  return { tur, baslik, neden: gecikmeNedeni(m, p, enKotu, zaman, malzemeBekleyen), emir: enKotu };
}

function gecikmeNedeni(m: KokpitModeli, p: OkunanPlan | null, e: KokpitEmri, zaman: (t: number) => string, malzemeBekleyen: Readonly<Record<string, number>>): string {
  const en = enCokBekleyen(m, e);
  if (!en) return 'Adımlar arasında uzun bekleme yok; işlerin toplam süresi termine sığmıyor.';
  const a = e.adimlar[en.k], r = a ? p?.ops[a.id] : undefined;
  if (!a) return 'Bilinmiyor.';
  const malzeme = malzemeNedeni(e, en.k, malzemeBekleyen, zaman);
  if (malzeme !== null) return malzeme;
  const bas = `${String(en.k + 1)}. adım (${a.ad})`, sure = sureYaz(en.bekleme.sure);
  if (r?.why?.t === 'tezgah') {
    const kod = m.tezgahlar.find((t) => t.id === en.tezgah)?.kod ?? en.tezgah;
    const onundeki = r.why.r ? m.emirler.find((x) => x.id === m.isler[r.why?.r ?? '']?.job)?.no : undefined;
    return `${bas} ${kod} tezgâhının boşalmasını ${sure} bekledi${onundeki ? ` (önündeki iş ${onundeki})` : ''}.`;
  }
  // Öncül adımı ve bilinmeyen nedeni motor iş kimliğiyle yazar; burada adım adıyla söylenir.
  if (!r?.why || r.why.t === 'rota') return `${bas} ${sure} bekledi.`;
  return `${bas} ${sure} bekledi: ${nedenMetni(r)}`;
}

// Liste düzeninde (3414 b) sıra: ilgi bekleyen (plansız, geç, riskli) önce, sonra zamanında bitenler; kendi içlerinde gelen sıra (termin) korunur.
const ILGI: Record<SiraKarti['durum'], number> = { plansiz: 0, gec: 0, risk: 0, iyi: 1 };
export const listeSirasi = (kartlar: readonly SiraKarti[]): SiraKarti[] => kartlar.map((k, i) => [k, i] as const).sort((a, b) => ILGI[a[0].durum] - ILGI[b[0].durum] || a[1] - b[1]).map(([k]) => k);

// Yeniden planlamaya giden emirler. Eksik adımları planlamak yalnız kısmen planlı emirleri verir (tam planlı emir yerinde kalır);
// seçili siparişi yeniden planlamak planda adımı olan her emri verir (hiç planlanmamış emir plana alınır, burada yoktur).
type Isli = Pick<KokpitModeli, 'isler'>;
export const eksikPlanlanacaklar = (m: Isli, kart: SiraKarti): string[] => kart.emirler.filter((e) => kismiPlanli(m, e)).map((e) => e.id);
export const yenidenPlanlanacaklar = (m: Isli, kart: SiraKarti): string[] => kart.emirler.filter((e) => e.durum !== 'plansiz' || kismiPlanli(m, e)).map((e) => e.id);
