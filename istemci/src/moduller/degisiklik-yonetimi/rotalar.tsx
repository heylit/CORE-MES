import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Degisiklikler } from './Degisiklikler.tsx';
import { EmirDetay } from './emir-detay/EmirDetay.tsx';
import { Gorevlerim } from './Gorevlerim.tsx';
import { TalepDetay } from './TalepDetay.tsx';

// Görevlerim, Değişiklikler ve talep detayı (P2), emir detayı (P3); Konfigürasyon, İzlenebilirlik, Raporlar ve olay günlüğü (P4) aşağıya eklenir.
export const rotalar: ModulRotasi[] = [
  { yol: '/degisiklik-yonetimi', ekran: Gorevlerim },
  { yol: '/degisiklik-yonetimi/degisiklikler', ekran: Degisiklikler },
  { yol: '/degisiklik-yonetimi/talepler/:id', ekran: TalepDetay },
  { yol: '/degisiklik-yonetimi/emirler/:id', ekran: EmirDetay },
];
