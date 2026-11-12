import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Baskilar } from './Baskilar.tsx';
import { EskiBasAdresi, EtiketBas, SablonKatalogu, YaziciDenemesi } from './EtiketMerkezi.tsx';
import { Etiketler } from './Etiketler.tsx';
import { OtomatikBaskilar } from './Otomatik.tsx';
import { Pano } from './Pano.tsx';
import { Yazicilar } from './Yazicilar.tsx';

// Diğer modüllerin düğmeleri `/etiket-merkezi?tur=…&id=…` adresine gelir; seçimli adres Etiket bas'a taşınır, seçimsiz kök Pano'dur (2992 a).
const Kok = () => <EskiBasAdresi pano={() => <Pano />} />;

export const rotalar: ModulRotasi[] = [
  { yol: '/etiket-merkezi', ekran: Kok },
  { yol: '/etiket-merkezi/bas', ekran: EtiketBas },
  { yol: '/etiket-merkezi/etiketler', ekran: Etiketler },
  { yol: '/etiket-merkezi/otomatik', ekran: OtomatikBaskilar },
  { yol: '/etiket-merkezi/sablonlar', ekran: SablonKatalogu },
  { yol: '/etiket-merkezi/deneme', ekran: YaziciDenemesi },
  { yol: '/etiket-merkezi/yazicilar', ekran: Yazicilar },
  { yol: '/etiket-merkezi/baskilar', ekran: Baskilar },
];
