import type { ReactNode } from 'react';
import { Sekmeler, type Sekme } from '../../ortak/arayuz/index.ts';
import { EkranHatalariSekmesi } from './EkranHatalariSekmesi.tsx';
import { DisBaglantilarSekmesi } from './DisBaglantilarSekmesi.tsx';
import { GunlukSekmesi } from './GunlukSekmesi.tsx';
import { KapanmalarSekmesi } from './KapanmalarSekmesi.tsx';
import { OzetOlaylari } from './OzetOlaylari.tsx';
import { SuAnSekmesi } from './SuAnSekmesi.tsx';
import { VeritabaniSekmesi } from './VeritabaniSekmesi.tsx';
import { YukSekmesi } from './YukSekmesi.tsx';
import { useEkranHatalari } from './izleme-sorgusu.ts';
import { plansizKapanmaSayisi, type IzlemeAdresi, type SekmeAnahtari } from './kapanma-yorumu.ts';
import { useKapanmalar } from './kapanma-sorgusu.ts';
import { SistemDurumu } from './SistemDurumu.tsx';
import './sistem-durumu.css';

export const VARSAYILAN_ADRES: IzlemeAdresi = { sekme: 'ozet', kayit: null, suzgec: {} };

// key: rozet sonradan gelince şerit yeniden ölçülsün (ortak şerit içerik değişimini gözlemez; CEKIRDEK-ISTEKLERI).
// Sistem İzleme (kart 3668): Özet (üç kutu, 24 saatlik çizelge, bugünkü sistem durumu), Şu an, Kapanmalar, Günlük, Yük ve davranış, Dış bağlantılar. Sekme, seçili kayıt ve günlük süzgeci adreste tutulur.
export function SistemIzleme({ adres, degistir, sayfaBaglantisi }: { adres: IzlemeAdresi; degistir: (a: IzlemeAdresi) => void; sayfaBaglantisi?: ReactNode }) {
  const kapanmalar = useKapanmalar();
  const ekranHatalari = useEkranHatalari('24s').data?.son24Saat ?? 0;
  const plansiz = plansizKapanmaSayisi(kapanmalar.data?.kapanmalar ?? [], Date.now());
  const sekmeler: readonly Sekme<SekmeAnahtari>[] = [
    { anahtar: 'ozet', baslik: 'Özet', simge: 'cpu' },
    { anahtar: 'suan', baslik: 'Şu an', simge: 'clock' },
    { anahtar: 'kapanmalar', baslik: 'Kapanmalar', simge: 'alert', sayi: plansiz },
    { anahtar: 'gunluk', baslik: 'Günlük', simge: 'list' },
    { anahtar: 'yuk', baslik: 'Yük ve davranış', simge: 'gauge' },
    { anahtar: 'dis', baslik: 'Dış bağlantılar', simge: 'route' },
    { anahtar: 'ekran', baslik: 'Ekran hataları', simge: 'laptop', sayi: ekranHatalari },
    { anahtar: 'veritabani', baslik: 'Veritabanı', simge: 'layers' },
  ];
  return (
    <div className="tc-izleme">
      <Sekmeler key={`${String(plansiz)}-${String(ekranHatalari)}`} etiket="Sistem izleme bölümleri" sekmeler={sekmeler} secili={adres.sekme} sec={(sekme) => { degistir({ sekme, kayit: null, suzgec: sekme === 'gunluk' ? adres.suzgec : {} }); }} />
      <div role="tabpanel" aria-label={sekmeler.find((s) => s.anahtar === adres.sekme)?.baslik} className="tc-izleme-panel">
        {adres.sekme === 'ozet' && (
          <>
            {plansiz > 0 && (
              <p className="tc-izleme-uyari" role="status">
                Son 7 günde plansız {plansiz} kapanma.{' '}
                <button type="button" className="tc-izleme-baglanti" onClick={() => { degistir({ sekme: 'kapanmalar', kayit: null, suzgec: {} }); }}>Kapanmalar'a git</button>
              </p>
            )}
            <OzetOlaylari />
            <SistemDurumu sayfaBaglantisi={sayfaBaglantisi} />
          </>
        )}
        {adres.sekme === 'suan' && <SuAnSekmesi />}
        {adres.sekme === 'yuk' && <YukSekmesi donem={adres.donem ?? '24s'} donemYaz={(donem) => { degistir({ ...adres, donem }); }} />}
        {adres.sekme === 'dis' && <DisBaglantilarSekmesi />}
        {adres.sekme === 'ekran' && <EkranHatalariSekmesi donem={adres.ekranDonem ?? '7g'} donemYaz={(ekranDonem) => { degistir({ ...adres, ekranDonem, kayit: null }); }} secili={adres.kayit} sec={(kayit) => { degistir({ ...adres, kayit }); }} />}
        {adres.sekme === 'veritabani' && <VeritabaniSekmesi />}
        {adres.sekme === 'kapanmalar' && <KapanmalarSekmesi kayit={adres.kayit} sec={(kayit) => { degistir({ ...adres, kayit }); }} git={degistir} />}
        {adres.sekme === 'gunluk' && <GunlukSekmesi suzgec={adres.suzgec} uygula={(suzgec) => { degistir({ ...adres, suzgec }); }} />}
      </div>
    </div>
  );
}
