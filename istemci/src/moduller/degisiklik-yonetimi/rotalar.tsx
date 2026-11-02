import { Navigate, useParams } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { analizRotalari } from './analiz-rotalari.ts';
import { Degisiklikler } from './Degisiklikler.tsx';
import { EmirDetay } from './emir-detay/EmirDetay.tsx';
import { emirYolu, talepYolu } from './gosterim.tsx';
import { Gorevlerim } from './Gorevlerim.tsx';
import { TalepDetay } from './TalepDetay.tsx';

// Eski kayıt adresleri (kayıtlı bağlantılar) yeni yere gider.
function EskiTalepAdresi() {
  const { id } = useParams();
  return <Navigate replace to={talepYolu(Number(id))} />;
}
function EskiEmirAdresi() {
  const { id } = useParams();
  return <Navigate replace to={emirYolu(Number(id))} />;
}

export const rotalar: ModulRotasi[] = [
  { yol: '/degisiklik-yonetimi', ekran: Gorevlerim },
  { yol: '/degisiklik-yonetimi/degisiklikler', ekran: Degisiklikler },
  { yol: '/degisiklik-yonetimi/degisiklikler/talepler/:id', ekran: TalepDetay },
  { yol: '/degisiklik-yonetimi/degisiklikler/emirler/:id', ekran: EmirDetay },
  { yol: '/degisiklik-yonetimi/talepler/:id', ekran: EskiTalepAdresi },
  { yol: '/degisiklik-yonetimi/emirler/:id', ekran: EskiEmirAdresi },
  ...analizRotalari,
];
