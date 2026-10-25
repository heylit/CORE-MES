import type {
  ADIMLI_OKUMA_ISLEMLERI as SUNUCUDAKI_LISTE, CalismaDurumu, Emir, EmirDurumu, KayitOlayi, UretimKaydi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const DURUM_ETIKETI: Record<EmirDurumu, string> = {
  taslak: 'Taslak', planli: 'Planlı', basladi: 'Başladı', bitti: 'Bitti', iptal: 'İptal',
};
export const DURUM_TONU: Record<EmirDurumu, RozetTonu> = {
  taslak: 'pasif', planli: 'bilgi', basladi: 'uyari', bitti: 'tamam', iptal: 'pasif',
};
// İş emirli emri okuyabilen işlemler; tip sözleşmedeki listeye birebir eşit olmak zorundadır (sapma derlemede yakalanır).
export const ADIMLI_OKUMA_ISLEMLERI: typeof SUNUCUDAKI_LISTE = ['sayfa.uretim-emirleri', 'sayfa.rota', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'plan.yaz'];

export const OLAY_ETIKETI: Record<KayitOlayi, string> = {
  ayar: 'Hazırlık başladı', baslat: 'Başlatıldı', bitir: 'Bitirildi', duraklat: 'Duraklatıldı', durdur: 'Durduruldu', devam: 'Devam edildi',
  hurda: 'Hurda', duzeltme: 'Düzeltme', kalite_onay: 'Kalite kararı (onay)', kalite_red: 'Kalite kararı (red)',
};

// Zaman sunucudan ISO metni gelir; yoksa null kalır (tabloda "yok" yazılır).
export function zamanMetni(iso: string | null): string | null {
  return iso === null ? null : new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

// Bitmemiş emirde sağlam adet yoktur; fark yalnız bitince anlamlıdır.
export function farkMetni(adet: number, saglamAdet: number | null): string | null {
  if (saglamAdet === null) return null;
  const fark = saglamAdet - adet;
  if (fark === 0) return 'Emir adedine eşit';
  return fark < 0 ? `Emir adedinden ${-fark} eksik` : `Emir adedinden ${fark} fazla`;
}

export const CALISMA_ETIKETI: Record<CalismaDurumu, string> = { calisiyor: 'Çalışıyor', durakli: 'Duraklı', durdu: 'Durdu' };
export const CALISMA_TONU: Record<CalismaDurumu, RozetTonu> = { calisiyor: 'tamam', durakli: 'uyari', durdu: 'hata' };

// Başlamış emirde ayrım çalışma durumundan gelir (emir durumu `basladi` kalır); canlı bilgi yoksa nötr "Başladı".
export function durumGosterimi(emir: Pick<Emir, 'durum' | 'canli'>): { etiket: string; ton: RozetTonu } {
  const calisma = emir.durum === 'basladi' ? emir.canli?.calisma : null;
  if (calisma) return { etiket: CALISMA_ETIKETI[calisma], ton: CALISMA_TONU[calisma] };
  return { etiket: DURUM_ETIKETI[emir.durum], ton: DURUM_TONU[emir.durum] };
}

// Başlamışta canlı sayaç, bitmişte kapanış adedi; öbürlerinde yok (sıfır uydurulmaz).
export function saglamSayisi(emir: Pick<Emir, 'durum' | 'canli' | 'saglamAdet'>): number | null {
  if (emir.durum === 'bitti') return emir.saglamAdet;
  return emir.durum === 'basladi' && emir.canli ? emir.canli.saglam : null;
}

// Defterde tek "Adet" sütunu: bitişte kapanış adedi, hurdada +N, düzeltmede işaretli fark.
export function kayitAdedi(k: Pick<UretimKaydi, 'olay' | 'saglamAdet' | 'adet'>): string | number | null {
  if (k.olay === 'bitir') return k.saglamAdet;
  if (k.adet === null || k.adet === undefined) return null;
  return k.adet > 0 ? `+${k.adet}` : String(k.adet);
}

// Kalite kararında kişi kararı verendir; kararı veren tutulmadan önceki satırda bilinmez.
export const kayitKisisi = (k: Pick<UretimKaydi, 'olay' | 'kisi' | 'kararVeren'>): string =>
  k.olay === 'kalite_onay' || k.olay === 'kalite_red' ? (k.kararVeren?.ad ?? '—') : k.kisi.ad;

export const kayitNedeni = (k: Pick<UretimKaydi, 'durusNedeni' | 'hurdaNedeni'>): string | null =>
  k.durusNedeni?.ad ?? k.hurdaNedeni?.ad ?? null;
