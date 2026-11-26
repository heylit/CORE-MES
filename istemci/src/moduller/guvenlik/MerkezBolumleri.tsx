import type { ReactNode } from 'react';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { BaglantiIzleme } from './BaglantiIzleme.tsx';

// 3737 a: Logo ve SmartES sayfasındaki "Gitmeyen belgeler", Güvenlik > Bağlantı izleme ekranının yalnız o sistemle açılmışıdır
// (aynı uç, aynı yetki, aynı düğmeler). Ekran bu modülde kalır: Logo ve SmartES modülü alt kattadır (ADR 0006).
function Kapi({ children }: { children: ReactNode }) {
  const islemler = useOturum().data?.islemler;
  if (islemler === undefined) return <DurumKutusu durum="yukleniyor" />;
  if (!islemler.includes('saglik.ayrinti-oku')) return <DurumKutusu durum="bos" mesaj="Bu bölümü görme yetkiniz yok." />;
  return <>{children}</>;
}

export function LogoGitmeyenSayfasi() {
  return <Kapi><BaglantiIzleme kaynak="Logo" /></Kapi>;
}

export function SmartesGitmeyenSayfasi() {
  return <Kapi><BaglantiIzleme kaynak="SmartES" /></Kapi>;
}
