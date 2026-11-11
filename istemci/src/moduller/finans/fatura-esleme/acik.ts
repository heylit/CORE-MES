import { kapaliModulYoluMu, yolKapaliMi } from '#paylasilan/sayfalar.ts';
import { useKapaliSayfalar } from '../../../ortak/veri/kapali-sayfalar.ts';

// Eşleme satın alma siparişinin satırlarını okur: modül derlemede kapalıysa ya da Sistem Ayarları'nda siparişler sayfası
// (ya da bütün satın alma) kapatıldıysa sayfa ve bağlantı görünmez (Mimar N2, 2675). Liste gelmeden açık sayılır (kabukla aynı).
const SIPARISLER = '/satin-alma/siparisler';

export function useSatinAlmaAcik(): boolean {
  const kapali = useKapaliSayfalar();
  return !kapaliModulYoluMu(SIPARISLER) && !yolKapaliMi(SIPARISLER, kapali);
}

// Arayüz B2: Kayıtlar altında; ikinci menüde Kayıtlar etkin görünür. Bağlantı yalnız Kayıtlar'dadır (finans.oku), adres de onun altında.
export const ESLEME_ROTASI = '/finans/kayitlar/fatura-eslemesi/:belgeId';
export const eslemeYolu = (belgeId: number): string => ESLEME_ROTASI.replace(':belgeId', String(belgeId));

// Bağlantı gezinme durumuna bunu koyar; "Kayıtlara dön" geri gider.
export interface EslemeDonusu { faturaAyrintisindan: true }
