import type { ArkonEkranOzellikleri } from '../sayfalar.ts';
import { Hazirlaniyor } from '../ortak/Hazirlaniyor.tsx';

// A6: Ayarlar (ekran modülleri, vardiya, tesis, nedenler, kurallar, yetkiler salt okunur) ve çağrı bandı. Yer tutucu.
export function Ayarlar(_o: ArkonEkranOzellikleri) { return <Hazirlaniyor />; }
// Açık çağrıların bandı: kök her sayfanın altında çizer (eski ekranda CallBanner). Yer tutucu: bant yok.
export function CagriBandi(_o: { sayfa: string }) { return null; }
