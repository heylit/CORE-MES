// Başka modüller (satın alma, stok, plan, proje maliyet) kuru, faizi, alış belgelerini, makine amortismanını ve genel gider oranını buradan alır; firma musteri-tedarikci'dedir. Fonksiyonlar çağıranın db'sini kullanır, transaction açmaz,
// yetki denetlemez (denetim çağıran modülün ucundadır) ve firmanın finans rakamını döndürmez (FNS-48, FNS-49).
import { satisSevkleriCozucusuKaydet, satisSiparisleriCozucusuKaydet, sevkIsiOzetiCozucusuKaydet, siparisOzetiCozucusuKaydet } from './servis.ts';
import type { SatisSevkleriCozucusu, SatisSiparisleriCozucusu, SevkIsiOzetiCozucusu, SiparisOzetiCozucusu } from './servis.ts';
export {
  alisBelgeleri, belgeSiparisBagla, faizGetir, gunlukFaizGetir, siparisOdemePlaniYaz, siparisPlanlari, faizler, kurGetir, kurlar, makineAmortismani, birimMaliyetleri, genelGiderOrani,
} from './servis.ts';
// 260 a: satış siparişinin faturaları ve iadeleri (tutar finans rakamıdır; FNS-48 yetkisi çağıranın ucundadır).
export { siparisFaturalari } from './servis.ts';
// 911 b, 940 c: projeye bağlanan gider belgeleri ve seçicisi (tutar KDV hariç TL; FNS-48 yetkisi çağıranın ucundadır).
export { giderBelgeleri, giderBelgesiSecenekleri } from './servis.ts';
export type { GecerliGunlukFaiz } from './servis.ts';
export type { SatisSevkleriCozucusu, SatisSiparisleriCozucusu, SevkIsiOzetiCozucusu, SiparisFaturasi, SiparisOzetiCozucusu } from './servis.ts';
// Siparişin durumu ve müşterisi kablolamadan gelir (siparişler -> malzemeler -> finans döngüsü).
export const siparisOzetiCozucusu = (cozucu: SiparisOzetiCozucusu | null): void => siparisOzetiCozucusuKaydet(cozucu);
export const satisSiparisleriCozucusu = (cozucu: SatisSiparisleriCozucusu | null): void => satisSiparisleriCozucusuKaydet(cozucu);
export const sevkIsiOzetiCozucusu = (cozucu: SevkIsiOzetiCozucusu | null): void => sevkIsiOzetiCozucusuKaydet(cozucu);
export const satisSevkleriCozucusu = (cozucu: SatisSevkleriCozucusu | null): void => satisSevkleriCozucusuKaydet(cozucu);
export type { BirimMaliyeti, GenelGiderOrani, AlisBelgesi, GiderBelgesi, GecerliFaiz, GecerliKur, SiparisAnahtari, SiparisOdemesi, SiparisPlani } from './servis.ts';
export type { MaliyetTuru } from './kurallar.ts';
export { tedarikciOlabilirMi } from './kurallar.ts';
// Takvim (891): aralıktaki vergi beyan ve ödeme son günleri (genel kural, tutarsız). Yetki denetlemez; çağıran finans.oku'yu denetler.
export { takvimKayitlari } from './servis.ts';
// 1840 (karar 1839 a): satın almanın üç yollu eşleşme uyarısı için alış faturasının KDV hariç tutarı ve para birimi. Yalnız bu
// tutar çıkar; KDV, toplam, kalan ve öteki finans rakamları çıkmaz (FNS-48). Firmanın olmayan, gider olmayan ya da iptal
// edilmiş belgede null döner.
import type { Db } from '#cekirdek/db.ts';
import { belgeGetir } from './sorgular.ts';
export async function alisBelgesiEslesmeTutari(db: Db, belgeId: number, firmaId: number): Promise<{ tutar: string; paraBirimi: string } | null> {
  const b = await belgeGetir<{ yon: string; firmaId: number | null; durum: string; tutar: string; paraBirimi: string }>(db, belgeId);
  if (b === null || b.yon !== 'gider' || b.durum === 'iptal' || b.firmaId !== firmaId) return null;
  return { tutar: b.tutar, paraBirimi: b.paraBirimi };
}
export { malzemeKartiIzleri } from './sorgular.ts';
