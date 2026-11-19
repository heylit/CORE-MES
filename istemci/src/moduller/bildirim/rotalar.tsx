import { Navigate, useLocation } from 'react-router-dom';
import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Arsiv, Gelenler, HazirlaSayfasi, YayinlarSayfasi } from './Bildirimler.tsx';
import { AcikTakipler, Gecikenlerim, KademeliUyari } from './Kademe.tsx';

// Bildirim Merkezi (3405-4 a): bildirim, duyuru ve kademeli takip tek sayfada. Bildirim yönetimi ve E-posta ayarları da bu menüdedir;
// ekranları Sistem Ayarları modülündedir ve oradan bu adrese kaydedilir.
function EskiAdres({ yeni }: { yeni: string }) {
  const { search } = useLocation();
  return <Navigate to={`${yeni}${search}`} replace />;
}

export const rotalar: ModulRotasi[] = [
  { yol: '/bildirim-merkezi', ekran: Gelenler },
  { yol: '/bildirim-merkezi/gecikenlerim', ekran: Gecikenlerim },
  { yol: '/bildirim-merkezi/arsiv', ekran: Arsiv },
  // Kişide yalnız telefon bildirimi anahtarı kalır, o da Profilim'dedir; eski Tercihlerim adresleri oraya gider.
  ...(['cihaz', 'tercihler'] as const).map((a) => ({ yol: `/bildirim-merkezi/${a}`, ekran: () => <Navigate to="/profil" replace /> })),
  { yol: '/bildirim-merkezi/hazirla', ekran: HazirlaSayfasi },
  { yol: '/bildirim-merkezi/yayinlar', ekran: YayinlarSayfasi },
  { yol: '/bildirim-merkezi/acik-takipler', ekran: AcikTakipler },
  { yol: '/bildirim-merkezi/kademeli-uyari', ekran: KademeliUyari },
  // Eski adresler (yer imi, gönderilmiş bildirim bağlantısı) yeni yere gider.
  { yol: '/profil/bildirimler', ekran: () => <EskiAdres yeni="/bildirim-merkezi" /> },
  ...(['arsiv', 'hazirla', 'yayinlar'] as const).map((a) => ({ yol: `/profil/bildirimler/${a}`, ekran: () => <EskiAdres yeni={`/bildirim-merkezi/${a}`} /> })),
  { yol: '/profil/bildirimler/tercihler', ekran: () => <Navigate to="/profil" replace /> },
];
