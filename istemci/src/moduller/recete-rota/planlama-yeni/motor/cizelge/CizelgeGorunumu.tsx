import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { DonemOlcegi, PlanlamaSecimi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { Aralik } from '../harita/kurallar.ts';
import type { Derleme, OkunanPlan } from '../kurallar.ts';
import { HAZIRLANIYOR } from '../ortak.tsx';
import { GunCizelgesi } from './GunCizelgesi.tsx';
import { tezgahSirasi } from './kurallar.ts';
import { OlcekCizelgesi } from './OlcekCizelgesi.tsx';
import './cizelge.css';

// Çizelge (t-tekyer tbAracCubugu ve mercekler, zo-kontrol sgHtml "masa"): araç satırında görünüm çubuğu, sepet ve havuz, mercek (Tezgâhlar,
// Siparişler, Kuyruk, Matris), arama, yardımcı ve ayrıntı, stüdyo ve tam ekran; gövdede seçili mercek. Tezgâhlar dönemin ölçeğini izler:
// gün saatlik katmandır, hafta ve ay gün ızgarası, yıl haftalık ısı.
export type CizelgeMercegi = 'gun' | 'zaman' | 'kuyruk' | 'matris';
const MERCEKLER: [CizelgeMercegi, string, SimgeAdi][] = [['gun', 'Tezgâhlar', 'gantt'], ['zaman', 'Siparişler', 'clock'], ['kuyruk', 'Kuyruk', 'sort'], ['matris', 'Matris', 'grid']];
type Panel = 'sepet' | 'havuz' | 'yardimci' | 'ayrinti';
const PANEL_AD: Record<Panel, string> = { sepet: 'Sepet', havuz: 'Havuz', yardimci: 'Yardımcı', ayrinti: 'Ayrıntı' };

interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: DonemOlcegi; kayma: number; r: Aralik; now: number;
  secim: PlanlamaSecimi; sec: (s: Partial<PlanlamaSecimi>) => void; olcekSec: (o: DonemOlcegi) => void; kaydir: (n: number) => void;
  planYaz: boolean; planKilitle: boolean; studyo: () => void; ust: ReactNode;
}

export function CizelgeGorunumu(o: Ozellikler) {
  const { c, p, cx, olcek, kayma, secim, sec, kaydir, olcekSec } = o;
  const { bildir } = useBildirim();
  const [mercek, setMercek] = useState<CizelgeMercegi>('gun');
  const [sol, setSol] = useState<'sepet' | 'havuz' | null>(null);
  const [sag, setSag] = useState<'yardimci' | 'ayrinti' | null>(null);
  const [tam, setTam] = useState(false);
  const [ara, setAra] = useState('');
  const g = Math.max(0, kayma);
  const secJob = secim.adim && p.ops[secim.adim] ? p.ops[secim.adim]?.job ?? null : secim.siparis;

  const isSec = useCallback((id: string) => { sec({ adim: secim.adim === id ? null : id, siparis: null, tezgah: null }); }, [sec, secim.adim]);
  const tezSec = useCallback((m: string) => { sec({ tezgah: m, adim: null, siparis: null }); }, [sec]);
  // Gün başlığı o günü saatlik açar (ol-gun); gün düğmeleri saatlik günü değiştirir (gy-gun).
  const gunAc = useCallback((t: number) => { olcekSec('gun'); const n = Math.max(0, Math.round((t - Math.floor(o.now / 24) * 24) / 24)); if (n) kaydir(n); }, [olcekSec, kaydir, o.now]);
  const gunSec = useCallback((n: number) => { if (n !== g) kaydir(n - kayma); }, [g, kayma, kaydir]);
  // Arama (tbBul): tezgâh kimliği tezgâhı, sipariş kimliği siparişi seçer.
  const bul = (q: string) => {
    const x = q.trim().toLocaleUpperCase('tr-TR'); setAra(''); if (!x) return;
    const sira = tezgahSirasi(c.D, p, cx); const m = sira.includes(x) ? x : sira.includes(`@${x}`) ? `@${x}` : null;
    if (m) { sec({ tezgah: m, siparis: null, adim: null }); return; }
    const s = c.D.siparisler.find((y) => y.id.toLocaleUpperCase('tr-TR') === x);
    if (!s) { bildir('hata', `${x} bulunamadı.`); return; }
    sec({ siparis: s.id, adim: null, tezgah: null });
  };
  // Tam ekrandan Esc ile çıkılır.
  useEffect(() => {
    if (!tam) return undefined;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { setTam(false); } };
    window.addEventListener('keydown', tus); return () => window.removeEventListener('keydown', tus);
  }, [tam]);

  const nHav = c.D.siparisler.filter((s) => s.havuz).length;
  const pd = (panel: Panel, simge: SimgeAdi, basili: boolean, ac: () => void, n = 0) => (
    <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-tb-pd" aria-pressed={basili} title={PANEL_AD[panel]} onClick={ac}>
      <Simge ad={simge} boyut="k" /><span>{PANEL_AD[panel]}</span>{n > 0 && <b className="tc-pym-mono tc-pym-tb-say">{n}</b>}
    </button>
  );
  const panel = (yer: 'sol' | 'sag', secili: Panel, sekmeler: [Panel, SimgeAdi][], sekSec: (x: Panel) => void, kapat: () => void) => (
    <aside className={`tc-pym-tbk-${yer}`} aria-label={PANEL_AD[secili]}>
      <header className="tc-pym-tbk-pbas">
        <div className="tc-pym-seg" role="tablist">
          {sekmeler.map(([id, sm]) => <button key={id} type="button" role="tab" aria-selected={secili === id} onClick={() => sekSec(id)}><Simge ad={sm} boyut="k" />{PANEL_AD[id]}</button>)}
        </div>
        <span className="tc-pym-ara" />
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Paneli kapat" aria-label="Paneli kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      <div className="tc-pym-tbk-pic"><p className="tc-pym-oz-hazir"><Simge ad="layers" boyut="o" />{PANEL_AD[secili]}: {HAZIRLANIYOR}</p></div>
    </aside>
  );

  let govde: ReactNode;
  if (mercek !== 'gun') govde = <div className="tc-pym-bos"><p className="tc-pym-oz-hazir"><Simge ad="layers" boyut="o" />{MERCEKLER.find((m) => m[0] === mercek)?.[1]}: {HAZIRLANIYOR}</p></div>;
  else if (olcek === 'gun') govde = <GunCizelgesi c={c} p={p} cx={cx} g={g} planYaz={o.planYaz} planKilitle={o.planKilitle} secili={secim.adim} secJob={secJob} isSec={isSec} tezSec={tezSec} gunSec={gunSec} />;
  else govde = <OlcekCizelgesi c={c} p={p} cx={cx} olcek={olcek} kayma={kayma} r={o.r} now={o.now} secili={secim.adim} isSec={isSec} tezSec={tezSec} gunAc={gunAc} kaydir={kaydir} />;

  return (
    <section className="tc-pym-tbk" data-tam={tam ? '' : undefined} aria-label="Çizelge">
      <div className="tc-pym-tbk-arac" role="toolbar" aria-label="Plan araçları">
        {o.ust}
        {pd('sepet', 'layers', sol === 'sepet', () => setSol((x) => (x === 'sepet' ? null : 'sepet')))}
        {pd('havuz', 'box', sol === 'havuz', () => setSol((x) => (x === 'havuz' ? null : 'havuz')), nHav)}
        <div className="tc-pym-seg tc-pym-mercek" role="tablist" aria-label="Görünüm">
          {MERCEKLER.map(([id, ad, sm]) => (
            <button key={id} type="button" role="tab" aria-selected={mercek === id} title={ad} onClick={() => setMercek(id)}><Simge ad={sm} boyut="k" /><span>{ad}</span></button>
          ))}
        </div>
        <label className="tc-pym-tb-ara">
          <Simge ad="search" boyut="k" />
          <input type="search" list="tc-pym-tb-sip" placeholder="Sipariş ya da tezgâh" aria-label="Sipariş ya da tezgâh bul" value={ara}
            onChange={(e) => { const x = e.target.value; setAra(x); if (!(e.nativeEvent instanceof InputEvent) || e.nativeEvent.inputType === 'insertReplacementText') bul(x); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bul(ara); } }} />
          <datalist id="tc-pym-tb-sip">
            {c.D.siparisler.map((s) => <option key={`s${s.id}`} value={s.id}>{c.D.urunler.find((u) => u.id === s.urun)?.ad ?? s.urun}</option>)}
            {c.D.tezgahlar.map((t) => <option key={`t${t.id}`} value={t.id}>{t.ad}</option>)}
          </datalist>
        </label>
        <span className="tc-pym-ara" />
        {pd('yardimci', 'help', sag === 'yardimci', () => setSag((x) => (x === 'yardimci' ? null : 'yardimci')))}
        {pd('ayrinti', 'list', sag === 'ayrinti', () => setSag((x) => (x === 'ayrinti' ? null : 'ayrinti')))}
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Stüdyo" aria-label="Stüdyo" onClick={o.studyo}><Simge ad="wrench" boyut="k" /></button>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-pressed={tam} aria-label={tam ? 'Tam ekrandan çık' : 'Tam ekran'} title={tam ? 'Tam ekrandan çık (Esc)' : 'Tam ekran'} onClick={() => setTam((x) => !x)}><Simge ad="expand" boyut="k" /></button>
      </div>
      <div className="tc-pym-tbk-govde">
        {sol && panel('sol', sol, [['sepet', 'layers'], ['havuz', 'box']], (x) => setSol(x as 'sepet' | 'havuz'), () => setSol(null))}
        <div className="tc-pym-tb" data-mercek={mercek}>{govde}</div>
        {sag && panel('sag', sag, [['yardimci', 'help'], ['ayrinti', 'list']], (x) => setSag(x as 'yardimci' | 'ayrinti'), () => setSag(null))}
      </div>
    </section>
  );
}
