import type { LogoYardimciBaglantiHatasi } from './sozlesme/logo.ts';
import { tesisSaati } from './tesis-zamani.ts';

// Logo yardımcısının son "oturum açılamadı" hatası ekranda tek biçimde yazılır (Logo hazırlık ve bağlantı izleme). Saat tesis saatidir ve
// ekranların öteki saatleri gibi "GG.AA.YYYY SS:DD" yazılır. Cümle sonu noktaları kırpılır: ayraçla eklenen parça çift nokta üretmez.
const sonNoktasiz = (metin: string): string => metin.trim().replace(/[.\s]+$/, '');
const ekranSaati = (an: Date): string => {
  const [tarih, saat] = tesisSaati(an).split(' ') as [string, string];
  const [yil, ay, gun] = tarih.split('-') as [string, string, string];
  return `${gun}.${ay}.${yil} ${saat}`;
};

export interface BaglantiHatasiMetni {
  // "25.11.2026 12:14 · UserLogin · kod -93"
  baslik: string;
  // Anlaşılır açıklama; yoksa Logo'nun metni; ikisi de yoksa boş.
  ayrinti: string;
  // "hh:mm"; yardımcı bekleme bildirmediyse null.
  yenidenDeneme: string | null;
  // Yeniden deneme saati geçtiyse true: hata eski olabilir, yeni deneme sonucu henüz görülmedi.
  gecti: boolean;
}

export function baglantiHatasiMetni(h: LogoYardimciBaglantiHatasi, simdi: Date = new Date()): BaglantiHatasiMetni {
  const parcalar = [ekranSaati(new Date(h.zaman)), h.adim ?? 'adım bilinmiyor', h.kod === null ? 'kod okunamadı' : `kod ${h.kod}`];
  const deneme = h.yenidenDeneme === null ? null : new Date(h.yenidenDeneme);
  return {
    baslik: parcalar.join(' · '),
    ayrinti: sonNoktasiz(h.aciklama ?? h.ileti ?? ''),
    yenidenDeneme: deneme === null ? null : tesisSaati(deneme).slice(11),
    gecti: deneme !== null && deneme.getTime() <= simdi.getTime(),
  };
}

// Üç satır: ne oluyor, neden, teknik ayrıntı (yönetici ekranı: adım, kod ve Logo'nun kendi metni kalır).
export interface HataSatirlari {
  ozet: string;
  neden: string | null;
  teknik: string;
}

export function baglantiHatasiSatirlari(h: LogoYardimciBaglantiHatasi, ozet: string, simdi: Date = new Date()): HataSatirlari {
  const m = baglantiHatasiMetni(h, simdi);
  const logoMetni = h.aciklama !== null && h.ileti !== null ? ` · Logo: ${sonNoktasiz(h.ileti)}` : '';
  const deneme = m.yenidenDeneme === null ? '' : ` · Yeniden deneme: ${m.yenidenDeneme}${m.gecti ? ' (zamanı geçti; yeni deneme sonucu bekleniyor)' : ''}`;
  return { ozet, neden: m.ayrinti === '' ? null : m.ayrinti, teknik: `${m.baslik}${logoMetni}${deneme}` };
}

// Son 15 dakikada yazmadan 503 gelmişse hazırlık kutusunda ve bağlantı izlemenin üstünde görünen uyarı. Okumaların çalışması bunu gizlemez.
export const yazilamiyorSatirlari = (h: LogoYardimciBaglantiHatasi, simdi: Date = new Date()): HataSatirlari =>
  baglantiHatasiSatirlari(h, "Logo'ya yazılamıyor: oturum açılamıyor, giden belgeler bekliyor.", simdi);

// Tek satır özet (günlük ve kontrol adımı iletisi).
export const baglantiHatasiOzeti = (h: LogoYardimciBaglantiHatasi, simdi: Date = new Date()): string => {
  const s = baglantiHatasiSatirlari(h, '', simdi);
  return `${s.neden === null ? '' : `${s.neden}. `}${s.teknik}`;
};
