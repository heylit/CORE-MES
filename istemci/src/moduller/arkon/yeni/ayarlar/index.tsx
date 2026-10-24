import type { ArkonEkranOzellikleri } from '../sayfalar.ts';
import { AyarlarEkrani } from './AyarlarEkrani.tsx';

export { CagriBandi } from './CagriBandi.tsx';

// A6: Ayarlar (genel, tesis, kişiler ve yetkiler, üretim, sistem) ve her sayfanın altındaki çağrı bandı.
export function Ayarlar(_o: ArkonEkranOzellikleri) { return <AyarlarEkrani />; }
