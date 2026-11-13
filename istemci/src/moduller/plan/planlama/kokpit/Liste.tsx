import { useMemo, useState } from 'react';
import { emirKuyrugu } from '../ortak/emir-no.ts';
import type { Derleme } from '../motor/kurallar.ts';
import { aralikYuku, durumYazisi, durusYazisi, matrisSirasi, satirKimligi, suAndakiDurus, yukYuzdesi, type KokpitEmri, type KokpitIsi, type KokpitModeli } from './kurallar.ts';

// Telefonda tahtanın yerini tutan liste. Tezgâh gözü: önce plana alınacak emirler, sonra tezgâh tezgâh sıradaki işler (ilk üçü, gerisi
// düğmeyle); Sipariş gözü: emirler, geç olan üstte. Satıra dokununca ayrıntı alttan açılır.
const ILK = 3;

export interface ListeOzellikleri {
  m: KokpitModeli; cx: Derleme; goz: 'T' | 'S';
  // Süzgeçten geçen emirler.
  emirler: readonly KokpitEmri[];
  secEmir: string | null; secIs: string | null;
  zaman: (t: number) => string;
  sec: (job: string, isId: string | null) => void;
}

export function Liste({ m, cx, goz, emirler, secEmir, secIs, zaman, sec }: ListeOzellikleri) {
  const [acik, setAcik] = useState<ReadonlySet<string>>(new Set());
  const emir = useMemo(() => new Map(emirler.map((e) => [e.id, e])), [emirler]);
  const gruplar = useMemo(() => {
    const hepsi = Object.values(m.isler), gorunen = hepsi.filter((x) => emir.has(x.job));
    return m.tezgahlar.map((t) => {
      const isler = gorunen.filter((x) => satirKimligi(x) === t.id).sort((a, b) => a.S - b.S);
      const yuzde = t.fason ? null : yukYuzdesi(aralikYuku(cx, hepsi, t.id, m.bas, m.bas + 7 * 24));
      return { t, isler, yuzde };
    }).filter((g) => g.isler.length > 0);
  }, [m, cx, emir]);

  const emirSatiri = (e: KokpitEmri) => (
    <li key={e.id}>
      <button type="button" data-d={e.durum} aria-current={secEmir === e.id} onClick={() => { sec(e.id, null); }}>
        <b>{e.no}</b><span>{e.urun}</span><small>{durumYazisi(e)}{e.bitis === null ? (e.termin === null ? '' : ` · termin ${zaman(e.termin).slice(0, 9)}`) : ` · biter ${zaman(e.bitis).slice(0, 9)}`}</small>
      </button>
    </li>
  );
  const isSatiri = (x: KokpitIsi) => {
    const e = emir.get(x.job);
    return (
      <li key={x.id}>
        <button type="button" data-d={e?.durum ?? 'iyi'} aria-current={secIs === x.id} onClick={() => { sec(x.job, x.id); }}>
          <b>{emirKuyrugu(e?.no ?? x.job)}</b><span>{e ? `${e.urun} · ` : ''}{x.ad}</span><small>{zaman(x.S).slice(6)}{e && e.durum !== 'iyi' ? ` · ${durumYazisi(e)}` : ''}</small>
        </button>
      </li>
    );
  };

  if (goz === 'S') {
    return (
      <ul className="tc-pyq-liste" aria-label="Emirler">
        {matrisSirasi(emirler).map(emirSatiri)}
        {!emirler.length && <li className="tc-pyq-not">Süzgece uyan emir yok.</li>}
      </ul>
    );
  }
  const plansiz = emirler.filter((e) => e.durum === 'plansiz');
  return (
    <div className="tc-pyq-liste" role="group" aria-label="Tezgâhlar ve işler">
      {plansiz.length > 0 && (
        <section>
          <h3><b>Plana alınacak</b><small>{plansiz.length} emir</small></h3>
          <ul>{plansiz.map(emirSatiri)}</ul>
        </section>
      )}
      {gruplar.map(({ t, isler, yuzde }) => {
        const tum = acik.has(t.id) || isler.some((x) => x.id === secIs);
        return (
          <section key={t.id}>
            <h3><b>{t.kod}</b><small>{t.ad}</small>{suAndakiDurus(m, t.id) ? <i data-durus>{durusYazisi(suAndakiDurus(m, t.id)!, zaman)}</i> : yuzde !== null && <i>%{yuzde}</i>}</h3>
            <ul>
              {(tum ? isler : isler.slice(0, ILK)).map(isSatiri)}
              {isler.length > ILK && (
                <li>
                  <button type="button" className="tc-pyq-liste-daha" aria-expanded={tum} onClick={() => { const y = new Set(acik); if (tum) y.delete(t.id); else y.add(t.id); setAcik(y); }}>
                    {tum ? 'İlk üç iş' : `+ ${String(isler.length - ILK)} iş daha`}
                  </button>
                </li>
              )}
            </ul>
          </section>
        );
      })}
      {!plansiz.length && !gruplar.length && <p className="tc-pyq-not">Süzgece uyan emir yok.</p>}
    </div>
  );
}
