import { Link } from 'react-router-dom';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';

// Kapanış onayları emrin ana yerindedir (3003 a): liste ve komutlar Üretim Emirleri > Kapanış onayları'nda; menü maddesi oraya götürür.
export function Kapanis() {
  return (
    <div data-parca="R3">
      <DurumKutusu durum="bos" mesaj="Kapanış onayları Üretim Emirleri sayfasına taşındı." />
      <p className="tc-rr3-ipucu tc-rr3-ipucu-simge">
        <Simge ad="clipboard-check" boyut="k" /><Link to="/uretim-emirleri/kapanis">Üretim Emirleri'nde kapanış onaylarını aç</Link>
      </p>
    </div>
  );
}
