import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { KapanisOnaylari } from './KapanisOnaylari.tsx';

// Liste ve emir ayrıntısı Reçete ve Rota'nın rotalarındadır (3003 a): açma penceresi ve emrin işlemleri o modülden gelir, bu modül alt
// kattadır (ADR 0006); ekranlar burada, disari.ts'tedir.
export const rotalar: ModulRotasi[] = [
  // Adım Durumu (2893-5 a): ana menüde ayrı sayfa, ekranı bu modülde.
  { yol: '/adim-durumu', ekran: AdimDurumu },
  { yol: '/uretim-emirleri/kapanis', ekran: KapanisOnaylari },
];
