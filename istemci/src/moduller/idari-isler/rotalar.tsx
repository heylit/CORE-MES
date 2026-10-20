import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { AracGorevleri } from './AracGorevleri.tsx';
import { AracTaleplerim } from './AracTaleplerim.tsx';
import { Bugun } from './Bugun.tsx';
import { Filo } from './Filo.tsx';
import { Periyodik } from './Periyodik.tsx';
import { TalepAc } from './TalepAc.tsx';
import { Talepler } from './Talepler.tsx';
import { Taleplerim } from './Taleplerim.tsx';
import { Yemek } from './Yemek.tsx';
import { Zimmet } from './Zimmet.tsx';

// İkinci menüdeki her maddenin rotası vardır (testle denetlenir).
export const rotalar: ModulRotasi[] = [
  { yol: '/idari-isler', ekran: Bugun },
  { yol: '/idari-isler/talepler', ekran: Talepler },
  { yol: '/idari-isler/periyodik', ekran: Periyodik },
  { yol: '/idari-isler/yemek', ekran: Yemek },
  { yol: '/idari-isler/zimmet', ekran: Zimmet },
  { yol: '/idari-isler/filo', ekran: Filo },
  { yol: '/idari-isler/arac-gorevleri', ekran: AracGorevleri },
  { yol: '/idari-isler/talep-ac', ekran: TalepAc },
  { yol: '/idari-isler/taleplerim', ekran: Taleplerim },
  { yol: '/idari-isler/arac-taleplerim', ekran: AracTaleplerim },
];
