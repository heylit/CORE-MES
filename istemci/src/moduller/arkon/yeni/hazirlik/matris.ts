import type { HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tmiBitti } from '../../../../../../arkon/web/src/data/biten-is.ts';
import { paketleriGrupla } from '../../../../../../arkon/web/src/data/paket-grup.ts';
import { baslamaDurumu, hazirlikSatirlari, type BaslamaDurumu, type HazirlikSatiri } from '../operator/HazirlikListesi.tsx';
import { paketHazirligi } from './HazirlikTakibi.tsx';
import type { Pkg } from './tipler.ts';

// 3606: Hazırlık sayfasının Matris görünümünün saf hesabı. Satır iş (operasyon): paketi olan iş paketiyle, paketi olmayan açık iş
// emrin hazırlık cevabındaki adımdan gelir ("Paket yok"). Hazırlık cevabı Liste'dekiyle aynı uçtan; durum aynı hesaptan (baslamaDurumu).
// Yalnız paketi olan emirler okunur: hiç paketi olmayan emir bu sayfada yoktur (Hazırlık durumu sayfasında görünür).
export type MatrisHali = HazirlikCevabi['maddeler'][number]['durum'] | 'uyari';
export interface MatrisSatiri {
  anahtar: string;
  emirNo: string;
  ad: string;
  // null: bu işin paketi yok; satır salt okunur, ayrıntı açılmaz.
  paket: Pkg | null;
  // null: hazırlık okunamadı.
  durum: BaslamaDurumu | null;
  hal: ReadonlyMap<string, MatrisHali>;
}

const haller = (l: readonly HazirlikSatiri[]): ReadonlyMap<string, MatrisHali> =>
  new Map(l.map((x) => [x.madde, x.hal === 'eksik' && x.uyarir ? 'uyari' as const : x.hal] as const));
const satirOlustur = (anahtar: string, emirNo: string, ad: string, paket: Pkg | null, l: readonly HazirlikSatiri[] | null): MatrisSatiri =>
  ({ anahtar, emirNo, ad, paket, durum: l ? baslamaDurumu(l) : null, hal: l ? haller(l) : new Map() });
const paketAdi = (p: Pkg) => p.op || (p.tmi?.opNo !== undefined ? `Op ${String(p.tmi.opNo)}` : 'Operasyon girilmedi');

export function matrisSatirlari(paketler: readonly Pkg[], harita: ReadonlyMap<number, HazirlikCevabi>): MatrisSatiri[] {
  const satirlar: MatrisSatiri[] = [];
  for (const g of paketleriGrupla(paketler, 'emir')) {
    const ilk = g.paketler[0];
    if (!ilk) continue;
    const emirId = ilk.tmi && Number.isSafeInteger(ilk.tmi.emirId) ? ilk.tmi.emirId : null;
    const v = emirId === null ? undefined : harita.get(emirId);
    const kullanilan = new Set<string>();
    if (v) {
      for (const a of [...v.isEmirleri].filter((x) => !x.bitti).sort((x, y) => x.opNo - y.opNo)) {
        const l = hazirlikSatirlari(v, a.isEmriId);
        const ps = g.paketler.filter((p) => p.tmi?.isEmriId === a.isEmriId);
        for (const p of ps) { kullanilan.add(p.id); satirlar.push(satirOlustur(p.id, p.no, paketAdi(p), p, l)); }
        if (!ps.length) satirlar.push(satirOlustur(`ie-${String(a.isEmriId)}`, ilk.no, `Op ${String(a.opNo)} · ${a.ad}`, null, l));
      }
    }
    // Hazırlık cevabında karşılığı olmayan paket (kol adımı, eski bağ, bitmiş iş) kaybolmasın.
    for (const p of g.paketler) if (!kullanilan.has(p.id) && !tmiBitti(p as { tmi?: { bitti?: unknown } | null })) satirlar.push(satirOlustur(p.id, p.no, paketAdi(p), p, paketHazirligi(harita, p)));
  }
  return satirlar;
}
