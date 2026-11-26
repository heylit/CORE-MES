import type { ReactNode } from 'react';
import type { Islem } from '#paylasilan/islemler.ts';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { LogoHazirligi, SmartesHazirligi } from './BaglantiHazirligi.tsx';
import { BaglantiAyarlari } from './SistemAyarlari.tsx';
import './ayarlar.css';

// 3737 a: Logo ve SmartES sayfası kendi sisteminin merkezidir. Hazırlık ve bütün ayarlar Sistem Ayarları > Bağlantılar'daki ekranın
// aynısıdır (aynı uç, aynı yetki, aynı tablo); değer kopyalanmaz. Ekran bu modülde kalır, adres o sayfanın altındadır: Logo ve
// SmartES modülü alt kattadır, bu ekranı ithal edemez (ADR 0006). Menü maddesi işlemi olmayana görünmez; adres elle açılırsa kapı söyler.
function Kapi({ islem, children }: { islem: Islem; children: ReactNode }) {
  const islemler = useOturum().data?.islemler;
  if (islemler === undefined) return <DurumKutusu durum="yukleniyor" />;
  if (!islemler.includes(islem)) return <DurumKutusu durum="bos" mesaj="Bu bölümü görme yetkiniz yok." />;
  return <>{children}</>;
}

export function LogoHazirlikSayfasi() {
  return <Kapi islem="saglik.ayrinti-oku"><div className="tc-merkez-bolum"><LogoHazirligi /></div></Kapi>;
}

export function SmartesHazirlikSayfasi() {
  return <Kapi islem="saglik.ayrinti-oku"><div className="tc-merkez-bolum"><SmartesHazirligi /></div></Kapi>;
}

export function LogoAyarlariSayfasi() {
  return <Kapi islem="ayarlar.yaz"><BaglantiAyarlari sistem="logo" /></Kapi>;
}

export function SmartesAyarlariSayfasi() {
  return <Kapi islem="ayarlar.yaz"><BaglantiAyarlari sistem="smartes" /></Kapi>;
}
