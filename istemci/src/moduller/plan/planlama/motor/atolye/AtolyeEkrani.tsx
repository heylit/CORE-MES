import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { useCanliPlan } from '../fark.ts';
import type { Derleme, OkunanPlan } from '../kurallar.ts';
import { degisken } from '../ortak.tsx';
import { ATOLYE_GEC_SINIRI, atolyeEkrani, sure, tz, zs } from './kurallar.ts';

// Atölye ekranı (zz36 atolyeAc, cizAtolye): canlı plan, salt okunur, büyük ekran; her tezgâhın şu anki ve sıradaki işi, yanda geciken
// siparişler. Canlı plan sunucudan okunur (Plan ve gerçekleşen ile aynı okuma); taşan ızgara on saniyede bir sayfa kayar, sonda başa döner.
// Esc ve Çık kapatır. Okuyan da yazan da aynısını görür.
const KAYMA_MS = 10_000;

export function AtolyeEkrani({ c, p, cx, now, canliSurum, kapat }: {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; now: number; canliSurum: number | null; kapat: () => void;
}) {
  const d = useCanliPlan(true, c, p, canliSurum);
  const ekran = useMemo(() => (d.tur === 'tamam' && Object.keys(d.canli).length ? atolyeEkrani(c, cx, d.canli, now) : null), [d, c, cx, now]);
  const izgara = useRef<HTMLDivElement | null>(null);
  const kapatRef = useRef(kapat); kapatRef.current = kapat;
  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.preventDefault(); e.stopImmediatePropagation(); kapatRef.current(); };
    document.addEventListener('keydown', tus, true);
    return () => document.removeEventListener('keydown', tus, true);
  }, []);
  useEffect(() => {
    if (!ekran) return undefined;
    const z = setInterval(() => {
      const g = izgara.current; if (!g) return;
      g.scrollTop = g.scrollTop + g.clientHeight >= g.scrollHeight - 4 ? 0 : g.scrollTop + g.clientHeight;
    }, KAYMA_MS);
    return () => clearInterval(z);
  }, [ekran]);
  let govde;
  if (d.tur === 'okunuyor' || d.tur === 'kapali') govde = <p className="tc-pym-ae-not">Canlı plan okunuyor.</p>;
  else if (d.tur === 'hata') govde = <p className="tc-pym-ae-not" data-ton="hata"><Simge ad="alert" boyut="k" />{d.ileti}</p>;
  else if (!ekran) govde = <p className="tc-pym-ae-not"><Simge ad="alert" boyut="k" />Henüz canlı plan yok. Atölye ekranı yalnız onaylanmış planı gösterir; Onay ve canlı sekmesinden canlıya alın.</p>;
  else {
    govde = (
      <div className="tc-pym-ae-govde">
        <div className="tc-pym-ae-izgara" ref={izgara}>
          {ekran.kartlar.map((k) => (
            <section key={k.m} className="tc-pym-ae-kart" data-durum={k.durum} aria-label={`Tezgâh ${k.m}`}>
              <div className="tc-pym-ae-ust">
                <b>{k.m}</b><span>{k.ad}</span>
                <i>{k.durum === 'ariza' ? <><Simge ad="alert" boyut="k" />Arıza</> : k.durum === 'calisiyor' ? <><Simge ad="play" boyut="k" />Çalışıyor</> : <><Simge ad="pause" boyut="k" />Boş</>}</i>
              </div>
              {k.su ? (
                <div className="tc-pym-ae-su">
                  <b>{k.su.job}</b> · {k.su.ad}<small>{`bitiş ${zs(c.D, k.su.C)}`}</small>
                  <span className="tc-pym-ae-bar"><i ref={degisken({ '--o': `${Math.round(k.su.oran * 100)}%` })} /></span>
                </div>
              ) : <div className="tc-pym-ae-su" data-bos="">Şu an iş yok</div>}
              <div className="tc-pym-ae-sonra">{k.sonra ? <>Sıradaki: <b>{k.sonra.job}</b> · {k.sonra.ad} · {tz(c.D, k.sonra.S)}</> : 'Sıradaki iş yok'}</div>
            </section>
          ))}
        </div>
        <aside aria-label="Geciken">
          <h4><Simge ad="alert" boyut="k" />{`Geciken · ${ekran.gec.length}`}</h4>
          {ekran.gec.length ? ekran.gec.slice(0, ATOLYE_GEC_SINIRI).map((x) => (
            <div key={x.j} className="tc-pym-ae-satir"><b>{x.j}</b><span className="tc-pym-tp-rozet" data-durum="gec">{`${sure(x.T)} geç`}</span></div>
          )) : <p className="tc-pym-ae-not">Geciken yok.</p>}
          <p className="tc-pym-ae-not">Salt okunur. Çalışma planındaki değişiklikler onaylanıp canlıya alınmadan burada görünmez.</p>
        </aside>
      </div>
    );
  }
  return createPortal(
    <div className="tc-pym-ae" role="region" aria-label="Atölye ekranı">
      <header>
        <Simge ad="laptop" boyut="k" /><b>Atölye</b><span>{`Canlı plan · sürüm ${canliSurum ?? 0}`}</span><span className="tc-pym-tp-bosluk" />
        <span className="tc-pym-ae-saat">{tz(c.D, now)}</span>
        <button type="button" className="tc-dugme" onClick={kapat}><Simge ad="x" boyut="k" />Çık</button>
      </header>
      {govde}
    </div>,
    document.body,
  );
}
