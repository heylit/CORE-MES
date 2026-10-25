import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { planGuncel } from '../../durum.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { bitenler, derle, girdiKur, malzemeHazir, plandanBitenler, simdiSaati, type Derleme, type OkunanPlan } from '../kurallar.ts';
import { MOTOR_NOTU } from '../ortak.tsx';
import type { AtolyeSekmesi } from './Atolye.tsx';
import { Brif, Bugun } from './Bugun.tsx';
import { Izgara } from './Izgara.tsx';
import { KartKatmani, type AcikKart, type Ankraj } from './Kartlar.tsx';
import {
  canliFark, secKacis, gunAnahtari, gunYeni, ilkOlcek, OLCEKLER, sipBilgi, siparisler, sure, suzSayisi, type AtolyeOlcegi, type SiparisBilgisi, type Suzgec,
} from './kurallar.ts';
import { Ray } from './Ray.tsx';

// Tezgâh panosu (zz36 TP): üst çubuk, sipariş rayı, tezgâh çizelgesi, Bugün ve kartlar. Plan sunucuda çözülür (357 b); motor isteyen her
// eylem (dene, olay, iyileştir, taşı, böl, çözüm yolları) görünür ama pasiftir. Kilit, donuk bölge ve brifing tercihi çalışmaya yalnız
// `komut.degistir`le yazılır (221 c); seçim iskeletin ortak seçimidir.

export interface Ortam {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; now: number; donuk: number; hazir: Record<string, number>;
  bilgi: Map<string, SiparisBilgisi>; liste: SiparisBilgisi[];
  suz: Suzgec | null; suzSec: (f: Suzgec | null) => void;
  secJob: string | null; secOp: string | null;
  yaz: boolean; o: PlanlamaEkranOzellikleri;
  opSec: (id: string, a?: Ankraj) => void; sipSec: (j: string) => void; sipGoster: (j: string) => void; opGit: (id: string) => void;
  kartAc: (k: AcikKart, a?: Ankraj) => void; kartKapat: () => void;
  olcek: AtolyeOlcegi; olcekSec: (z: AtolyeOlcegi) => void; sekSec: (s: AtolyeSekmesi) => void;
  bugunAc: (x: boolean) => void; brifAc: () => void;
}

interface Ozellikler { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan; sekSec: (s: AtolyeSekmesi) => void; onayda: number }

export function Pano({ o, c, p, sekSec, onayda }: Ozellikler) {
  const { komut, yetki, secim, sec } = o;
  const emirler = o.depo.durum?.emirler ?? null;
  const cx = useMemo(() => derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p))), [c, p, emirler]);
  const hazir = useMemo(() => malzemeHazir(cx), [cx]);
  const liste = useMemo(() => siparisler(c, p, cx, hazir), [c, p, cx, hazir]);
  const bilgi = useMemo(() => new Map(liste.map((s) => [s.id, s])), [liste]);
  const now = simdiSaati(c);
  const donuk = Number(c.w.dondurma) || 0;
  const [olcek, setOlcek] = useState<AtolyeOlcegi>(() => ilkOlcek(typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [suz, suzSec] = useState<Suzgec | null>(null);
  const [rayAcik, setRayAcik] = useState(false);
  const [bugunAcik, setBugunAcik] = useState(false);
  const bugun = gunAnahtari(Date.now());
  // Brifing günün ilk açılışında bir kez (eski gunBasla: geniş ekranda, açılışta gün yazılır); kapatmak yalnız gizler. Eskide gün bu tarayıcının
  // kaydındaydı; ortak çalışmaya yazılsa ilk açan herkesin brifingini kapatırdı, bu yüzden tarayıcıda tutulur.
  const [brif, setBrif] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768 && brifGunu() !== bugun);
  useEffect(() => { if (brif) brifGunuYaz(bugun); }, [brif, bugun]);
  const [kart, setKart] = useState<{ k: AcikKart; a: Ankraj | null } | null>(null);
  const [parla, setParla] = useState<string | null>(null);
  const kap = useRef<HTMLDivElement | null>(null);
  const pano = useRef<HTMLDivElement | null>(null);
  const yaz = komut !== null && yetki.planYaz;
  const { bildir } = useBildirim();

  // Seçili adımın siparişi seçili sipariş sayılır.
  const secOp = secim.adim && p.ops[secim.adim] ? secim.adim : null;
  const secJob = secOp ? p.ops[secOp]?.job ?? null : secim.siparis && cx.jobs[secim.siparis] ? secim.siparis : null;

  const kartAc = useCallback((k: AcikKart, a?: Ankraj) => setKart({ k, a: a ?? null }), []);
  const kartKapat = useCallback(() => setKart(null), []);
  const opSec = useCallback((id: string, a?: Ankraj) => { sec({ adim: id, siparis: null, tezgah: null }); setKart({ k: { tur: 'op', id }, a: a ?? null }); }, [sec]);
  const sipSec = useCallback((j: string) => { sec({ siparis: secJob === j ? null : j, adim: null, tezgah: null }); }, [sec, secJob]);
  // Bugün, brifing ve kartlardan siparişe gidiş: ray açılır, sipariş seçilir.
  const sipGoster = useCallback((j: string) => { sec({ siparis: j, adim: null, tezgah: null }); setKart(null); setRayAcik(true); }, [sec]);
  // Akıştaki adım çizelgede gösterilir: pano ona kayar, çubuk bir an parlar.
  const opGit = useCallback((id: string) => {
    const r = p.ops[id]; if (!r) return;
    sec({ adim: id, siparis: null, tezgah: null }); setRayAcik(false); setParla(id);
    requestAnimationFrame(() => {
      const pn = pano.current; const el = pn?.querySelector<HTMLElement>(`[data-id="${secKacis(id)}"]`); if (!pn || !el) return;
      const sat = el.closest<HTMLElement>('[data-m]');
      const az = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      pn.scrollTo?.({ left: Math.max(0, el.offsetLeft - pn.clientWidth / 3), top: Math.max(0, (sat?.offsetTop ?? 0) - pn.clientHeight / 3), behavior: az ? 'auto' : 'smooth' });
    });
  }, [p, sec]);
  useEffect(() => { if (!parla) return undefined; const z = setTimeout(() => setParla(null), 1600); return () => clearTimeout(z); }, [parla]);
  const brifKapat = useCallback(() => setBrif(false), []);
  // Gün başı ve bugünün özeti çalışmaya sessiz yazılır (eski gunBasla, gunKaydet; iz, bildirim ve geri alma yok).
  useEffect(() => {
    if (!yaz) return;
    const g = gunYeni(c, p, bugun);
    if (g) komut.degistir('Gün özeti', (t) => { (t as Record<string, unknown>).tpGun = g; }, { sessiz: true });
  }, [yaz, komut, c, p, bugun]);

  // Pano kabın kalan yüksekliğini alır (boyut): üstte başlık, altta telefonda alt menü.
  useLayoutEffect(() => {
    const olc = () => {
      const k = kap.current; if (!k) return;
      const alt = document.querySelector<HTMLElement>('.tc-kabuk-alt');
      const altH = alt && alt.offsetParent ? alt.offsetHeight : 0;
      k.style.setProperty('--tc-pym-tp-yuk', `${Math.max(320, window.innerHeight - k.getBoundingClientRect().top - altH - 8)}px`);
    };
    olc(); window.addEventListener('resize', olc);
    return () => window.removeEventListener('resize', olc);
  }, []);

  // Klavye: Esc kartı ya da seçimi kapatır, 1-5 ölçek, / arama, Ctrl+Z geri al. Yazı alanında çalışmaz.
  const tuslar = useRef({ kart, secJob, secOp, sec, komut, yaz });
  tuslar.current = { kart, secJob, secOp, sec, komut, yaz };
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null; const yazi = !!t?.closest?.('input, textarea, select, [contenteditable]');
      const x = tuslar.current;
      if (e.key === 'Escape') {
        if (x.kart) { e.preventDefault(); setKart(null); return; }
        if (!yazi && (x.secJob || x.secOp)) { e.preventDefault(); x.sec({ siparis: null, adim: null, tezgah: null }); }
        return;
      }
      if (yazi || e.altKey) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLocaleLowerCase('tr-TR') === 'z' && !e.shiftKey) {
        if (x.yaz && x.komut?.geriAlinabilir()) { e.preventDefault(); x.komut.geriAl(); }
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const i = '12345'.indexOf(e.key);
      if (i >= 0 && e.key.length === 1) { e.preventDefault(); setOlcek(OLCEKLER[i]?.[0] ?? 72); return; }
      if (e.key === '/') { const a = kap.current?.querySelector<HTMLInputElement>('input[type="search"]'); if (a) { e.preventDefault(); setRayAcik(true); a.focus(); } }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, []);

  const ort: Ortam = {
    c, p, cx, now, donuk, hazir, bilgi, liste, suz, suzSec, secJob, secOp, yaz, o, opSec, sipSec, sipGoster, opGit, kartAc, kartKapat,
    olcek, olcekSec: setOlcek, sekSec, bugunAc: setBugunAcik, brifAc: () => { setBrif(true); setKart(null); },
  };
  const ozet = p.ozet;
  const fark = useMemo(() => canliFark(c, p), [c, p]);
  const farkli = fark.farkli || !planGuncel(c);
  const ns = suzSayisi(suz);
  const geriVar = yaz && !!komut?.geriAlinabilir();
  const ust = (
    <header className="tc-pym-tp-ust">
      <button type="button" className="tc-dugme tc-pym-hayalet tc-pym-tp-dar" aria-label="Siparişler" aria-expanded={rayAcik} onClick={() => setRayAcik((x) => !x)}><Simge ad="list" boyut="k" /></button>
      {!fark.var ? (
        <span className="tc-pym-tp-durum" title="Henüz canlıya alınmış plan yok"><Simge ad="edit" boyut="k" />Çalışma<span data-ikincil=""> · canlı yok</span></span>
      ) : fark.say ? (
        <span className="tc-pym-tp-durum" title="Canlı plandan farklı"><Simge ad="edit" boyut="k" />{`Taslak · ${fark.say}`}<span data-ikincil=""> değişiklik</span></span>
      ) : (
        <span className="tc-pym-tp-durum" data-ton="ayni" title="Çalışma planı canlı planla aynı"><Simge ad="check" boyut="k" />Canlı planla aynı</span>
      )}
      {onayda > 0 && (
        <button type="button" className="tc-pym-tp-durum" data-ton="onayda" title="Onay sekmesini aç" onClick={() => sekSec('onay')}><Simge ad="clock" boyut="k" />{`${onayda} onayda`}</button>
      )}
      <div className="tc-pym-tp-olc">
        <span title="Geciken sipariş"><b data-ton={ozet.late ? 'kotu' : 'iyi'}>{ozet.late}</b> <span data-ad="">geciken</span></span>
        <span><b>{sure(ozet.wT)}</b> <span data-ad="">gecikme</span></span>
        {yetki.maliyetOku && <span data-kar="" title="Kâr kayıtlı planda yok"><b>—</b> <span data-ad="">kâr</span></span>}
      </div>
      <span className="tc-pym-tp-bosluk" />
      <div className="tc-pym-tp-grup" role="group" aria-label="Ölçek">
        {OLCEKLER.map(([z, a]) => <button key={z} type="button" aria-pressed={olcek === z} onClick={() => setOlcek(z)}>{a}</button>)}
      </div>
      <button type="button" className="tc-dugme tc-pym-hayalet" data-suz={ns ? '' : undefined} aria-label="Süz: tezgâh, istasyon, üretim emri" title="Süz"
        onClick={(e) => kartAc({ tur: 'suz' }, ankraj(e))}>
        <Simge ad="eye" boyut="k" />{ns > 0 && <span className="tc-pym-tp-tsay">{ns}</span>}
      </button>
      <div className="tc-pym-tp-grup" data-geri="" role="group" aria-label="Geri al">
        <button type="button" aria-label="Geri al" title="Geri al (Ctrl+Z)" aria-disabled={!geriVar} onClick={() => { if (geriVar) komut?.geriAl(); }}><Simge ad="back" boyut="k" /></button>
        <button type="button" aria-label="Karar geçmişi ve taslağı sıfırla" title="Karar geçmişi, taslağı sıfırla" onClick={(e) => kartAc({ tur: 'geri' }, ankraj(e))}><Simge ad="down" boyut="k" /></button>
      </div>
      <button type="button" className="tc-dugme" aria-disabled="true" aria-label="Şu olursa: denemeler" title={`Çalışma planını bozmadan farklı yollar dene ve karşılaştır. ${MOTOR_NOTU}`}>
        <Simge ad="lab" boyut="k" /><span data-ikincil="" data-metin="">Dene</span>
      </button>
      <button type="button" className="tc-dugme" aria-disabled="true" aria-label="Olay: arıza, acil sipariş, malzeme, personel ya da fason" title={`Olay: arıza, acil sipariş, malzeme, personel ya da fason. ${MOTOR_NOTU}`}>
        <Simge ad="plus" boyut="k" /><span data-ikincil="" data-metin="">Olay</span>
      </button>
      <button type="button" className="tc-dugme" aria-disabled="true" aria-label="İyileştir" title={`Motor planı kısa sürede iyileştirir. ${MOTOR_NOTU}`}>
        <Simge ad="bolt" boyut="k" /><span data-ikincil="" data-metin="">İyileştir</span>
      </button>
      {farkli && yaz && yetki.planStudyo && (
        <button type="button" className="tc-dugme tc-dugme-birincil" aria-label="Onaya gönder" onClick={(e) => kartAc({ tur: 'gonder' }, ankraj(e))}>
          <Simge ad="upload" boyut="k" /><span data-metin="">Onaya gönder</span>{fark.say > 0 && <span className="tc-pym-tp-tsay">{fark.say}</span>}
        </button>
      )}
      <button type="button" className="tc-dugme tc-pym-hayalet" aria-label="Diğer" onClick={(e) => kartAc({ tur: 'menu' }, ankraj(e))}><Simge ad="more" boyut="k" /></button>
    </header>
  );

  return (
    <div className="tc-pym-tp-kap" ref={kap}>
      {ust}
      {brif && <Brif ort={ort} kapat={brifKapat} />}
      <div className="tc-pym-tp-govde" data-ray={rayAcik ? '' : undefined}>
        <Ray ort={ort} />
        <Izgara ort={ort} pano={pano} parla={parla} />
        <Bugun ort={ort} acik={bugunAcik} />
      </div>
      {kart && <KartKatmani ort={ort} kart={kart.k} ankraj={kart.a} bildir={bildir} />}
    </div>
  );
}

const BRIF_ANAHTARI = 'tmi:planlama:brif';
function brifGunu(): string | null { try { return localStorage.getItem(BRIF_ANAHTARI); } catch { return null; } }
function brifGunuYaz(g: string): void { try { localStorage.setItem(BRIF_ANAHTARI, g); } catch { /* depo kapalıysa brifing yeniden açılışta da görünür */ } }

export const ankraj = (e: { clientX: number; clientY: number }): Ankraj => ({ x: e.clientX, y: e.clientY });
// Ortamdan siparişin bilgisi (ray, kart ve brifing aynı hesabı kullanır).
export const bilgiAl = (ort: Ortam, j: string): SiparisBilgisi | null => ort.bilgi.get(j) ?? sipBilgi(ort.c, ort.p, ort.cx, ort.hazir, j);
