import { useEffect, useMemo, useRef, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { DonemOlcegi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { Aralik } from '../harita/kurallar.ts';
import { bekleyenBaslik, type BekleyenSiparis, type Derleme, type OkunanPlan } from '../kurallar.ts';
import { degisken, MOTOR_NOTU } from '../ortak.tsx';
import { zamanCizelgesi, type IkincilSatiri, type ZamanSatiri } from './kurallar.ts';

// Siparişler merceği (t-tekyer mercek "zaman": zamanAraclari, gantt, lejant): bütün planın tezgâh zaman çizelgesi, tezgâh grupları katlanır,
// fason ayrı grupta. Konumlar saat cinsindendir; saat başına piksel dönemin ölçeğidir (stilde). İşe basmak onu seçer.
interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: DonemOlcegi; kayma: number; r: Aralik; now: number;
  secili: string | null; secJob: string | null; planYaz: boolean; opSec: (id: string) => void; komut?: CalismaKomutu | null;
  // 3050 a: bekletilen emirler; işi "Beklemede" deseniyle çizilir.
  bekleyen?: ReadonlyMap<string, BekleyenSiparis>;
}

// Planı geri al (2053): bu oturumda planı değiştiren son adıma (planı kur ya da bekleyen değişikliği uygula) döner. Ondan sonra yapılan
// değişiklikler de birlikte geri alınır; ipucu kaç adım olduğunu söyler. Plan adımı yoksa düğme pasiftir.
const IKINCIL_GRUBU = '~ikincil';
const PLAN_ADIMI = /^Plan çözüldü$|bekleyen değişiklik uygulandı$/iu;
export function planGeriAdimi(k: CalismaKomutu | null | undefined): number | null {
  const i = k?.geriAdimlari().findIndex((x) => PLAN_ADIMI.test(x.ne)) ?? -1;
  return i >= 0 ? i + 1 : null;
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
  const geri = o.planYaz ? planGeriAdimi(o.komut) : null;
  const katla = (g: string) => setKatli((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));

  const satir = (s: ZamanSatiri) => (
    <div key={s.m} className="tc-pym-g-satir">
      <div className="tc-pym-g-etiket"><b>{s.kod}</b><span title={s.ad}>{s.ad}{s.u != null && <span className="tc-pym-g-u"> · %{Math.round(s.u * 100)}</span>}</span></div>
      <div className="tc-pym-g-serit" data-m={s.m}>
        {s.kapali.map((k) => <i key={k.x} className="tc-pym-g-kapali" ref={degisken({ '--x': k.x, '--w': k.w })} />)}
        {s.ariza.map((k) => <i key={`a${k.x}`} className="tc-pym-g-ariza" title={k.baslik} ref={degisken({ '--x': k.x, '--w': k.w })} />)}
        {v.cizgiler.map((x) => <i key={`c${x}`} className="tc-pym-g-gunc" ref={degisken({ '--x': x })} />)}
        <i className="tc-pym-g-simdi" ref={degisken({ '--x': now })} />
        {v.termin != null && <i className="tc-pym-g-termin" title={`Termin ${v.terminYazi ?? ''}`} ref={degisken({ '--x': v.termin })} />}
        {s.isler.map((i) => (
          <button key={i.id} type="button" className="tc-pym-g-is" data-job={i.job} data-gec={i.gec ? '' : undefined} data-soluk={i.soluk ? '' : undefined}
            data-bekle={o.bekleyen?.has(i.job) ? '' : undefined}
            data-secili={o.secili === i.id ? '' : undefined} title={bekleyenBaslik(o.bekleyen, i.job, i.baslik)} aria-label={bekleyenBaslik(o.bekleyen, i.job, i.baslik)}
            ref={degisken({ '--x': i.x, '--w': i.w, '--c': i.renk, '--a': `${(i.ayar * 100).toFixed(2)}%` })} onClick={() => o.opSec(i.id)}>
            <i className="tc-pym-g-is-ayar" aria-hidden="true" />
            {i.degisim.map((d) => <i key={d.a} className="tc-pym-g-is-takim" title={d.baslik} aria-hidden="true" ref={degisken({ '--ta': `${(d.a * 100).toFixed(2)}%`, '--tw': `${(d.w * 100).toFixed(2)}%` })} />)}{o.bekleyen?.has(i.job) ? <Simge ad="pause" boyut="k" /> : i.kilit && <Simge ad="lock" boyut="k" />}{i.etiket && <span>{i.etiket}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  // 3199: ikincil kaynak satırı; kullanım çubuğuna basmak o işi seçer.
  const ikSatir = (s: IkincilSatiri) => (
    <div key={`ik${s.id}`} className="tc-pym-g-satir tc-pym-g-ik" ref={degisken({ '--n': s.serit })}>
      <div className="tc-pym-g-etiket"><b>{s.kod}</b><span title={s.ad}>{s.ad} · <b>{s.adet}</b>{s.izle ? ' · İzle' : ''}</span></div>
      <div className="tc-pym-g-serit">
        {v.cizgiler.map((x) => <i key={`c${x}`} className="tc-pym-g-gunc" ref={degisken({ '--x': x })} />)}
        {s.profil.map((x) => <i key={`p${x.x}`} className="tc-pym-g-ik-profil" data-asim={x.asim ? '' : undefined} ref={degisken({ '--x': x.x, '--w': x.w, '--h': `${(x.oran * 100).toFixed(1)}%` })} />)}
        {s.kesinti.map((x) => <span key={`k${x.x}`} className="tc-pym-g-ik-kesinti" ref={degisken({ '--x': x.x, '--w': x.w })}>{x.ad}</span>)}
        <i className="tc-pym-g-simdi" ref={degisken({ '--x': now })} />
        {s.kullanim.map((k) => (
          <button key={k.id} type="button" className="tc-pym-g-ik-kul" title={k.baslik} aria-label={`${s.kod}: ${k.baslik}`} data-soluk={o.secJob && k.job !== o.secJob ? '' : undefined}
            data-secili={o.secili === k.id ? '' : undefined} ref={degisken({ '--x': k.x, '--w': k.w, '--c': k.renk, '--s': k.serit })} onClick={() => o.opSec(k.id)}>
            {k.w * v.px > 56 && <span>{k.etiket}</span>}
          </button>
        ))}
        {s.degisim.map((d) => <i key={`d${d.x}`} className="tc-pym-g-ik-degisim" title={d.baslik} ref={degisken({ '--x': d.x, '--w': d.w })} />)}
      </div>
    </div>
  );
  const ikKapali = katli.includes(IKINCIL_GRUBU);

  return (
    <div className="tc-pym-tb-mercek" data-mercek="zaman">
      <div className="tc-pym-sira tc-pym-arac">
        <label className="tc-pym-anahtar" aria-disabled="true" title={`Kaynak yükü: ${MOTOR_NOTU}`}><input type="checkbox" disabled /><i />Kaynak yükü</label>
        <span className="tc-pym-ara" />
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Grupları katla ya da aç" aria-label="Grupları katla ya da aç"
          onClick={() => setKatli((l) => (l.length ? [] : v.gruplar.map((g) => g.g)))}><Simge ad="layers" boyut="k" /></button>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Şimdiye git" aria-label="Şimdiye git" onClick={simdiye}><Simge ad="target" boyut="k" /></button>
        {o.planYaz && (
          <button type="button" className="tc-dugme tc-pym-kucuk" data-pasif={geri === null ? '' : undefined} aria-disabled={geri === null}
            title={geri === null ? 'Bu oturumda geri alınacak plan çözümü yok.' : geri === 1 ? 'Son plan çözümünü geri al' : `Son plan çözümünü ve ondan sonraki ${String(geri - 1)} değişikliği geri al`}
            onClick={() => { if (geri !== null) o.komut?.geriDon(geri); }}><Simge ad="back" boyut="k" />Planı geri al</button>
        )}
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
          {v.ikincil.length > 0 && (
            <button type="button" className="tc-pym-g-grup" aria-expanded={!ikKapali} onClick={() => katla(IKINCIL_GRUBU)}>
              <Simge ad={ikKapali ? 'chev-right' : 'down'} boyut="k" />İkincil kaynaklar <span className="tc-pym-g-grup-alt">{v.ikincil.length} kaynak · tezgâhla birlikte boş olmalı</span>
            </button>
          )}
          {!ikKapali && v.ikincil.map(ikSatir)}
        </div>
      </div>
      <div className="tc-pym-lejant">
        <span><i className="tc-pym-l-ayar" />Ayar</span><span><i className="tc-pym-l-gec" />Geciken sipariş</span><span><i className="tc-pym-l-kapali" />Tezgâh kapalı</span>
        <span><i className="tc-pym-l-ariza" />Arıza, bakım</span><span><Simge ad="lock" boyut="k" />Kilitli</span>
        {o.bekleyen?.size ? <span><i className="tc-pym-l-bekle" />Beklemede</span> : null}
        {v.ikincil.length > 0 && (
          <>
            <span><i className="tc-pym-l-ik-profil" />Kaynak doluluğu</span><span><i className="tc-pym-l-ik-asim" />Kapasite aşımı</span>
            <span><i className="tc-pym-l-ik-kesinti" />Kesinti</span>
            {v.ikincil.some((x) => x.takim) && <span><i className="tc-pym-l-ik-degisim" />Takım değişimi</span>}
          </>
        )}
        {o.planYaz && <span className="tc-pym-l-genis">Bir işi sürükleyip başka tezgâha ya da saate bırakın; motor sonucu hesaplar, siz onaylarsınız.</span>}
        <span className={o.planYaz ? 'tc-pym-l-dar' : undefined}>Bir işe dokunun: ayrıntı ve hamleler sağda.</span>
      </div>
    </div>
  );
}
