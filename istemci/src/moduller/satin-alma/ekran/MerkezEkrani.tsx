import { useSyncExternalStore } from 'react';
import { S, V } from '../merkez/store.ts';
import { merkezAbone, merkezSurumu, ortakEkranMi } from '../merkez/views.ts';
import { IsKutusu } from './IsKutusu.tsx';
import { Siparisler } from './Siparisler.tsx';
import { TalepAyrinti } from './TalepAyrinti.tsx';
import { Talepler } from './Talepler.tsx';
import './ekran.css';

// Satın almacının iş kutusu, Talepler, Siparişler (2430) ve talep ayrıntısı ortak parçalarla çizilir (2412-2, 2420 a). Veri ve işlemler merkezindir:
// ekran merkezin her çiziminde yeniden okur, düğmeler merkezin işlemlerini çağırır. Adımların içeriği merkezin gövdesinde kalır.
export function MerkezEkrani() {
  useSyncExternalStore(merkezAbone, merkezSurumu);
  if (!S.ready || !ortakEkranMi()) return null;
  if (V.page === 'request') return <TalepAyrinti />;
  if (V.page === 'requests') return <Talepler />;
  if (V.page === 'orders') return <Siparisler />;
  return <IsKutusu />;
}
