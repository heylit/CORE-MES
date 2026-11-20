import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { LogoGecisi } from './LogoGecisi.tsx';
import { IrsaliyeSayfasi } from './logo-irsaliyeleri/IrsaliyeAyrintisi.tsx';
import { AlisIrsaliyeleri, SatisIrsaliyeleri } from './logo-irsaliyeleri/LogoIrsaliyeleri.tsx';
import { MalzemelerYeni } from './yeni/MalzemelerYeni.tsx';

// Yeni ekran menünün adresindedir (572, 527 1 a); Logo gönderimi onun bölümüdür (kart #232, 497/6 a). Tanımsız bölüm (eski yer imi
// `/malzemeler/eski` dahil) köke döner.
export const rotalar: ModulRotasi[] = [
  { yol: '/malzemeler', ekran: MalzemelerYeni },
  { yol: '/malzemeler/:bolum', ekran: MalzemelerYeni },
  // 3068 a: Logo geçişi ayrı menü sayfasıdır (Tanımlar); malzeme sekmesi bu modülün, cari sekmesi sonra müşteri-tedarikçiden gelir.
  { yol: '/logo-gecisi', ekran: LogoGecisi },
  // 3474-1: aynı ekran Logo sayfasının yan menüsünde (Logo > Logo geçişi).
  { yol: '/logo/gecis', ekran: LogoGecisi },
  // 3345 a: Logo irsaliyeleri (yalnız okuma) Logo geçişi gibi burada durur; veri logo modülünün uçlarındandır.
  { yol: '/logo-irsaliyeleri', ekran: AlisIrsaliyeleri },
  { yol: '/logo-irsaliyeleri/satis', ekran: SatisIrsaliyeleri },
  { yol: '/logo-irsaliyeleri/:firma/:donem/:kayitNo', ekran: IrsaliyeSayfasi },
];
