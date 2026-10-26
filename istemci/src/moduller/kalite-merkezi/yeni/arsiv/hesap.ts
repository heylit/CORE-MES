import { ayEkle, bugun } from '../kurallar.ts';
import { KAPALI } from '../sabitler.ts';
import type { KmKayit, KmKoleksiyonu } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';

type Kayit = KmKayit & { durum?: string; sonuc?: string; tip?: string; karar?: string; tarih?: string; termin?: string; acilis?: string };

// Uygulamanın ARSIV_COLS'u: yalnız kapanmış, onaylanmış ya da sonuçlanmış kayıt arşive alınır. İş emri ve siparişler sahibindedir
// (592 B1 c); Kalite Merkezi onları arşivlemez.
export const ARSIV_KOLLARI: readonly { kol: KmKoleksiyonu; ad: string; uygun: (r: Kayit) => boolean }[] = [
  { kol: 'ncr', ad: 'NCR', uygun: (r) => r.durum === KAPALI },
  { kol: 'capa', ad: 'DÖF', uygun: (r) => r.durum === KAPALI },
  { kol: 'insp', ad: 'Muayene', uygun: (r) => ['Kabul', 'Ret', 'Beklemede'].includes(r.sonuc ?? '') },
  { kol: 'lot', ad: 'Lot kabul', uygun: (r) => r.tip !== 'reset' && !!r.karar },
  { kol: 'frm', ad: 'Form', uygun: (r) => r.durum === 'Onaylandı' },
];
export const ARSIV_AYLARI = [6, 12, 24, 36, 60];

export interface ArsivAdayi { kol: KmKoleksiyonu; ad: string; kayitlar: Kayit[]; arsivde: number }

export function arsivAdaylari(v: KmVerisi, ay: number, simdi: string = bugun()): ArsivAdayi[] {
  const sinir = ayEkle(simdi, -ay);
  return ARSIV_KOLLARI.map(({ kol, ad, uygun }) => {
    const L = v[kol] as readonly Kayit[];
    return {
      kol, ad,
      kayitlar: L.filter((r) => !r.arsiv && uygun(r) && (r.tarih || r.termin || r.acilis || '') < sinir),
      arsivde: L.filter((r) => r.arsiv).length,
    };
  });
}
