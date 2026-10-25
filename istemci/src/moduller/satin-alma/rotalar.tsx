import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import {
  DisOperasyonlarSayfasi, IsKutusuSayfasi, KgFiyatlariSayfasi, MalzemelerSayfasi, OnaylarSayfasi, RaporlarSayfasi, TaleplerSayfasi, TedarikcilerSayfasi, TedarikTerminleriSayfasi,
} from './SatinAlma.tsx';
import { TaleplerimSayfasi } from './talep/TaleplerimSayfasi.tsx';

// İkinci menüdeki her maddenin rotası (şartname: testle denetlenir).
export const rotalar: ModulRotasi[] = [
  { yol: '/satin-alma', ekran: IsKutusuSayfasi },
  { yol: '/satin-alma/talepler', ekran: TaleplerSayfasi },
  { yol: '/satin-alma/onaylar', ekran: OnaylarSayfasi },
  { yol: '/satin-alma/dis-operasyonlar', ekran: DisOperasyonlarSayfasi },
  { yol: '/satin-alma/tedarik-terminleri', ekran: TedarikTerminleriSayfasi },
  { yol: '/satin-alma/malzemeler', ekran: MalzemelerSayfasi },
  { yol: '/satin-alma/kg-fiyatlari', ekran: KgFiyatlariSayfasi },
  { yol: '/satin-alma/tedarikciler', ekran: TedarikcilerSayfasi },
  { yol: '/satin-alma/raporlar', ekran: RaporlarSayfasi },
  { yol: '/taleplerim', ekran: TaleplerimSayfasi },
];
