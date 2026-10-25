import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ArkonCercevesi, ESKI_ARKON_KOKU, KUYRUK_SAYFASI, URETIM_TERMINALI_ESKI_YOLU } from './ArkonCercevesi.tsx';
import { TmiYansimalari } from './TmiYansimalari.tsx';
import { ArkonAyriSayfa, ArkonYeni } from './yeni/ArkonYeni.tsx';

// Yeni ekranlar eski adresindedir (541, 527 1 a); eski çerçeve bir süre `<adres>/eski` altında kalır, kişi menüsündeki "Eski görünüm"
// açar. Çerçevenin kökü eski adrestir: Arkon iç sayfa değiştirse de adres yeni ekrana dönmez.
export const KUYRUK_ESKI_YOLU = '/kuyruk/eski';
const YeniKuyruk = () => <ArkonAyriSayfa sayfa="kuyruk" />;
const EskiKuyruk = () => <ArkonCercevesi kok={KUYRUK_ESKI_YOLU} sabitSayfa={KUYRUK_SAYFASI} />;
const YeniTerminal = () => <ArkonAyriSayfa sayfa="operator" />;
const EskiTerminal = () => <ArkonCercevesi kok={URETIM_TERMINALI_ESKI_YOLU} />;
const EskiArkon = () => <ArkonCercevesi kok={ESKI_ARKON_KOKU} />;

export const rotalar: ModulRotasi[] = [
  // Yalın /arkon rolüne göre Pano'yu ya da Üretim Terminali'ni açar.
  { yol: '/arkon', ekran: ArkonYeni },
  // Operatör menüde gezip döndüğünde terminal yeniden kurulmaz, yarım iş yerinde kalır.
  { yol: '/uretim-terminali', ekran: YeniTerminal, kalici: true },
  { yol: URETIM_TERMINALI_ESKI_YOLU, ekran: EskiTerminal },
  { yol: '/kuyruk', ekran: YeniKuyruk },
  { yol: KUYRUK_ESKI_YOLU, ekran: EskiKuyruk },
  // TMI ekranı ve eski çerçeve: sabit yol /arkon/:sayfa'dan önce eşlenir.
  { yol: '/arkon/tmi-yansimalari', ekran: TmiYansimalari },
  { yol: ESKI_ARKON_KOKU, ekran: EskiArkon },
  { yol: `${ESKI_ARKON_KOKU}/:sayfa`, ekran: EskiArkon },
  // Yeni ekranın kimlikli adresinin (önizleme) eskisi: çerçeve kimliği bilmez, sayfayı açar.
  { yol: `${ESKI_ARKON_KOKU}/:sayfa/:kimlik`, ekran: EskiArkon },
  { yol: '/arkon/:sayfa', ekran: ArkonYeni },
  { yol: '/arkon/:sayfa/:kimlik', ekran: ArkonYeni },
];
