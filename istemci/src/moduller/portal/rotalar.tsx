import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PortalCercevesi } from './PortalCercevesi.tsx';
import { PortalYeni } from './yeni/PortalYeni.tsx';

// İkinci menünün tek maddesi kök yoldur; prototip kendi iç gezinmesini taşır.
// TS ekranı (soru 199 b) alıma kadar ikinci yoldadır; menüde görünmez, yalnız yeni ekran kapısından geçene açılır.
export const rotalar: ModulRotasi[] = [
  { yol: '/portal', ekran: PortalCercevesi },
  { yol: '/portal/yeni', ekran: PortalYeni },
  { yol: '/portal/yeni/:gorunum', ekran: PortalYeni },
];
