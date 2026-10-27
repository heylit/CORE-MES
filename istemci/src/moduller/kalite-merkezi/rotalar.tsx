import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { ESKI_KOK, KaliteMerkeziCercevesi } from './KaliteMerkeziCercevesi.tsx';
import { KaliteMerkeziYeni } from './yeni/KaliteMerkeziYeni.tsx';

// Yeni ekran Kalite Merkezi'nin adreslerindedir (582, 527 1 a): kök ve ikinci menünün her maddesi (paylasilan/sayfalar/kalite-merkezi.ts)
// yeni ekrana gider, görünümü adres seçer. Eski çerçeve bir süre /kalite-merkezi/eski altında kalır, kişi menüsündeki "Eski görünüm" açar.
// Resim ve modeller yeni stüdyodadır (597 a).
const EskiKaliteMerkezi = () => <KaliteMerkeziCercevesi />;

export const rotalar: ModulRotasi[] = [
  { yol: '/kalite-merkezi', ekran: KaliteMerkeziYeni },
  { yol: ESKI_KOK, ekran: EskiKaliteMerkezi },
  { yol: `${ESKI_KOK}/:gorunum`, ekran: EskiKaliteMerkezi },
  { yol: '/kalite-merkezi/:gorunum', ekran: KaliteMerkeziYeni },
];
