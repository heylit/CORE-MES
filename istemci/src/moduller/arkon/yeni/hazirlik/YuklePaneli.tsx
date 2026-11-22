import { YuklemeTerminali } from '../operator/YuklemeTerminali.tsx';
import { useDarEkran } from '../operator/kancalar.ts';

// Sevkiyat çalışanı terminalde yalnız yüklemeyi görür (Arkon rolü yok, /arkon/ben istenmez). Çıkış kaydı Sevkiyat'ın ve Stok'undur, iş kaydına (sr) yazmaz.
export function YuklePaneli() {
  const dar = useDarEkran();
  return (
    <div className="tc-ay2-panel tc-ay2-depo">
      <YuklemeTerminali dar={dar} />
    </div>
  );
}
