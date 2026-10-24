import type { KatalogRolu } from '#paylasilan/sozlesme/malzemeler.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import type { KatalogOrtami } from './tipler.ts';
import { KG_FIYATI_ISLEMLERI } from './veri.ts';

// Ekran yalnız gizler; denetim uçtadır. Rol sunucunun `katalogRolu` sonucudur (hazır cevabındaki rol), yeni rol x işlem yok.
export interface MalzemeYetkisi {
  oku: boolean;
  yaz: boolean;
  onayla: boolean;
  tanimYaz: boolean;
  // 213 a: Malzeme ayarlarını tanım yazan yazar; ekran sunucunun cevabını izler.
  ayarYaz: boolean;
  kgFiyatiOkur: boolean;
  etiketMerkezi: boolean;
  rol: KatalogRolu | null;
}

export const YETKISIZ: MalzemeYetkisi = {
  oku: false, yaz: false, onayla: false, tanimYaz: false, ayarYaz: false, kgFiyatiOkur: false, etiketMerkezi: false, rol: null,
};

export function malzemeYetkisi(islemler: (islem: string) => boolean, ortam: KatalogOrtami | undefined): MalzemeYetkisi {
  return {
    oku: islemler('sayfa.malzemeler'),
    yaz: islemler('malzemeler.yaz'),
    onayla: islemler('malzemeler.onayla'),
    tanimYaz: islemler('malzemeler.tanim-yaz'),
    ayarYaz: ortam?.ayarYazabilir ?? false,
    kgFiyatiOkur: KG_FIYATI_ISLEMLERI.some(islemler),
    etiketMerkezi: islemler('sayfa.etiket-merkezi'),
    rol: ortam?.rol ?? null,
  };
}

export function useMalzemeYetkisi(ortam: KatalogOrtami | undefined): MalzemeYetkisi {
  const yetki = useYetki();
  return malzemeYetkisi((i) => yetki.var(i as Parameters<typeof yetki.var>[0]), ortam);
}
