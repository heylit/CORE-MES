import { Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';

// Çerçevedeki izin ve personel durum çiplerinin ortak rozet karşılığı; metin her zaman yazılır.
const IZIN_TONU: Readonly<Record<string, RozetTonu>> = { Beklemede: 'uyari', Onaylandı: 'tamam', Reddedildi: 'hata', İptal: 'pasif' };

export function izinTonu(durum: string | undefined): RozetTonu {
  return (durum !== undefined && IZIN_TONU[durum]) || 'bilgi';
}

// Personel durumu (izinde, deneme, başlayacak, ayrıldı) motorun hesabıdır; çip yalnız metni ve tonu gösterir.
export function DurumCipi({ metin, ton = 'bilgi' }: { metin: string; ton?: RozetTonu }) {
  return <Rozet ton={ton}>{metin}</Rozet>;
}

export function IzinCipi({ durum }: { durum: string | undefined }) {
  return <Rozet ton={izinTonu(durum)}>{durum ?? '—'}</Rozet>;
}
