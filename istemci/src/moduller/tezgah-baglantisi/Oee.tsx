import type { TezgahOeeCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { Kart, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { Eksikler, GOLGE_NOTU, Kirilmaz, makineMetni, oranMetni, PencereSecimi, SorguDurumu, sureMetni, useDeneme, usePencere } from './deneme-ortak.tsx';
import { YOK } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Makine = TezgahOeeCevabi['makineler'][number];
type Bilesen = 'kullanilabilirlik' | 'performans' | 'kalite' | 'oee';

// 5 puandan büyük fark renkle ve "≠" ile gösterilir; renk tek başına anlam taşımaz.
const FARK_ESIGI = 0.05;
const FARK_ACIKLAMASI = 'OEE modülünden 5 puandan fazla farklı';
function Oran({ m, b }: { m: Makine; b: Bilesen }) {
  const t = m.tezgah[b], o = m.modul?.[b] ?? null;
  const farkli = t !== null && o !== null && Math.abs(t - o) > FARK_ESIGI;
  return (
    <>
      <span className={farkli ? 'tc-tzb-kirilmaz tc-tzb-fark-deger' : 'tc-tzb-kirilmaz'}>
        {oranMetni(t)}
        {farkli && <span role="img" aria-label={FARK_ACIKLAMASI} title={FARK_ACIKLAMASI}> ≠</span>}
      </span>
      {m.modul !== null && <span className="tc-tzb-alt tc-tzb-kirilmaz">OEE modülü {oranMetni(o)}</span>}
    </>
  );
}

const sutunlar: Sutun<Makine>[] = [
  { anahtar: 'makine', baslik: 'Makine', kirilmaz: true, hucre: (m) => <Kirilmaz>{makineMetni(m.makine, m.cihazAdi)}</Kirilmaz> },
  { anahtar: 'oee', kartTamSatir: true, baslik: 'OEE', hizala: 'sag', hucre: (m) => <Oran m={m} b="oee" /> },
  { anahtar: 'kul', kartTamSatir: true, baslik: 'Kullanılabilirlik', hizala: 'sag', hucre: (m) => <Oran m={m} b="kullanilabilirlik" /> },
  { anahtar: 'perf', kartTamSatir: true, baslik: 'Performans', hizala: 'sag', hucre: (m) => <Oran m={m} b="performans" /> },
  { anahtar: 'kal', kartTamSatir: true, baslik: 'Kalite', hizala: 'sag', hucre: (m) => <Oran m={m} b="kalite" /> },
  {
    anahtar: 'cevrim', baslik: 'Gerçek / standart çevrim', hizala: 'sag', kartTamSatir: true,
    hucre: (m) => (
      <>
        <Kirilmaz>{sureMetni(m.gercekCevrimSaniye === null ? null : Math.round(m.gercekCevrimSaniye))} / {sureMetni(m.standartCevrimSaniye === null ? null : Math.round(m.standartCevrimSaniye))}</Kirilmaz>
        {m.onerilenStandartSaniye !== null && <span className="tc-tzb-alt tc-tzb-kirilmaz">Önerilen standart {sureMetni(Math.round(m.onerilenStandartSaniye))}</span>}
      </>
    ),
  },
  { anahtar: 'hiz', baslik: 'Hız düşürme', hizala: 'sag', kirilmaz: true, hucre: (m) => <Kirilmaz>{sureMetni(m.hizDusurmeSaniye)}</Kirilmaz> },
  { anahtar: 'sure', baslik: 'Çalışma / planlı', hizala: 'sag', kirilmaz: true, hucre: (m) => (m.planliSaniye === null ? YOK : <Kirilmaz>{`${sureMetni(m.calismaSaniye)} / ${sureMetni(m.planliSaniye)}`}</Kirilmaz>) },
];

export function Oee() {
  const [pencere, pencereSec] = usePencere();
  const sorgu = useDeneme<TezgahOeeCevabi>('oee', pencere);
  const v = sorgu.data;
  return (
    <Kart baslik="OEE">
      <div className="tc-tzb">
        <p className="tc-tzb-not">{GOLGE_NOTU}</p>
        <PencereSecimi secili={pencere} sec={pencereSec} />
        <SorguDurumu sorgu={sorgu} baslik="OEE" />
        {v && <Eksikler eksikler={v.eksikler} />}
        {v?.makineler.some((m) => m.modul === null) && <p className="tc-tzb-not">Eşlenmemiş makinede OEE modülü verisi yok; oranlar yalnız tezgâh verisinden gösterilir.</p>}
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
