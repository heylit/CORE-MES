import { useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { AdimAdim } from './AdimAdim.tsx';
import { Hamleler, type HamleOzellikleri } from './Hamleler.tsx';
import { BEKLEME_ESIGI, adimBeklemesi, durumYazisi, enCokBekleyen, satirKimligi, sureYaz, tasinabilir, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

// Seçili emrin ayrıntısı: adımları, yerleri ve seçili adım için tezgâh seçenekleri. Bilgisayarda tahtanın yanında, telefonda alttan açılır;
// telefonda taşıma buradaki düğmelerle yapılır. Matriste çözüm buradadır: neden geç olduğu ve seçenekler adımlardan önce gelir.
export interface AyrintiOzellikleri extends Pick<HamleOzellikleri, 'zaman' | 'uygula' | 'surum' | 'bekle'> {
  m: KokpitModeli; e: KokpitEmri; secIs: string | null;
  adimSec: (isId: string) => void;
  kapat: () => void;
  matris?: boolean;
  // Son uygulanan hamlenin sonucu (Matris).
  ileti?: string | null;
}

export function Ayrinti({ m, e, secIs, zaman, uygula, surum, bekle = false, adimSec, kapat, matris = false, ileti = null }: AyrintiOzellikleri) {
  const kod = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  // Plana alma yolu (3229 a): açılış bugünkü hızlı yoldur.
  const [adimAdim, setAdimAdim] = useState(false);
  const adimli = adimAdim && e.durum === 'plansiz';
  const secili = secIs ? m.isler[secIs] : undefined;
  const neden = matris && (e.durum === 'gec' || e.durum === 'risk') ? enCokBekleyen(m, e) : null;
  const adimlar = (
    <>
      <h3>Adımlar</h3>
      <ol className="tc-pyq-adimlar">
        {e.adimlar.map((a, i) => {
          const x = m.isler[a.id], b = matris ? adimBeklemesi(m, e, i) : null;
          return (
            <li key={a.id}>
              <button type="button" aria-current={secIs === a.id} disabled={!x} onClick={() => { adimSec(a.id); }}>
                <b>{i + 1}. {a.ad}</b>
                <small>
                  {x ? `${kod.get(satirKimligi(x)) ?? x.m} · ${zaman(x.S).slice(6)} – ${zaman(x.C).slice(6)}${x.basladi ? ' · sürüyor' : ''}` : 'plansız'}
                  {b !== null && b.acik >= BEKLEME_ESIGI && <em> · {sureYaz(b.sure)} bekler</em>}
                </small>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
  const cozum = e.durum === 'plansiz' ? (
    <>
      <h3>Plana al</h3>
      <span className="tc-pyq-seg" role="group" aria-label="Plana alma yolu">
        <button type="button" aria-pressed={!adimAdim} onClick={() => { setAdimAdim(false); }}>Hızlı (ilk adım)</button>
        <button type="button" aria-pressed={adimAdim} onClick={() => { setAdimAdim(true); }}>Adım adım</button>
      </span>
      {adimAdim ? <AdimAdim key={e.id} m={m} e={e} zaman={zaman} uygula={uygula} surum={surum} bekle={bekle} />
        : <Hamleler m={m} e={e} isId={null} zaman={zaman} uygula={uygula} surum={surum} bekle={bekle} />}
    </>
  ) : (
    <>
      <h3>{secili ? `${secili.ad}: tezgâh seçenekleri` : 'Erkene alma seçenekleri'}</h3>
      {secili && tasinabilir(secili) ? <p className="tc-pyq-not">{tasinabilir(secili)}</p> : <Hamleler m={m} e={e} isId={secIs} zaman={zaman} uygula={uygula} surum={surum} bekle={bekle} yalnizKazanc={matris} />}
    </>
  );
  return (
    <aside className="tc-pyq-ayrinti" aria-label={`${e.no} ayrıntısı`} data-d={e.durum}>
      <header>
        <div><b>{e.no}</b><small>{e.urun} · {e.adet} adet</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Ayrıntıyı kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      <dl>
        <div><dt>Durum</dt><dd data-d={e.durum}>{durumYazisi(e)}</dd></div>
        <div><dt>Termin</dt><dd>{e.termin === null ? '–' : zaman(e.termin)}</dd></div>
        <div><dt>Plandaki bitiş</dt><dd>{e.bitis === null ? '–' : zaman(e.bitis)}</dd></div>
      </dl>
      {neden && (
        <p className="tc-pyq-neden">
          Neden {e.durum === 'gec' ? 'geç' : 'riskli'}: {neden.k + 1}. adım ({e.adimlar[neden.k]?.ad}) {kod.get(neden.tezgah) ?? neden.tezgah} tezgâhında {sureYaz(neden.bekleme.sure)} sıra bekliyor.
        </p>
      )}
      {ileti && <p className="tc-pyq-sonuc" role="status">{ileti}</p>}
      {adimli ? cozum : matris ? <>{cozum}{adimlar}</> : <>{adimlar}{cozum}</>}
    </aside>
  );
}
