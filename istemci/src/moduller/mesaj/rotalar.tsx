import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { MesajCercevesi } from './MesajCercevesi.tsx';

// İkinci menünün tek maddesi kök yoldur; prototip kendi iç gezinmesini taşır.
export const rotalar: ModulRotasi[] = [{ yol: '/mesaj', ekran: MesajCercevesi }];
