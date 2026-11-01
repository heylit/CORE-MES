import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { PlanOzeti } from './kurallar.ts';

// Liste ve ayrıntının ortak gösterimleri: tür adı, plan hücresi. Durum adı ve tonu tek sözlükten gelir (kurallar.ts durumGosterimi).
export const turAdi = (tur: string): string => (EMIR_TURU_ADLARI as Record<string, string>)[tur] ?? tur;
const TAMPON_ADI = { gec: 'Gecikiyor', kirmizi: 'Tampon kritik', sari: 'Tampon azaldı', yesil: 'Tampon yeterli' } as const;
const TAMPON_TONU: Readonly<Record<keyof typeof TAMPON_ADI, RozetTonu>> = { gec: 'hata', kirmizi: 'hata', sari: 'uyari', yesil: 'tamam' };
const gunBicimi = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export interface TamponRozeti { tur: keyof typeof TAMPON_ADI; metin: string; ton: RozetTonu; ipucu: string }
export function tamponRozeti(p: PlanOzeti): TamponRozeti | null {
  if (p.tur !== 'plan' || p.tampon === null || p.bolluk === null) return null;
  const gun = gunBicimi.format(p.bolluk);
  return { tur: p.tampon, metin: `${TAMPON_ADI[p.tampon]}, ${p.bolluk >= 0 ? '+' : ''}${gun} g`, ton: TAMPON_TONU[p.tampon], ipucu: `Teslime kalan bolluk ${gun} gün` };
}
// Plan dışı çalışan adım (487/2 b): tarih aynı kalır, alt satır uyarı tonunda yazılır.
const calisanMetni = (op: number[]): string =>
  op.length === 1 ? `OP ${String(op[0])} çalışıyor, planda yok` : `${String(op.length)} çalışan adım planda yok`;
export function planMetni(p: PlanOzeti): { metin: string; ton: RozetTonu | null; alt: string | null; altTon: RozetTonu | null } {
  switch (p.tur) {
    case 'tamam': return { metin: p.metin, ton: null, alt: null, altTon: null };
    case 'plan-disi': return { metin: 'Plan dışı', ton: null, alt: null, altTon: null };
    case 'motor-yok': return { metin: '—', ton: null, alt: null, altTon: null };
    case 'planlanamiyor': {
      const ilk = p.kok[0];
      return {
        metin: 'Planlanamıyor', ton: 'hata', altTon: null,
        alt: ilk === undefined ? null : p.kok.length === 1 ? `OP ${String(ilk.opNo)}: ${ilk.neden}` : `${String(p.kok.length)} adım planlanamadı: ${ilk.neden}`,
      };
    }
    case 'yerlesmedi': return p.calisanPlanDisi.length === p.acikAdim
      ? { metin: 'Yerleşmedi', ton: 'hata', alt: calisanMetni(p.calisanPlanDisi), altTon: 'uyari' }
      : { metin: 'Yerleşmedi', ton: 'hata', alt: `${String(p.acikAdim)} açık adım planda yok`, altTon: null };
    case 'plan': return {
      metin: tarih(p.bitis), ton: p.bitis === null ? null : p.gecikiyor ? 'hata' : 'tamam',
      alt: p.calisanPlanDisi.length ? calisanMetni(p.calisanPlanDisi) : null, altTon: p.calisanPlanDisi.length ? 'uyari' : null,
    };
  }
}
