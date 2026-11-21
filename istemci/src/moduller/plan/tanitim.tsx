import type { TanitimKonusu } from '../../ortak/rota/tanitim.ts';
import { KokpitTanitimi } from './planlama/kokpit/tanitim/KokpitTanitimi.tsx';

// Tanıtım sayfasına bu modülün verdiği konular (3536). İçerik ekranın yanında durur; ekran değişince orada güncellenir.
export const tanitimKonulari: readonly TanitimKonusu[] = [
  { anahtar: 'kokpit', sira: 10, baslik: 'Kokpit', alt: 'Planlama', simge: 'gantt', icerik: KokpitTanitimi },
];
