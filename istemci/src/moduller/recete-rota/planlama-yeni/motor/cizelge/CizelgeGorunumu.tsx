import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { DonemOlcegi, PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { Aralik } from '../harita/kurallar.ts';
import type { Derleme, OkunanPlan, Sorun } from '../kurallar.ts';
import { HAZIRLANIYOR } from '../ortak.tsx';
import { GunCizelgesi } from './GunCizelgesi.tsx';
import { tezgahSirasi } from './kurallar.ts';
import { OlcekCizelgesi } from './OlcekCizelgesi.tsx';
import { SagPanel, SolPanel, type SagPanelAdi, type SolPanelAdi } from './Paneller.tsx';
import { ZamanCizelgesi } from './ZamanCizelgesi.tsx';
import './cizelge.css';

// Çizelge (t-tekyer tbAracCubugu ve mercekler, zo-kontrol sgHtml "masa"): araç satırında görünüm çubuğu, sepet ve havuz, mercek (Tezgâhlar,
// Siparişler, Kuyruk, Matris), arama, yardımcı ve ayrıntı, stüdyo ve tam ekran; gövdede seçili mercek. Tezgâhlar dönemin ölçeğini izler:
// gün saatlik katmandır, hafta ve ay gün ızgarası, yıl haftalık ısı.
export type CizelgeMercegi = 'gun' | 'zaman' | 'kuyruk' | 'matris';
const MERCEKLER: [CizelgeMercegi, string, SimgeAdi][] = [['gun', 'Tezgâhlar', 'gantt'], ['zaman', 'Siparişler', 'clock'], ['kuyruk', 'Kuyruk', 'sort'], ['matris', 'Matris', 'grid']];
type Panel = SolPanelAdi | SagPanelAdi;
const PANEL_AD: Record<Panel, string> = { sepet: 'Sepet', havuz: 'Havuz', yardimci: 'Yardımcı', ayrinti: 'Ayrıntı' };

interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: DonemOlcegi; kayma: number; r: Aralik; now: number;
  secim: PlanlamaSecimi; sec: (s: Partial<PlanlamaSecimi>) => void; olcekSec: (o: DonemOlcegi) => void; kaydir: (n: number) => void;
  planYaz: boolean; planKilitle: boolean; planCanliyaAl: boolean; studyo: () => void; ust: ReactNode;
  sor: Sorun[]; guncel: boolean; komut: CalismaKomutu | null;
}
// Eski sayfanın geniş ekran sınırı (t-tekyer sagAcikMi: innerWidth >= 1280); çerçevenin yerine görünümün genişliği.
const GENIS = 1280;

export function CizelgeGorunumu(o: Ozellikler) {
  const { c, p, cx, olcek, kayma, secim, sec, kaydir, olcekSec } = o;
  const { bildir } = useBildirim();
  const [mercek, setMercek] = useState<CizelgeMercegi>('gun');
  const [sol, setSol] = useState<SolPanelAdi | null>(null);
  // Sağ panel elle açılıp kapanana dek geniş ekranda ve Tezgâhlar dışındaki mercekte açıktır; seçim değişince Ayrıntı'ya geçer (sagPanel).
  const [sagAcik, setSagAcik] = useState<boolean | null>(null);
  const [sagSek, setSagSek] = useState<SagPanelAdi>('yardimci');
  const anahtar = `${secim.adim ?? ''}|${secim.siparis ?? ''}|${secim.tezgah ?? ''}`;
  const [sonAnahtar, setSonAnahtar] = useState(anahtar);
  if (anahtar !== sonAnahtar) { setSonAnahtar(anahtar); if (anahtar !== '||') setSagSek('ayrinti'); }
  const kok = useRef<HTMLElement>(null);
  const [genis, setGenis] = useState(false);
  useEffect(() => {
    const el = kok.current?.closest('.tc-pym') ?? kok.current; if (!el) return undefined;
    const olc = () => setGenis(el.getBoundingClientRect().width >= GENIS); olc();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(olc); ro.observe(el); return () => ro.disconnect();
  }, []);
  const sag = (sagAcik ?? (genis && mercek !== 'gun')) ? sagSek : null;
  // Dar ekranda iki panel üst üste biner; biri açılınca öteki kapanır.
  const sagAc = useCallback((x?: SagPanelAdi) => { if (x) setSagSek(x); setSagAcik(true); if (!genis) setSol(null); }, [genis]);
  const solAc = useCallback((x: SolPanelAdi) => { setSol(x); if (!genis) setSagAcik(false); }, [genis]);
  const solDugme = (x: SolPanelAdi) => { if (sol === x) setSol(null); else solAc(x); };
  const sagDugme = (x: SagPanelAdi) => { if (sag === x) setSagAcik(false); else sagAc(x); };
  const [tam, setTam] = useState(false);
  const [ara, setAra] = useState('');
  const g = Math.max(0, kayma);
  const secJob = secim.adim && p.ops[secim.adim] ? p.ops[secim.adim]?.job ?? null : secim.siparis;

  const isSec = useCallback((id: string) => { sec({ adim: secim.adim === id ? null : id, siparis: null, tezgah: null }); }, [sec, secim.adim]);
  const tezSec = useCallback((m: string) => { sec({ tezgah: m, adim: null, siparis: null }); sagAc('ayrinti'); }, [sec, sagAc]);
  // Siparişler merceğinde işe basmak seçer, seçimi kaldırmaz (c-masa op).
  const opSec = useCallback((id: string) => { sec({ adim: id, siparis: null, tezgah: null }); }, [sec]);
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
  const sipSec = useCallback((j: string) => { sec({ siparis: j, adim: null, tezgah: null }); }, [sec]);

  let govde: ReactNode;
  if (mercek === 'zaman') govde = <ZamanCizelgesi c={c} p={p} cx={cx} olcek={olcek} kayma={kayma} r={o.r} now={o.now} secili={secim.adim} secJob={secJob} planYaz={o.planYaz} opSec={opSec} />;
  else if (mercek !== 'gun') govde = <div className="tc-pym-bos"><p className="tc-pym-oz-hazir"><Simge ad="layers" boyut="o" />{MERCEKLER.find((m) => m[0] === mercek)?.[1]}: {HAZIRLANIYOR}</p></div>;
  else if (olcek === 'gun') govde = <GunCizelgesi c={c} p={p} cx={cx} g={g} planYaz={o.planYaz} planKilitle={o.planKilitle} secili={secim.adim} secJob={secJob} isSec={isSec} tezSec={tezSec} gunSec={gunSec} />;
  else govde = <OlcekCizelgesi c={c} p={p} cx={cx} olcek={olcek} kayma={kayma} r={o.r} now={o.now} secili={secim.adim} isSec={isSec} tezSec={tezSec} gunAc={gunAc} kaydir={kaydir} />;

  return (
    <section ref={kok} className="tc-pym-tbk" data-tam={tam ? '' : undefined} aria-label="Çizelge">
      <div className="tc-pym-tbk-arac" role="toolbar" aria-label="Plan araçları">
        {o.ust}
        {pd('sepet', 'layers', sol === 'sepet', () => solDugme('sepet'))}
        {pd('havuz', 'box', sol === 'havuz', () => solDugme('havuz'), nHav)}
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
        {pd('yardimci', 'help', sag === 'yardimci', () => sagDugme('yardimci'))}
        {pd('ayrinti', 'list', sag === 'ayrinti', () => sagDugme('ayrinti'))}
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Stüdyo" aria-label="Stüdyo" onClick={o.studyo}><Simge ad="wrench" boyut="k" /></button>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-pressed={tam} aria-label={tam ? 'Tam ekrandan çık' : 'Tam ekran'} title={tam ? 'Tam ekrandan çık (Esc)' : 'Tam ekran'} onClick={() => setTam((x) => !x)}><Simge ad="expand" boyut="k" /></button>
      </div>
      <div className="tc-pym-tbk-govde">
        {sol && <SolPanel sol={sol} solSec={setSol} kapat={() => setSol(null)} c={c} p={p} planYaz={o.planYaz} secJob={secJob} />}
        <div className="tc-pym-tb" data-mercek={mercek}>{govde}</div>
        {sag && (
          <SagPanel sag={sag} sagSec={setSagSek} kapat={() => setSagAcik(false)} c={c} p={p} cx={cx} sor={o.sor} guncel={o.guncel} komut={o.planYaz ? o.komut : null}
            planYaz={o.planYaz} planKilitle={o.planKilitle} planCanliyaAl={o.planCanliyaAl} secim={secim} secJob={secJob} sipSec={sipSec} solAc={solAc} mercekSec={setMercek} />
        )}
      </div>
    </section>
  );
}
