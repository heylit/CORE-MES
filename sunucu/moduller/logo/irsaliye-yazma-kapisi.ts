import { OLCUM_DURUMU } from './irsaliye-etiket-esleme.ts';

// Irsaliye yazma ayarının açılabilirlik kapısı (saf). Ayar tek başına yetmez: ölçülmemiş etiketle Logo'ya yazılmaz (ADR 0017 m.5).
export type IrsaliyeTuru = 'satin_alma' | 'satis' | 'konsinye';
export type KapiEngeli = 'etiket' | 'durum_kodlari' | 'e_irsaliye_ureticisi' | 'teyit' | 'konsinye';

export const KAPI_ENGEL_ILETILERI: Readonly<Record<KapiEngeli, string>> = Object.freeze({
  etiket: "Logo etiketleri gerçek Logo dökümüyle ölçülmedi.",
  durum_kodlari: 'E-irsaliye durum kodu kümesi onaylanmadı.',
  e_irsaliye_ureticisi: 'Giden e-irsaliyeyi kimin ürettiği belli değil.',
  teyit: 'Logo Connect ile alış e-irsaliyesi kararı kaldırılmadı.',
  konsinye: 'Konsinye çıkış türü Logo\'da ölçülmedi.',
});

export interface KapiSonucu { acik: boolean; engeller: KapiEngeli[] }

export function yazmaKapisi(tur: IrsaliyeTuru): KapiSonucu {
  const durum = OLCUM_DURUMU;
  const engeller: KapiEngeli[] = [];
  const etiketOlculdu = tur === 'satin_alma' ? durum.satinAlmaEtiketleriOlculdu : durum.satisEtiketleriOlculdu;
  if (!etiketOlculdu) engeller.push('etiket');
  if (tur === 'konsinye' && !durum.konsinyeOlculdu) engeller.push('konsinye');
  if (!durum.durumKodlariOnaylandi) engeller.push('durum_kodlari');
  if (!durum.eIrsaliyeUreticisiBelli) engeller.push('e_irsaliye_ureticisi');
  if (tur === 'satin_alma' && !durum.teyitKalkti) engeller.push('teyit');
  return { acik: engeller.length === 0, engeller };
}
