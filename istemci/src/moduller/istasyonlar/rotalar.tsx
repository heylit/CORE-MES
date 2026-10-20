import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Istasyonlar } from './Istasyonlar.tsx';

// Tek sayfa: ikinci menünün bütün maddeleri aynı ekrana gelir, bölümü adres seçer.
export const rotalar: ModulRotasi[] = [
  { yol: '/istasyonlar', ekran: Istasyonlar },
  { yol: '/istasyonlar/:bolum', ekran: Istasyonlar },
];
