import { useSearchParams } from 'react-router-dom';
import { PANO_BOLUMLERI, gorunenKaynaklar, type AnaSayfaKaynagi, type PanoBolumu } from '../rota/ana-sayfa.ts';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Kart } from './Kart.tsx';
import { Simge } from './Simge.tsx';
import './grafik/grafik.css';
import './ana-sayfa.css';

export const DONEMLER = [7, 30, 90] as const;
const VARSAYILAN_GUN = 30;

// Yönetim panosu (kart 1773, 1772 ikisi birden): ana sayfadaki grafiklerin ayrıntısı. Yeni işlem açılmaz: her grafik
// kendi okuma işlemiyle görünür; süzgeç (dönem) aşağıdaki bütün grafikleri birlikte değiştirir ve adreste durur.
export function YonetimPanosu({ kaynaklar, islemler }: { kaynaklar: readonly AnaSayfaKaynagi[]; islemler: readonly string[] }) {
  const [adres, adresYaz] = useSearchParams();
  const grafikler = gorunenKaynaklar(kaynaklar, islemler).filter((k) => k.tur === 'grafik');
  const bolumler = PANO_BOLUMLERI.filter((b) => grafikler.some((g) => g.bolum === b.anahtar));
  if (bolumler.length === 0) {
    return (
      <Kart baslik="Yönetim panosu">
        <DurumKutusu durum="bos" mesaj="Size açık bir grafik yok." />
      </Kart>
    );
  }
  const istenenGun = Number(adres.get('gun'));
  const gun = (DONEMLER as readonly number[]).includes(istenenGun) ? istenenGun : VARSAYILAN_GUN;
  const istenenBolum = adres.get('bolum');
  const bolum: PanoBolumu = bolumler.find((b) => b.anahtar === istenenBolum)?.anahtar ?? bolumler[0]!.anahtar;
  const degistir = (ad: string, deger: string) => { const yeni = new URLSearchParams(adres); yeni.set(ad, deger); adresYaz(yeni, { replace: true }); };
  return (
    <div className="tc-pano tc-rol-panosu">
      <div className="tc-pano-ust">
        <div className="tc-pano-karsilama">
          <p className="tc-pano-selam">Yönetim panosu</p>
          <p className="tc-pano-tarih">Süzgeç aşağıdaki bütün grafikleri birlikte değiştirir.</p>
        </div>
      </div>
      <div className="tc-pano-suzgec" role="toolbar" aria-label="Süzgeç">
        <div className="tc-pano-suzgec-grup" role="group" aria-label="Dönem">
          {DONEMLER.map((g) => <button key={g} type="button" aria-pressed={g === gun} onClick={() => degistir('gun', String(g))}>Son {g} gün</button>)}
        </div>
      </div>
      <nav className="tc-pano-bolumleri" aria-label="Bölümler">
        {bolumler.map((b) => (
          <button key={b.anahtar} type="button" className="tc-gp-dugme" aria-pressed={b.anahtar === bolum} onClick={() => degistir('bolum', b.anahtar)}>
            <Simge ad={b.simge} boyut="k" />{b.baslik}
          </button>
        ))}
      </nav>
      <div className="tc-gp-izgarasi">
        {grafikler.filter((g) => g.bolum === bolum).map((g) => <g.kaynak key={g.anahtar} gun={gun} />)}
      </div>
    </div>
  );
}
