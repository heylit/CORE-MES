import { Navigate } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Gorevler } from './Gorevler.tsx';
import { GorevDagit } from './GorevDagit.tsx';
import { GorevSablonlari } from './GorevSablonlari.tsx';
import { GorevSayfasi } from './GorevSayfasi.tsx';
import { HazirlikMaddeleri } from './HazirlikMaddeleri.tsx';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { Projeler } from './Projeler.tsx';
import { StatuListesi } from './StatuListesi.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/projeler', ekran: Projeler },
  // Sabit yol, :id'den önce eşleşmeli.
  { yol: '/projeler/statuler', ekran: StatuListesi },
  // 3444 a: tek görev sayfası; adres bildirimlerde ve kademeli uyarıda kayıtlı olduğu için değişmez.
  { yol: '/proje-gorevlerim', ekran: Gorevler },
  // 3458 (1 b): görev kendi sayfasında; bildirimden ve listeden doğrudan açılır.
  // 3458 dilim 3: şablon ve hazırlık maddeleri Görevler'in altında; sabit yollar :gorevId'den önce eşleşmeli.
  { yol: '/proje-gorevlerim/sablonlar', ekran: GorevSablonlari },
  { yol: '/proje-gorevlerim/hazirlik-maddeleri', ekran: HazirlikMaddeleri },
  { yol: '/proje-gorevlerim/:gorevId', ekran: GorevSayfasi },
  // Eski adresler (yer imi, belge) yeni yere gider.
  { yol: '/projeler/sablonlar', ekran: () => <Navigate to="/proje-gorevlerim/sablonlar" replace /> },
  { yol: '/projeler/hazirlik-maddeleri', ekran: () => <Navigate to="/proje-gorevlerim/hazirlik-maddeleri" replace /> },
  // Kademeli takip ayarı Bildirim Merkezi'ne taşındı (3405-4 a); eski adres oraya gider.
  { yol: '/projeler/hazirlik-kademe', ekran: () => <Navigate to="/bildirim-merkezi/kademeli-uyari" replace /> },
  // 3458-2 a: iş başlangıcında görevler bu ekranda dağıtılır.
  { yol: '/projeler/:id/gorev-dagit', ekran: GorevDagit },
  { yol: '/projeler/:id', ekran: ProjeAyrinti },
];
