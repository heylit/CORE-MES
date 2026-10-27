/* Üretim anomalisi panosu (kart #1149). Hesap TMI sunucusundadır (GET /arkon/anomaliler); ekran yalnız gösterir. Bilinmeyen değer null gelir
   ve "–" gösterilir: sıfır uydurulmaz. İşaret alanları true: anomali, false: yok, null: hüküm yok ya da kural kapalı. */
export type AnomaliDurumu = 'normal' | 'isaret' | 'izinli' | 'bilinmiyor';

export interface AnomaliIstasyonu {
  istasyonId: number; kod: string; ad: string; kapasiteKaynagi: 'makine' | 'insan';
  beklenen: number | null; uretilen: number | null; oran: number | null;
  girisYokDk: number | null; girisYok: boolean | null; adetEksik: boolean | null; hurda: number | null;
  // Plana girmemiş iş emirlerinin sağlamı; orana girmez (kart #1306).
  planDisi: number | null;
}
export interface AnomaliMakinesi { makineId: number; kod: string; ad: string; istasyonId: number; beklenen: number | null; uretilen: number | null; hurda: number | null; fark: number | null; durum: AnomaliDurumu }
export interface AnomaliKisisi { kisiId: number; ad: string; beklenen: number | null; uretilen: number | null; hurda: number | null; fark: number | null; durum: AnomaliDurumu; performans: number | null; emekVerimi: number | null }
export interface Anomaliler {
  tarih: string; hesaplama: string;
  esikler: { girisYokDk: number | null; adetToleransYuzde: number | null };
  toplam: { beklenen: number; uretilen: number; oran: number | null; hurda: number; performans: number | null; planDisi: number };
  // Kişi kırılımı yalnız yöneticiye gelir (kart #1306); öbürüne null.
  istasyonlar: AnomaliIstasyonu[]; makineler: AnomaliMakinesi[]; kisiler: AnomaliKisisi[] | null;
  atlanan: number;
}

export const ANOMALI_DURUM_ETIKETI: Record<AnomaliDurumu, string> = { normal: 'Normal', isaret: 'Eksik', izinli: 'İzinli', bilinmiyor: 'Bilinmiyor' };
export const ANOMALI_DURUM_RENGI: Record<AnomaliDurumu, string> = { normal: 'var(--run)', isaret: 'var(--stop)', izinli: 'var(--idle)', bilinmiyor: 'var(--hold)' };

/** Adet: tam sayıysa kesirsiz, değilse bir ondalık; bilinmeyen "–". */
export function anomaliAdedi(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

/** Oran yüzde olarak; bilinmeyen (plan yok) "–". */
export function anomaliOrani(oran: number | null | undefined): string {
  return oran === null || oran === undefined ? '–' : '%' + Math.round(oran * 100);
}

/** İstasyonun işareti: AR-AN-1 ya da AR-AN-2'den biri true ise işaretli; ikisi de false ise normal; hüküm yoksa null. */
export function istasyonIsareti(i: Pick<AnomaliIstasyonu, 'girisYok' | 'adetEksik'>): boolean | null {
  if (i.girisYok === true || i.adetEksik === true) return true;
  return i.girisYok === false || i.adetEksik === false ? false : null;
}

/** İşaretli istasyonlar önce gelir (kod sırası korunur). */
export function istasyonlariSirala(liste: readonly AnomaliIstasyonu[]): AnomaliIstasyonu[] {
  const agirlik = (i: AnomaliIstasyonu): number => (istasyonIsareti(i) === true ? 0 : 1);
  return [...liste].sort((a, b) => agirlik(a) - agirlik(b) || a.kod.localeCompare(b.kod));
}

/** Panonun üst satırı: işaretli istasyon sayısı. Hiçbirinde hüküm yoksa null (hepsi normal denmez). */
export function isaretliSayisi(liste: readonly AnomaliIstasyonu[]): number | null {
  const hukumler = liste.map(istasyonIsareti);
  if (hukumler.every((h) => h === null)) return null;
  return hukumler.filter((h) => h === true).length;
}

/** Kapalı kural bilgisi: eşik boşsa o kural çalışmaz, panoda söylenir. */
export function kapaliKurallar(e: Anomaliler['esikler']): string[] {
  return [e.girisYokDk === null ? 'Giriş yok süresi' : null, e.adetToleransYuzde === null ? 'Eksik adet' : null].filter((x): x is string => x !== null);
}

/* Gün, hafta, ay istatistiği (kart #1306): TMI'nin kaydettiği günlerden (GET /arkon/anomali-istatistik). Kaydı olmayan gün null alanlıdır. */
export type AnomaliDonemi = 'gun' | 'hafta' | 'ay';
interface DonemOlcusu { beklenen: number; uretilen: number; hurda: number; oran: number | null; performans: number | null }
interface DonemKirilimi extends DonemOlcusu { isaretliGun: number; gun: number }
export interface AnomaliIstatistigi {
  donem: AnomaliDonemi; bas: string; bit: string;
  gunler: { tarih: string; durum: 'acik' | 'kesin' | null; beklenen: number | null; uretilen: number | null; hurda: number | null; oran: number | null; performans: number | null; planDisi: number | null; isaretliIstasyon: number | null }[];
  toplam: DonemOlcusu & { planDisi: number; kayitliGun: number };
  istasyonlar: (DonemKirilimi & { istasyonId: number; kod: string; ad: string; planDisi: number })[];
  makineler: (DonemKirilimi & { makineId: number; kod: string; ad: string; istasyonId: number | null })[];
  kisiler: (DonemKirilimi & { kisiId: number; ad: string; emekVerimi: number | null })[] | null;
}

export const ANOMALI_DONEM_ETIKETI: Record<AnomaliDonemi, string> = { gun: 'Gün', hafta: 'Hafta', ay: 'Ay' };

/** Oranın rengi: plan yoksa nötr; %100 ve üstü iyi, %90 altı kötü, arası uyarı. Eşik ekran içindir; işaret sunucunun kararıdır. */
export function oranRengi(oran: number | null): string {
  if (oran === null) return 'var(--hold)';
  return oran >= 1 ? 'var(--run)' : oran >= 0.9 ? 'var(--hold)' : 'var(--stop)';
}

/** Gün şeridinde çubuğun boyu: dönemdeki en büyük beklenen ya da üretilene göre yüzde; kayıt yoksa 0. */
export function gunCubugu(gun: { beklenen: number | null; uretilen: number | null }, enBuyuk: number): { beklenen: number; uretilen: number } {
  if (!(enBuyuk > 0)) return { beklenen: 0, uretilen: 0 };
  return { beklenen: Math.round(((gun.beklenen ?? 0) / enBuyuk) * 100), uretilen: Math.round(((gun.uretilen ?? 0) / enBuyuk) * 100) };
}

/** Tarih kısa: '2026-10-14' -> '14.10'. */
export const kisaTarih = (t: string): string => t.slice(8, 10) + '.' + t.slice(5, 7);

/* Zaman olayları (kart 764): geç giriş, girdinin geç gelmesi, sonraki işe etki, teslim riski (GET /arkon/anomali-olaylari). Dakika net aktif
   dakikadır; plan anı olayın açıldığı andaki canlı plandan donmuştur. Eşik boşsa o kural kapalıdır. */
export type AnomaliOlayTuru = 'gec-giris' | 'gec-teslim' | 'ardil-etkisi' | 'teslim-riski' | 'toplu-tutarsiz' | 'bitis-kaymasi' | 'sure-asimi';
export interface AnomaliOlayi {
  id: number; tur: AnomaliOlayTuru; isEmriId: number; uretimEmriId: number | null; emirNo: string | null; opNo: number | null;
  istasyon: { id: number; ad: string } | null; kaynak: { tur: 'makine' | 'kisi'; id: number; ad: string | null } | null;
  planAni: string | null; tabanAni: string | null; tabanDakika: number | null; gercekAni: string | null; dakika: number; kokOlayId: number | null;
  acilis: string; kapanis: string | null;
}
export interface AnomaliOlaylari {
  hesaplama: string;
  esikler: { gecGirisDk: number | null; gecTeslimDk: number | null; bitisKaymaDk: number | null; sureAsimYuzde: number | null };
  ozet: { acik: number; aksatilanIs: number; toplamEtkiDk: number; riskliEmir: number };
  olaylar: AnomaliOlayi[];
}

export const ANOMALI_OLAY_ETIKETI: Record<AnomaliOlayTuru, string> = {
  'gec-giris': 'Geç giriş', 'gec-teslim': 'Girdi gecikti', 'ardil-etkisi': 'Sonraki işe etki', 'teslim-riski': 'Teslim riski',
  'toplu-tutarsiz': 'Toplu giriş tutarsız', 'bitis-kaymasi': 'Bitiş kayması', 'sure-asimi': 'Süre aşımı',
};

/** Dakika okunur süre: 45 dk, 2 sa 10 dk, 1 g 3 sa. */
export function sureMetni(dk: number): string {
  const d = Math.round(dk);
  if (d < 60) return d + ' dk';
  const sa = Math.floor(d / 60);
  if (sa < 24) return sa + ' sa' + (d % 60 ? ' ' + (d % 60) + ' dk' : '');
  return Math.floor(sa / 24) + ' g' + (sa % 24 ? ' ' + (sa % 24) + ' sa' : '');
}

/** Zaman kurallarından kapalı olanlar (eşiği boş). */
export function kapaliZamanKurallari(e: AnomaliOlaylari['esikler']): string[] {
  return [e.gecGirisDk === null ? 'Geç giriş' : null, e.gecTeslimDk === null ? 'Girdi gecikmesi' : null, e.bitisKaymaDk === null ? 'Bitiş kayması' : null,
    e.sureAsimYuzde === null ? 'Süre aşımı' : null].filter((x): x is string => x !== null);
}
