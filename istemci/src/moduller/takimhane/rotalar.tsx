import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { BaslangicStogu, CikisIade, EmirTakimlariSayfasi, TakimhaneGenel } from './Ekranlar.tsx';

// /takimhane (sayfa.takimhane): ana ekran, emir takımları, çıkış ve iade, başlangıç stoğu (ikinci menü paylasilan/sayfalar/takimhane.ts).
export const rotalar: ModulRotasi[] = [
  { yol: '/takimhane', ekran: TakimhaneGenel },
  { yol: '/takimhane/emirler', ekran: EmirTakimlariSayfasi },
  { yol: '/takimhane/cikis-iade', ekran: CikisIade },
  { yol: '/takimhane/baslangic', ekran: BaslangicStogu },
];
