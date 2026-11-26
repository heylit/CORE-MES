import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { GuvenlikAlarmlar } from './Alarmlar.tsx';
import { BaglantiIzleme } from './BaglantiIzleme.tsx';
import { GuvenlikDurum } from './Durum.tsx';
import { LogoGitmeyenSayfasi, SmartesGitmeyenSayfasi } from './MerkezBolumleri.tsx';
import { GuvenlikKoruma, GuvenlikKurallar, GuvenlikYoneticiIslemleri } from './Koruma.tsx';
import { GuvenlikGirisler, GuvenlikOturumlar, GuvenlikReddedilenler } from './Takip.tsx';

// /guvenlik altındaki her yol paylasilan/sayfalar/guvenlik.ts ikinci menüsünün bir maddesidir.
export const rotalar: ModulRotasi[] = [
  { yol: '/guvenlik', ekran: GuvenlikDurum },
  { yol: '/guvenlik/alarmlar', ekran: GuvenlikAlarmlar },
  { yol: '/guvenlik/baglantilar', ekran: BaglantiIzleme },
  { yol: '/guvenlik/girisler', ekran: GuvenlikGirisler },
  { yol: '/guvenlik/oturumlar', ekran: GuvenlikOturumlar },
  { yol: '/guvenlik/reddedilen', ekran: GuvenlikReddedilenler },
  { yol: '/guvenlik/koruma', ekran: GuvenlikKoruma },
  { yol: '/guvenlik/kurallar', ekran: GuvenlikKurallar },
  { yol: '/guvenlik/yonetici-islemleri', ekran: GuvenlikYoneticiIslemleri },
  // 3737 a: Logo ve SmartES sayfasının Gitmeyen maddesi; ekran bu modülün, menü o sayfanındır.
  { yol: '/logo/gitmeyen', ekran: LogoGitmeyenSayfasi },
  { yol: '/smartes/gitmeyen', ekran: SmartesGitmeyenSayfasi },
];
