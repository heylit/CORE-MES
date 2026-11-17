import type { SatinAlmaEkiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { OkunanPlan } from '../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import type { KokpitEmri } from './kurallar.ts';

// Kokpit'te emrin malzemesi rotadan önceki adım gibi yazılır (3369 a): şirket, termin, kaç birimi stoktan kaçı siparişten. Miktarlar ve
// anlar planın kaydındandır (motorun dağıtımı); sipariş numarası ve tedarikçi adı planda durmaz, satın almayı okuyabilen kişide açık
// sipariş okumasından (anahtar: Satın Alma satırı) eşlenir. Okuyamayan kişide miktar ve termin yazar, şirket boş kalır.

export type MalzemeDurumu = 'stokta' | 'geliyor' | 'terminsiz' | 'eksik';
// no ve tedarikci: okunamadıysa ya da satır elle girildiyse null. talep: onaylı, siparişi henüz verilmemiş talep.
export interface MalzemeSiparisi { no: string | null; tedarikci: string | null; talep: boolean; miktar: number }
export interface MalzemeSatiri {
  kod: string; ad: string; birim: string;
  // Tüketen adımın kimliği; adımı belli olmayan (eski) reçete satırında null.
  adimId: string | null;
  ihtiyac: number; stoktan: number; siparisten: number;
  // Stok ve verilmiş siparişle karşılanmayan miktar (siparişi verilmemiş).
  eksik: number;
  durum: MalzemeDurumu;
  // geliyor: malzemenin hazır olduğu an (tüketen adım bundan önce başlamaz). terminsiz: planın malzemeyi gelmiş saydığı an. Ötekilerde null.
  an: number | null;
  siparisler: MalzemeSiparisi[];
}
export interface EmirMalzemeleri {
  // Emir kimliği → malzeme satırları (reçete sırasıyla). Malzemesi olmayan emir haritada yoktur.
  satirlar: Readonly<Record<string, readonly MalzemeSatiri[]>>;
  // Malzemeyi bekleyerek yerleşen adım (motorun nedeni 'malzeme') → başlangıcı.
  bekleyen: Readonly<Record<string, number>>;
}
export type AcikSiparisler = SatinAlmaEkiCevabi['acikSiparisler'];

const ESIK = 1e-6;

export function emirMalzemeleri(c: PlanlamaCalismasi, p: OkunanPlan | null, acik: AcikSiparisler | undefined, simdi: number): EmirMalzemeleri {
  const satirlar: Record<string, MalzemeSatiri[]> = {}, bekleyen: Record<string, number> = {};
  if (p === null) return { satirlar, bekleyen };
  const tanim = new Map((c.D.malzemeler ?? []).map((m) => [m.kod, m]));
  const siparis = new Map((acik ?? []).flatMap((x) => (x.satir === undefined ? [] : [[x.satir, x] as const])));
  for (const [emir, l] of Object.entries(p.mal ?? {})) {
    const s = l.map((d): MalzemeSatiri => {
      const verilen = d.pay.filter((x) => x.tur === 'sa');
      const siparisten = verilen.reduce((a, x) => a + x.q, 0);
      const eksik = d.eksik + d.pay.filter((x) => x.tur === 'yok').reduce((a, x) => a + x.q, 0);
      const terminsiz = verilen.filter((x) => x.tb);
      const durum: MalzemeDurumu = eksik > ESIK ? 'eksik' : terminsiz.length > 0 ? 'terminsiz' : siparisten > ESIK ? 'geliyor' : 'stokta';
      const sayilan = terminsiz.flatMap((x) => (x.gelis === null ? [] : [x.gelis]));
      const m = tanim.get(d.kod);
      return {
        kod: d.kod, ad: m?.ad ?? d.kod, birim: m?.birim ?? '', adimId: d.adim === null ? null : `${emir}.${d.adim}`,
        ihtiyac: d.need, stoktan: d.stok, siparisten, eksik: eksik > ESIK ? eksik : 0, durum,
        an: durum === 'geliyor' ? (d.t !== null && d.t > simdi ? d.t : null) : durum === 'terminsiz' && sayilan.length > 0 ? Math.max(...sayilan) : null,
        siparisler: verilen.map((x) => {
          const k = x.kim === null ? undefined : siparis.get(x.kim);
          return { no: k?.siparisNo ?? null, tedarikci: k?.tedarikci ?? null, talep: x.kim !== null && x.kim < 0, miktar: x.q };
        }),
      };
    });
    if (s.length > 0) satirlar[emir] = s;
  }
  for (const r of Object.values(p.ops)) if (r.why?.t === 'malzeme' && Number.isFinite(r.S)) bekleyen[r.id] = r.S;
  return { satirlar, bekleyen };
}

// Plan malzemeyi gelmiş saydıysa (termini girilmemiş ya da eksik) emrin "zamanında" görünmesi bu varsayıma bağlıdır.
export const malzemeVarsayimi = (l: readonly MalzemeSatiri[] | undefined): boolean => (l ?? []).some((x) => x.durum === 'terminsiz' || x.durum === 'eksik');

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const miktarYaz = (x: number, birim: string): string => `${SAYI.format(x)}${birim === '' ? '' : ` ${birim}`}`;

export const MALZEME_DURUM_ADI: Record<MalzemeDurumu, string> = { stokta: 'Stokta', geliyor: 'Bekleniyor', terminsiz: 'Termin yok', eksik: 'Eksik' };

// Termin hücresinin yazısı ve altındaki açıklama.
export function terminYazisi(x: MalzemeSatiri, zaman: (t: number) => string, adim: string | null): { ana: string; alt: string | null } {
  if (x.durum === 'stokta') return { ana: 'stokta', alt: null };
  if (x.durum === 'eksik') return { ana: 'eksik', alt: 'stok yetmiyor, sipariş yok; iş yine de yerleşti' };
  if (x.durum === 'terminsiz') return { ana: 'termin girilmemiş', alt: x.an === null ? null : `plan malzemeyi ${zaman(x.an)} gelmiş saydı` };
  if (x.an === null) return { ana: 'siparişte', alt: 'gelişi işin başlangıcından önce' };
  return { ana: `${zaman(x.an)} geliyor`, alt: adim === null ? null : `${adim} bu tarihten önce başlamaz` };
}

// Emrin geç ya da riskli olmasının nedeni malzemeyse yazısı: en çok bekleyen adım malzemeyi bekleyerek yerleştiyse.
export function malzemeNedeni(e: KokpitEmri, k: number, bekleyen: Readonly<Record<string, number>>, zaman: (t: number) => string): string | null {
  const a = e.adimlar[k];
  if (!a || bekleyen[a.id] === undefined) return null;
  return `${String(k + 1)}. adım (${a.ad}) malzemeyi bekliyor; malzeme ${zaman(bekleyen[a.id]!)} geliyor.`;
}
