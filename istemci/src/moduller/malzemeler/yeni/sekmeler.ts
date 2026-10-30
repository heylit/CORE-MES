import type { ComponentType } from 'react';
import type { KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { LogoGonderimi } from '../LogoGonderimi.tsx';
import { MalzemeAyarlari } from './ayarlar/index.tsx';
import { Katalog } from './katalog/index.tsx';
import { Kilavuz } from './kilavuz/index.tsx';
import { Sablonlar } from './sablonlar/index.tsx';
import { YeniKart } from './sihirbaz/index.tsx';
import type { KatalogOrtami } from './tipler.ts';
import type { MalzemeYetkisi } from './yetki.ts';

// Yeni ekran menünün adresindedir (572, 527 1 a): bölüm yolları ikinci menünün yollarıdır (`/malzemeler`, `/malzemeler/yeni` ...).
export const YENI_KOK = '/malzemeler';

export interface YeniKartSecenegi { kart?: string; kopya?: string; sablon?: string; sablonYap?: string; tur?: KatalogTuru }
export type DisSayfa = 'operasyon-tipleri' | 'rota-sablonlari' | 'urun-rotalari';

export interface Gezinti {
  katalog: (kimlik?: string) => void;
  yeniKart: (s?: YeniKartSecenegi) => void;
  ayarlar: (bolum?: string) => void;
  sablonlar: () => void;
  kilavuz: () => void;
  disari: (anahtar: DisSayfa) => void;
  // Kart nolarıyla Etiket Merkezi'ni açar; adres kurulamazsa (geçerli no yok, sınır aşıldı) false döner.
  etiketMerkezi: (nolar: readonly number[]) => boolean;
}

export interface EkranOzellikleri {
  ortam: KatalogOrtami;
  yetki: MalzemeYetkisi;
  git: Gezinti;
}

export type Bolum = 'katalog' | 'kart' | 'sablonlar' | 'ayarlar' | 'logo' | 'kilavuz';

export interface BolumTanimi {
  anahtar: Bolum;
  baslik: string;
  simge: SimgeAdi;
  // Kök bölüm adres parçası almaz.
  yol: string;
  ekran: ComponentType<EkranOzellikleri>;
  gorur: (y: MalzemeYetkisi) => boolean;
}

// Sıra ve adlar ikinci menüyle aynıdır (paylasilan/sayfalar/malzemeler.ts); yeni kartı yalnız yazabilen görür.
// Logo gönderimi prototipte yoktur, kabuğun kendi sayfasıdır (kart #232); sekmede aynı sayfa değişmeden açılır (497/6 a).
export const BOLUMLER: readonly BolumTanimi[] = [
  { anahtar: 'kart', baslik: 'Yeni kart', simge: 'plus', yol: 'yeni', ekran: YeniKart, gorur: (y) => y.yaz },
  { anahtar: 'katalog', baslik: 'Katalog', simge: 'list', yol: '', ekran: Katalog, gorur: (y) => y.oku },
  { anahtar: 'sablonlar', baslik: 'Şablonlar', simge: 'grid', yol: 'sablonlar', ekran: Sablonlar, gorur: (y) => y.oku },
  { anahtar: 'ayarlar', baslik: 'Malzeme ayarları', simge: 'gear', yol: 'ayarlar', ekran: MalzemeAyarlari, gorur: (y) => y.oku },
  { anahtar: 'logo', baslik: 'Logo gönderimi', simge: 'upload', yol: 'logo', ekran: LogoGonderimi, gorur: (y) => y.oku },
  { anahtar: 'kilavuz', baslik: 'Kılavuz', simge: 'eye', yol: 'kilavuz', ekran: Kilavuz, gorur: (y) => y.oku },
];

export function bolumYolu(b: Bolum): string {
  const t = BOLUMLER.find((x) => x.anahtar === b);
  return t && t.yol !== '' ? `${YENI_KOK}/${t.yol}` : YENI_KOK;
}

export function adrestekiBolum(parca: string | undefined): Bolum | null {
  if (parca === undefined || parca === '') return 'katalog';
  return BOLUMLER.find((x) => x.yol === parca)?.anahtar ?? null;
}
