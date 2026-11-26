import { EntegrasyonYonetimi } from '../../ortak/arayuz/index.ts';
import { LogoOzeti } from './LogoOzeti.tsx';
import { TekKayitOku } from './TekKayitOku.tsx';
import './logo.css';

// 3445: Logo ile bütün okuma ve yazmalar tek yerde (bağlantı, akış ayarları, akış günlüğü). Görmek yalnız yönetici (sayfa.logo).
// 3626: tek kayıt yeniden okuma ortak yönetim bileşeninin altındadır (ortak parça değişmez).
// 3737 a: başta özet şeridi; her kutu ilgili menü maddesine gider.
export function LogoYonetimi() {
  return (
    <div className="tc-logo-bolum">
      <LogoOzeti />
      <EntegrasyonYonetimi ad="Logo" kok="/logo" />
      <TekKayitOku />
    </div>
  );
}
