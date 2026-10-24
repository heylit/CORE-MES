import type { Gorunumler } from '../sekmeler.ts';
import { TeklifAyrintisi } from './TeklifAyrintisi.tsx';
import { TeklifListesi } from './TeklifListesi.tsx';
import { YeniTeklif } from './YeniTeklif.tsx';

// Müşteri teklifleri parçası (P1).
export const gorunumler: Gorunumler = { sales: TeklifListesi, sale: TeklifAyrintisi, newsale: YeniTeklif };
