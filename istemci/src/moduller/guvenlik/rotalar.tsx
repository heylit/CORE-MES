import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { GuvenlikAlarmlar } from './Alarmlar.tsx';
import { GuvenlikDurum } from './Durum.tsx';
import { GuvenlikKoruma, GuvenlikKurallar, GuvenlikYoneticiIslemleri } from './Koruma.tsx';
import { GuvenlikGirisler, GuvenlikOturumlar } from './Takip.tsx';

// Her yol paylasilan/sayfalar/guvenlik.ts ikinci menüsünün bir maddesidir.
export const rotalar: ModulRotasi[] = [
  { yol: '/guvenlik', ekran: GuvenlikDurum },
  { yol: '/guvenlik/alarmlar', ekran: GuvenlikAlarmlar },
  { yol: '/guvenlik/girisler', ekran: GuvenlikGirisler },
  { yol: '/guvenlik/oturumlar', ekran: GuvenlikOturumlar },
  { yol: '/guvenlik/koruma', ekran: GuvenlikKoruma },
  { yol: '/guvenlik/kurallar', ekran: GuvenlikKurallar },
  { yol: '/guvenlik/yonetici-islemleri', ekran: GuvenlikYoneticiIslemleri },
];
