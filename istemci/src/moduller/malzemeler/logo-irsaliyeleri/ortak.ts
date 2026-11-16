import type { IRSALIYE_ESLESME_DURUMLARI } from '#paylasilan/sozlesme/logo.ts';
import type { RozetTonu } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';

// 3345 a: Logo irsaliyeleri yalnız okunur (logo modülünün aynası). Sayfa Logo geçişi gibi bu modülde durur; veri logo uçlarındandır.
export const IRSALIYE_ANAHTARI = ['logo', 'irsaliyeler'] as const;
export type IrsaliyeYonu = 'alis' | 'satis';
export type EslesmeDurumu = (typeof IRSALIYE_ESLESME_DURUMLARI)[number];

// Logo STFICHE.TRCODE: alış tarafı (satın alma, konsinye giriş, satın alma iade, konsinye giriş iade).
export const ALIS_TURLERI: readonly number[] = [1, 5, 6, 10];

export const DURUMLAR: Readonly<Record<EslesmeDurumu, { ad: string; ton: RozetTonu; simge: SimgeAdi }>> = {
  eslesti: { ad: 'Eşleşti', ton: 'tamam', simge: 'check' },
  fark: { ad: 'Fark var', ton: 'uyari', simge: 'alert' },
  eslesmedi: { ad: 'Eşleşmedi', ton: 'bilgi', simge: 'help' },
  'karsiligi-yok': { ad: 'Karşılığı yok', ton: 'pasif', simge: 'help' },
  iptal: { ad: 'İptal', ton: 'pasif', simge: 'x' },
  'logoda-yok': { ad: 'Logo\'da yok', ton: 'pasif', simge: 'trash' },
};

export const irsaliyeYolu = (yon: IrsaliyeYonu): string => (yon === 'alis' ? '/logo-irsaliyeleri' : '/logo-irsaliyeleri/satis');
export const ayrintiYolu = (x: { firma: number; donem: number; kayitNo: number }): string => `/logo-irsaliyeleri/${x.firma}/${x.donem}/${x.kayitNo}`;

// Ondalık metin Türkçe yazımla; sondaki sıfırlar atılır, sayı uydurulmaz.
export function miktarMetni(d: string | null): string {
  if (d === null) return '—';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(d);
  if (m === null) return d;
  const tam = Number(m[2]).toLocaleString('tr-TR');
  const kesir = (m[3] ?? '').replace(/0+$/, '');
  return `${m[1]}${tam}${kesir === '' ? '' : `,${kesir}`}`;
}

// Logo birimi büyük harfle gelir (ADET); CORE yazımıyla küçük harf gösterilir.
export const birimMetni = (b: string | null): string => (b === null ? '' : b.toLocaleLowerCase('tr-TR'));
