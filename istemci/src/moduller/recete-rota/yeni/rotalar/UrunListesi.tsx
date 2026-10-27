import { useState } from 'react';
import { Sayfalama } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import { acikRevizyon, kucuk, rotaSahibiOlur, turKisa, yururlukteki, type Malzeme, type Revizyon } from './kurallar.ts';
import type { RotaDuzeni } from './useRotaDuzeni.ts';

const DURUM_ADI = { yururlukte: 'Yürürlükte', taslak: 'Taslak', onay: 'Onay bekliyor', yerel: 'Rota var', yok: 'Rota yok' } as const;
type Durum = keyof typeof DURUM_ADI;
const SAYFA_BOYU = 50;
const DURUM_SUZGECI = [['all', 'Tümü'], ['var', 'Rotalı'], ['acik', 'Taslak ya da onayda'], ['yok', 'Rotasız']] as const;
const TUR_SUZGECI = [['all', 'Tümü'], ['yari', 'YM'], ['mamul', 'MM']] as const;

interface Satir { m: Malzeme; A: Revizyon | null; O: Revizyon | null; adim: number; durum: Durum; son: number }

// Ürün listesi (eski sayfanın sık tablosu): rotası olabilen bütün kartlar ve rota durumu; satıra dokununca şemada açılır.
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
  const seg = (etiket: string, secenekler: readonly (readonly [string, string])[], secili: string, sec: (v: string) => void) => (
    <span className="tc-rr1-seg" role="group" aria-label={etiket}>
      {secenekler.map(([k, l]) => <button key={k} type="button" aria-pressed={secili === k} onClick={() => { sec(k); setSayfa(1); }}>{l}</button>)}
    </span>
  );
  return (
    <section className="tc-rr1-ul" aria-label="Ürün listesi">
      <input className="tc-rr1-metin tc-rr1-ul-ara" type="search" value={ara} placeholder="Malzeme no ya da ad ara" aria-label="Ürün ara" autoComplete="off"
        onChange={(e) => { setAra(e.target.value); setSayfa(1); }} />
      <div className="tc-rr1-top">
        {seg('Tür', TUR_SUZGECI, tur, setTur)}
        {seg('Rota durumu', DURUM_SUZGECI, dr, setDr)}
        <span className="tc-rr1-ipucu">{liste.length} / {hepsi.length} ürün</span>
      </div>
      {liste.length > 0 ? (
        <div className="tc-rr1-tblkap">
          <table className="tc-rr1-rt tc-rr1-ul-tablo" aria-label="Ürünler ve rotaları">
            <thead>
              <tr><th>Malzeme no</th><th>Ad</th><th>Tür</th><th>Rota durumu</th><th className="tc-rr1-sag">Adım</th><th>Son değişiklik</th></tr>
            </thead>
            <tbody>
              {gor.map((x) => {
                const r = x.O ?? x.A;
                return (
                  <tr key={x.m.id} tabIndex={0} title="Şemada aç" onClick={() => { ac(x.m.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ac(x.m.id); } }}>
                    <td className="tc-rr1-kirilmaz"><b>{x.m.code}</b></td>
                    <td>{x.m.name}</td>
                    <td><span className={`tc-rr1-slot tc-rr1-slot-k tc-rr1-slot-${x.m.type}`}>{turKisa(x.m.type)}</span></td>
                    <td>
                      <span className={`tc-rr1-ul-durum tc-rr1-d-${x.durum}`}>{DURUM_ADI[x.durum]}</span>
                      {r && <span className={`tc-rr1-rvchip tc-rr1-rv-${r.status}`}>Rev {r.no}</span>}
                    </td>
                    <td className="tc-rr1-sag">{x.adim ? String(x.adim) : '–'}</td>
                    <td className="tc-rr1-kirilmaz">{x.son ? tarih(x.son) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="tc-rr1-ipucu">{hepsi.length ? 'Bu süzgeçte ürün yok.' : 'Henüz ürün yok. Ürün kartını Malzemeler ve Hizmetler\'de aç.'}</p>
      )}
      {sonSayfa > 1 && <Sayfalama sayfa={gecerli} sayfaBoyu={SAYFA_BOYU} toplam={liste.length} degistir={setSayfa} etiket="Ürün listesi sayfaları" />}
    </section>
  );
}
