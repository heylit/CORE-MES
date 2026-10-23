import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { MesajCercevesi } from './MesajCercevesi.tsx';
import { MesajYeni } from './yeni/MesajYeni.tsx';

// İkinci menünün tek maddesi kök yoldur; prototip kendi iç gezinmesini taşır.
// Yeni ekran (TS geçişi) alıma kadar ikinci yolda ve yalnız yöneticide açılır (YeniEkranKapisi).
export const rotalar: ModulRotasi[] = [
  { yol: '/mesaj', ekran: MesajCercevesi },
  { yol: '/mesaj/yeni', ekran: MesajYeni },
  { yol: '/mesaj/yeni/:gorunum', ekran: MesajYeni },
  { yol: '/mesaj/yeni/sohbet/:kanal', ekran: MesajYeni },
];
