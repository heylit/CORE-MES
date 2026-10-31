import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { TmiYansimalari } from './TmiYansimalari.tsx';
import { ArkonAyriSayfa, ArkonYeni } from './yeni/ArkonYeni.tsx';
import './cikis-temizligi.ts';

const YeniKuyruk = () => <ArkonAyriSayfa sayfa="kuyruk" />;
const YeniTerminal = () => <ArkonAyriSayfa sayfa="operator" />;

// Eski çerçevenin adresleri (`<kök>/eski/...`) kalktı (1418, karar 1392 a); yer imleri aynı yolun yeni adresine gider, sorgu ve işaret korunur.
export const ESKI_KOKLER = ['/arkon', '/kuyruk', '/uretim-terminali'] as const;
export const eskiAdresinYenisi = (adres: string): string => {
  const kok = ESKI_KOKLER.find((k) => adres === `${k}/eski` || adres.startsWith(`${k}/eski/`));
  return kok === undefined ? adres : kok + adres.slice(`${kok}/eski`.length);
};
function EskiAdres() {
  const { pathname, search, hash } = useLocation();
  return <Navigate replace to={{ pathname: eskiAdresinYenisi(pathname), search, hash }} />;
}

export const rotalar: ModulRotasi[] = [
  // Yalın /arkon rolüne göre Pano'yu ya da Üretim Terminali'ni açar.
  { yol: '/arkon', ekran: ArkonYeni },
  // Operatör menüde gezip döndüğünde terminal yeniden kurulmaz, yarım iş yerinde kalır.
  { yol: '/uretim-terminali', ekran: YeniTerminal, kalici: true },
  { yol: '/uretim-terminali/eski', ekran: EskiAdres },
  { yol: '/kuyruk', ekran: YeniKuyruk },
  { yol: '/kuyruk/eski', ekran: EskiAdres },
  // Sabit yollar /arkon/:sayfa'dan önce eşlenir.
  { yol: '/arkon/tmi-yansimalari', ekran: TmiYansimalari },
  { yol: '/arkon/eski', ekran: EskiAdres },
  { yol: '/arkon/eski/:sayfa', ekran: EskiAdres },
  { yol: '/arkon/eski/:sayfa/:kimlik', ekran: EskiAdres },
  { yol: '/arkon/:sayfa', ekran: ArkonYeni },
  { yol: '/arkon/:sayfa/:kimlik', ekran: ArkonYeni },
];
