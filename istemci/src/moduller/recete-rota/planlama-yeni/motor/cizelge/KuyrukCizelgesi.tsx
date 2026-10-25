import { useEffect, useMemo, useRef } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYazi, sayiYaz, type Derleme, type OkunanPlan } from '../kurallar.ts';
import { degisken, MOTOR_NOTU } from '../ortak.tsx';
import { KUYRUK_ARALIKLARI, KUYRUK_DURUM, kuyruk } from './kurallar.ts';

// Kuyruk merceği (k-gorunum sKanban, kanbanBagla): her tezgâh bir sütun, kartlar plandaki sırasıyla. Sırayı ve tezgâhı değiştirmek motorun
// hamlesidir: oklar ve tezgâh seçimi görünür, pasiftir (357 b); sürükleme kapalıdır (459/4 a). "Plan masasında gör" işi Siparişler'de seçer.
interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; planYaz: boolean;
  gun: number; gunSec: (n: number) => void; odak: string | null; masadaGor: (id: string) => void;
}

export function KuyrukCizelgesi(o: Ozellikler) {
  const { c, p, cx, gun, odak } = o;
  const sutunlar = useMemo(() => kuyruk(c, p, cx, gun), [c, p, cx, gun]);
  const kap = useRef<HTMLDivElement>(null);
  // Matristen gelen tezgâhın sütunu işaretlenir ve görünür kaydırılır; işaret mercek değişene dek kalır.
  useEffect(() => {
    const k = kap.current; if (!k || !odak) return;
    const s = [...k.querySelectorAll<HTMLElement>('.tc-pym-k-sutun')].find((x) => x.dataset.m === odak);
    if (s) k.scrollLeft = s.offsetLeft - k.offsetLeft - 8;
  }, [odak]);
  const pasif = (ad: string) => `${ad}: ${MOTOR_NOTU}`;

  return (
    <div className="tc-pym-tb-mercek" data-mercek="kuyruk">
      <div className="tc-pym-sira">
        <div className="tc-pym-seg" role="tablist" aria-label="Aralık">
          {KUYRUK_ARALIKLARI.map(([n, ad]) => <button key={n} type="button" role="tab" aria-selected={gun === n} onClick={() => o.gunSec(n)}>{ad}</button>)}
        </div>
        <span className="tc-pym-ara" />
        <span className="tc-pym-kucuk-yazi">Kartı sürükleyip bırakın ya da oklarla sırayı değiştirin; motor her taşımayı önizler.</span>
      </div>
      <div ref={kap} className="tc-pym-kanban" role="region" aria-label="Tezgâh kuyrukları" tabIndex={0}>
        {sutunlar.map((s) => (
          <section key={s.m} className="tc-pym-k-sutun" data-m={s.m} aria-label={`${s.m} kuyruğu`} data-odak={odak === s.m ? '' : undefined}>
            <header className="tc-pym-k-bas">
              <div><b className="tc-pym-mono">{s.m}</b> <span className="tc-pym-kucuk-yazi">{s.ad}</span></div>
              <div className="tc-pym-k-olcu">
                <span>{s.n} iş</span>
                <span className="tc-pym-k-dolu" data-isi={s.isi}><i ref={degisken({ '--w': `${Math.min(100, Math.round(s.dolu * 100))}%` })} /></span>
                <span className="tc-pym-mono">%{Math.round(s.dolu * 100)}</span>
              </div>
            </header>
            <ol className="tc-pym-k-liste" data-m={s.m}>
              {s.kartlar.map((k, i) => {
                const [dad, dsm] = KUYRUK_DURUM[k.durum];
                return (
                  <li key={k.id} className="tc-pym-k-kart" data-id={k.id} data-durum={k.durum} data-gec={k.gec != null ? '' : undefined} ref={degisken({ '--c': k.renk })}>
                    <div className="tc-pym-k-ust">
                      <span className="tc-pym-k-no tc-pym-mono">{i + 1}</span><b className="tc-pym-mono">{k.job}</b><span className="tc-pym-kucuk-yazi">{k.k}</span>
                      <span className="tc-pym-ara" />
                      {k.kilit && <span className="tc-pym-k-ikon" title="Kilitli: motor yerini değiştirmez"><Simge ad="lock" boyut="k" /></span>}
                      <span className="tc-pym-k-durum" data-durum={k.durum}><Simge ad={dsm} boyut="k" />{dad}</span>
                    </div>
                    <div className="tc-pym-k-ad">{k.ad}</div>
                    <div className="tc-pym-k-bilgi">
                      <span><Simge ad="box" boyut="k" />{sayiYaz(k.adet, 0)} adet</span>
                      <span><Simge ad="clock" boyut="k" /><span className="tc-pym-mono">{k.zaman}</span></span>
                      {k.gec != null && <span className="tc-pym-k-gec"><Simge ad="alert" boyut="k" />{saatYazi(k.gec)} gecikme</span>}
                    </div>
                    <div className="tc-pym-k-arac">
                      {o.planYaz && (
                        <>
                          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled="true" aria-label="Sırada öne al" title={pasif('Sırada öne al')}><Simge ad="up" boyut="k" /></button>
                          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled="true" aria-label="Sırada geriye al" title={pasif('Sırada geriye al')}><Simge ad="down" boyut="k" /></button>
                          {k.alt.length > 0 && (
                            <select className="tc-alan-kutu tc-pym-k-tasi" aria-label="Başka tezgâha taşı" title={pasif('Başka tezgâha taşı')} disabled value="">
                              <option value="">Tezgâh değiştir</option>
                              {k.alt.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                          )}
                        </>
                      )}
                      <span className="tc-pym-ara" />
                      <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label="Plan masasında gör" title="Plan masasında gör" onClick={() => o.masadaGor(k.id)}><Simge ad="gantt" boyut="k" /></button>
                    </div>
                  </li>
                );
              })}
              {!s.kartlar.length && <li className="tc-pym-kucuk-yazi tc-pym-k-bos">Bu aralıkta iş yok.</li>}
              {s.fazla > 0 && <li className="tc-pym-kucuk-yazi tc-pym-k-fazla">+{s.fazla} iş daha</li>}
            </ol>
            {s.sonra > 0 && <footer className="tc-pym-kucuk-yazi tc-pym-k-sonra">Aralık dışında {s.sonra} iş daha</footer>}
          </section>
        ))}
      </div>
    </div>
  );
}
