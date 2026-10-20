import type { AdresTuru, Firma, FirmaTuru, MusteriSinifi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { RozetTonu, Secenek } from '../../ortak/arayuz/index.ts';

export const TUR_ETIKETI = {
  musteri: 'Müşteri',
  tedarikci: 'Tedarikçi',
  ikisi: 'Müşteri ve tedarikçi',
} as const satisfies Record<FirmaTuru, string>;

export const ADRES_TURU_ETIKETI = {
  fatura: 'Fatura',
  teslim: 'Teslim',
  sube: 'Şube',
} as const satisfies Record<AdresTuru, string>;

export const LOGO_DURUMU = {
  bekliyor: { etiket: 'Logo: bekliyor', ton: 'uyari' },
  gonderildi: { etiket: 'Logo: gönderildi', ton: 'tamam' },
  hata: { etiket: 'Logo: hata', ton: 'hata' },
} as const satisfies Record<NonNullable<Firma['logoGonderimDurumu']>, { etiket: string; ton: RozetTonu }>;

export const TUR_SECENEKLERI: readonly Secenek[] = (Object.keys(TUR_ETIKETI) as FirmaTuru[]).map((t) => ({ deger: t, baslik: TUR_ETIKETI[t] }));
export const ADRES_TURU_SECENEKLERI: readonly Secenek[] = (Object.keys(ADRES_TURU_ETIKETI) as AdresTuru[]).map((t) => ({
  deger: t,
  baslik: ADRES_TURU_ETIKETI[t],
}));

// Plan bedeli sınıfla çarpılır (265 a); boş sınıf 1,0 sayılır.
export const SINIF_ETIKETI = { A: 'A sınıfı', B: 'B sınıfı', C: 'C sınıfı' } as const satisfies Record<MusteriSinifi, string>;
export const SINIF_SECENEKLERI: readonly Secenek[] = (Object.keys(SINIF_ETIKETI) as MusteriSinifi[]).map((s) => ({ deger: s, baslik: SINIF_ETIKETI[s] }));
export const sinifMi = (deger: string): deger is MusteriSinifi => deger in SINIF_ETIKETI;

export const turMu = (deger: string): deger is FirmaTuru => deger in TUR_ETIKETI;
export const adresTuruMu = (deger: string): deger is AdresTuru => deger in ADRES_TURU_ETIKETI;

export interface MenuSuzgeci {
  baslik: string;
  tur?: 'musteri' | 'tedarikci';
  fason?: true;
}

// Ana liste ve üç menü maddesi aynı ekrandır; madde yolu sunucuya giden sabit süzgeci belirler.
export function menuSuzgeci(yol: string): MenuSuzgeci {
  if (yol.endsWith('/musteriler')) return { baslik: 'Müşteriler', tur: 'musteri' };
  if (yol.endsWith('/tedarikciler')) return { baslik: 'Tedarikçiler', tur: 'tedarikci' };
  if (yol.endsWith('/fason')) return { baslik: 'Fason firmalar', fason: true };
  return { baslik: 'Müşteriler ve Tedarikçiler' };
}
