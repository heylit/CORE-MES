import { useNavigate } from 'react-router-dom';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { yeniYol } from '../sekmeler.ts';
import type { FinansVerisi, FinansYetkisi } from '../veri.ts';
import './ana.css';

// İlk kurulum açılışta zorlanmaz; Ana sayfa ve Plan bölümleri Ayarlar > İlk kurulum'a götüren kısa uyarıyı gösterir (prototip
// kurulumUyarisi). Kurulumu ayar ve hesap eylemi olan tamamlar (finans.ayar, finans.hesap-yonet); başkasına kimin tamamlayacağı yazılır.
export function KurulumUyarisi({ finans, yetki }: { finans: FinansVerisi; yetki: FinansYetkisi }) {
  const git = useNavigate();
  const d = finans.motor.durum;
  if (d.setupDone) return null;
  // Hesaplar başka yoldan açılmışsa bakiye "tamam" görünür; uyarı yalnız eksik kalanı söyler (veri tamlığı listesiyle çelişmesin).
  const bakiyeVar = !!(Number(d.company.openingCash) || d.cashChecks.length);
  return (
    <div className="tc-fa-uyari" role="status" data-kurulum-uyarisi>
      <span>{bakiyeVar
        ? 'Finans ilk kurulumu tamamlanmadı. Kasa ve banka bakiyesi girilmiş; şirket bilgisi ve nakit güvenlik eşiği girilmeden nakit uyarıları eksik kalır.'
        : 'Finans ilk kurulumu yapılmadı. Şirket bilgisi ve başlangıç kasa ve banka bakiyesi girilmeden nakit tahmini eksik kalır.'}</span>
      {yetki.ayar && yetki.hesapYonet
        ? <Dugme simge="gear" onClick={() => { void git(`${yeniYol('ayarlar')}?sekme=kurulum`); }}>Ayarlar'da tamamla</Dugme>
        : <span className="tc-fa-soluk">Finans yöneticisi Ayarlar'dan tamamlar.</span>}
    </div>
  );
}
