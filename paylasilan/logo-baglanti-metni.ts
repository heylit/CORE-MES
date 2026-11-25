import type { LogoYardimciBaglantiHatasi } from './sozlesme/logo.ts';
import { tesisSaati } from './tesis-zamani.ts';

// Logo yardımcısının son "oturum açılamadı" hatası ekranda tek biçimde yazılır (Logo hazırlık ve bağlantı izleme). Saat tesis saatidir.
// Açıklama yalnız kaynağı olan kod ve adım için gelir (kurallar.ts baglantiHatasiAciklamasi); yoksa Logo'nun kendi metni düz gösterilir.
export interface BaglantiHatasiMetni {
  // "2026-11-25 12:14 · UserLogin · kod -93"
  baslik: string;
  // Anlaşılır açıklama; yoksa Logo'nun metni; ikisi de yoksa boş.
  ayrinti: string;
  // "hh:mm"; yardımcı bekleme bildirmediyse null.
  yenidenDeneme: string | null;
  // Yeniden deneme saati geçtiyse true: hata eski olabilir, yeni deneme sonucu henüz görülmedi.
  gecti: boolean;
}

export function baglantiHatasiMetni(h: LogoYardimciBaglantiHatasi, simdi: Date = new Date()): BaglantiHatasiMetni {
  const parcalar = [tesisSaati(new Date(h.zaman)), h.adim ?? 'adım bilinmiyor', h.kod === null ? 'kod okunamadı' : `kod ${h.kod}`];
  const deneme = h.yenidenDeneme === null ? null : new Date(h.yenidenDeneme);
  return {
    baslik: parcalar.join(' · '),
    ayrinti: h.aciklama ?? h.ileti ?? '',
    yenidenDeneme: deneme === null ? null : tesisSaati(deneme).slice(11),
    gecti: deneme !== null && deneme.getTime() <= simdi.getTime(),
  };
}

export const baglantiHatasiOzeti = (h: LogoYardimciBaglantiHatasi, simdi: Date = new Date()): string => {
  const m = baglantiHatasiMetni(h, simdi);
  const ek = h.aciklama !== null && h.ileti !== null ? ` Logo: ${h.ileti}` : '';
  return `${m.baslik}${m.ayrinti ? `: ${m.ayrinti}` : ''}${ek}${m.yenidenDeneme === null ? '' : `. Yeniden deneme: ${m.yenidenDeneme}${m.gecti ? ' (zamanı geçti; yeni deneme sonucu bekleniyor)' : ''}`}`;
};
