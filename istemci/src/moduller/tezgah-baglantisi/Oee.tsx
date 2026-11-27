import type { TezgahOeeCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { Kart, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { Eksikler, GOLGE_NOTU, makineMetni, oranMetni, PencereSecimi, SorguDurumu, sureMetni, useDeneme, usePencere } from './deneme-ortak.tsx';
import { YOK } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Makine = TezgahOeeCevabi['makineler'][number];
type Bilesen = 'kullanilabilirlik' | 'performans' | 'kalite' | 'oee';

// 5 puandan büyük fark renkle ve "≠" ile gösterilir; renk tek başına anlam taşımaz.
const FARK_ESIGI = 0.05;
function Oran({ m, b }: { m: Makine; b: Bilesen }) {
  const t = m.tezgah[b], o = m.modul?.[b] ?? null;
  const farkli = t !== null && o !== null && Math.abs(t - o) > FARK_ESIGI;
  return (
    <>
      <span className={farkli ? 'tc-tzb-fark-deger' : undefined}>{oranMetni(t)}{farkli && ' ≠'}</span>
      <span className="tc-tzb-alt">OEE modülü {m.modul === null ? 'veri yok' : oranMetni(o)}</span>
    </>
  );
}

const sutunlar: Sutun<Makine>[] = [
  { anahtar: 'makine', baslik: 'Makine', hucre: (m) => makineMetni(m.makine, m.cihazAdi) },
  { anahtar: 'oee', baslik: 'OEE', hizala: 'sag', hucre: (m) => <Oran m={m} b="oee" /> },
  { anahtar: 'kul', baslik: 'Kullanılabilirlik', hizala: 'sag', hucre: (m) => <Oran m={m} b="kullanilabilirlik" /> },
  { anahtar: 'perf', baslik: 'Performans', hizala: 'sag', hucre: (m) => <Oran m={m} b="performans" /> },
  { anahtar: 'kal', baslik: 'Kalite', hizala: 'sag', hucre: (m) => <Oran m={m} b="kalite" /> },
  {
    anahtar: 'cevrim', baslik: 'Gerçek / standart çevrim', hizala: 'sag',
    hucre: (m) => (
      <>
        {sureMetni(m.gercekCevrimSaniye === null ? null : Math.round(m.gercekCevrimSaniye))} / {sureMetni(m.standartCevrimSaniye === null ? null : Math.round(m.standartCevrimSaniye))}
        {m.onerilenStandartSaniye !== null && <span className="tc-tzb-alt">Önerilen standart {sureMetni(Math.round(m.onerilenStandartSaniye))}</span>}
      </>
    ),
  },
  { anahtar: 'hiz', baslik: 'Hız düşürme', hizala: 'sag', hucre: (m) => sureMetni(m.hizDusurmeSaniye) },
  { anahtar: 'sure', baslik: 'Çalışma / planlı', hizala: 'sag', hucre: (m) => (m.planliSaniye === null ? YOK : `${sureMetni(m.calismaSaniye)} / ${sureMetni(m.planliSaniye)}`) },
];

export function Oee() {
  const [pencere, pencereSec] = usePencere();
  const sorgu = useDeneme<TezgahOeeCevabi>('oee', pencere);
  const v = sorgu.data;
  return (
    <Kart baslik="OEE denemesi">
      <div className="tc-tzb">
        <p className="tc-tzb-not">{GOLGE_NOTU}</p>
        <PencereSecimi secili={pencere} sec={pencereSec} />
        <SorguDurumu sorgu={sorgu} baslik="OEE" />
        {v && <Eksikler eksikler={v.eksikler} />}
        {v && <Tablo etiket="Tezgâh verisinden OEE" sutunlar={sutunlar} satirlar={v.makineler} satirAnahtari={(m) => m.cihazAdi} bosMesaj="Eşlenmiş makine yok." />}
        {v && (
          <p className="tc-tzb-not">
            Kullanılabilirlik: tezgâhın çalıştığı süre / vardiyadaki planlı süre. Performans: rotadaki standart çevrim × tezgâh adedi / çalışılan süre. Kalite: terminaldeki sağlam / toplam.
            Gerçek çevrim, ardışık sayaç artışları arasındaki sürelerin ortancasıdır; önerilen standart yalnız gösterilir, yazılmaz. Hız düşürme: ilerleme oranının %100’ün altında kaldığı süre.
            “≠”: OEE modülünden 5 puandan fazla farklı.
          </p>
        )}
      </div>
    </Kart>
  );
}
