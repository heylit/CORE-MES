import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { SiparisAyrinti } from './SiparisAyrinti.tsx';
import { SiparisFormu } from './SiparisFormu.tsx';
import { SiparisListesi } from './SiparisListesi.tsx';
import { TeklifAyrinti } from './TeklifAyrinti.tsx';
import { TeklifFormu } from './TeklifFormu.tsx';
import { TeklifListesi } from './TeklifListesi.tsx';

const YeniSiparis = () => <SiparisFormu />;
const SiparisDuzenle = () => <SiparisFormu duzenle />;
const YeniTeklif = () => <TeklifFormu />;
const TeklifDuzenle = () => <TeklifFormu duzenle />;

// İkinci menüdeki her maddenin rotası vardır (testle denetlenir); ayrıntı ve düzenleme yolları menüde durmaz.
export const rotalar: ModulRotasi[] = [
  { yol: '/siparisler', ekran: SiparisListesi },
  { yol: '/siparisler/yeni', ekran: YeniSiparis },
  { yol: '/siparisler/teklifler', ekran: TeklifListesi },
  { yol: '/siparisler/teklifler/yeni', ekran: YeniTeklif },
  { yol: '/siparisler/teklifler/:id', ekran: TeklifAyrinti },
  { yol: '/siparisler/teklifler/:id/duzenle', ekran: TeklifDuzenle },
  { yol: '/siparisler/:id', ekran: SiparisAyrinti },
  { yol: '/siparisler/:id/duzenle', ekran: SiparisDuzenle },
];
