import { EntegrasyonYonetimi } from '../../ortak/arayuz/index.ts';
import { TekKayitOku } from './TekKayitOku.tsx';

// 3445: Logo ile bütün okuma ve yazmalar tek yerde (bağlantı, akış ayarları, akış günlüğü). Görmek yalnız yönetici (sayfa.logo).
// 3626: tek kayıt yeniden okuma ortak yönetim bileşeninin altındadır (ortak parça değişmez).
export function LogoYonetimi() {
  return (
    <>
      <EntegrasyonYonetimi ad="Logo" kok="/logo" />
      <TekKayitOku />
    </>
  );
}
