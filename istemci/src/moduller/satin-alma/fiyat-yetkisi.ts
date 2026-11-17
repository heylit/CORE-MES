import type { Islem } from '#paylasilan/islemler.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// 3401-1 a: sunucuyla aynı kural (sunucu/moduller/satin-alma/kurallar.ts fiyatGorurMu). Fiyat görür = fiyat-oku, yaz ya da onayla;
// yalnız satin-alma.oku (planlama) tam görür ama fiyatsız. Asıl kapı sunucudur; burası kilidi çizmek içindir.
export const FIYAT_GOREN_ISLEMLER: readonly Islem[] = ['satin-alma.fiyat-oku', 'satin-alma.yaz', 'satin-alma.onayla'];
// Analiz yalnız okur ve onayla tek başına açmaz (sunucudaki uç yetkisi).
export const FIYAT_ANALIZI_ISLEMLERI: readonly Islem[] = ['satin-alma.fiyat-oku', 'satin-alma.yaz'];
// finans.maliyet-oku tek başına kg fiyatını açar; satin-alma.oku açmaz.
export const KG_FIYATI_OKUR: readonly Islem[] = ['satin-alma.fiyat-oku', 'satin-alma.yaz', 'finans.maliyet-oku'];

export const biriVarMi = (islemler: readonly string[], liste: readonly string[]): boolean => liste.some((i) => islemler.includes(i));

// Oturum gelene kadar null: ekran ne kilit ne fiyat çizer, istek atmaz.
export function useYetkiVarMi(liste: readonly string[]): boolean | null {
  const { data } = useOturum();
  return data === undefined || data === null ? null : biriVarMi(data.islemler, liste);
}
