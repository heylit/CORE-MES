import { useRef, useState } from 'react';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYaz, type Derleme, type OkunanPlan } from '../../motor/kurallar.ts';
import { MOTOR_NOTU } from '../../motor/ortak.tsx';
import { siraDegisti, siraKur, siraTasi, siraTezgahlari, siraYon, type TezgahSirasi } from './kurallar.ts';
import './sira.css';

// Tezgâh sırası aracı (w-v20 v20SiraGovde): tezgâh seçilir, sıradaki işler tutup sürüklenir ya da oklarla taşınır. Uygula yeni sırayı motora
// verir (hamleDene); motorun önizlemesi yeni ekranda yok, Uygula görünür ve pasiftir (357 b). Deneme sırası yalnız bu pencerededir, çalışmaya
// yazılmaz; plan değişince baştan kurulur. Okuyan da aynı listeyi ve düğmeleri görür; düğmeler ona pasiftir.
const YETKISIZ = 'Plan yazma yetkiniz yok.';

export function TezgahSirasiPaneli({ c, p, cx, m, yaz, kapat }: {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; m: string | null; yaz: boolean; kapat: () => void;
}) {
  const { bildir } = useBildirim();
  const tez = siraTezgahlari(cx);
  const ilkM = m && tez.includes(m) ? m : tez[0] ?? null;
  const [q, setQ] = useState<TezgahSirasi | null>(() => (ilkM ? siraKur(p, cx, ilkM) : null));
  const [sonP, setSonP] = useState(p);
  if (p !== sonP) { setSonP(p); setQ(q && cx.M[q.m] ? siraKur(p, cx, q.m) : ilkM ? siraKur(p, cx, ilkM) : null); }
  const tutulan = useRef<string | null>(null);
  const [hedef, setHedef] = useState<string | null>(null);
  const sabit = (id: string) => !!c.locks[id];
  const yeni = (x: TezgahSirasi | 'sabit' | null) => { if (x === 'sabit') bildir('bilgi', 'Sabit işin sırası değişmez.'); else if (x) setQ(x); };
  const kok = useRef<HTMLElement | null>(null);
  const yon = (id: string, y: -1 | 1) => {
    if (!q) return; yeni(siraYon(q, id, y, sabit));
    requestAnimationFrame(() => kok.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] [data-yon="${y}"]`)?.focus());
  };
  const degisti = q ? siraDegisti(q) : false;
  return (
    <section ref={kok} className="tc-pym-yp tc-pym-kb tc-pys" role="dialog" aria-label="Tezgâh sırası">
      <header>
        <b><Simge ad="sort" boyut="k" />Tezgâh sırası</b>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat (Esc)" aria-label="Kapat (Esc)" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!q ? <p>Bu planda sırası olan tezgâh yok.</p> : (
        <>
          <label className="tc-alan">
            <span className="tc-alan-etiket">Tezgâh</span>
            <select className="tc-alan-kutu" value={q.m} onChange={(e) => setQ(siraKur(p, cx, e.target.value))}>
              {tez.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <p className="tc-pym-kucuk-yazi">Sıradaki işleri tutup sürükleyin ya da oklarla taşıyın; sonra Uygula. Motor yeni sırayı korur, saatleri yeniden hesaplar. Sabit işin yeri değişmez.</p>
          {q.ids.length ? (
            <ol className="tc-pys-liste" aria-label={`${q.m} kuyruğu`}>
              {q.ids.map((id, i) => {
                const r = p.ops[id]; const s = sabit(id);
                return (
                  <li key={id} data-id={id} data-sabit={s ? '' : undefined} data-yeni={id !== q.ilk[i] ? '' : undefined} data-hedef={hedef === id ? '' : undefined}
                    draggable={yaz && !s}
                    onDragStart={(e) => { tutulan.current = id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* bazı tarayıcılar reddeder */ } }}
                    onDragOver={(e) => { if (!tutulan.current || tutulan.current === id || s) return; e.preventDefault(); setHedef(id); }}
                    onDragLeave={() => setHedef((h) => (h === id ? null : h))}
                    onDrop={(e) => { const t = tutulan.current; if (!t) return; e.preventDefault(); tutulan.current = null; setHedef(null); yeni(siraTasi(q, t, id, sabit)); }}
                    onDragEnd={() => { tutulan.current = null; setHedef(null); }}>
                    <span className="tc-pys-tut" aria-hidden="true"><Simge ad="more" boyut="k" /></span>
                    <span className="tc-pys-no tc-pym-mono">{i + 1}</span>
                    <span className="tc-pys-ic">
                      <b className="tc-pym-mono">{id}</b>
                      <small>{cx.byId[id]?.ad ?? ''} · <span className="tc-pym-mono">{saatYaz(c.D, r?.S)}</span>{s ? ' · sabit' : ''}</small>
                    </span>
                    {(['-1', '1'] as const).map((y) => {
                      const n = Number(y) as -1 | 1;
                      return (
                        <button key={y} type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" data-yon={y} aria-label={`${id} bir ${n < 0 ? 'yukarı' : 'aşağı'}`}
                          aria-disabled={yaz ? undefined : 'true'} title={yaz ? `${id} bir ${n < 0 ? 'yukarı' : 'aşağı'}` : YETKISIZ} onClick={yaz ? () => yon(id, n) : undefined}>
                          <Simge ad={n < 0 ? 'up' : 'down'} boyut="k" />
                        </button>
                      );
                    })}
                  </li>
                );
              })}
            </ol>
          ) : <p className="tc-pym-kucuk-yazi">Bu tezgâhta sırada iş yok.</p>}
          <div className="tc-pym-dugmeler">
            {degisti && <button type="button" className="tc-dugme tc-pym-kucuk" onClick={() => setQ({ ...q, ids: q.ilk })}><Simge ad="rotate" boyut="k" />Baştaki sıraya dön</button>}
            <button type="button" className="tc-dugme tc-pym-kucuk tc-dugme-birincil" aria-disabled="true" title={`Uygula: ${yaz ? (degisti ? MOTOR_NOTU : 'Sıra değişmedi.') : YETKISIZ}`}>
              <Simge ad="check" boyut="k" />Uygula
            </button>
          </div>
        </>
      )}
    </section>
  );
}
