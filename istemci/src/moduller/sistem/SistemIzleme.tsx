import type { ReactNode } from 'react';
import { Sekmeler, type Sekme } from '../../ortak/arayuz/index.ts';
import { GunlukSekmesi } from './GunlukSekmesi.tsx';
import { KapanmalarSekmesi } from './KapanmalarSekmesi.tsx';
import { plansizKapanmaSayisi, type IzlemeAdresi, type SekmeAnahtari } from './kapanma-yorumu.ts';
import { useKapanmalar } from './kapanma-sorgusu.ts';
import { SistemDurumu } from './SistemDurumu.tsx';
import './sistem-durumu.css';

export const VARSAYILAN_ADRES: IzlemeAdresi = { sekme: 'ozet', kayit: null, suzgec: {} };

// key: rozet sonradan gelince şerit yeniden ölçülsün (ortak şerit içerik değişimini gözlemez; CEKIRDEK-ISTEKLERI).
// Sistem İzleme (kart 3668): Özet (bugünkü sistem durumu, değişmedi), Kapanmalar, Günlük. Sekme, seçili kayıt ve günlük süzgeci adreste tutulur.
export function SistemIzleme({ adres, degistir, sayfaBaglantisi }: { adres: IzlemeAdresi; degistir: (a: IzlemeAdresi) => void; sayfaBaglantisi?: ReactNode }) {
  const kapanmalar = useKapanmalar();
  const plansiz = plansizKapanmaSayisi(kapanmalar.data?.kapanmalar ?? [], Date.now());
  const sekmeler: readonly Sekme<SekmeAnahtari>[] = [
    { anahtar: 'ozet', baslik: 'Özet', simge: 'cpu' },
    { anahtar: 'kapanmalar', baslik: 'Kapanmalar', simge: 'alert', sayi: plansiz },
    { anahtar: 'gunluk', baslik: 'Günlük', simge: 'list' },
  ];
  return (
    <div className="tc-izleme">
      <Sekmeler key={plansiz} etiket="Sistem izleme bölümleri" sekmeler={sekmeler} secili={adres.sekme} sec={(sekme) => { degistir({ sekme, kayit: null, suzgec: sekme === 'gunluk' ? adres.suzgec : {} }); }} />
      <div role="tabpanel" aria-label={sekmeler.find((s) => s.anahtar === adres.sekme)?.baslik} className="tc-izleme-panel">
        {adres.sekme === 'ozet' && (
          <>
            {plansiz > 0 && (
              <p className="tc-izleme-uyari" role="status">
                Son 7 günde plansız {plansiz} kapanma.{' '}
                <button type="button" className="tc-izleme-baglanti" onClick={() => { degistir({ sekme: 'kapanmalar', kayit: null, suzgec: {} }); }}>Kapanmalar'a git</button>
              </p>
            )}
            <SistemDurumu sayfaBaglantisi={sayfaBaglantisi} />
          </>
        )}
        {adres.sekme === 'kapanmalar' && <KapanmalarSekmesi kayit={adres.kayit} sec={(kayit) => { degistir({ ...adres, kayit }); }} git={degistir} />}
        {adres.sekme === 'gunluk' && <GunlukSekmesi suzgec={adres.suzgec} uygula={(suzgec) => { degistir({ ...adres, suzgec }); }} />}
      </div>
    </div>
  );
}
