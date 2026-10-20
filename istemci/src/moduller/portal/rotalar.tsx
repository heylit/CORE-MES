import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { PortalCercevesi } from './PortalCercevesi.tsx';

// İkinci menünün tek maddesi kök yoldur; prototip kendi iç gezinmesini taşır.
export const rotalar: ModulRotasi[] = [{ yol: '/portal', ekran: PortalCercevesi }];
