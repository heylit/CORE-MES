// Planlama plan modülünün sayfasıdır (658 b, 661 a); ikinci menü paylasilan/sayfalar/plan.ts'dedir, görünüm sırası ve başlığı oradan gelir.
// Madde anahtarı görünümün adıdır; eski çerçeve (659 a: yalnız yönetici, /plan/eski) aynı anahtarlarla açılır.
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import type { PLAN_IKINCI_MENU } from '#paylasilan/sayfalar/plan.ts';

const menu = IKINCI_MENULER.find((m): m is typeof PLAN_IKINCI_MENU => m.kok === '/plan');
if (menu === undefined) throw new Error('Planlama ikinci menüsü tanımlı değil (paylasilan/sayfalar/plan.ts).');
export const ONERILEN_IKINCI_MENU: typeof PLAN_IKINCI_MENU = menu;

// Planlama sayfalarını görme işlemi; yönetici, müdür ve planlamadadır (195 a, 663 a).
export const PLANLAMA_ISLEMI = 'plan.planlama-oku';

// Maliyet ve kâr gösteren planlama sayfaları birim maliyet okumasını da ister: planlama rolü maliyet görmez (200 a), 195 a bunu korur.
export const MALIYET_ISLEMI = 'finans.maliyet-oku';
export const MALIYET_ANAHTARLARI: readonly string[] = ['maliyet', 'giderler', 'denge'];
