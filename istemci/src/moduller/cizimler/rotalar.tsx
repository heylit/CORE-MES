import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { BelgeSayfasi } from './BelgeSayfasi.tsx';
import { Belgeler } from './Belgeler.tsx';

// Her ikinci menü adresi kendi bölümüdür (paylasilan/sayfalar/cizimler.ts).
export const rotalar: ModulRotasi[] = [
  { yol: '/cizimler', ekran: () => <Belgeler /> },
  { yol: '/cizimler/teknik-resim', ekran: () => <Belgeler tur="teknik-resim" /> },
  { yol: '/cizimler/3b-model', ekran: () => <Belgeler tur="3b-model" /> },
  { yol: '/cizimler/makine', ekran: () => <Belgeler tur="makine" /> },
  { yol: '/cizimler/sertifika', ekran: () => <Belgeler tur="sertifika" /> },
  { yol: '/cizimler/rapor', ekran: () => <Belgeler tur="rapor" /> },
  { yol: '/cizimler/kroki', ekran: () => <Belgeler tur="kroki" /> },
  { yol: '/cizimler/diger', ekran: () => <Belgeler tur="diger" /> },
  { yol: '/cizimler/arsiv', ekran: () => <Belgeler arsiv /> },
  { yol: '/cizimler/belge/:id', ekran: BelgeSayfasi },
];
