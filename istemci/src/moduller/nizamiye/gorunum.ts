import type { KartDurumu, KartTuru, KimlikTuru, Neden, Ziyaret } from '#paylasilan/sozlesme/nizamiye.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

export const NEDEN_ADLARI: Record<Neden, string> = {
  toplanti: 'Toplantı', teslimat: 'Teslimat / kargo', servis: 'Servis / bakım', denetim: 'Denetim', is_gorusmesi: 'İş görüşmesi', diger: 'Diğer',
};
export const NEDEN_SIMGELERI: Record<Neden, SimgeAdi> = {
  toplanti: 'users', teslimat: 'truck', servis: 'wrench', denetim: 'eye', is_gorusmesi: 'user', diger: 'more',
};
// Seçenek listeleri adlardan okunur: istemci sözleşmeyi yalnız tip olarak ithal eder (zod pakete girmez); Record eksik değeri derlemede yakalar.
export const NEDENLER = Object.keys(NEDEN_ADLARI) as Neden[];
// Sunucudaki ATOLYE_NEDENLERI ile aynı: bu nedenle gelen kask ve gözlük almadan içeri alınmaz (NZ-02).
const ATOLYE: Record<Neden, boolean> = { toplanti: false, teslimat: false, servis: true, denetim: true, is_gorusmesi: false, diger: false };
export const atolyeZorunlu = (n: Neden): boolean => ATOLYE[n];
export const KIMLIK_TURU_ADLARI: Record<KimlikTuru, string> = { tc_kimlik: 'T.C. kimlik', pasaport: 'Pasaport', ehliyet: 'Ehliyet', diger: 'Diğer' };
export const KIMLIK_TURLERI = Object.keys(KIMLIK_TURU_ADLARI) as KimlikTuru[];
export const KART_TURU_ADLARI: Record<KartTuru, string> = { ziyaretci: 'Ziyaretçi', taseron: 'Taşeron' };
export const KART_TURLERI = Object.keys(KART_TURU_ADLARI) as KartTuru[];
export const KART_DURUM_ADLARI: Record<KartDurumu, string> = { bos: 'Boş', kullanimda: 'Kullanımda', kayip: 'Kayıp', hasarli: 'Hasarlı' };
export const KART_DURUM_TONLARI: Record<KartDurumu, RozetTonu> = { bos: 'tamam', kullanimda: 'bilgi', kayip: 'hata', hasarli: 'uyari' };
export const ZIYARET_DURUM_ADLARI: Record<Ziyaret['durum'], string> = { beklenen: 'Bekleniyor', iceride: 'İçeride', cikti: 'Çıktı', iptal: 'İptal' };

// Ön kayıtlı ziyaretçi bu kadar gecikince satırda uyarı çıkar.
export const GECIKME_DK = 15;

export const saat = (zaman: string | null): string => (zaman === null ? '—' : tesisSaati(Date.parse(zaman)).slice(11));
export const tarihSaat = (zaman: string | null): string => (zaman === null ? '—' : tesisSaati(Date.parse(zaman)));

export function sureMetni(zaman: string, simdi: number): string {
  const dk = Math.max(0, Math.round((simdi - Date.parse(zaman)) / 60_000));
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
}

export const adi = (z: Pick<Ziyaret, 'ad'>): string => z.ad ?? 'Anonim kayıt';

// Satırın dikkat isteyen hali: gecikmiş ön kayıt ya da dizüstüyle içeride.
export function uyari(z: Ziyaret, simdi: number): string | null {
  if (z.durum === 'beklenen' && z.beklenenZaman !== null) {
    const gec = Math.round((simdi - Date.parse(z.beklenenZaman)) / 60_000);
    if (gec >= GECIKME_DK) return `${gec} dk gecikti`;
  }
  if (z.durum === 'iceride' && z.dizustu) return 'Dizüstü / kamera ile girdi';
  return null;
}
