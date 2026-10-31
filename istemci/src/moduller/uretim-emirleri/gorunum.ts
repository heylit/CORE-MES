import type {
  ADIMLI_OKUMA_ISLEMLERI as SUNUCUDAKI_LISTE, Emir, EmirDurumu, KayitOlayi, UretimKaydi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EMIR_DURUMU, emirDurumuGosterimi, type DurumGosterimi, type KapanisSonucu } from '#paylasilan/sozlesme/emir-durumu.ts';

// Ad ve ton tek sözlükten (1389 a); bu modül ve başka ekranlar aynı adı yazar.
export const DURUM_ETIKETI = Object.fromEntries(Object.entries(EMIR_DURUMU).map(([d, g]) => [d, g.etiket])) as Record<EmirDurumu, string>;
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

export type KapanisSonucuAlani = { kapanisSonucu?: KapanisSonucu | null };

// Başlamış emirde canlı çalışma durumu adın ikinci parçasıdır ("Başladı · Duraklı"); canlı bilgi yoksa yalnız "Başladı".
export const durumGosterimi = (emir: Pick<Emir, 'durum' | 'canli'> & KapanisSonucuAlani): DurumGosterimi =>
  emirDurumuGosterimi({ durum: emir.durum, kapanisSonucu: emir.kapanisSonucu ?? null, calisma: emir.canli?.calisma ?? null });

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
