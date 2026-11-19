import { EntegrasyonYonetimi } from '../../ortak/arayuz/index.ts';

// 3445: Logo ile bütün okuma ve yazmalar tek yerde (bağlantı, akış ayarları, akış günlüğü). Görmek yalnız yönetici (sayfa.logo).
export function LogoYonetimi() {
  return <EntegrasyonYonetimi ad="Logo" kok="/logo" />;
}
