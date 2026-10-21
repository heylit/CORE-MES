import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { BildirimYonetimi } from './BildirimYonetimi.tsx';
import { SayfaYetkileri } from './SayfaYetkileri.tsx';
import { SistemAyarlari } from './SistemAyarlari.tsx';
import { Yetkiler } from './Yetkiler.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/ayarlar', ekran: SistemAyarlari },
  { yol: '/ayarlar/yetkiler', ekran: Yetkiler },
  { yol: '/ayarlar/sayfa-yetkileri', ekran: SayfaYetkileri },
  { yol: '/ayarlar/bildirim-yonetimi', ekran: BildirimYonetimi },
];
