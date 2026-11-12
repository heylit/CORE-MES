import type { KmGirisKaydi, KmGirisKarari, KmGkkTuru } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { YOK } from '../bicim.ts';

export const girisKaydiAnahtari = (id: number) => ['kalite-merkezi', 'giris', 'kayit', id] as const;
export const GIRIS_KAYITLARI_ANAHTARI = ['kalite-merkezi', 'giris', 'kayitlar'] as const;

export const DURUM_ADI: Record<KmGirisKaydi['durum'], string> = { gkk_bekliyor: 'GKK bekliyor', karar_bekliyor: 'Karar bekliyor', kapandi: 'Kapandı' };
export const DURUM_TONU: Record<KmGirisKaydi['durum'], RozetTonu> = { gkk_bekliyor: 'uyari', karar_bekliyor: 'hata', kapandi: 'tamam' };
export const KARAR_ADI: Record<KmGirisKarari, string> = { kabul: 'Kabul', sartli_kabul: 'Şartlı kabul', red: 'Red (iade)' };

// Sunucu miktarı "7.000" verir; ekranda "7", ondalıkta "2,5".
export const miktarMetni = (m: string | null): string => (m === null || m.trim() === '' || Number.isNaN(Number(m.replace(',', '.')))
  ? YOK : Number(m.replace(',', '.')).toLocaleString('tr-TR', { maximumFractionDigits: 3 }));

export const GKK_TURU_ADI: Record<KmGkkTuru, string> = { hammadde: 'Hammadde GKK', yari_mamul: 'Yarı mamul GKK' };

// 3118: kontrol maddelerinin ekrandaki başlığı; anahtarlar sözleşmedeki KM_GKK_MADDELERI ile aynıdır.
export const MADDE_BASLIGI: Record<string, string> = {
  irsaliye: 'İrsaliye ve sipariş uyumlu',
  sertifika: 'Malzeme sertifikası var; kalite ve standart kartla aynı',
  dokum: 'Döküm no sertifikada ve lotta aynı',
  kimlik: 'Cins, form, durum ve yüzey kartla aynı',
  olcu: 'Ölçüler tolerans içinde',
  miktar: 'Sayılan ya da tartılan miktar irsaliyeyle aynı',
  gorsel: 'Pas, çatlak, eğrilik, darbe yok',
  markalama: 'Ambalaj ve markalama uygun',
  resim: 'Resim no ve revizyon kartla aynı',
  rapor: 'İşlem raporu var (kaplama, ısıl işlem)',
  yuzey: 'Darbe, çizik ve yüzey hatası yok',
  ambalaj: 'Çapak yok; ambalaj ve koruma uygun',
};

// Dört sonuç ayrı tutulmaz; kabul ve hatalı miktarıyla hatalının kararından çıkar (1251 a, 1252, 1253 a).
export type GkkSonucu = 'kabul' | 'kismi' | 'sartli' | 'ret';
export const SONUC_ADI: Record<GkkSonucu, string> = { kabul: 'Kabul', kismi: 'Kısmi kabul', sartli: 'Şartlı kabul', ret: 'Ret' };
export function gkkSonucu(k: Pick<KmGirisKaydi, 'kabulMiktar' | 'hataliMiktar' | 'karar'>): GkkSonucu | null {
  if (k.hataliMiktar === null) return null;
  if (Number(k.hataliMiktar) <= 0) return 'kabul';
  if (k.karar === 'sartli_kabul') return 'sartli';
  if (k.karar === 'red') return Number(k.kabulMiktar ?? 0) > 0 ? 'kismi' : 'ret';
  if (k.karar === 'kabul') return 'kabul';
  return null;
}

export function sonucMetni(k: KmGirisKaydi): string {
  if (k.durum !== 'kapandi') return YOK;
  const s = gkkSonucu(k);
  if (s === null) return YOK;
  if (s === 'kabul' && k.karar === 'kabul') return `Kabul (${miktarMetni(k.hataliMiktar)} hatalı olduğu gibi)`;
  if (s === 'kismi') return `Kısmi kabul (${miktarMetni(k.hataliMiktar)} ret)`;
  if (s === 'sartli') return `Şartlı kabul (${miktarMetni(k.hataliMiktar)})`;
  return SONUC_ADI[s];
}

// Arama mal kabul no, malzeme, lot, tedarikçi ve siparişte; Türkçe harf duyarsız.
const sadeles = (m: string): string => m.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
export function girisAraniyor(k: KmGirisKaydi, q: string): boolean {
  const s = sadeles(q.trim());
  if (!s) return true;
  return [k.gkkNo, k.malKabulNo, k.malzemeKod, k.malzemeAd, k.partiEtiketi, k.tedarikciAdi, k.siparisNo].some((d) => d !== null && sadeles(d).includes(s));
}
