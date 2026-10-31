import { useNavigate } from 'react-router-dom';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { yeniYol } from '../sekmeler.ts';
import type { FinansVerisi, FinansYetkisi } from '../veri.ts';
import './ana.css';

// İlk kurulum açılışta zorlanmaz; Ana sayfa ve Plan bölümleri Ayarlar > İlk kurulum'a götüren kısa uyarıyı gösterir (prototip
// kurulumUyarisi). Kurulumu finans.yonet tamamlar; başkasına kimin tamamlayacağı yazılır.
export function KurulumUyarisi({ finans, yetki }: { finans: FinansVerisi; yetki: FinansYetkisi }) {
  const git = useNavigate();
  if (finans.motor.durum.setupDone) return null;
  return (
    <div className="tc-fa-uyari" role="status" data-kurulum-uyarisi>
      <span>Finans ilk kurulumu yapılmadı. Şirket bilgisi ve başlangıç kasa ve banka bakiyesi girilmeden nakit tahmini eksik kalır.</span>
      {yetki.yonet
        ? <Dugme simge="gear" onClick={() => { void git(`${yeniYol('ayarlar')}?sekme=kurulum`); }}>Ayarlar'da tamamla</Dugme>
        : <span className="tc-fa-soluk">Finans yöneticisi Ayarlar'dan tamamlar.</span>}
    </div>
  );
}
