import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dugme, Pencere } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useAyarDuzeni, type Duzen } from './duzen.ts';
import { AYAR_MENUSU, gecerliBolum, type AyarBolumu } from './menu.ts';
import { Aileler } from './bolumler/Aileler.tsx';
import { Kategoriler, MamulAlanlari, YariMamulAlanlari } from './bolumler/Alanlar.tsx';
import { BelgeTurleri, GenelAyarlar, Roller, Sertifikalar, StokBirimleri } from './bolumler/Genel.tsx';
import { Kaliteler } from './bolumler/Kaliteler.tsx';
import { TurKurallari } from './bolumler/Kurallar.tsx';
import { Ozellikler } from './bolumler/Ozellikler.tsx';
import { Ozet } from './bolumler/Ozet.tsx';
import { DurumSecenekleri, SinifVarsayilanlari, ToleransNormlari } from './bolumler/Secenekler.tsx';
import './ayarlar.css';

const BOLUMLER: Record<AyarBolumu, (d: Duzen) => ReactNode> = {
  ozet: (d) => <Ozet d={d} />,
  aile: (d) => <Aileler d={d} />,
  kalite: (d) => <Kaliteler d={d} />,
  ozellik: (d) => <Ozellikler d={d} />,
  durum: (d) => <DurumSecenekleri d={d} />,
  varsayilan: (d) => <SinifVarsayilanlari d={d} />,
  tol: (d) => <ToleransNormlari d={d} />,
  kural: (d) => <TurKurallari d={d} />,
  ym: (d) => <YariMamulAlanlari d={d} />,
  mm: (d) => <MamulAlanlari d={d} />,
  sarf: (d) => <Kategoriler key="sarf" d={d} tur="sarf" />,
  db: (d) => <Kategoriler key="demirbas" d={d} tur="demirbas" />,
  sertifika: (d) => <Sertifikalar d={d} />,
  birim: (d) => <StokBirimleri d={d} />,
  belge: (d) => <BelgeTurleri d={d} />,
  roller: (d) => <Roller d={d} />,
};

export function MalzemeAyarlari(o: EkranOzellikleri) {
  const [sorgu] = useSearchParams();
  const bolum = gecerliBolum(sorgu.get('bolum'));
  const kartaDon = sorgu.get('don') === 'kart';
  const d = useAyarDuzeni(o);
  const ac = (b: AyarBolumu) => {
    d.sec({ yeni: null, kaliteDuz: null });
    o.git.ayarlar(b === 'ozet' ? undefined : b);
  };

  return (
    <div className="tc-ma">
      {kartaDon && (
        <p className="tc-ma-uyari tc-ma-karta-don">
          Açtığın kart bekliyor; girdiğin bilgiler duruyor. <Dugme simge="back" onClick={() => o.git.yeniKart()}>Karta dön</Dugme>
        </p>
      )}
      {d.ro && <p className="tc-ma-uyari">Malzeme ayarlarını yalnız yetkili kişi değiştirebilir; burada yalnız görüntülenir.</p>}
      <div className="tc-ma-duzen">
        <nav className="tc-ma-menu" aria-label="Malzeme ayarları bölümleri">
          {AYAR_MENUSU.map((g) => (
            <div key={g.baslik || 'ust'} className="tc-ma-menu-grup">
              {g.baslik && <span className="tc-ma-menu-baslik">{g.baslik}</span>}
              {g.bolumler.map((b) => (
                <button key={b.anahtar} type="button" aria-current={b.anahtar === bolum ? 'page' : undefined} onClick={() => ac(b.anahtar)}>{b.ad}</button>
              ))}
            </div>
          ))}
        </nav>
        <div className="tc-ma-ic">{BOLUMLER[bolum](d)}</div>
      </div>
    </div>
  );
}

// Prototipin üst başındaki "Ayarlar" penceresi: onay akışı, kod, QR, açıklama ve mükerrer tarama; malzeme ayarlarının bölümü değildir.
// Taramadaki karta gidince pencere kapanır (prototipte kartın föyü bu pencerenin yerine açılır).
export function GenelAyarPenceresi({ kapat, ...o }: EkranOzellikleri & { kapat: () => void }) {
  const d = useAyarDuzeni({ ...o, git: { ...o.git, katalog: (k) => { kapat(); o.git.katalog(k); } } });
  return (
    <Pencere acik kapat={kapat} baslik="Ayarlar" alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      <div className="tc-ma"><GenelAyarlar d={d} /></div>
    </Pencere>
  );
}
