import type { Islem } from '#paylasilan/islemler.ts';
import { useYetki, type Yetki } from '../../../ortak/veri/yetki.ts';

// Ekranın sorduğu İK yetkileri. Ekran yalnız gizler; her yazmayı kendi ucu ayrıca denetler.
export interface IkYetkisi {
  oku: boolean;
  personelYaz: boolean;
  ucretYaz: boolean;
  izinYaz: boolean;
  izinTalep: boolean;
  izinOnay: boolean;
  devamYaz: boolean;
  devamOnay: boolean;
  bordroKesinlestir: boolean;
  bordroKilitAc: boolean;
  bordroGordum: boolean;
  performansYaz: boolean;
  egitimYaz: boolean;
  iseAlimYaz: boolean;
  pozisyonOnay: boolean;
  ayarYaz: boolean;
  ozelVeriOku: boolean;
  herhangiYazma: boolean;
}

const YAZMALAR = {
  personelYaz: 'ik.personel-yaz', ucretYaz: 'ik.ucret-yaz', izinYaz: 'ik.izin-yaz', izinTalep: 'ik.izin-talep', izinOnay: 'ik.izin-onay',
  devamYaz: 'ik.devam-yaz', devamOnay: 'ik.devam-onay', bordroKesinlestir: 'ik.bordro-kesinlestir', bordroKilitAc: 'ik.bordro-kilit-ac',
  bordroGordum: 'ik.bordro-gordum', performansYaz: 'ik.performans-yaz', egitimYaz: 'ik.egitim-yaz', iseAlimYaz: 'ik.ise-alim-yaz',
  pozisyonOnay: 'ik.pozisyon-onay', ayarYaz: 'ik.ayar-yaz',
} as const satisfies Record<string, Islem>;
type YazmaAdi = keyof typeof YAZMALAR;

// Salt okunur oturum hiçbir yazma düğmesi göstermez; okuma yetkileri değişmez.
export function ikYetkisiKur(yetki: Pick<Yetki, 'var'>, kosul: { saltOkunur: boolean }): IkYetkisi {
  const yazabilir = !kosul.saltOkunur;
  const yazmalar = Object.fromEntries(
    (Object.keys(YAZMALAR) as YazmaAdi[]).map((ad) => [ad, yazabilir && yetki.var(YAZMALAR[ad])]),
  ) as Record<YazmaAdi, boolean>;
  return {
    ...yazmalar,
    oku: yetki.var('ik.oku'),
    ozelVeriOku: yetki.var('ik.ozel-veri-oku'),
    herhangiYazma: Object.values(yazmalar).some(Boolean),
  };
}

export function useIkYetkisi(kosul: { saltOkunur: boolean }): IkYetkisi {
  return ikYetkisiKur(useYetki(), kosul);
}

// Yazma ucunun seçimi kişinin gerçek işlemlerine bakar (bugünkü köprü kuralı).
export interface YazmaYetkisi { izinYaz: boolean; devamYaz: boolean; iseAlimYaz: boolean; personelYaz: boolean }
export const yazmaYetkisiKur = (yetki: Pick<Yetki, 'var'>): YazmaYetkisi => ({
  izinYaz: yetki.var('ik.izin-yaz'), devamYaz: yetki.var('ik.devam-yaz'), iseAlimYaz: yetki.var('ik.ise-alim-yaz'), personelYaz: yetki.var('ik.personel-yaz'),
});
