import type { ComponentType } from 'react';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { Arsiv, ArsivSayaci } from './arsiv/index.tsx';
import { Ayarlar, AyarlarSayaci } from './ayarlar/index.tsx';
import { Belgeler, BelgelerSayaci } from './belgeler/index.tsx';
import { Bugun, BugunSayaci } from './bugun/index.tsx';
import { Cihazlar, CihazlarSayaci } from './cihazlar/index.tsx';
import { Dof, DofSayaci } from './dof/index.tsx';
import { IsEmirleri, IsEmirleriSayaci } from './emirler/index.tsx';
import { Formlar, FormlarSayaci } from './formlar/index.tsx';
import { Gostergeler, GostergelerSayaci } from './gostergeler/index.tsx';
import { DegisiklikIzi, DegisiklikIziSayaci } from './iz/index.tsx';
import { Kullanicilar, KullanicilarSayaci } from './kullanicilar/index.tsx';
import { TeknikKutuphane, TeknikKutuphaneSayaci } from './kutuphane/index.tsx';
import { LotKabul, LotKabulSayaci } from './lot/index.tsx';
import { Muayeneler, MuayenelerSayaci } from './muayene/index.tsx';
import { Uygunsuzluklar, UygunsuzluklarSayaci } from './ncr/index.tsx';
import { Parcalar, ParcalarSayaci } from './parcalar/index.tsx';
import { ResimVeModellerSayaci } from '../studyo/index.tsx';
import { ResimVeModellerSayfasi } from '../studyo/ResimListesi.tsx';
import { OlcumAnalizi, OlcumAnaliziSayaci } from './spc/index.tsx';
import { Tedarikciler, TedarikcilerSayaci } from './tedarikciler/index.tsx';
import { Terimler, TerimlerSayaci } from './terimler/index.tsx';
import type { KmGecis, KmGorunum } from './tipler.ts';
import type { KmVerisi } from './veri.ts';
import type { KmYetkisi } from './yetki.ts';

export type { KmGecis, KmGorunum } from './tipler.ts';

export interface EkranOzellikleri {
  veri: KmVerisi;
  yetki: KmYetkisi;
  // Başka görünümden gelen istek (kayıt aç, yeni kayıt ön değerleri). Görünüm işleyince `gecisTamam` çağırır: geri gelişte yinelenmez.
  gecis: KmGecis | null;
  gecisTamam: () => void;
  git: (gorunum: KmGorunum, gecis?: KmGecis) => void;
  // Atölye modu (uygulamadaki body.shop): düğme ve tercih kabukta; kök `.tc-km-atolye` sınıfını da taşır, parça CSS'i ona bağlanabilir.
  atolye: boolean;
}

// Uygulamanın navCounts karşılığı: rozet sayısı ve kötü tonu; sayaç yoksa null.
export type KmSayaci = ((veri: KmVerisi) => { n: number; kotu: boolean } | null) | null;

export type KmBolumu = 'bugun' | 'parca' | 'resim' | 'muayene' | 'uyg' | 'kaynak' | 'rapor';

export interface KmGorunumTanimi {
  anahtar: KmGorunum;
  baslik: string;
  bolum: KmBolumu;
  ekran: ComponentType<EkranOzellikleri>;
  sayac: KmSayaci;
}

export const BOLUMLER: readonly { anahtar: KmBolumu; baslik: string; simge: SimgeAdi }[] = [
  { anahtar: 'bugun', baslik: 'Bugün', simge: 'home' },
  { anahtar: 'parca', baslik: 'Parçalar', simge: 'box' },
  { anahtar: 'resim', baslik: 'Resim ve modeller', simge: 'file' },
  { anahtar: 'muayene', baslik: 'Muayene', simge: 'clipboard-check' },
  { anahtar: 'uyg', baslik: 'Uygunsuzluk', simge: 'alert' },
  { anahtar: 'kaynak', baslik: 'Kaynaklar', simge: 'tool' },
  { anahtar: 'rapor', baslik: 'Raporlar', simge: 'chart' },
];

// Sıra uygulamanın bölüm ve alt sekme sırasıdır (SECTIONS).
export const GORUNUMLER: readonly KmGorunumTanimi[] = [
  { anahtar: 'bugun', baslik: 'Bugün', bolum: 'bugun', ekran: Bugun, sayac: BugunSayaci },
  { anahtar: 'parcalar', baslik: 'Parçalar', bolum: 'parca', ekran: Parcalar, sayac: ParcalarSayaci },
  { anahtar: 'resimler', baslik: 'Resim ve modeller', bolum: 'resim', ekran: ResimVeModellerSayfasi, sayac: ResimVeModellerSayaci },
  { anahtar: 'kutuphane', baslik: 'Teknik kütüphane', bolum: 'resim', ekran: TeknikKutuphane, sayac: TeknikKutuphaneSayaci },
  { anahtar: 'muayeneler', baslik: 'Muayeneler', bolum: 'muayene', ekran: Muayeneler, sayac: MuayenelerSayaci },
  { anahtar: 'lot-kabul', baslik: 'Lot kabul (AQL)', bolum: 'muayene', ekran: LotKabul, sayac: LotKabulSayaci },
  { anahtar: 'is-emirleri', baslik: 'İş emirleri', bolum: 'muayene', ekran: IsEmirleri, sayac: IsEmirleriSayaci },
  { anahtar: 'olcum-analizi', baslik: 'Ölçüm analizi', bolum: 'muayene', ekran: OlcumAnalizi, sayac: OlcumAnaliziSayaci },
  { anahtar: 'uygunsuzluklar', baslik: 'Uygunsuzluklar (NCR)', bolum: 'uyg', ekran: Uygunsuzluklar, sayac: UygunsuzluklarSayaci },
  { anahtar: 'dof', baslik: 'DÖF / 8D', bolum: 'uyg', ekran: Dof, sayac: DofSayaci },
  { anahtar: 'cihazlar', baslik: 'Ölçüm cihazları', bolum: 'kaynak', ekran: Cihazlar, sayac: CihazlarSayaci },
  { anahtar: 'tedarikciler', baslik: 'Tedarikçiler', bolum: 'kaynak', ekran: Tedarikciler, sayac: TedarikcilerSayaci },
  { anahtar: 'belgeler', baslik: 'Belgeler', bolum: 'kaynak', ekran: Belgeler, sayac: BelgelerSayaci },
  { anahtar: 'formlar', baslik: 'Formlar', bolum: 'kaynak', ekran: Formlar, sayac: FormlarSayaci },
  { anahtar: 'kullanicilar', baslik: 'Kullanıcılar', bolum: 'kaynak', ekran: Kullanicilar, sayac: KullanicilarSayaci },
  { anahtar: 'terimler', baslik: 'Terimler', bolum: 'kaynak', ekran: Terimler, sayac: TerimlerSayaci },
  { anahtar: 'gostergeler', baslik: 'Kalite göstergeleri', bolum: 'rapor', ekran: Gostergeler, sayac: GostergelerSayaci },
  { anahtar: 'degisiklik-izi', baslik: 'Değişiklik izi', bolum: 'rapor', ekran: DegisiklikIzi, sayac: DegisiklikIziSayaci },
  { anahtar: 'arsiv', baslik: 'Arşiv', bolum: 'rapor', ekran: Arsiv, sayac: ArsivSayaci },
  { anahtar: 'ayarlar', baslik: 'Ayarlar ve yedek', bolum: 'rapor', ekran: Ayarlar, sayac: AyarlarSayaci },
];

export const KOK_YOL = '/kalite-merkezi';
// Resim ve modeller 597 a ile yeni stüdyodadır. Cihaz kaydı Kalibrasyondadır.
export const gorunumYolu = (g: KmGorunum): string => (g === 'bugun' ? KOK_YOL : `${KOK_YOL}/${g}`);
export const STUDYO_YOLU = gorunumYolu('resimler');
export const KALIBRASYON_YOLU = '/kalibrasyon';
export const gorunumTanimi = (g: string | undefined): KmGorunumTanimi | undefined => GORUNUMLER.find((x) => x.anahtar === (g ?? 'bugun'));
