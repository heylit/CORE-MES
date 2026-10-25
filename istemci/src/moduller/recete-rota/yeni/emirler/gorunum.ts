import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { Emir, PlanOzeti } from './kurallar.ts';

// Liste ve ayrıntının ortak gösterimleri: durum rengi (Rozet tonu; metin her zaman yazılır), tür adı, plan hücresi.
export const DURUM_TONU: Readonly<Record<Emir['status'], RozetTonu>> = { taslak: 'pasif', serbest: 'bilgi', uretimde: 'uyari', tamam: 'tamam', iptal: 'hata' };
export const turAdi = (tur: string): string => (EMIR_TURU_ADLARI as Record<string, string>)[tur] ?? tur;
const TAMPON_ADI = { gec: 'Gecikiyor', kirmizi: 'Tampon kritik', sari: 'Tampon azaldı', yesil: 'Tampon yeterli' } as const;
const TAMPON_TONU: Readonly<Record<keyof typeof TAMPON_ADI, RozetTonu>> = { gec: 'hata', kirmizi: 'hata', sari: 'uyari', yesil: 'tamam' };
const gunBicimi = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export interface TamponRozeti { metin: string; ton: RozetTonu; ipucu: string }
export function tamponRozeti(p: PlanOzeti): TamponRozeti | null {
  if (p.tur !== 'plan' || p.tampon === null || p.bolluk === null) return null;
  const gun = gunBicimi.format(p.bolluk);
  return { metin: `${TAMPON_ADI[p.tampon]}, ${p.bolluk >= 0 ? '+' : ''}${gun} g`, ton: TAMPON_TONU[p.tampon], ipucu: `Teslime kalan bolluk ${gun} gün` };
}
export function planMetni(p: PlanOzeti): { metin: string; ton: RozetTonu | null; alt: string | null } {
  switch (p.tur) {
    case 'tamam': return { metin: 'Tamamlandı', ton: null, alt: null };
    case 'plan-disi': return { metin: 'Plan dışı', ton: null, alt: null };
    case 'motor-yok': return { metin: '—', ton: null, alt: null };
    case 'planlanamiyor': return {
      metin: 'Planlanamıyor', ton: 'hata', alt: p.adimlar.length === 1 ? p.adimlar[0]?.neden ?? null : `${String(p.adimlar.length)} adım planlanamadı`,
    };
    case 'yerlesmedi': return { metin: 'Yerleşmedi', ton: 'hata', alt: `${String(p.acikAdim)} açık adım planda yok` };
    case 'plan': return {
      metin: tarih(p.bitis), ton: p.bitis === null ? null : p.gecikiyor ? 'hata' : 'tamam',
      alt: null,
    };
  }
}
