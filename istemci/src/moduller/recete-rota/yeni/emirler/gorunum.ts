import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { Emir, PlanOzeti } from './kurallar.ts';

// Liste ve ayrıntının ortak gösterimleri: durum rengi (Rozet tonu; metin her zaman yazılır), tür adı, plan hücresi.
export const DURUM_TONU: Readonly<Record<Emir['status'], RozetTonu>> = { taslak: 'pasif', serbest: 'bilgi', uretimde: 'uyari', tamam: 'tamam', iptal: 'hata' };
export const turAdi = (tur: string): string => (EMIR_TURU_ADLARI as Record<string, string>)[tur] ?? tur;
export function planMetni(p: PlanOzeti): { metin: string; ton: RozetTonu | null; alt: string | null } {
  switch (p.tur) {
    case 'tamam': return { metin: 'Tamamlandı', ton: null, alt: null };
    case 'plan-disi': return { metin: 'Plan dışı', ton: null, alt: null };
    case 'motor-yok': return { metin: '—', ton: null, alt: null };
    case 'yerlesmedi': return { metin: 'Yerleşmedi', ton: 'hata', alt: `${String(p.acikAdim)} açık adım planda yok` };
    case 'plan': return {
      metin: tarih(p.son), ton: p.gecikiyor ? 'hata' : 'tamam',
      alt: p.gecikiyor ? 'son adım teslimden sonra' : p.yerlesmeyen ? `${String(p.yerlesmeyen)} adım planda yok` : 'son adım başlangıcı',
    };
  }
}
