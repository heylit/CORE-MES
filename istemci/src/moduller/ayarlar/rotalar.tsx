import { Navigate } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { BildirimYonetimi } from './BildirimYonetimi.tsx';
import { SayfaYetkileri } from './SayfaYetkileri.tsx';
import { EpostaSayfasi, SistemAyarlari } from './SistemAyarlari.tsx';
import { Yetkiler } from './Yetkiler.tsx';

export const rotalar: ModulRotasi[] = [
  { yol: '/ayarlar', ekran: SistemAyarlari },
  { yol: '/ayarlar/yetkiler', ekran: Yetkiler },
  { yol: '/ayarlar/sayfa-yetkileri', ekran: SayfaYetkileri },
  // Bildirim yönetimi ve E-posta Bildirim Merkezi > Ayarlar'dadır (3405-4 a); ekranlar bu modülündür. Eski adres oraya gider.
  { yol: '/bildirim-merkezi/yonetim', ekran: BildirimYonetimi },
  { yol: '/bildirim-merkezi/eposta', ekran: EpostaSayfasi },
  { yol: '/ayarlar/bildirim-yonetimi', ekran: () => <Navigate to="/bildirim-merkezi/yonetim" replace /> },
];
