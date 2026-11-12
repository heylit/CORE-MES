import type { KmGirisKaydi, KmGirisKarari } from '#paylasilan/sozlesme/kalite-merkezi.ts';
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

export function sonucMetni(k: KmGirisKaydi): string {
  if (k.durum !== 'kapandi') return YOK;
  const hatali = Number(k.hataliMiktar ?? 0);
  if (hatali <= 0) return 'Kabul';
  return `${miktarMetni(k.hataliMiktar)} hatalı · ${k.karar === null ? YOK : KARAR_ADI[k.karar]}`;
}

// Arama mal kabul no, malzeme, lot, tedarikçi ve siparişte; Türkçe harf duyarsız.
const sadeles = (m: string): string => m.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
export function girisAraniyor(k: KmGirisKaydi, q: string): boolean {
  const s = sadeles(q.trim());
  if (!s) return true;
  return [k.malKabulNo, k.malzemeKod, k.malzemeAd, k.partiEtiketi, k.tedarikciAdi, k.siparisNo].some((d) => d !== null && sadeles(d).includes(s));
}
