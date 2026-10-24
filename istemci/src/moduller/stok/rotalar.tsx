import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Ayarlar } from './Ayarlar.tsx';
import { Depo } from './Depo.tsx';
import { Fis } from './Fis.tsx';
import { Hareketler } from './Hareketler.tsx';
import { MalzemeFisi } from './MalzemeFisi.tsx';
import { MalzemeFisleri } from './MalzemeFisleri.tsx';
import { EskiToplamaYolu, Hazirlik } from './Hazirlik.tsx';
import { IsKutusu } from './IsKutusu.tsx';
import { KonumAyrinti } from './KonumAyrinti.tsx';
import { Konumlar } from './Konumlar.tsx';
import { MalKabul } from './MalKabul.tsx';
import { MalKabulAyrinti } from './MalKabulAyrinti.tsx';
import { MalzemeAyrinti } from './MalzemeAyrinti.tsx';
import { OkutYonlendir } from './OkutYonlendir.tsx';
import { Malzemeler } from './Malzemeler.tsx';
import { Raflar } from './Raflar.tsx';
import { Sepet } from './Sepet.tsx';
import { YerlesimDuzenleyici } from './YerlesimDuzenleyici.tsx';

// Alt yollar `/stok` sayfasına aittir; ikinci menüyü kabuk `STOK_IKINCI_MENU` verisinden çizer.
export const rotalar: ModulRotasi[] = [
  { yol: '/stok', ekran: IsKutusu },
  { yol: '/stok/okut', ekran: OkutYonlendir },
  { yol: '/stok/sepet', ekran: Sepet },
  { yol: '/stok/fisler/:id', ekran: Fis },
  { yol: '/stok/hazirlik', ekran: Hazirlik },
  { yol: '/stok/hazirlik/:id', ekran: Hazirlik },
  { yol: '/stok/toplama', ekran: EskiToplamaYolu },
  { yol: '/stok/depo', ekran: Depo },
  { yol: '/stok/yerlesim', ekran: YerlesimDuzenleyici },
  { yol: '/stok/toplama/:id', ekran: EskiToplamaYolu },
  { yol: '/stok/mal-kabul', ekran: MalKabul },
  { yol: '/stok/istekler', ekran: EskiToplamaYolu },
  { yol: '/stok/mal-kabul/:id', ekran: MalKabulAyrinti },
  { yol: '/stok/malzemeler', ekran: Malzemeler },
  { yol: '/stok/malzemeler/:id', ekran: MalzemeAyrinti },
  { yol: '/stok/hareketler', ekran: Hareketler },
  { yol: '/stok/malzeme-fisleri', ekran: MalzemeFisleri },
  { yol: '/stok/malzeme-fisleri/:id', ekran: MalzemeFisi },
  { yol: '/stok/konumlar', ekran: Konumlar },
  { yol: '/stok/konumlar/:id', ekran: KonumAyrinti },
  { yol: '/stok/raflar', ekran: Raflar },
  { yol: '/stok/raflar/:id', ekran: Raflar },
  { yol: '/stok/ayarlar', ekran: Ayarlar },
];
