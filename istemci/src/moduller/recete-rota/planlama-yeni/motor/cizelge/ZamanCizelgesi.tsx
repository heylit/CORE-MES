import { useEffect, useMemo, useRef, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { Aralik } from '../harita/kurallar.ts';
import type { Derleme, OkunanPlan } from '../kurallar.ts';
import { degisken, MOTOR_NOTU } from '../ortak.tsx';
import { zamanCizelgesi, type ZamanSatiri } from './kurallar.ts';

// Siparişler merceği (t-tekyer mercek "zaman": zamanAraclari, gantt, lejant): bütün planın tezgâh zaman çizelgesi, tezgâh grupları katlanır,
// fason ayrı grupta. Konumlar saat cinsindendir; saat başına piksel dönemin ölçeğidir (stilde). İşe basmak onu seçer.
interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: DonemOlcegi; kayma: number; r: Aralik; now: number;
  secili: string | null; secJob: string | null; planYaz: boolean; opSec: (id: string) => void;
}

export function ZamanCizelgesi(o: Ozellikler) {
  const { c, p, cx, olcek, kayma, now } = o;
  const v = useMemo(() => zamanCizelgesi(c, p, cx, olcek, o.secJob), [c, p, cx, olcek, o.secJob]);
  const [katli, setKatli] = useState<string[]>([]);
  const kap = useRef<HTMLDivElement>(null);
  // Dönem okları çizelgeyi seçili dönemin başına kaydırır (zz5-olcek-her-yer).
  const a = o.r.a;
  useEffect(() => { const g = kap.current; if (g && kayma) g.scrollLeft = Math.max(0, a * v.px - 40); }, [olcek, kayma, a, v.px]);
  const simdiye = () => kap.current?.scrollTo({ left: Math.max(0, now * v.px - 60), behavior: 'smooth' });
  const katla = (g: string) => setKatli((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));

  const satir = (s: ZamanSatiri) => (
    <div key={s.m} className="tc-pym-g-satir">
      <div className="tc-pym-g-etiket"><b>{s.kod}</b><span title={s.ad}>{s.ad}{s.u != null && <span className="tc-pym-g-u"> · %{Math.round(s.u * 100)}</span>}</span></div>
      <div className="tc-pym-g-serit" data-m={s.m}>
        {s.kapali.map((k) => <i key={k.x} className="tc-pym-g-kapali" ref={degisken({ '--x': k.x, '--w': k.w })} />)}
        {s.ariza.map((k) => <i key={`a${k.x}`} className="tc-pym-g-ariza" title={k.baslik} ref={degisken({ '--x': k.x, '--w': k.w })} />)}
        {v.cizgiler.map((x) => <i key={`c${x}`} className="tc-pym-g-gunc" ref={degisken({ '--x': x })} />)}
        <i className="tc-pym-g-simdi" ref={degisken({ '--x': now })} />
        {v.termin != null && <i className="tc-pym-g-termin" ref={degisken({ '--x': v.termin })} />}
        {s.isler.map((i) => (
          <button key={i.id} type="button" className="tc-pym-g-is" data-job={i.job} data-gec={i.gec ? '' : undefined} data-soluk={i.soluk ? '' : undefined}
            data-secili={o.secili === i.id ? '' : undefined} title={i.baslik} aria-label={i.baslik}
            ref={degisken({ '--x': i.x, '--w': i.w, '--c': i.renk, '--a': `${(i.ayar * 100).toFixed(2)}%` })} onClick={() => o.opSec(i.id)}>
            <i className="tc-pym-g-is-ayar" aria-hidden="true" />{i.kilit && <Simge ad="lock" boyut="k" />}{i.etiket && <span>{i.etiket}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="tc-pym-tb-mercek" data-mercek="zaman">
      <div className="tc-pym-sira tc-pym-arac">
        <label className="tc-pym-anahtar" aria-disabled="true" title={`Kaynak yükü: ${MOTOR_NOTU}`}><input type="checkbox" disabled /><i />Kaynak yükü</label>
        <span className="tc-pym-ara" />
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Grupları katla ya da aç" aria-label="Grupları katla ya da aç"
          onClick={() => setKatli((l) => (l.length ? [] : v.gruplar.map((g) => g.g)))}><Simge ad="layers" boyut="k" /></button>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Şimdiye git" aria-label="Şimdiye git" onClick={simdiye}><Simge ad="target" boyut="k" /></button>
        {o.planYaz && <button type="button" className="tc-dugme tc-pym-kucuk" data-pasif="" aria-disabled="true" title={`Planı geri al: ${MOTOR_NOTU}`}><Simge ad="back" boyut="k" />Planı geri al</button>}
      </div>
      <div ref={kap} className="tc-pym-gantt" tabIndex={0} role="region" aria-label="Plan çizelgesi" data-olcek={olcek}>
        <div className="tc-pym-g-ic" ref={degisken({ '--w': v.saat })}>
          <div className="tc-pym-g-ust">
            <div className="tc-pym-g-kose">Tezgâh</div>
            <div className="tc-pym-g-zaman">
              {v.basliklar.map((b) => (
                <div key={b.x} className="tc-pym-g-gun" data-tatil={b.tatil ? '' : undefined} ref={degisken({ '--x': b.x, '--w': b.w })}>
                  {b.ad}{b.saatler.map((s) => <span key={s.x} className="tc-pym-g-saat" ref={degisken({ '--x': s.x })}>{s.ad}</span>)}
                </div>
              ))}
            </div>
          </div>
          {v.gruplar.map((g) => {
            const kapali = katli.includes(g.g);
            return [
              <button key={`g${g.g}`} type="button" className="tc-pym-g-grup" aria-expanded={!kapali} onClick={() => katla(g.g)}>
                <Simge ad={kapali ? 'chev-right' : 'down'} boyut="k" />{g.g} <span className="tc-pym-g-grup-alt">{g.n} tezgâh{g.u != null ? ` · %${Math.round(g.u * 100)} dolu` : ''}</span>
              </button>,
              ...(kapali ? [] : g.satirlar.map(satir)),
            ];
          })}
          {v.fason.length > 0 && <div className="tc-pym-g-grup">fason</div>}
          {v.fason.map(satir)}
        </div>
      </div>
      <div className="tc-pym-lejant">
        <span><i className="tc-pym-l-ayar" />Ayar</span><span><i className="tc-pym-l-gec" />Geciken sipariş</span><span><i className="tc-pym-l-kapali" />Tezgâh kapalı</span>
        <span><i className="tc-pym-l-ariza" />Arıza, bakım</span><span><Simge ad="lock" boyut="k" />Kilitli</span>
        {o.planYaz && <span className="tc-pym-l-genis">Bir işi sürükleyip başka tezgâha ya da saate bırakın; motor sonucu hesaplar, siz onaylarsınız.</span>}
        <span className={o.planYaz ? 'tc-pym-l-dar' : undefined}>Bir işe dokunun: ayrıntı ve hamleler sağda.</span>
      </div>
    </div>
  );
}
