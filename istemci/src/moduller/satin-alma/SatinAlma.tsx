import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useBildirim } from '../../ortak/arayuz/Bildirim.tsx';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { OnTalepKarti } from './OnTalepKarti.tsx';
import { MerkezEkrani } from './ekran/MerkezEkrani.tsx';
import { acilisOku, merkezAdresi, merkeziBagla, type MerkezSayfasi } from './merkez/bagla.ts';
import type { Role } from './merkez/roles.ts';

// Her ikinci menü maddesi Satın Alma Merkezi'nin bir ekranını açar; arayüz prototipin kendisidir, menüyü kabuk çizer.
function Merkez({ rol, sayfa, yol }: { rol: Role; sayfa: MerkezSayfasi; yol: string }) {
  const kok = useRef<HTMLDivElement>(null);
  const git = useNavigate();
  const [adres] = useSearchParams();
  const { data: kullanici } = useOturum();
  const onaylayabilir = kullanici?.islemler.includes('satin-alma.onayla') ?? false;
  const basamakYazar = kullanici?.islemler.includes('ayarlar.yaz') ?? false;
  // Merkezin bildirimi ve geri al'ı kabuğun ortak bildirimidir.
  const { bildir, kaldir } = useBildirim();
  // Ortak parçalarla çizilen ekranlar (2412-2) merkezin iskeletindeki #sa-ekran'a taşınır; iskelet her bağlamada yeniden kurulur.
  const [ekranYeri, ekranYeriYaz] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const k = kok.current;
    if (!k) return undefined;
    const coz = merkeziBagla(k, { rol, sayfa, yol, onaylayabilir, basamakYazar, git: (y, yerine) => { void git(y, { replace: yerine === true }); }, bildirim: { bildir, kaldir } });
    ekranYeriYaz(k.querySelector<HTMLElement>('#sa-ekran'));
    return () => { ekranYeriYaz(null); coz(); };
  }, [rol, sayfa, yol, onaylayabilir, basamakYazar, git, bildir, kaldir]);
  // Adresteki talep (Ctrl K 1237, geri ve ileri tuşu; 2412) ayrıntıyı açar; adreste talep kalmayınca ayrıntı kapanır.
  useEffect(() => { merkezAdresi(acilisOku(adres)); }, [adres]);
  return <><div ref={kok} className="sa-kok" />{ekranYeri && createPortal(<MerkezEkrani />, ekranYeri)}</>;
}

// Kök sayfa iş kutusudur (satın alma). İş kutusunu görmeyen kişi kendi maddesine gider: onaylayan onaylara, okuyan taleplere.
export function IsKutusuSayfasi() {
  const { data: kullanici } = useOturum();
  if (!kullanici) return null;
  const var_ = (i: (typeof kullanici.islemler)[number]) => kullanici.islemler.includes(i);
  if (!var_('satin-alma.yaz')) {
    if (var_('satin-alma.onayla')) return <Navigate to="/satin-alma/onaylar" replace />;
    if (var_('satin-alma.oku')) return <Navigate to="/satin-alma/talepler" replace />;
  }
  return (
    <div className="sa-is-kutusu">
      <Merkez rol="buyer" sayfa="dash" yol="/satin-alma" />
      {/* Merkezin altında: üstte kalınca sayfa başlığının ve aramanın önüne geçiyordu (2400, kullanıcı ekran görüntüsü). */}
      <OnTalepKarti />
    </div>
  );
}

export const TaleplerSayfasi = () => <Merkez rol="buyer" sayfa="requests" yol="/satin-alma/talepler" />;
export const SiparislerSayfasi = () => <Merkez rol="buyer" sayfa="orders" yol="/satin-alma/siparisler" />;
// Kabuk yalnız sayfa düzeyinde rota keser; adresle açılan Onaylar, onay işlemi olmayana Onayla/Reddet çizmesin diye kökle döner.
export function OnaylarSayfasi() {
  const { data: kullanici } = useOturum();
  if (!kullanici) return null;
  if (!kullanici.islemler.includes('satin-alma.onayla')) return <Navigate to="/satin-alma" replace />;
  return <Merkez rol="approver" sayfa="dash" yol="/satin-alma/onaylar" />;
}
export const MalzemelerSayfasi = () => <Merkez rol="buyer" sayfa="materials" yol="/satin-alma/malzemeler" />;
export const TedarikcilerSayfasi = () => <Merkez rol="buyer" sayfa="suppliers" yol="/satin-alma/tedarikciler" />;
export const RaporlarSayfasi = () => <Merkez rol="buyer" sayfa="reports" yol="/satin-alma/raporlar" />;
export { DisOperasyonlar as DisOperasyonlarSayfasi } from './dis-operasyon/DisOperasyonlar.tsx';
export { KgFiyatlari as KgFiyatlariSayfasi } from './kg-fiyat/KgFiyatlari.tsx';
export { TedarikTerminleri as TedarikTerminleriSayfasi } from './tedarik-termin/TedarikTerminleri.tsx';
// Ayarlar yalnız Sistem Ayarları'nda açılır (ayar-ekranlari.tsx).
export const AyarlarSayfasi = () => <Merkez rol="buyer" sayfa="settings" yol="/ayarlar" />;
