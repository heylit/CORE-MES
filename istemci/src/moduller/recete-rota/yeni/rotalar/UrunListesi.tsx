import { useState } from 'react';
import { Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import { acikRevizyon, kucuk, rotaSahibiOlur, turKisa, yururlukteki, type Malzeme, type Revizyon } from './kurallar.ts';
import type { RotaDuzeni } from './useRotaDuzeni.ts';

const DURUM_ADI = { yururlukte: 'Yürürlükte', taslak: 'Taslak', onay: 'Onay bekliyor', yerel: 'Rota var', yok: 'Rota yok' } as const;
type Durum = keyof typeof DURUM_ADI;
const SAYFA_BOYU = 50;
const DURUM_SUZGECI = [
  { deger: 'all', baslik: 'Tümü' }, { deger: 'var', baslik: 'Rotalı' }, { deger: 'acik', baslik: 'Taslak ya da onayda' }, { deger: 'yok', baslik: 'Rotasız' },
] as const;
const TUR_SUZGECI = [['all', 'Tümü'], ['yari', 'YM'], ['mamul', 'MM']] as const;

interface Satir { m: Malzeme; A: Revizyon | null; O: Revizyon | null; adim: number; durum: Durum; son: number }

// Ürün listesi: rotası olabilen bütün kartlar ve rota durumu; satıra dokununca şemada açılır.
export function UrunListesi({ duzen, ac }: { duzen: RotaDuzeni; ac: (id: string) => void }) {
  const [ara, setAra] = useState('');
  const [tur, setTur] = useState('all');
  const [dr, setDr] = useState('all');
  const [sayfa, setSayfa] = useState(1);
  const hepsi: Satir[] = [...duzen.h.malzeme.values()].map((m) => {
    const revs = duzen.revler(m.id);
    const A = yururlukteki(revs); const O = acikRevizyon(revs);
    const adim = duzen.adimlar(m.id).length;
    return { m, A, O, adim, durum: O ? O.status as Durum : A ? 'yururlukte' : adim ? 'yerel' : 'yok', son: revs.reduce((t, r) => Math.max(t, r.approvedAt ?? 0, r.created), 0) };
  }).filter((x) => rotaSahibiOlur(x.m, x.adim, duzen.revler(x.m.id).length));
  const grup = (x: Satir) => (x.durum === 'taslak' || x.durum === 'onay' ? 'acik' : x.durum === 'yok' ? 'yok' : 'var');
  const q = kucuk(ara.trim());
  const liste = hepsi.filter((x) => (tur === 'all' || x.m.type === tur) && (dr === 'all' || grup(x) === dr) && (!q || kucuk(`${x.m.code} ${x.m.name}`).includes(q)))
    .sort((a, b) => a.m.code.localeCompare(b.m.code, 'tr'));
  const sonSayfa = Math.max(1, Math.ceil(liste.length / SAYFA_BOYU));
  const gecerli = Math.min(sayfa, sonSayfa);
  const gor = liste.slice((gecerli - 1) * SAYFA_BOYU, gecerli * SAYFA_BOYU);
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'kod', baslik: 'Malzeme no', kirilmaz: true, hucre: (x) => <b>{x.m.code}</b>, csv: (x) => x.m.code },
    { anahtar: 'ad', baslik: 'Ad', hucre: (x) => x.m.name },
    { anahtar: 'tur', baslik: 'Tür', hucre: (x) => <span className={`tc-rr1-slot tc-rr1-slot-${x.m.type}`}>{turKisa(x.m.type)}</span>, csv: (x) => turKisa(x.m.type) },
    {
      anahtar: 'durum', baslik: 'Rota durumu', csv: (x) => DURUM_ADI[x.durum],
      hucre: (x) => {
        const r = x.O ?? x.A;
        return <span className={`tc-rr1-ul-durum tc-rr1-d-${x.durum}`}>{DURUM_ADI[x.durum]}{r && <span className={`tc-rr1-rvchip tc-rr1-rv-${r.status}`}>Rev {r.no}</span>}</span>;
      },
    },
    { anahtar: 'adim', baslik: 'Adım', hizala: 'sag', hucre: (x) => (x.adim ? String(x.adim) : '–') },
    { anahtar: 'son', baslik: 'Son değişiklik', kirilmaz: true, hucre: (x) => (x.son ? tarih(x.son) : '–') },
  ];
  return (
    <Tablo
      etiket="Ürünler ve rotaları" sutunlar={sutunlar} satirlar={gor} satirAnahtari={(x) => x.m.id} satirSec={(x) => { ac(x.m.id); }}
      bosMesaj={hepsi.length ? 'Bu süzgeçte ürün yok.' : 'Henüz ürün yok. Ürün kartını Malzemeler ve Hizmetler\'de aç.'}
      sayfalama={{ sayfa: gecerli, sayfaBoyu: SAYFA_BOYU, toplam: liste.length, degistir: setSayfa, etiket: 'Ürün listesi sayfaları' }}
      arac={{
        arama: { deger: ara, degistir: (v) => { setAra(v); setSayfa(1); }, etiket: 'Ürün ara', yerTutucu: 'Malzeme no ya da ad ara' },
        suzgec: { etiket: 'Rota durumu', secenekler: DURUM_SUZGECI, secili: dr, sec: (v) => { setDr(v); setSayfa(1); } },
        csv: { ad: 'urunler-ve-rotalar', satirlar: liste },
        sag: (
          <span className="tc-rr1-arac-sag">
            <span className="tc-rr1-seg" role="group" aria-label="Tür">
              {TUR_SUZGECI.map(([k, l]) => <button key={k} type="button" aria-pressed={tur === k} onClick={() => { setTur(k); setSayfa(1); }}>{l}</button>)}
            </span>
            <span className="tc-rr1-ipucu">{liste.length} / {hepsi.length} ürün</span>
          </span>
        ),
      }}
    />
  );
}
