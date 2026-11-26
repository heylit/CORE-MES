import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { AdimDurumuCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Sekmeler, type Sekme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { adimDurumuUcu } from './adim-durumu.ts';
import { gecikti } from './adim-tablosu.ts';
import { AdimTablosu } from './AdimTablosu.tsx';
import { AdimMatrisi } from './AdimMatrisi.tsx';
import { EmreOzelSablon } from './EmreOzelSablon.tsx';
import { HazirlikSablonu } from './HazirlikSablonu.tsx';
import { gorunumOku, type Gorunum } from './adim-matrisi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI } from './gorunum.ts';
import './uretim-emirleri.css';
import './adim-durumu.css';

function Cubuk({ yuzde, etiket }: { yuzde: number; etiket: string }) {
  return (
    <span className="tc-emir-ilerleme-cubuk">
      <progress max={100} value={yuzde} aria-label={`${etiket} yüzde ${String(yuzde)}`} />
      <b>%{yuzde}</b>
    </span>
  );
}

// Adım Durumu (2893, tasarım 2955, 3581, 3738): iki sekme. Adımlar: bütün açık emirler tek matriste (satır emir, sütun OP; Durum ve Hazırlık mercekleri,
// hücre paneli). Hazırlık şablonu: tür başına gerekli maddeler. Tek emrin adım tablosu ve emre özel fark `?emir=` adresiyle açılır (matristeki panelin "Emri aç"ı);
// statüyü sunucu türetir, elle işlemler ayrıntıda ve yetkilidir. Eski `?gorunum=emir|matris|tablo` adresleri Adımlar'a düşer.
const GORUNUM_SEKMELERI: readonly Sekme<Gorunum>[] = [
  { anahtar: 'adimlar', baslik: 'Adımlar', simge: 'grid' },
  { anahtar: 'sablon', baslik: 'Hazırlık şablonu', simge: 'gear' },
];
export function AdimDurumu() {
  const [adres, adresYaz] = useSearchParams();
  const gorunum = gorunumOku(adres.get('gorunum'));
  const emir = Number(adres.get('emir')) || null;
  const degistir = (yap: (y: URLSearchParams) => void) => {
    adresYaz((a) => { const y = new URLSearchParams(a); yap(y); return y; }, { replace: true });
  };
  const gorunumSec = (g: Gorunum) => {
    degistir((y) => { y.delete('emir'); if (g === 'adimlar') y.delete('gorunum'); else y.set('gorunum', g); });
  };
  return (
    <div className="tc-ad-kok">
      <Sekmeler etiket="Adım Durumu görünümü" sekmeler={GORUNUM_SEKMELERI} secili={gorunum} sec={gorunumSec} />
      {gorunum === 'sablon' ? <HazirlikSablonu />
        : emir === null ? <AdimMatrisi />
          : <EmrinAdimDurumu id={emir} geri={() => { degistir((y) => { y.delete('emir'); }); }} />}
    </div>
  );
}

function EmrinAdimDurumu({ id, geri }: { id: number; geri: () => void }) {
  const d = useQuery({ queryKey: anahtarlar.adimDurumu(id), queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(id)) });
  const geriDugmesi = <Dugme simge="chev-left" className="tc-ad-geri" onClick={geri}>Matris</Dugme>;
  if (d.isPending) return <Kart>{geriDugmesi}<DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) return <Kart>{geriDugmesi}<DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Adım durumu alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  const v = d.data;
  return (
    <Kart baslik={v.emirNo} baslikEki={<Rozet ton="bilgi">{DURUM_ETIKETI[v.durum]}</Rozet>}>
      {geriDugmesi}
      <p className="tc-ad-ozet">
        <b>{v.urun.ad}</b> <span className="tc-emir-kod">{v.urun.kod}</span>
        <span>{v.adet} adet</span>
        {v.teslim !== null && <span className={gecikti(v.teslim) ? 'tc-ad-gec' : undefined}>teslim {tarihMetni(v.teslim)}{gecikti(v.teslim) ? ' · gecikti' : ''}</span>}
      </p>
      {v.rotaYuzde !== null && <Cubuk yuzde={v.rotaYuzde} etiket="Rota" />}
      <AdimTablosu emirId={id} />
      <EmreOzelSablon emirId={id} />
    </Kart>
  );
}
