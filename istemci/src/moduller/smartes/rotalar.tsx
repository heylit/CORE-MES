import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { BaglantiDurumu } from './BaglantiDurumu.tsx';
import { Eslemeler } from './Eslemeler.tsx';
import { MakineBulgulari } from './MakineBulgulari.tsx';
import { MakinelerCanli } from './MakinelerCanli.tsx';
import { Hesaplar } from './Hesaplar.tsx';
import { Alarmlar, AmbarHareketleri, Duruslar, FireHareketleri, Giden, KaliteOlcumleri, UretimSayilari } from './Listeler.tsx';
import { OnayBekleyenler } from './OnayBekleyenler.tsx';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/smartes.ts); her bölüm kendi adresindedir.
export const rotalar: ModulRotasi[] = [
  { yol: '/smartes', ekran: BaglantiDurumu },
  { yol: '/smartes/eslemeler', ekran: Eslemeler },
  { yol: '/smartes/onay-bekleyenler', ekran: OnayBekleyenler },
  { yol: '/smartes/makineler', ekran: MakinelerCanli },
  { yol: '/smartes/makine-bulgulari', ekran: MakineBulgulari },
  { yol: '/smartes/is-emri-durumlari', ekran: UretimSayilari },
  { yol: '/smartes/duruslar', ekran: Duruslar },
  { yol: '/smartes/alarmlar', ekran: Alarmlar },
  { yol: '/smartes/fire', ekran: FireHareketleri },
  { yol: '/smartes/ambar', ekran: AmbarHareketleri },
  { yol: '/smartes/kalite', ekran: KaliteOlcumleri },
  { yol: '/smartes/hesaplar', ekran: Hesaplar },
  { yol: '/smartes/giden', ekran: Giden },
];
