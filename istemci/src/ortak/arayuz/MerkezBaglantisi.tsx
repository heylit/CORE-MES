import { Link } from 'react-router-dom';
import { Simge } from './Simge.tsx';
import { useOturum } from '../veri/oturum.ts';
import './entegrasyon-yonetimi.css';

// 3737 a: Logo ve SmartES ayarlarının, hazırlığının ve gitmeyen belgelerinin merkezi kendi sayfasıdır. Sistem Ayarları ve Güvenlik'teki
// bölümler yerinde kalır; başlarında o sayfaya giden tek satır durur. Sayfayı göremeyene çizilmez.
const METIN = {
  logo: { ad: 'Logo', metin: "Logo'nun bütün ayarları, hazırlığı ve gitmeyen belgeleri Logo sayfasında bir arada." },
  smartes: { ad: 'SmartES', metin: "SmartES'in bütün ayarları, hazırlığı ve gitmeyen iş emirleri SmartES sayfasında bir arada." },
} as const;

export function MerkezBaglantisi({ sistem }: { sistem: 'logo' | 'smartes' }) {
  const gorur = useOturum().data?.islemler.includes(`sayfa.${sistem}`) === true;
  if (!gorur) return null;
  const m = METIN[sistem];
  return (
    <Link className="tc-merkez-baglantisi" to={`/${sistem}`}>
      <span className="tc-merkez-baglantisi-metin">{m.metin}</span>
      <span className="tc-merkez-baglantisi-git">{m.ad} sayfasını aç<Simge ad="next" /></span>
    </Link>
  );
}
