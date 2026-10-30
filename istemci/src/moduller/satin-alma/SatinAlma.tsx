import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { StokYokKarti } from './StokYokKarti.tsx';
import { acilisOku, merkezAc, merkeziBagla, type MerkezSayfasi } from './merkez/bagla.ts';
import type { Role } from './merkez/roles.ts';

// Her ikinci menü maddesi Satın Alma Merkezi'nin bir ekranını açar; arayüz prototipin kendisidir, menüyü kabuk çizer.
function Merkez({ rol, sayfa, yol }: { rol: Role; sayfa: MerkezSayfasi; yol: string }) {
  const kok = useRef<HTMLDivElement>(null);
  const git = useNavigate();
  const [adres, adresYaz] = useSearchParams();
  useEffect(() => (kok.current ? merkeziBagla(kok.current, { rol, sayfa, yol, git: (y) => { void git(y); } }) : undefined), [rol, sayfa, yol, git]);
  // Ctrl K'nın açtığı talep ya da pencere (1237); adres temizlenir ki geri gelince pencere yeniden açılmasın.
  useEffect(() => {
    const acilis = acilisOku(adres);
    if (!acilis) return;
    merkezAc(acilis);
    adresYaz({}, { replace: true });
  }, [adres, adresYaz]);
  return <div ref={kok} className="sa-kok" />;
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
    <>
      <StokYokKarti />
      <Merkez rol="buyer" sayfa="dash" yol="/satin-alma" />
    </>
  );
}

export const TaleplerSayfasi = () => <Merkez rol="buyer" sayfa="requests" yol="/satin-alma/talepler" />;
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
