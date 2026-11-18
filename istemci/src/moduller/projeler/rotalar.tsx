import { Navigate } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { GorevSablonlari } from './GorevSablonlari.tsx';
import { HazirlikMaddeleri } from './HazirlikMaddeleri.tsx';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { ProjeGorevlerim } from './ProjeGorevlerim.tsx';
import { Projeler } from './Projeler.tsx';
import { StatuListesi } from './StatuListesi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/projeler', ekran: Projeler },
  // Sabit yol, :id'den önce eşleşmeli.
  { yol: '/projeler/statuler', ekran: StatuListesi },
  { yol: '/proje-gorevlerim', ekran: ProjeGorevlerim },
  { yol: '/projeler/sablonlar', ekran: GorevSablonlari },
  { yol: '/projeler/hazirlik-maddeleri', ekran: HazirlikMaddeleri },
  // Kademeli takip ayarı Bildirim Merkezi'ne taşındı (3405-4 a); eski adres oraya gider.
  { yol: '/projeler/hazirlik-kademe', ekran: () => <Navigate to="/bildirim-merkezi/kademeli-uyari" replace /> },
  { yol: '/projeler/:id', ekran: ProjeAyrinti },
];
