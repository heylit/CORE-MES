import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { DenetimHazirlikCercevesi } from './DenetimHazirlikCercevesi.tsx';

// İkinci menünün tek maddesi kök yoldur; prototip kendi iç gezinmesini taşır.
export const rotalar: ModulRotasi[] = [{ yol: '/denetim-hazirlik', ekran: DenetimHazirlikCercevesi }];
