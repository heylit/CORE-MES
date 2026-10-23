import { useYetki } from '../../../ortak/veri/yetki.ts';
import type { KmKoleksiyonu } from './tipler.ts';
import { useKmKimligi } from './veri.ts';

export type KmRolu = 'Muayeneci' | 'Kalite mühendisi' | 'Kalite yöneticisi';

export interface KmYetkisi {
  hazir: boolean;
  oku: boolean;
  yaz: boolean;
  onayla: boolean;
  yonetici: boolean;
  rol: KmRolu;
  silebilir: (kol: KmKoleksiyonu) => boolean;
  arsiv: boolean;
  ayar: boolean;
  kaynak: (kol: KmKoleksiyonu) => boolean;
  kapat: boolean;
  kilitAc: boolean;
  geriYukle: boolean;
}

// Onay işlemiyle de silinebilenler (260 a): belge, Teknik kütüphane bayrağı, şablonu varsayılana döndürme.
const ONAYLA_SILINEN: ReadonlySet<KmKoleksiyonu> = new Set(['belge', 'bayrak', 'tpl']);
// Kaynak kayıtları (229 a): tedarikçi ve şablon yazma onay işlemi ister. Cihaz Kalibrasyondan salt okunur gelir.
const KAYNAK: ReadonlySet<KmKoleksiyonu> = new Set(['sup', 'tpl']);

// Uygulamanın rol seviyeleri TMI yetkisinden: yönetici Kalite yöneticisi, onay işlemi olan Kalite mühendisi, öteki Muayeneci (#313).
// Ekran yalnız gizler; asıl denetim sunucudadır (229 a, 260 a, 261 a: silme ve arşiv yönetici, muayeneci bunları yapamaz).
export function kmYetkisiKur(islemler: { oku: boolean; yaz: boolean; onayla: boolean; geriYukle: boolean }, yonetici: boolean, hazir = true): KmYetkisi {
  const { oku, yaz, onayla, geriYukle } = islemler;
  const rol: KmRolu = yonetici ? 'Kalite yöneticisi' : onayla ? 'Kalite mühendisi' : 'Muayeneci';
  return {
    hazir, oku, yaz, onayla, yonetici, rol,
    silebilir: (kol) => yaz && (yonetici || (onayla && ONAYLA_SILINEN.has(kol))),
    arsiv: yaz && yonetici,
    ayar: yaz && yonetici,
    kaynak: (kol) => yaz && (KAYNAK.has(kol) ? onayla || yonetici : kol !== 'dev'),
    kapat: onayla,
    kilitAc: onayla,
    geriYukle: geriYukle && yonetici,
  };
}

export function useKmYetkisi(): KmYetkisi {
  const y = useYetki();
  const kimlik = useKmKimligi();
  return kmYetkisiKur(
    { oku: y.var('kalite-merkezi.oku'), yaz: y.var('kalite-merkezi.yaz'), onayla: y.var('kalite-merkezi.onayla'), geriYukle: y.var('kalite-merkezi.geri-yukle') },
    kimlik.data?.yonetici === true,
    y.hazir && !kimlik.isPending,
  );
}
