import type { Order, Pkg, Result } from '@shared/model';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../data/cakisma';
import { AKStore } from '../data/store';
import { anahtarliErteleyici } from '../data/ertele';
import { durumKaydiGerekir } from '../data/durum-kaydi';
import { IS_DEGISIMI, nedenAdi } from '../data/durus-nedeni';
import { istasyonPaketleri, operatoreAcik, planOnce } from '../data/tmi-plan';
import { tmiEmirId } from '../data/tmi-adim';
import { hazirlikUyarisi } from '../data/cnc-hazirlik';
import { adimTuru } from '../data/adim-turu';
import { parcaEtiketi } from '../data/parca';
import { baslatmaGeriAlma, baslatmaGeriUygula, durumEsitle, durumEsitleme, durumIletisi, geriAlinacakIs, sayimGeriAlma, sayimGeriUygula, sayimKapaliNedeni, tmiBitti } from '../data/biten-is';
import { ornekIslerAcik } from '../data/ornek-isler';
import { gecisteDuraklatilacaklar, oneAlinanSuruyor, yeniOneAlinan } from '../data/is-gecisi';
import { ilkAcilis } from '../data/istasyon-sec';
import { ILETI_GITMEDI } from '../data/gonderim-hatasi';
import { retGerekcesiMetni, sonNumuneDurumu, yeniNumuneYamasi } from '../data/numune';
import { ILK_PARCA_ONCE_SAY_ILETISI, ilkParcaKarari, ilkParcaSayimReddi, yenidenIlkParcaAcik, kararBekleyenSayisi, yenidenIlkParcaTabani } from '../data/ilk-parca';
import { vardiyaUretimi } from '../data/operator-ozeti';
import { refakatIsi, refakatKodu } from '../data/refakat-okut';
import { AYRIM_YENILEME_MS, kayittakiMakineler, kilitsizSecim, makineSecimiGorunur, seciliMakineler, type MakineAyrimlari } from '../data/makine-secimi';
import { CALLS, Fragment, I, ORDERS, REASONS, ST, dur, fmt, html, isPlannedReason, pl, reasonOf, useCallback, useEffect, useMemo, useNow, useRef, useState } from './temel';
import { Dial, Orbs, Queue, Top } from './bilesenler';
import { FEAT, LS } from './yukleyici';
import { elleNumuneOlculeri } from '../data/kontrol-plani';
import { APPMODE, ME, MEU, POLICY, ROLE_L, allowed, can, currentShift, downNow, isStationTablet, machineOf, myStation, stationList } from './ortak-ayarlar';
import { gomuluMu } from './gomulu';
import { BlueprintM } from './teknik-resim';
import { otomatikNumuneOlculeri } from '../data/otomatik-numune';
import { Analytics, AwayView, CallChip, CallOv, CallTrackOv, DoneOv, NextPrepOv, NumOv, MakineSecici, PlanBanner, ReasonOv, ScrapOv, TopluPanel, ShiftOv, Steps, TaskCard, beep, dueControls, firstGate, ilkParcaKalemleri, nextTask, pctS, readyCount, sampItems, sampOf, shiftCalc, shiftStart, useShiftLog } from './operator-parcalar';
import { LVL, ToolsCard, WarnOv, nearEdge, rulesOf } from './kurallar';
import { EMPTY_ORDER, OPTYPES, PANELS, ScanOv, StationPicker, opOf, stOf } from './istasyonlar';
import { seedIfEmpty } from './hazirlik';
import { logMeas } from './kalite';
import { NumuneOv } from './bakim-raporlar';
import { Brand, useMob, useTheme } from './baslat';
import { baslatmaUyarisi, uyariliBaslatmaIletisi } from '../data/baslatma-uyarisi';
import { Ozetim, ozetimGorunur } from './ozetim';
import { EMIR_SEC_OLAYI, emirSeciminiAl, emirSirasi } from '../data/emir-secimi';
import type { EmirSecimiPenceresi } from '../data/emir-secimi';

/* ── app ── */
export function App({ preview }) {
  const mob = useMob();
  const [mv, setMv] = useState(() => (!preview && ozetimGorunur() ? 'ozet' : 'prod'));
  const [theme, setTheme] = useTheme();
  const MACHINE = preview ? (LS.get('pvStation') || myStation()) : myStation();
  const curMc = () => (o && o.pkg && o.pkg.mc) || (machineOf(MACHINE).mcs.length === 1 ? machineOf(MACHINE).mcs[0].id : null);
  const [orders, setOrders] = useState<Order[]>(() => (ornekIslerAcik(APPMODE.demo, MACHINE, !!preview) ? ORDERS : []).map(o => ({ ...o, baseGood: o.good })));
  const [ai, setAi] = useState(0);
  const [mcSel, setMcSel] = useState<string[]>([]); // başlatırken seçilen makineler (kart #1148); boşsa işe atanmış makine
  const aiRef = useRef(0); aiRef.current = ai;
  const o = orders[ai] || orders[0] || EMPTY_ORDER(MACHINE);
  // 393 d: seçici açıkken emrin makine ayrımları sunucudan okunur; okunamazsa null ve seçici bugünkü gibidir (son söz başlatmada).
  const [ayrim, setAyrim] = useState<MakineAyrimlari | null>(null);
  const ayrimEmri = tmiEmirId(o.pkg);
  const seciciAcik = !preview && !o.empty && can('prod.run') && makineSecimiGorunur(machineOf(MACHINE).mcs, o.state);
  useEffect(() => {
    setAyrim(null);
    if (!seciciAcik || ayrimEmri === null) return;
    let bitti = false;
    const oku = () => AKStore.Server.makineAyrimlari(ayrimEmri).then(c => { if (!bitti) setAyrim(c || null); }, () => { if (!bitti) setAyrim(null); });
    oku();
    const t = setInterval(oku, AYRIM_YENILEME_MS);
    return () => { bitti = true; clearInterval(t); };
  }, [ayrimEmri, seciciAcik, MACHINE]);
  const [since, setSince] = useState(() => { const l = LS.get('lastState:' + MACHINE); return l && l.at ? l.at : Date.now(); });
  const [tab, setTab] = useState('draw');
  const [ov, setOv] = useState(null);
  useEffect(() => { if (preview || APPMODE.demo || !stationList().length) return; const k = ilkAcilis(LS.get('station'), (MEU() || {}).st, MACHINE, can('prod.run')); if (k === 'kaydet') LS.set('station', MACHINE); else if (k === 'sor') setOv('station'); }, []); // ilk açılış: bu tablet hangi istasyonda?
  const [toast, setToast] = useState(null);
  const [segs, setSegs] = useState([]);
  const [focus, setFocus] = useState(null);
  const [away, setAway] = useState(false);
  const [call, setCall] = useState(null);
  const [callLog, setCallLog] = useState([]);
  const [handover, setHandover] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [snooze, setSnooze] = useState<Record<string, any>>({});
  const shiftRef = useRef<any>({ good: 0, scrap: 0, mOk: 0, mNok: 0 });
  const SL = useShiftLog(MACHINE, !!preview);
  const scrapLog = useRef<any[]>([]);
  const lastAct = useRef(Date.now());
  const now = useNow(1000);
  const SC = useMemo(() => shiftCalc(SL, Date.now()), [SL, Math.floor(now / 15000)]);
  const shiftNow = Math.min(480, 312 + (now - since) / 60000);
  const say = useCallback((m, i = 'check', c = 'var(--sig)', extra?) => { setToast(Object.assign({ m, i, c, k: Date.now() }, extra || null)); }, []);
  useEffect(() => { const f = (e: any) => say((e.detail && e.detail.msg) || CAKISMA_ILETISI, 'alert', 'var(--hold)'); window.addEventListener(CAKISMA_OLAYI, f); return () => window.removeEventListener(CAKISMA_OLAYI, f); }, [say]);
  window.__akSay = say;
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.undo || toast.action ? 5200 : 2800); return () => clearTimeout(t); }, [toast]);

  /* paketler */
  const mergePkgs = (list, pk, rs) => {
    const mine = preview ? pk.filter(p => p.id === preview) : istasyonPaketleri(pk, MACHINE);
    let out = list.filter(x => !x.pkg || mine.some(p => p.id === x.pkg.id));
    for (const p of mine.sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0))) {
      const i = out.findIndex(x => (x.pkg && x.pkg.id === p.id) || (!x.pkg && x.no === p.no));
      const base = { no: p.no, part: p.part, op: p.op, due: p.due || '—', urgent: p.priority === 'urgent', target: p.target, cycle: p.cycle, pkg: p };
      const r = !preview && rs && rs[p.id];
      if (i >= 0) { const prev = out[i]; out[i] = Object.assign({}, prev, base, { fresh: preview ? false : prev.pkg ? (prev.pkg.version !== p.version || prev.fresh) : true, baseGood: prev.pkg ? prev.baseGood : prev.good }, r && !prev.pkg ? { state: r.state || prev.state, good: r.good, scrap: r.scrap, meas: r.meas || {}, pins: r.pins || [], baseGood: r.baseGood ?? r.good, acks: r.acks || {}, toolsAt: r.toolsAt || {}, sr: r.sr || {} } : null, r && prev.pkg ? { pins: r.pins || prev.pins || [] } : null); }
      else out = [Object.assign({ state: 'queued', good: 0, scrap: 0, meas: {}, pins: [], fresh: !r && !preview, baseGood: 0 }, r ? { state: r.state || 'queued', good: r.good || 0, scrap: r.scrap || 0, meas: r.meas || {}, pins: r.pins || [], baseGood: r.baseGood ?? 0, acks: r.acks || {}, toolsAt: r.toolsAt || {}, sr: r.sr || {} } : null, base), ...out];
    }
    // TMI'de biten emrin işi terminalde de biter (kart #1194): sayaç kapanır, iş biten işlere geçer.
    out = out.map(x => tmiBitti(x.pkg) && x.state !== 'done' ? Object.assign({}, x, { state: 'done' }) : x);
    // Sıra: canlı plandaki TMI işleri plan sırasıyla, öteki işler Planlama'daki sırayla (pkg.seq)
    return out.map((x, i) => [x, x.pkg && x.pkg.seq != null ? x.pkg.seq : 1e9 + i]).sort((a, b) => planOnce(a[0].pkg, b[0].pkg) || a[1] - b[1]).map(x => x[0]);
  };
  const pkgsRef = useRef<any>({});
  const rqRef = useRef<any[]>([]);
  const loadPkgs = async (msg?) => {
    const pk = await AKStore.DB.all('pkgs'); pkgsRef.current = Object.fromEntries(pk.map(p => [p.id, p])); const rs = Object.fromEntries((await AKStore.DB.all('results')).map(r => [r.id, r]));
    const rq = preview ? [] : await AKStore.DB.all('requests').catch(() => []);
    rqRef.current = rq;
    // kalitede bekleyen numune ve son ret yenilemede de görünür; ekranda canlı numune durumu varsa ona dokunulmaz
    const numuneli = l => l.map(x => { if (!x.pkg || x.pendingReq || x.lastDecision) return x; const d = sonNumuneDurumu(rq, x.pkg.id, x.pkg.plan); return d ? Object.assign({}, x, d) : x; });
    setOrders(prev => { const activeNo = (prev[aiRef.current] || {}).no; const nx = numuneli(mergePkgs(prev, pk, rs)); const idx = preview ? 0 : nx.findIndex(x => x.no === activeNo); if (idx >= 0 && idx !== aiRef.current) setTimeout(() => setAi(idx), 0); return nx; });
    if (msg && msg.type === 'pkg' && msg.machine === MACHINE && !operatoreAcik(pkgsRef.current[msg.id])) return;
    if (msg && msg.type === 'pkg') { beep('call'); if (msg.machine === MACHINE) say((msg.version > 1 ? 'Paket güncellendi: ' : 'Yeni iş paketi: ') + msg.no + ' · Rev ' + msg.rev, 'layers', 'var(--hazard)'); else say(msg.machine + ' için paket yayınlandı · bu makine değil', 'layers', 'var(--idle)'); }
    if (msg && msg.type === 'pin-resolved') say('Hazırlık notunu yanıtladı: ' + (msg.reply || 'çözüldü'), 'check', 'var(--run)');
  };
  useEffect(() => { (async () => { await seedIfEmpty(); await loadPkgs(); if (!preview) { const h = await AKStore.DB.get('kv', 'handover'); if (h && Date.now() - h.at < 12 * 3600e3) setHandover(h); } })(); if (preview) return; return AKStore.Bus.on(m => { if (m.type === 'pkg' || m.type === 'pkg-removed' || m.type === 'pin-resolved') loadPkgs(m); if (m.type === 'pkg-order' && m.machine === MACHINE) loadPkgs(); if (m.type === '$merged' && (m.store === 'results' || m.store === 'pkgs')) loadPkgs(); if (m.type === 'mc' && m.st === MACHINE) onMachineData(m); if (m.type === 'call-ack' && m.machine === MACHINE) { beep('call'); setCall(x => x && x.t0 === m.t0 ? Object.assign({}, x, { stage: Math.max(x.stage, 1), who: m.who, times: x.times.concat([Date.now()]), msgs: x.msgs.concat([{ from: 'them', text: m.who + ' çağrıyı aldı · geliyor', at: Date.now() }]) }) : x); } if (m.type === 'sample-result' && m.machine === MACHINE) onSampleResult(m); const ds = durumIletisi(m, MACHINE); if (ds) onTmiDurum(ds); }); }, []);
  // Makine devralındı: TMI'deki hâl gelir, ekran ona eşitlenir; eşitleme yeni durum kaydı yazmaz.
  const onTmiDurum = ds => {
    const a = live.current.o;
    if (a && a.no === ds.orderNo && a.state !== ds.state) { autoRef.current.state = true; if (a.state === 'running' && ds.state === 'paused') say('Makine başka işe devredildi · iş duraklatıldı', 'alert', 'var(--hazard)'); }
    setOrders(l => durumEsitle(l, ds));
  };
  const onSampleResult = async m => {
    const rq = await AKStore.DB.get('requests', m.reqId); if (!rq) return;
    AKStore.DB.all('requests').then(l => { rqRef.current = l; }).catch(() => {});
    const bad = rq.items.map(id => ({ id, r: rq.results[id] })).filter(x => x.r && !x.r.ok);
    const plan = (Object.values<any>(pkgsRef.current || {}).find(p => p.id === rq.pkgId) || {}).plan || [];
    const badTxt = bad.map(x => { const b = plan.find(q => q.id === x.id); return (b ? b.nom : '#' + x.id) + ' = ' + x.r.v; }).join(', ');
    const res: Record<string, any> = {}; for (const id of rq.items) if (rq.results[id]) res[id] = Object.assign({}, rq.results[id], rq.status === 'deviation' ? { dev: true } : null);
    setOrders(l => l.map(x => x.pkg && x.pkg.id === rq.pkgId ? Object.assign({}, x, { meas: Object.assign({}, x.meas, res), pendingReq: null, pendingItems: null, lastDecision: { status: rq.status, bad: badTxt, note: rq.note, at: Date.now() } }) : x));
    const QR = rulesOf(Object.values<any>(pkgsRef.current || {}).find(p => p.id === rq.pkgId)).q, L = live.current;
    if (rq.status === 'rejected') {
      beep('nok');
      if (QR.nok === 'stop') { setOrders(l => l.map(x => x.pkg && x.pkg.id === rq.pkgId && (x.state === 'running' || x.state === 'setup') ? Object.assign({}, x, { state: 'stopped' }) : x)); setSince(Date.now()); setSegs(s => { const t = s.length ? s[s.length - 1].t : 0; return [...s, { f: t, t: t + .5, s: 'stopped', n: 'D-05' }]; }); say('Kalite RED · makine durduruldu · ' + badTxt, 'stop', 'var(--stop)'); }
      else if (QR.nok === 'call') { L.startCall && L.startCall(CALLS.find(c => c.k === 'kalite')); say('Kalite RED · kalite çağrıldı · ' + badTxt, 'x', 'var(--stop)'); }
      else say('Kalite RED · ' + badTxt, 'x', 'var(--stop)', { action: { l: 'Durdur', fn: () => setOv('reason') } });
    }
    else {
      beep('ok'); say(rq.status === 'deviation' ? 'Sapma izni ile onaylandı' : 'Kalite onayladı · ' + rq.items.length + ' ölçü uygun', 'check', 'var(--run)');
      const edge = rq.items.map(id => ({ b: plan.find(q => q.id === id), r: rq.results[id] })).filter(x => x.b && x.r && x.r.ok && nearEdge(x.b, x.r.v, QR.band));
      if (edge.length) setTimeout(() => say('Sınıra yakın: ' + edge.map(x => x.b.nom + ' = ' + x.r.v + ' (%' + nearEdge(x.b, x.r.v, QR.band) + ')').join(', ') + ' · takımı kontrol et', 'alert', 'var(--hazard)'), 3000);
    }
  };
  const saveT = useRef(anahtarliErteleyici());
  const saveResult = (x, ping?) => { if (preview || !x || !x.pkg || !isStationTablet()) return; saveT.current(x.pkg.id, async () => { await AKStore.DB.put('results', { id: x.pkg.id, no: x.no, rev: x.pkg.rev, version: x.pkg.version, state: x.state, good: x.good, scrap: x.scrap, baseGood: x.baseGood, meas: x.meas || {}, pins: x.pins || [], acks: x.acks || {}, toolsAt: x.toolsAt || {}, sr: x.sr || {}, at: Date.now() }); AKStore.Bus.send({ type: ping || 'progress', id: x.pkg.id, no: x.no }); }, ping ? 50 : 1500); };
  useEffect(() => { saveResult(o); }, [o && o.good, o && o.scrap, o && o.state, o && o.acks, o && o.toolsAt, o && o.sr]);
  /* iş değiştirme: çalışan eski iş duraklatılır ve olayı yeni işin olaylarından önce gönderilir (is-gecisi.ts) */
  const isGec = (i: number) => {
    const duraklat = gecisteDuraklatilacaklar(orders, i);
    for (const j of duraklat) {
      const x = orders[j], eski = Object.assign({}, x, { state: 'paused' });
      if (!preview && isStationTablet()) AKStore.Log.add('events', { machine: MACHINE, wc: machineOf(MACHINE).wc || null, mc: (x.pkg && x.pkg.mc) || curMc(), orderNo: x.no, pkgId: x.pkg ? x.pkg.id : null, state: 'paused', reason: IS_DEGISIMI, planned: null });
      saveResult(eski, 'result');
    }
    if (duraklat.length) setOrders(l => l.map((x, j) => duraklat.includes(j) ? Object.assign({}, x, { state: 'paused' }) : x));
    setAi(i);
  };

  // Ctrl K'den gelen emir: listede varsa seçilir; çalışan başka iş varsa duraklatılmaz, seçim yapılmaz ve operatöre söylenir.
  const emirIstegi = useRef<number | null>(null);
  const emirSec = () => {
    const id = emirIstegi.current; if (id === null || preview) return;
    const i = emirSirasi(orders, id); if (i < 0) { if (orders.some(x => x.pkg)) emirIstegi.current = null; return; }
    emirIstegi.current = null;
    if (i === ai) return;
    if (o.state === 'running') { say('Çalışan iş var · ' + orders[i].no + ' için önce bu işi duraklat', 'alert', 'var(--hazard)'); return; }
    setAi(i);
  };
  const emirSecRef = useRef(emirSec); emirSecRef.current = emirSec;
  useEffect(() => { const al = () => { const id = emirSeciminiAl(window as EmirSecimiPenceresi); if (id !== null) { emirIstegi.current = id; emirSecRef.current(); } }; al(); window.addEventListener(EMIR_SEC_OLAYI, al); return () => window.removeEventListener(EMIR_SEC_OLAYI, al); }, []);
  useEffect(() => { emirSec(); }, [orders]);

  /* iş kuralları (hazırlıktan) */
  const RL = useMemo(() => rulesOf(o.pkg), [o.pkg]);
  /* istasyon tipi: iş paketine göre */
  const opT = opOf(o.pkg), OT = OPTYPES[opT], Panel = PANELS[opT];
  const [scan, setScan] = useState(null);
  useEffect(() => { document.documentElement.setAttribute('data-op', opT); }, [opT]);
  useEffect(() => { setTab(Panel ? 'st' : 'draw'); if (mob) setMv(v => (v === 'ozet' ? v : 'prod')); }, [o.no]);
  const stUpd = fn => setOrders(l => l.map((x, i) => i === aiRef.current ? Object.assign({}, x, fn(x)) : x));
  const stApi = { o, pkg: o.pkg || {}, cfg: stOf(o.pkg), sr: o.sr || {}, say, scan: opts => setScan(opts), act: (label, icon, color, fn) => undoable(label, icon, color, () => stUpd(fn)), act0: fn => stUpd(fn) };
  const live = useRef<any>({});
  const [warnShow, setWarnShow] = useState(null);
  const wKey = (w, x) => w.when === 'every' && w.n > 0 ? Math.floor(x.good / w.n) : 0;
  const ackWarns = list => { const at = Date.now(); setOrders(l => l.map((x, i) => { if (i !== aiRef.current) return x; const a = Object.assign({}, x.acks); list.forEach(w => { a[w.id] = { at, by: ME(), cnt: x.good, k: wKey(w, x), v: x.pkg && x.pkg.version }; }); return Object.assign({}, x, { acks: a }); })); };
  const dueWarns = () => RL.warns.filter(w => {
    if (!w.t || !w.t.trim()) return false;
    const a = (o.acks || {})[w.id], run = o.state === 'running';
    if (w.when === 'every') return run && w.n > 0 && o.good >= w.n && (!a || wKey(w, o) > (a.k || 0));
    if (w.when === 'interval') return run && w.n > 0 && now - (a ? a.at : (o.startedAt || since)) >= w.n * 60000;
    if (w.when === 'shift') return (run || o.state === 'setup') && (!a || a.at < shiftStart(now));
    if (w.when === 'tool') return !!o.toolEvt && (!a || a.at < o.toolEvt);
    return false;
  });
  useEffect(() => {
    if (preview || warnShow || ov) return;
    const due = dueWarns(); if (!due.length) return;
    const loud = due.filter(w => w.ack || w.lvl === 'crit'), quiet = due.filter(w => !(w.ack || w.lvl === 'crit'));
    if (quiet.length) { ackWarns(quiet); beep('due'); say(quiet[0].t, LVL[quiet[0].lvl].i, LVL[quiet[0].lvl].c); }
    if (loud.length) { setAway(false); beep('call'); setWarnShow({ list: loud }); }
  }, [Math.floor(now / 5000), o.good, o.state, o.toolEvt, !!warnShow, !!ov, o.no]);
  /* takım ömrü uyarıları */
  const toolSeen = useRef(new Set());
  useEffect(() => {
    for (const t of RL.prod.tools) {
      const used = o.good - ((o.toolsAt || {})[t.id] || 0), pct = used / t.life * 100, k = o.no + ':' + t.id + ':' + ((o.toolsAt || {})[t.id] || 0);
      if (pct >= t.warnPct && pct < 100 && !toolSeen.current.has(k + 'w')) { toolSeen.current.add(k + 'w'); say(t.name + ' ömrünün %' + Math.round(pct) + '’inde · ' + (t.life - used) + ' parça kaldı', 'tool', 'var(--hazard)'); }
    }
  }, [o.good, RL]);
  useEffect(() => { if (!o.pkg || preview) return; const miss = RL.prod.tools.filter(t => (o.toolsAt || {})[t.id] == null); if (miss.length) patch({ toolsAt: Object.assign({}, o.toolsAt, Object.fromEntries(miss.map(t => [t.id, o.good - (o.good % t.life)]))) }); }, [o.no, RL]);
  const changeTool = t => undoable(t.name + ' değiştirildi · sayaç sıfırlandı', 'tool', 'var(--run)', () => patch({ toolsAt: Object.assign({}, o.toolsAt, { [t.id]: o.good }), toolEvt: Date.now() }));
  /* uzun duruş */
  const pauseSeen = useRef(0);
  useEffect(() => {
    if (preview || !RL.prod.maxPauseMin || !(o.state === 'paused' || o.state === 'stopped')) return;
    if (now - since >= RL.prod.maxPauseMin * 60000 && pauseSeen.current !== since) { pauseSeen.current = since; beep('nok'); say((o.state === 'paused' ? 'Duraklatma ' : 'Duruş ') + RL.prod.maxPauseMin + ' dk’yı geçti', 'clock', 'var(--stop)', { action: { l: 'Amiri çağır', fn: () => startCall(CALLS.find(c => c.k === 'amir')) } }); }
  }, [Math.floor(now / 10000), o.state]);

  /* kontrol takvimi */
  const D = useMemo(() => opT === 'cnc' ? dueControls(o, now) : { due: [], next: null }, [o, Math.floor(now / 5000), opT]);
  const dueKey = D.due.map(b => b.id).join(',');
  const prevDue = useRef('');
  useEffect(() => {
    const before = new Set(prevDue.current.split(',').filter(Boolean)); prevDue.current = dueKey;
    const fresh = D.due.filter(b => !before.has(String(b.id)));
    const freshQ = fresh.filter(b => D.who[b.id] !== 'op'), freshO = fresh.filter(b => D.who[b.id] === 'op');
    if (otomatikNumuneOlculeri(freshQ, D.why, o.lastDecision).length && o.pkg && RL.q.autoSend && !o.pendingReq && !preview) { setTimeout(() => live.current.sendSample && live.current.sendSample(true), 400); }
    // Ret kartı ekrandayken kalite ölçüsü için ayrıca uyarı verilmez: RED iletisi ve kart operatöre düzeltip göndermesini zaten söyler.
    else if (fresh.length && o.pkg && !(o.lastDecision && o.lastDecision.status === 'rejected' && !freshO.length)) { const b = (freshQ[0] || freshO[0]); setAway(false); setTab('draw'); setMv('prod'); setFocus({ id: b.id, n: Date.now() }); beep('due'); say(freshQ.length ? 'Numune zamanı · ' + b.nom + ' (' + (D.why[b.id] || '') + ') · kaliteye gönder' : 'Ölçüm sırası sende · ' + b.nom + ' (' + (D.why[b.id] || '') + ')', freshQ.length ? 'target' : 'ruler', b.crit ? 'var(--stop)' : freshQ.length ? 'var(--hazard)' : 'var(--run)'); }
  }, [dueKey]);
  const nextOrder = orders.find((x, i) => i !== ai && x.state === 'queued');
  const siraRef = useRef<string[]>([]);
  const [ondeNo, setOndeNo] = useState<string | null>(null);
  const siraAnahtari = orders.map(x => x.no + ':' + x.state).join(',');
  useEffect(() => { if (preview) return; const yeni = yeniOneAlinan(siraRef.current, orders); siraRef.current = orders.map(x => x.no); setOndeNo(n => yeni ?? (n && oneAlinanSuruyor(n, orders) ? n : null)); }, [siraAnahtari]);
  useEffect(() => { if (ondeNo) say('Sıradaki iş öne alındı: ' + ondeNo + ' · geçince çalışan iş duraklatılır', 'alert', 'var(--hazard)'); }, [ondeNo]);
  // operatörün ölçebileceği ölçüler: sırası operatörde olanlar + yalnız operatörün ölçtüğü kurallardakiler
  const opIds = useMemo(() => { if (!o.pkg) return []; const ids = new Set(D.due.filter(b => D.who[b.id] === 'op').map(b => b.id)); sampOf(o.pkg).filter(r => (r.who || ['q']).every(w => w === 'op')).forEach(r => sampItems(o.pkg, r).forEach(b => ids.add(b.id))); return Array.from(ids); }, [o.pkg, dueKey]);
  // İlk parça kapısı (129, 131 b, denetim #12): Kalite Merkezi onaylayana dek ilk parçadan sonraki sağlam parça karar bekler; yeniden ilk parça açıkken ikinci sağlam sayılmaz.
  // Yeniden ilk parçanın tabanı hazırlık kararının damgasıdır.
  const yenidenAcik = !!o.pkg && POLICY.fpRestart !== false && ilkParcaKalemleri(o).length > 0 && yenidenIlkParcaAcik(o.pkg);
  const ilkKarari = ilkParcaKarari(o.pkg);
  const ilkAcik = !!o.pkg && !preview && ilkParcaKalemleri(o).length > 0 && ilkKarari !== 'onay';
  const ilkSayilan = o.good - (o.baseGood ?? 0) - (ilkAcik ? 0 : yenidenIlkParcaTabani(o.pkg));
  const ilk = {
    acik: ilkAcik || (!preview && yenidenAcik), yeniden: !ilkAcik && !preview && yenidenAcik, sayilan: ilkSayilan,
    kararBekleyen: kararBekleyenSayisi(ilkAcik, ilkSayilan, ilkAcik && ilkKarari === 'ret'),
  };
  const task0 = nextTask(o, D, nextOrder, ilk);
  const task = task0 && task0.key && snooze[task0.key] > now ? nextTask(Object.assign({}, o, { _skip: true }), D, null, ilk) : task0;

  const ctl = useMemo(() => o && o.pkg ? {
    key: o.pkg.id + ':' + o.pkg.version, files: o.pkg.files, primary: o.pkg.primary, derived: o.pkg.derived, cfg: o.pkg.readCfg, bal: o.pkg.plan, setBal: () => {}, readOnly: true, noMeasure: true, aletZorunlu: !preview, opIds: opIds, onFocusMode: setFocusMode,
    meas: o.meas || {}, retGerekcesi: retGerekcesiMetni(o.lastDecision), focus, due: D.due.map(b => b.id), pins: o.pins || [],
    setMeas: m => { const nm = typeof m === 'function' ? m(o.meas || {}) : m; for (const k in nm) if (nm[k] && nm[k].cnt == null) { nm[k] = Object.assign({}, nm[k], { cnt: o.good, who: 'op', by: ME() }); const ok = nm[k].ok; shiftRef.current[ok ? 'mOk' : 'mNok']++; if (!preview) logMeas(o.pkg, o.pkg.plan.find(b => String(b.id) === String(k)), nm[k], { src: 'op', orderNo: o.no, machine: MACHINE }); } const snap = { meas: o.meas || {} }; setOrders(l => l.map((x, i) => i === aiRef.current ? Object.assign({}, x, { meas: nm }) : x)); saveResult(Object.assign({}, o, { meas: nm }), 'result'); setTimeout(() => setToast(t => t && Object.assign({}, t, { undo: () => { setOrders(l => l.map((x, i) => i === aiRef.current ? Object.assign({}, x, { meas: snap.meas }) : x)); saveResult(Object.assign({}, o, { meas: snap.meas }), 'result'); say('Ölçüm geri alındı', 'rotate', 'var(--idle)'); } })), 0); },
    onPin: preview ? null : p => { const pin = Object.assign({ id: 'p' + Date.now(), by: ME() + ' · ' + MACHINE, at: Date.now(), status: 'open' }, p); const pins = (o.pins || []).concat([pin]); setOrders(l => l.map((x, i) => i === aiRef.current ? Object.assign({}, x, { pins }) : x)); saveResult(Object.assign({}, o, { pins }), 'feedback'); say('Not hazırlığa gönderildi', 'flag', 'var(--hazard)'); }
  } : undefined, [o && o.pkg && o.pkg.id, o && o.pkg && o.pkg.version, o && o.meas, o && o.lastDecision, o && o.pins, o && o.no, focus, dueKey, RL, opIds.join(',')]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.setAttribute('data-state', o.state); }, [o.state]);
  // çevrim saati: son parçadan bu yana geçen çalışma süresi (duraklamalar sayılmaz)
  const cycRef = useRef<any>({ acc: 0, since: null, good: null, scrap: null, no: null, state: null, jit: 1, last: 0, n: 0 });
  { // çizimden ÖNCE eşitlenir: halka animasyonu aynı çizimde sıfırdan başlasın (iyi parça ya da hurda eklenince)
    const c = cycRef.current, now = Date.now();
    if (c.no !== o.no) Object.assign(c, { no: o.no, good: o.good, scrap: o.scrap, state: o.state, acc: 0, since: o.state === 'running' ? now : null, last: 0, n: c.n + 1, fired: false });
    else {
      if (c.state !== o.state) { if (o.state === 'running') { if (!c.since) c.since = now; } else if (c.since) { c.acc += now - c.since; c.since = null; } c.state = o.state; }
      if (o.good > c.good || o.scrap > c.scrap) { const el = c.acc + (c.since ? now - c.since : 0); if (el > 500) c.last = el; Object.assign(c, { acc: 0, since: o.state === 'running' ? now : null, n: c.n + 1, fired: false, jit: 0.93 + Math.random() * 0.16 }); }
      c.good = o.good; c.scrap = o.scrap;
    }
  }
  const cycApi = useMemo(() => ({ el: () => { const c = cycRef.current; return c.acc + (c.since ? Date.now() - c.since : 0); }, last: () => cycRef.current.last, n: () => cycRef.current.n }), []);
  // tanıtım sayacı: varsayılan KAPALI · parça yalnız operatörün +1 / sayı düzeltmesiyle artar. Ayarlar'dan açılırsa planlı çevrim süresinde (±%8) kendiliğinden sayar
  const ilkBekliyor = ilkParcaSayimReddi(ilk.yeniden, ilk.sayilan, 1) !== null;
  useEffect(() => { if (o.state !== 'running' || !FEAT.get().autoCount || ilkBekliyor) return; const T = (o.cycle > 0 ? o.cycle : 3) * 1000; const id = setInterval(() => { if (cycRef.current.fired || cycApi.el() < T * cycRef.current.jit) return; cycRef.current.fired = true; setOrders(l => l.map((x, i) => { if (i === ai && x.state === 'running' && x.good < x.target) { shiftRef.current.good++; return { ...x, good: x.good + 1 }; } return x; })); }, 250); return () => clearInterval(id); }, [o.state, ai, o.cycle, ilkBekliyor]);
  /* üretim kayıtları: durum değişimi ve sayımlar (OEE, vardiya özeti) — her kaynaktan gelen değişiklik yakalanır (düğme, düzeltme, kalite kararı, geri al) */
  const lastNoteRef = useRef(null), prevCnt = useRef(null);
  useEffect(() => {
    if (preview || o.empty || !isStationTablet()) return;
    const k = 'lastState:' + MACHINE, l = LS.get(k);
    if (l && l.no === o.no && l.state === o.state) return;
    LS.set(k, { no: o.no, state: o.state, at: Date.now() });
    const why = o.state === 'stopped' ? lastNoteRef.current : null;
    if (!autoRef.current.state && durumKaydiGerekir(l, o)) AKStore.Log.add('events', { machine: MACHINE, wc: machineOf(MACHINE).wc || null, mc: curMc(), mcs: kayittakiMakineler(kilitsizSecim(mcSel, ayrim), machineOf(MACHINE).mcs, o.state), orderNo: o.no, pkgId: o.pkg ? o.pkg.id : null, state: o.state, reason: why, planned: why ? isPlannedReason(why) : null });
    autoRef.current.state = false; lastNoteRef.current = null;
    schedAutoCall(why);
  }, [o.state, o.no]);
  /* nedeni bir ekibe bağlıysa (ör. mekanik arıza → bakım) belirlenen süre sonra kendiliğinden çağır */
  const schedAutoCall = why => {
    clearTimeout(autoCallT.current);
    const r = why && reasonOf(why);
    if (r && r.team && POLICY.autoCall) { const c0 = CALLS.find(c => c.k === r.team); if (c0) autoCallT.current = setTimeout(() => { const L = live.current; if (L.o && L.o.state === 'stopped' && !L.call) { L.startCall && L.startCall(c0, 'Otomatik · ' + r.l); } }, (r.after || 0) * 60e3 + 400); }
  };
  /* zaten durmuş makineye (ör. makine verisiyle durdu) neden girilince */
  const noteStop = code => {
    AKStore.Log.add('events', { machine: MACHINE, wc: machineOf(MACHINE).wc || null, mc: curMc(), orderNo: o.no, pkgId: o.pkg ? o.pkg.id : null, state: 'stopped', reason: code, planned: isPlannedReason(code) });
    setSegs(sg => sg.length ? sg.map((x, i) => i === sg.length - 1 ? Object.assign({}, x, { n: code }) : x) : sg); schedAutoCall(code);
    say('Duruş nedeni kaydedildi · ' + ((reasonOf(code) || {}).l || code), 'stop', 'var(--stop)');
  };
  const autoCallT = useRef(0), autoRef = useRef<any>({ state: false, cnt: false }), scrapWhy = useRef(null), topluRef = useRef(false);
  useEffect(() => () => clearTimeout(autoCallT.current), []);
  useEffect(() => {
    // Toplu girişin parça süresi yoktur: son çevrim süresi topluya yazılırsa birim süre ortalaması bozulur.
    const toplu = topluRef.current; topluRef.current = false;
    if (preview || o.empty || !isStationTablet()) return;
    const p = prevCnt.current; prevCnt.current = { no: o.no, good: o.good, scrap: o.scrap };
    if (!p || p.no !== o.no) return;
    const base = { machine: MACHINE, wc: machineOf(MACHINE).wc || null, mc: curMc(), orderNo: o.no, pkgId: o.pkg ? o.pkg.id : null, planMs: o.cycle > 0 ? Math.round(o.cycle * 1000) : null, state: o.state };
    const cyc = cycRef.current.last ? Math.round(cycRef.current.last) : null;
    if (autoRef.current.cnt) { autoRef.current.cnt = false; return; } // makine verisinden gelen sayım sunucuda zaten kayıtlı
    if (o.good !== p.good) AKStore.Log.add('counts', Object.assign({ kind: 'good', delta: o.good - p.good, cycleMs: o.good > p.good && !toplu ? cyc : null }, base));
    if (o.scrap !== p.scrap) { AKStore.Log.add('counts', Object.assign({ kind: 'scrap', delta: o.scrap - p.scrap, cycleMs: o.scrap > p.scrap && !toplu ? cyc : null, reason: o.scrap > p.scrap ? scrapWhy.current : null }, base)); scrapWhy.current = null; }
  }, [o.good, o.scrap, o.no]);
  /* sunucu sayımı ya da başlatmayı reddetti: terminaldeki sayı ya da durum geri döner, ret metni gösterilir; geri alma yeni kayıt yazmaz */
  useEffect(() => {
    const f = e => {
      // TMI işin hâlini bildirdiyse ekran ona eşitlenir (tek kaynak TMI): duraklatma yazılmadıysa iş çalışıyor, devam reddedildiyse ama iş
      // çalışıyorsa çalışıyor görünür. Yoksa başlatma geri alınır.
      const es = durumEsitleme(e.detail);
      if (es) {
        const a = live.current.o; if (a && a.state !== es.state && geriAlinacakIs(a, { ...es, alan: 'good', fark: 0 })) autoRef.current.state = true;
        setOrders(l => durumEsitle(l, es));
        beep('nok'); say('TMI kabul etmedi · ' + (e.detail.msg || ''), 'alert', 'var(--stop)');
        return;
      }
      const b = baslatmaGeriAlma(e.detail);
      if (b) {
        // Başlatma yazılmadı: iş geri döner; geri dönüş yeni durum kaydı yazmaz (TMI'de değişen bir şey yok).
        const a = live.current.o; if (a && a.state === 'running' && geriAlinacakIs(a, { ...b, alan: 'good', fark: 0 })) autoRef.current.state = true;
        setOrders(l => baslatmaGeriUygula(l, b));
        beep('nok'); say('İş başlamadı · ' + (e.detail.msg || 'TMI kabul etmedi'), 'alert', 'var(--stop)');
        return;
      }
      const g = sayimGeriAlma(e.detail); if (!g) return;
      const a = live.current.o; if (a && geriAlinacakIs(a, g) && Math.max(0, a[g.alan] + g.fark) !== a[g.alan]) autoRef.current.cnt = true;
      setOrders(l => sayimGeriUygula(l, g));
      beep('nok'); say('Sayım işlenmedi, sayı geri alındı · ' + (e.detail.msg || ''), 'alert', 'var(--stop)');
    };
    window.addEventListener('arkon-rejected', f); return () => window.removeEventListener('arkon-rejected', f);
  }, []);
  useEffect(() => { const f = (e: any) => say(ILETI_GITMEDI + ' · ' + ((e.detail && e.detail.msg) || ''), 'alert', 'var(--hold)'); window.addEventListener('arkon-ileti-gitmedi', f); return () => window.removeEventListener('arkon-ileti-gitmedi', f); }, []);
  /* QR / barkod ile iş emri aç */
  const pickByCode = code => {
    const rk = refakatKodu(code);
    // Refakat partisi kartı (kart #128): emir sunucudan okunur; bağlantı yoksa kartın altındaki emir numarası elle yazılır.
    if (rk && 'partiId' in rk) {
      AKStore.Server.refakatPartisi(rk.partiId).then((p) => {
        if (!p) { beep('nok'); say('Refakat kartı bulunamadı: ' + code, 'alert', 'var(--stop)'); return; }
        if (p.durum === 'iptal') { beep('nok'); say('Refakat kartı iptal edilmiş: ' + p.etiket, 'alert', 'var(--stop)'); return; }
        pickByCode('UE:' + p.emirId);
      }, () => { beep('nok'); say('Kart okunamadı; bağlantı yok. Kartın altındaki emir numarasını yaz (UE-…-P1).', 'alert', 'var(--hold)'); });
      return;
    }
    if (rk && !('partiId' in rk)) {
      const r = refakatIsi(rk, orders, Object.values<any>(pkgsRef.current || {}));
      if (r.tur === 'yok') { beep('nok'); say('Emir bulunamadı: ' + code, 'alert', 'var(--stop)'); return; }
      if (r.tur === 'ac') { isGec(r.sira); setSince(Date.now()); setMv('prod'); say('İş emri açıldı: ' + orders[r.sira].no, 'check', 'var(--run)'); return; }
      beep('nok'); say('Bu emrin bu istasyonda işi yok' + (r.istasyon ? ', sıradaki adım: ' + r.istasyon : ''), 'alert', 'var(--stop)'); return;
    }
    const n = String(code || '').trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, '');
    const i = orders.findIndex(x => [x.no, x.pkg && x.pkg.partNo, x.part].filter(Boolean).some(v => String(v).toLocaleUpperCase('tr-TR').replace(/\s+/g, '') === n || n.endsWith(String(v).toLocaleUpperCase('tr-TR').replace(/\s+/g, ''))));
    if (i < 0) { beep('nok'); say('Bu kodla iş emri yok: ' + code, 'alert', 'var(--stop)'); return; }
    isGec(i); setSince(Date.now()); setMv('prod'); say('İş emri açıldı: ' + orders[i].no, 'check', 'var(--run)');
  };
  const scanOrder = () => setScan({ title: 'İş emrini okut', hint: 'Refakat kartındaki QR ya da barkod · elle de yazabilirsin', cb: pickByCode });
  useEffect(() => { setSegs(s => { const L = s[s.length - 1]; if (!L) return s; return s.map((x, i) => i === s.length - 1 ? { ...x, t: Math.max(x.t, shiftNow) } : x); }); }, [Math.floor(shiftNow)]);
  /* uzak mod: 30 sn dokunulmazsa */
  useEffect(() => { const f = () => { lastAct.current = Date.now(); }; window.addEventListener('pointerdown', f, true); window.addEventListener('keydown', f, true); return () => { window.removeEventListener('pointerdown', f, true); window.removeEventListener('keydown', f, true); }; }, []);
  useEffect(() => { if (!preview && !away && !ov && !focusMode && Date.now() - lastAct.current > 45000) setAway(true); }, [Math.floor(now / 1000)]);

  const patch = p => setOrders(l => l.map((x, i) => i === ai ? { ...x, ...p } : x));
  const snapshot = () => ({ orders, since, segs });
  const undoable = (label, icon, color, fn) => { const s = snapshot(); fn(); say(label, icon, color, { undo: () => { setOrders(s.orders); setSince(s.since); setSegs(s.segs); say('Geri alındı', 'rotate', 'var(--idle)'); } }); };
  const go = (st, note?) => { lastNoteRef.current = note || null; patch(Object.assign({ state: st }, st === 'running' && !o.startedAt ? { startedAt: Date.now() } : null)); setSince(Date.now()); setSegs(s => { const t = s.length ? s[s.length - 1].t : 0; return [...s, { f: t, t: t + .5, s: st === 'done' || st === 'queued' ? 'paused' : st, n: note }]; }); };
  const ok = k => preview || allowed(k, say);
  const istasyonAc = () => ((preview || can('prod.station') || ((MEU() || {}).sts || []).length > 0 || ok('prod.station')) && setOv('station'));
  const kapaliNedeni = sayimKapaliNedeni(o), kapali = kapaliNedeni !== null;
  const iyiKapaliNedeni = sayimKapaliNedeni(o, 'good'), iyiKapali = iyiKapaliNedeni !== null;
  const iyiArtiNedeni = n => iyiKapaliNedeni ?? ilkParcaSayimReddi(ilk.yeniden, ilk.sayilan, n), iyiArtiKapali = iyiArtiNedeni(1) !== null;
  const sayimOk = (k, neden = kapaliNedeni) => { if (neden !== null) { beep('nok'); say(neden, 'alert', 'var(--idle)'); return false; } return ok(k); };
  const iyiSayimOk = k => sayimOk(k, iyiKapaliNedeni);
  const topluKaydet = g => { if (!sayimOk('prod.run', g.saglam > 0 ? iyiArtiNedeni(g.saglam) ?? kapaliNedeni : kapaliNedeni)) return false; doToplu(g); };
  const hazirlikta = useRef(false);
  const act = (a, t?, warned?, hazir?) => {
    if (['start', 'resume', 'restart', 'pause', 'setup', 'stop', 'finish'].includes(a) && !ok('prod.run')) return;
    if (a === 'tool') { const tl = RL.prod.tools.find(x => x.id === (t && t.toolId)); if (tl) changeTool(tl); return; }
    if (a === 'warns') { setWarnShow({ list: RL.warns.filter(w => w.t), title: 'Bu işin uyarıları' }); return; }
    if (a === 'stop') return setOv('reason');
    if (a === 'drawing') return setTab('draw');
    if (a === 'st') { setTab('st'); setMv('st'); return; }
    if (a === 'measure') { setTab('draw'); setFocus({ id: t.id, n: Date.now() }); return; }
    if (a === 'call') return setOv('call');
    if (a === 'prepnext') return setOv('prepnext');
    if (a === 'ack') { patch({ lastDecision: Object.assign({}, o.lastDecision, { ack: true }) }); return; }
    if (a === 'sample') { setOv('numune'); return; } // hatırlatmadan Kaliteye numune penceresi (kart #1083)
    if (a === 'finish') { setToast(null); go('done'); setOv('done'); return; } // açık "Geri al" bitmiş işi yeniden açmasın
    if (a === 'next') { const n = orders.findIndex((x, i) => i !== ai && x.state === 'queued'); setOv(null); if (n >= 0) { isGec(n); setSince(Date.now()); setOrders(l => l.map((x, j) => j === n ? Object.assign({}, x, { fresh: false }) : x)); say('Yüklendi: ' + orders[n].no + ' · hazırlık ' + readyCount(orders[n]) + '/4', 'next', 'var(--hazard)'); } else say('Kuyrukta iş kalmadı', 'check'); return; }
    const m = { start: 'running', resume: 'running', restart: 'running', pause: 'paused', setup: 'setup' }[a];
    // Başlat ilk parça onayını beklemez (129, 130 a): ilk parça Başlat'tan sonra üretilip sayılır ve kaliteye gider.
    if ((a === 'start' || a === 'resume' || a === 'restart') && ilk.acik) say('Dikkat: ilk parçayı say ve kaliteye gönder · ' + (ilk.yeniden ? 'karar gelene kadar sonraki sağlam parçalar sayılmaz' : 'karar gelene kadar sonraki sağlam parçalar karar bekler'), 'alert', 'var(--hold)');
    if ((a === 'start' || a === 'setup') && !warned && !preview) { const sw = RL.warns.filter(w => w.t && w.t.trim() && w.when === 'start' && !((o.acks || {})[w.id] && (o.acks || {})[w.id].v === (o.pkg && o.pkg.version))); if (sw.length) { setWarnShow({ list: sw, title: 'Başlamadan önce oku', then: () => act(a, t, true) }); return; } }
    // Üretim Terminali gibi: TMI emrinde başlatmadan önce girdiler istasyonda mı sorulur; eksikse istek açılır, Malzeme · Teslim paneli açılır
    // ve iş uyarıyla başlar (karar 110 b). Sorulamazsa (ağ yok) başlatma gider, son sözü TMI'nin başlat denetimi söyler.
    const tmiEmir = tmiEmirId(o.pkg);
    if (a === 'start' && !hazir && !preview && tmiEmir !== null && AKStore.status().mode === 'server') {
      if (hazirlikta.current) return;
      hazirlikta.current = true;
      const no = o.no, devam = () => { if (live.current.o && live.current.o.no === no) act(a, t, true, true); };
      AKStore.Server.uretimHazirligi(tmiEmir, MACHINE)
        .then(c => {
          const uyari = baslatmaUyarisi(c);
          if (uyari) beep('nok');
          devam();
          // "Üretim başladı" iletisinin Geri al düğmesi kalsın diye uyarı aynı iletiye eklenir.
          if (uyari) setTimeout(() => setToast(x => x && Object.assign({}, x, { m: uyariliBaslatmaIletisi(x.m, uyari), i: 'alert', c: 'var(--hold)' })), 0);
        }, devam)
        .finally(() => { hazirlikta.current = false; });
      return;
    }
    undoable({ start: 'Üretim başladı', resume: 'Üretime devam', restart: 'Yeniden başlatıldı', pause: 'İş duraklatıldı', setup: 'Hazırlık süresi başladı' }[a], { pause: 'pause', setup: 'wrench' }[a] || 'play', ST[m].c, () => go(m));
  };
  const sendSample = async (auto?) => {
    if (!o.pkg) { say('Bu iş için kontrol planı yok', 'alert', 'var(--hold)'); return; }
    let items = D.due.filter(b => (D.who || {})[b.id] !== 'op');
    // Numune stoktan teslim edilir (115 a): ilk parça önce sağlam sayılmış olmalı, hazırlıkta yapılan parça stokta yoktur (129).
    if (ilk.acik && (o.state !== 'running' || ilk.sayilan < 1) && items.some(b => firstGate(o).some(f => f.id === b.id))) { if (auto !== true) say(o.state === 'running' ? ILK_PARCA_ONCE_SAY_ILETISI : 'İlk parça Başlat\'tan sonra üretilir · önce başlat', 'alert', 'var(--hold)'); return; }
    if (auto === true) items = otomatikNumuneOlculeri(items, D.why || {}, o.lastDecision);
    // Zamanı gelen ölçü yokken operatör yine de numune gönderebilir (şüphe, takım değişimi): planın bütün ölçüleri gider.
    const elle = !items.length && auto !== true;
    if (elle && o.pendingReq) { say('Önceki numune kalitede · sonuç bekleniyor', 'clock', 'var(--idle)'); return; }
    if (elle) items = elleNumuneOlculeri(o.pkg.plan || []);
    if (!items.length) { say('Kontrol planında ölçü yok', 'check'); return; }
    if (preview) { say('Önizlemede gönderilmez', 'eye', 'var(--idle)'); return; }
    const reason = elle ? 'Operatör isteği' : Array.from(new Set(items.map(b => (D.why || {})[b.id] || b.freq || 'İlk parça'))).join(' + ');
    const req = { id: 'rq' + Date.now(), pkgId: o.pkg.id, no: o.no, part: o.part, rev: o.pkg.rev, machine: MACHINE, by: ME(), at: Date.now(), reason, items: items.map(b => b.id), crit: items.some(b => b.crit), cnt: o.good, status: 'waiting', results: {} };
    await AKStore.DB.put('requests', req);
    AKStore.Bus.send({ type: 'sample', reqId: req.id, no: o.no, machine: MACHINE, reason });
    patch(yeniNumuneYamasi(req));
    beep('call'); say((auto === true ? 'Otomatik numune isteği · ' : 'Numune isteği kalitede · onay bekleniyor · ') + items.length + ' ölçü · etiketle: ' + o.no + ' #' + fmt(o.good), 'target', 'var(--hold)');
  };
  // Kaliteye numune isteği terminalde ayrı düğme değil; görev kartındaki hatırlatma ve ilk parça uyarısı pencereyi açar (kart #1083).
  const numune = { hazir: !!o.pkg, bekliyor: !!o.pendingReq, gonder: () => sendSample() };
  const addScrap = () => { if (!sayimOk('prod.run')) return; if (!preview) setOv('scrap'); else doScrap(); }; // hurda yalnız nedenle yazılır (116 a); önizleme kayıt yazmaz
  const doScrap = (why?) => {
    scrapWhy.current = why || null;
    scrapLog.current = scrapLog.current.concat([o.good]).slice(-5); shiftRef.current.scrap++;
    const recent = scrapLog.current.filter(c => o.good - c <= 20);
    undoable('Hurda kaydedildi · toplam ' + (o.scrap + 1), 'trash', 'var(--stop)', () => patch({ scrap: o.scrap + 1 }));
    const tot = o.good + o.scrap + 1, rate = (o.scrap + 1) / tot * 100;
    if (RL.prod.scrapPct > 0 && tot >= RL.prod.scrapMin && rate >= RL.prod.scrapPct) setTimeout(() => { beep('nok'); say('Hurda oranı %' + rate.toFixed(1) + ' · limit %' + RL.prod.scrapPct, 'alert', 'var(--stop)', { action: { l: 'Amiri çağır', fn: () => startCall(CALLS.find(c => c.k === 'amir')) } }); }, 400);
    else if (recent.length >= 3) setTimeout(() => say('Hurda artıyor: son 20 parçada ' + recent.length + ' hurda', 'alert', 'var(--stop)', { action: { l: 'Kaliteyi çağır', fn: () => startCall(CALLS.find(c => c.k === 'kalite')) } }), 400);
  };
  const doToplu = g => {
    shiftRef.current.good += g.saglam; shiftRef.current.scrap += g.hurda; scrapWhy.current = g.hurda > 0 ? g.neden : null; topluRef.current = true;
    undoable('Toplu giriş · ' + fmt(g.saglam) + ' sağlam' + (g.hurda ? ' · ' + fmt(g.hurda) + ' hurda' : ''), 'check', 'var(--run)', () => patch({ good: o.good + g.saglam, scrap: o.scrap + g.hurda }));
  };
  /* duruş nedeni önerileri */
  const reasonSuggest = () => {
    const out = [], h = new Date().getHours() + new Date().getMinutes() / 60;
    if ((o.pkg && o.pkg.plan.some(b => (b.freq || 'İlk parça') === 'İlk parça' && !(o.meas || {})[b.id])) || D.due.length) out.push({ code: 'D-05', why: 'Bekleyen kalite kontrolü var' });
    for (const tl of RL.prod.tools) { const left = tl.life - (o.good - ((o.toolsAt || {})[tl.id] || 0)); if (left < tl.life * 0.12) out.push({ code: 'D-04', why: tl.name + ' ömrü: ' + Math.max(0, left) + ' parça kaldı' }); }
    { const t = Date.now(), dw = downNow(MACHINE, t); if (dw && dw.d.reason) out.unshift({ code: dw.d.reason, why: 'Takvimde planlı: ' + (dw.d.title || '') }); if ((currentShift(t).breaks || []).some(b => t >= b.s - 10 * 60e3 && t <= b.e)) out.push({ code: 'D-08', why: 'Mola saati' }); }
    const last = segs.slice().reverse().find(s => s.s === 'stopped' && s.n); if (last) out.push({ code: last.n, why: 'Son duruş nedeni' });
    if (nextOrder && readyCount(nextOrder) < 2 && Math.max(0, o.target - o.good) < 30) out.push({ code: 'D-01', why: 'Sıradaki iş için malzeme hazır değil' });
    return out;
  };
  /* çağrı simülasyonu */
  const callTimers = useRef<any[]>([]);
  const startCall = (c, note?) => {
    callTimers.current.forEach(clearTimeout); beep('call');
    const who = APPMODE.demo ? { bakim: 'Emre D.', kalite: 'Zeynep A.', malzeme: 'Hakan T.', amir: 'Serkan Y.' }[c.k] : null;
    const t0 = Date.now(), why = note || (o.state === 'stopped' && LS.get('lastState:' + MACHINE) ? (reasonOf((segs[segs.length - 1] || {}).n) || {}).l : null) || null;
    setCall({ ...c, t0, stage: 0, who: null, note: why, times: [t0], msgs: [{ from: 'sys', text: c.l + ' ekibine iletildi' + (why ? ' · ' + why : ''), at: t0 }] });
    if (!preview) { AKStore.Bus.send({ type: 'call', k: c.k, l: c.l, machine: MACHINE, wc: machineOf(MACHINE).wc || null, mc: curMc(), by: ME(), t0, note: why, orderNo: o.no }); AKStore.Log.add('calls', { machine: MACHINE, wc: machineOf(MACHINE).wc || null, mc: curMc(), callId: String(t0), team: c.k, phase: 'open', note: why }); }
    if (!APPMODE.demo) return; // gerçek kullanımda yanıt, çağrıyı alan ekrandan gelir
    const step = (ms, fn) => callTimers.current.push(setTimeout(() => setCall(x => x && x.t0 === t0 ? fn(x) : x), ms));
    step(3000, x => ({ ...x, stage: 1, who, times: [...x.times, Date.now()], msgs: [...x.msgs, { from: 'them', text: who + ' çağrıyı aldı', at: Date.now() }] }));
    step(7000, x => { beep('call'); return { ...x, stage: 2, times: [...x.times, Date.now()], msgs: [...x.msgs, { from: 'them', text: c.eta + ' dakikaya oradayım', at: Date.now() }] }; });
    step(22000, x => { beep('ok'); return { ...x, stage: 3, times: [...x.times, Date.now()], msgs: [...x.msgs, { from: 'them', text: 'Makinedeyim', at: Date.now() }] }; });
    say(c.l + ' çağrıldı · takip üst çubukta', 'bell', c.c);
  };
  const replyCall = q => { const at = Date.now(); setCall(x => x && ({ ...x, msgs: [...x.msgs, { from: 'me', text: q.t, at }] })); if (q.r) setTimeout(() => setCall(x => x && ({ ...x, msgs: [...x.msgs, { from: 'them', text: q.r, at: Date.now() }] })), 1500); if (q.close) setTimeout(() => endCall(), 2600); };
  const endCall = () => { callTimers.current.forEach(clearTimeout); setCall(x => { if (x) { setCallLog(l => l.concat([{ k: x.k, ms: (x.times[2] || Date.now()) - x.t0 }])); if (!preview) { AKStore.Log.add('calls', { machine: MACHINE, wc: machineOf(MACHINE).wc || null, callId: String(x.t0), team: x.k, phase: 'done' }); AKStore.Bus.send({ type: 'call-done', machine: MACHINE, t0: x.t0, k: x.k }); } } return null; }); setOv(o2 => o2 === 'calltrack' ? null : o2); say('Çağrı kapatıldı', 'check', 'var(--run)'); };
  live.current = { sendSample, startCall, o, call, mcData: m => {
    /* makine veri toplayıcısından (sunucu) gelen sayım / durum — sunucuda src: 'auto' olarak zaten kaydedildi */
    if (o.empty || o.state === 'done') return;
    if (m.kind === 'count' && m.delta) { autoRef.current.cnt = true; if (m.ck === 'scrap') patch({ scrap: o.scrap + m.delta }); else if (m.delta < 0 || iyiArtiNedeni(m.delta) === null) { shiftRef.current.good += m.delta; patch({ good: o.good + m.delta }); } }
    if (m.kind === 'state' && m.state && m.state !== o.state) {
      autoRef.current.state = true; go(m.state, null);
      if (m.state === 'stopped') { setOv('reason'); say('Makine durdu · nedeni seç', 'stop', 'var(--stop)'); }
      else if (m.state === 'running') say('Makine çalışıyor (makine verisi)', 'play', 'var(--run)');
    }
  } };
  const onMachineData = m => live.current.mcData && live.current.mcData(m);
  /* çağrı yükseltme: belirlenen sürede kimse üstlenmezse vardiya amirine / yöneticiye */
  useEffect(() => {
    if (!call || preview || call.stage > 0 || call.esc || !(POLICY.callEsc > 0)) return;
    const t = setTimeout(() => {
      setCall(x => x && x.t0 === call.t0 && x.stage === 0 ? Object.assign({}, x, { esc: true, msgs: x.msgs.concat([{ from: 'sys', text: POLICY.callEsc + ' dk yanıt yok · vardiya amirine yükseltildi', at: Date.now() }]) }) : x);
      AKStore.Bus.send({ type: 'call', esc: true, k: call.k, l: call.l, machine: MACHINE, wc: machineOf(MACHINE).wc || null, by: ME(), t0: call.t0, note: call.note, orderNo: o.no });
      AKStore.Log.add('calls', { machine: MACHINE, wc: machineOf(MACHINE).wc || null, callId: String(call.t0), team: call.k, phase: 'esc' });
      beep('call'); say(call.l + ' çağrısına ' + POLICY.callEsc + ' dk yanıt yok · amire yükseltildi', 'bell', 'var(--stop)');
    }, Math.max(500, call.t0 + POLICY.callEsc * 60e3 - Date.now()));
    return () => clearTimeout(t);
  }, [call && call.t0, call && call.stage, call && call.esc]);
  /* vardiya özeti */
  const vardiyaOzeti = SL.ok && !SC.sh.tanimsiz ? vardiyaUretimi(SC.good, SC.expected) : null;
  const shiftStats = () => {
    const c = shiftCalc(SL, Date.now()), good = c.good, q = good + c.scrap ? good / (good + c.scrap) * 100 : 100;
    const topL = c.topReason ? nedenAdi(c.topReason, k => (REASONS.find(r => r.code === k) || {}).l ?? null) : null;
    const avg = callLog.length ? Math.round(callLog.reduce((a, x) => a + x.ms, 0) / callLog.length / 1000) + ' sn' : '';
    const mm = Object.values<any>(o.meas || {});
    const headline = c.sh.tanimsiz ? 'Vardiya tanımsız; OEE hesaplanmadı.' : !c.has ? 'Bu vardiyada henüz üretim kaydı yok.' : c.oee != null ? 'OEE ' + pctS(c.oee) + ' · kullanılabilirlik ' + pctS(c.A) + ', performans ' + pctS(c.P && Math.min(1, c.P)) + ', kalite ' + pctS(c.Q) + '.' : 'Kayıtlar toplanıyor.';
    return { title: 'Vardiya özeti · ' + ME().split(' ')[0], machine: MACHINE, good, scrap: c.scrap, best: c.best ? Math.round(c.best / 1000) : '—', std: o.cycle || '—', mOk: shiftRef.current.mOk, mNok: shiftRef.current.mNok, stopMin: Math.round(c.stopMs / 60000), stops: c.stops, topReason: topL, calls: callLog.length + (call ? 1 : 0), callAvg: avg, goal: c.expected || Math.max(1, good), headline };
  };
  const setReady = k => setOrders(l => l.map(x => nextOrder && x.no === nextOrder.no ? Object.assign({}, x, { ready: Object.assign({}, x.ready, { [k]: !(x.ready || {})[k] }) }) : x));

  const tabs = [Panel ? { id: 'st', l: OT.tab, i: OT.i } : null, (!Panel || (o.pkg && o.pkg.files && o.pkg.files.length)) ? { id: 'draw', l: Panel ? 'Resim' : 'Teknik Resim', i: 'ruler', n: D.due.length || null } : null, { id: 'steps', l: 'Adımlar', i: 'list', n: o.pkg ? o.pkg.steps.filter(x => x.r).length : 3 }, { id: 'ana', l: 'Analiz', i: 'chart' }].filter(Boolean);
  const ti = tabs.findIndex(t => t.id === tab);
  const overlays = html`<${Fragment}>
    ${scan ? html`<${ScanOv} title=${scan.title} hint=${scan.hint} onClose=${() => setScan(null)} onCode=${c => { const f = scan.cb; setScan(null); beep('ok'); f(c); }} />` : null}
    ${ov === 'station' ? html`<${StationPicker} cur=${MACHINE} onClose=${() => setOv(null)} onPick=${id => { LS.set('station', id); location.reload(); }} />` : null}
    ${warnShow ? html`<${WarnOv} list=${warnShow.list} title=${warnShow.title} onAck=${() => { const w = warnShow; ackWarns(w.list); setWarnShow(null); beep('ok'); if (w.then) setTimeout(w.then, 50); }} />` : null}
    ${ov === 'numune' ? html`<${NumuneOv} st=${MACHINE} numune=${numune} onClose=${() => setOv(null)} />` : null}
    ${ov === 'scrap' ? html`<${ScrapOv} onClose=${() => setOv(null)} onSave=${code => { setOv(null); doScrap(code); }} />` : null}
    ${ov === 'reason' ? html`<${ReasonOv} machine=${MACHINE} suggest=${reasonSuggest()} onClose=${() => setOv(null)} onSave=${r => { setOv(null); if (o.state === 'stopped') noteStop(r.code); else undoable('Duruş kaydedildi · ' + r.l, 'stop', 'var(--stop)', () => go('stopped', r.code)); }} />` : null}
    ${ov === 'num' ? html`<${NumOv} value=${o.good} max=${o.target} onClose=${() => setOv(null)} onSave=${v => { if (v > o.good && !sayimOk('prod.fix', iyiArtiNedeni(v - o.good))) return; setOv(null); undoable('Sayaç güncellendi · ' + fmt(v), 'check', 'var(--sig)', () => patch({ good: v })); }} />` : null}
    ${ov === 'call' ? html`<${CallOv} onClose=${() => setOv(null)} onCall=${c => { setOv(null); startCall(c); }} />` : null}
    ${ov === 'calltrack' && call ? html`<${CallTrackOv} call=${call} onClose=${() => setOv(null)} onReply=${replyCall} onEnd=${endCall} />` : null}
    ${ov === 'prepnext' && nextOrder ? html`<${NextPrepOv} o=${nextOrder} onClose=${() => setOv(null)} onToggle=${setReady} />` : null}
    ${ov === 'shift' ? html`<${ShiftOv} st=${shiftStats()} onClose=${() => setOv(null)} onHandover=${async note => { setOv(null); if (note && !preview) await AKStore.DB.put('kv', { note, by: ME() + ' · Vardiya ' + currentShift(Date.now()).name, at: Date.now() }, 'handover'); say('Vardiya devredildi' + (note ? ' · not Vardiya B\'ye iletildi' : ''), 'check', 'var(--run)'); }} />` : null}
    ${ov === 'ozetim' ? html`<div className="ov" onClick=${e => e.target === e.currentTarget && setOv(null)}><div className="glass ov-card ozov" role="dialog" aria-modal="true" aria-label="Özetim">
      <div className="ov-h"><div><span className="over">Üretim Terminali</span><h2>Özetim</h2></div><button className="iconbtn x" onClick=${() => setOv(null)} aria-label="Kapat"><${I} n="x" /></button></div>
      <${Ozetim} /></div></div>` : null}
    ${ov === 'done' ? html`<${DoneOv} o=${o} onClose=${() => setOv(null)} onNext=${() => act('next')} />` : null}
    ${away ? html`<${AwayView} o=${o} task=${task} D=${D} since=${since} st=${MACHINE} onWake=${() => { lastAct.current = Date.now(); setAway(false); }} />` : null}
    ${toast ? html`<div key=${toast.k} className=${'toast ' + (toast.undo || toast.action ? 'act' : '')} role="status"><span className="ti" style=${{ '--c': toast.c }}><${I} n=${toast.i} s=${18} /></span>${toast.m}
      ${toast.undo ? html`<button className="tbtn" onClick=${() => { const f = toast.undo; setToast(null); f(); }}><${I} n="rotate" s=${16} />Geri al</button>` : null}
      ${toast.action ? html`<button className="tbtn" onClick=${() => { const f = toast.action.fn; setToast(null); f(); }}>${toast.action.l}</button>` : null}
      ${toast.undo || toast.action ? html`<i className="tbar"></i>` : null}</div>` : null}
  </${Fragment}>`;
  if (mob) {
    const MV = [!preview && ozetimGorunur() ? { id: 'ozet', l: 'Özetim', i: 'user' } : null, { id: 'prod', l: 'Üretim', i: 'gauge' }, Panel ? { id: 'st', l: OT.short, i: OT.i } : null, (!Panel || (o.pkg && o.pkg.files && o.pkg.files.length)) ? { id: 'draw', l: 'Resim', i: 'ruler', n: D.due.length || null } : null, { id: 'queue', l: 'İşler', i: 'list', n: orders.filter(x => x.fresh).length || null }, { id: 'steps', l: 'Adımlar', i: 'check' }, Panel ? null : { id: 'ana', l: 'Analiz', i: 'chart' }].filter(Boolean);
    return html`<${Fragment}>
    <div className="aura"></div><div className="grain"></div>
    <div className="app mapp">
      <header className="mtop">
        <${Brand} compact />
        <div className="mm" onClick=${istasyonAc}><b>${MACHINE}</b><span className="mst"><span className="sdot"></span>${ST[o.state].l}<span className="mono">${dur((now - since) / 1000)}</span></span></div>
        <${CallChip} call=${call} onOpen=${() => setOv('calltrack')} />
        ${!call ? html`<button className="iconbtn mcall" onClick=${() => setOv('call')} aria-label="Çağrı"><${I} n="bell" s=${22} /></button>` : null}
        <button className="iconbtn" onClick=${() => setOv('menu')} aria-label="Menü"><${I} n="list" s=${22} /></button>
      </header>
      ${preview ? html`<span className="pvbadge" style=${{ margin: '0 12px' }}>ÖNİZLEME · kayıt yapılmaz</span>` : null}
      <div className="mview">
        ${mv === 'ozet' ? html`<div className="mpane mscroll"><${Ozetim} /></div>` : null}
        <div className="mpane mprod" style=${{ display: mv === 'prod' ? 'flex' : 'none' }}>
          <div className="mprod-in">
          <${PlanBanner} st=${MACHINE} o=${o} now=${now} onStop=${code => ok('prod.run') && undoable('Planlı duruş · ' + ((reasonOf(code) || {}).l || ''), 'stop', 'var(--done)', () => go('stopped', code))} />
          ${handover ? html`<div className="handover glass"><${I} n="alert" s=${18} /><div><span className="over">Önceki vardiyadan not</span><b>${handover.note}</b></div><button className="x" onClick=${() => setHandover(null)} aria-label="Kapat"><${I} n="x" s=${16} /></button></div>` : null}
          <div className="glass morder" onClick=${() => setMv('queue')}><div><span className="over">Aktif iş ${o.urgent ? '· ACİL' : ''}</span><b>${o.no}${o.pkg ? html`<span className="revc">Rev ${o.pkg.rev}</span>` : null}</b><small>${o.part} · ${o.op}${adimTuru(o.pkg) ? html` · <span className="tag adim">${adimTuru(o.pkg).etiket}</span>` : null}${parcaEtiketi(o.pkg) ? html` · <span className="tag adim">${parcaEtiketi(o.pkg)}</span>` : null}</small></div>${RL.warns.some(w => w.t) ? html`<button className="wchip" onClick=${e => { e.stopPropagation(); act('warns'); }} aria-label="Bu işin uyarıları"><${I} n="bell" s=${16} />${RL.warns.filter(w => w.t).length}</button>` : null}<${I} n="next" s=${18} /></div>
          ${hazirlikUyarisi(o.pkg) ? html`<div className="pnote" role="status"><${I} n="alert" s=${16} /><span>${hazirlikUyarisi(o.pkg)}</span></div>` : null}
          ${o.pkg && o.pkg.note ? html`<div className="pnote"><${I} n="alert" s=${16} /><span>${o.pkg.note}</span></div>` : null}
          <${MakineSecici} makineler=${machineOf(MACHINE).mcs} secili=${kilitsizSecim(seciliMakineler(mcSel, machineOf(MACHINE).mcs), ayrim)} atanan=${(ayrim && ayrim.planMakinesi) || (o.pkg && o.pkg.mc)} ayrim=${ayrim} durum=${preview || o.empty || !can('prod.run') ? 'running' : o.state} onChange=${setMcSel} />
          <${TaskCard} task=${task} onAct=${(a, t) => { if (a === 'measure' || a === 'drawing') setMv('draw'); act(a, t); }} onDismiss=${t => { setSnooze(s => Object.assign({}, s, { [t.key]: Date.now() + 600000 })); say('10 dakika sonra tekrar hatırlatılacak', 'clock', 'var(--idle)'); }} />
          <div className="sayac">
            <${Dial} o=${o} onEdit=${() => iyiSayimOk('prod.fix') && setOv('num')} label=${OT.cnt} unit=${OT.unit} cyc=${cycApi} />
            <div className="pills" role="group" aria-label="Sayaç">
              <button className="pill" disabled=${iyiKapali || o.good <= 0} onClick=${() => iyiSayimOk('prod.fix') && undoable('İyi parça −1 · ' + fmt(o.good - 1), 'minus', 'var(--idle)', () => patch({ good: o.good - 1 }))} aria-label="İyi parça eksi bir"><${I} n="minus" s=${20} />İyi −1</button>
              <button className="pill good" disabled=${iyiArtiKapali || o.good >= o.target} onClick=${() => { if (!sayimOk('prod.run', iyiArtiNedeni(1))) return; shiftRef.current.good++; undoable('İyi parça +1 · ' + fmt(o.good + 1), 'plus', 'var(--run)', () => patch({ good: o.good + 1 })); }}><${I} n="plus" s=${20} />İyi +1</button>
              <button className="pill bad" disabled=${kapali || o.scrap <= 0} onClick=${() => sayimOk('prod.fix') && undoable('Hurda −1 · toplam ' + fmt(o.scrap - 1), 'minus', 'var(--idle)', () => patch({ scrap: o.scrap - 1 }))} aria-label="Hurda eksi bir"><${I} n="minus" s=${20} />Hurda −1</button>
              <button className="pill bad" disabled=${kapali} onClick=${addScrap}><${I} n="trash" s=${20} />Hurda +1</button>
            </div>
          </div>
          <${TopluPanel} key=${o.no} kalan=${o.target - o.good} disabled=${kapali} onSave=${topluKaydet} />
          </div>
          <${Orbs} state=${o.state} act=${a => { if (a === 'drawing') { setMv('draw'); return; } act(a); }} />
        </div>
        ${mv === 'st' && Panel ? html`<div className="mpane mscroll"><${Panel} key=${o.no} api=${stApi} RL=${RL} /></div>` : null}
        <div className="mpane" style=${{ display: mv === 'draw' ? 'flex' : 'none' }}><${BlueprintM} say=${say} theme=${theme} ctl=${ctl} yuklemeYok=${true} /></div>
        ${mv === 'queue' ? html`<div className="mpane mscroll"><${Queue} orders=${orders} active=${ai} nextNo=${nextOrder && nextOrder.no} aheadNo=${ondeNo} onScan=${preview ? null : scanOrder} onPick=${i => { isGec(i); setSince(Date.now()); setOrders(l => l.map((x, j) => j === i ? Object.assign({}, x, { fresh: false }) : x)); setMv('prod'); }} /></div>` : null}
        ${mv === 'steps' ? html`<div className="mpane mscroll"><${Steps} key=${o.no} steps=${o.pkg && o.pkg.steps} emirId=${tmiEmirId(o.pkg)} preview=${preview} /></div>` : null}
        ${mv === 'ana' ? html`<div className="mpane mscroll"><${ToolsCard} tools=${RL.prod.tools} o=${o} onChange=${changeTool} /><${Analytics} c=${SC} now=${now} o=${o} st=${MACHINE} /></div>` : null}
      </div>
      <nav className="mnav">${MV.map(t => html`<button key=${t.id} className=${mv === t.id ? 'on' : ''} onClick=${() => setMv(t.id)}><span className="ni"><${I} n=${t.i} s=${22} />${t.n ? html`<em className=${t.id === 'draw' ? 'hot' : ''}>${t.n}</em>` : null}</span>${t.l}</button>`)}</nav>
    </div>
    ${ov === 'menu' ? html`<div className="ov" onClick=${e => e.target === e.currentTarget && setOv(null)}><div className="glass ov-card mmenu">
      <div className="ov-h"><div><span className="over">${ME()} · ${ROLE_L[(MEU() || {}).role] || 'Operatör'} · ${MACHINE}</span><h2>Menü</h2></div><button className="iconbtn x" onClick=${() => setOv(null)} aria-label="Kapat"><${I} n="x" /></button></div>
      <button className="mrow" onClick=${() => setOv('shift')}><${I} n="chart" s=${22} /><div><b>Vardiya özeti ve devir</b><small>Üretim, kalite, not bırak</small></div></button>
      ${MEU() && !gomuluMu() ? html`<button className="mrow" onClick=${() => { setOv(null); window.dispatchEvent(new Event('arkon-switch')); }}><${I} n="user" s=${22} /><div><b>Kişi değiştir</b><small>${ME()} · PIN ile başka kişi girer</small></div></button>` : null}
      <button className="mrow" onClick=${() => { setOv(null); setAway(true); }}><${I} n="expand" s=${22} /><div><b>Uzak mod</b><small>Uzaktan okunur dev sayaç</small></div></button>
      <button className="mrow" onClick=${() => { setOv(null); setMv('draw'); }}><${I} n="ruler" s=${22} /><div><b>Teknik resim · 3B</b><small>Odak modu resim panelinde</small></div></button>
      <button className="mrow" onClick=${() => setTheme(theme === 'dark' ? 'light' : 'dark')}><${I} n=${theme === 'dark' ? 'sun' : 'moon'} s=${22} /><div><b>${theme === 'dark' ? 'Gün ışığı teması' : 'Vardiya (koyu) teması'}</b><small>Ortam ışığına göre seç</small></div></button>
      ${!preview ? html`<a className="mrow" ...${pl('kalite', true)}><${I} n="target" s=${22} /><div><b>Kalite istasyonu</b><small>Numune ölçümü</small></div></a><a className="mrow" ...${pl('hazirlik', true)}><${I} n="layers" s=${22} /><div><b>Üretim Terminali Hazırlık</b><small>İş paketi hazırla</small></div></a>` : null}
    </div></div>` : null}
    ${overlays}
  </${Fragment}>`;
  }
  return html`<${Fragment}>
    <div className="aura"></div><div className="gridbg"></div><div className="grain"></div>
    <div className="app">
      <${Top} state=${o.state} since=${since} theme=${theme} onTheme=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} onCall=${() => setOv('call')} call=${call} onCallOpen=${() => setOv('calltrack')} onAway=${() => setAway(true)} onShift=${() => setOv('shift')} onOzetim=${!preview && ozetimGorunur() ? () => setOv('ozetim') : null} preview=${preview} machine=${MACHINE} onStation=${istasyonAc} ozet=${vardiyaOzeti} />
      <main className="main">
        <${Queue} orders=${orders} active=${ai} nextNo=${nextOrder && nextOrder.no} aheadNo=${ondeNo} onScan=${preview ? null : scanOrder} onPick=${i => { isGec(i); setSince(Date.now()); setOrders(l => l.map((x, j) => j === i ? Object.assign({}, x, { fresh: false }) : x)); }} />
        <section className="col">
          <${PlanBanner} st=${MACHINE} o=${o} now=${now} onStop=${code => ok('prod.run') && undoable('Planlı duruş · ' + ((reasonOf(code) || {}).l || ''), 'stop', 'var(--done)', () => go('stopped', code))} />
          ${handover ? html`<div className="handover glass"><${I} n="alert" s=${18} /><div><span className="over">Önceki vardiyadan not · ${handover.by}</span><b>${handover.note}</b></div><button className="x" onClick=${() => setHandover(null)} aria-label="Kapat"><${I} n="x" s=${16} /></button></div>` : null}
          <div className="glass order"><div><span className="over">Aktif iş emri ${o.urgent ? html`<span className="tag urgent" style=${{ marginLeft: 6 }}>Acil</span>` : null}</span><h1>${o.no}${o.pkg ? html`<span className="revbig">Rev ${o.pkg.rev}</span>` : null}</h1><p>${o.part} · ${o.op}</p>${parcaEtiketi(o.pkg) ? html`<div className="adimtur"><span className="tag adim">${parcaEtiketi(o.pkg)}</span></div>` : null}${adimTuru(o.pkg) ? html`<div className="adimtur"><span className="tag adim">${adimTuru(o.pkg).etiket}</span>${adimTuru(o.pkg).aciklama ? html`<span className="adimnot">${adimTuru(o.pkg).aciklama}</span>` : null}</div>` : null}${hazirlikUyarisi(o.pkg) ? html`<div className="pnote" role="status"><${I} n="alert" s=${16} /><span>${hazirlikUyarisi(o.pkg)}</span></div>` : null}${o.pkg && o.pkg.note ? html`<div className="pnote"><${I} n="alert" s=${16} /><span>${o.pkg.note}</span></div>` : null}</div>
            <div className="facts">${RL.warns.some(w => w.t) ? html`<button className="wchip" onClick=${() => act('warns')} title="Bu işin uyarıları"><${I} n="bell" s=${18} />${RL.warns.filter(w => w.t).length}</button>` : null}<div><span className="over">Çevrim</span><b>${o.cycle} sn</b></div><div><span className="over">Termin</span><b>${o.due}</b></div></div></div>
          <div className=${'glass stage' + (preview || can('prod.run') ? '' : ' noperm')} title=${preview || can('prod.run') ? null : 'Bu rol üretim kaydı yapamaz'}>
            <${MakineSecici} makineler=${machineOf(MACHINE).mcs} secili=${kilitsizSecim(seciliMakineler(mcSel, machineOf(MACHINE).mcs), ayrim)} atanan=${(ayrim && ayrim.planMakinesi) || (o.pkg && o.pkg.mc)} ayrim=${ayrim} durum=${preview || o.empty || !can('prod.run') ? 'running' : o.state} onChange=${setMcSel} />
          <${TaskCard} task=${task} onAct=${act} onDismiss=${t => { setSnooze(s => Object.assign({}, s, { [t.key]: Date.now() + 600000 })); say('10 dakika sonra tekrar hatırlatılacak', 'clock', 'var(--idle)'); }} />
            <div className="sayac">
              <${Dial} o=${o} onEdit=${() => iyiSayimOk('prod.fix') && setOv('num')} label=${OT.cnt} unit=${OT.unit} cyc=${cycApi} />
              <div className="pills" role="group" aria-label="Sayaç">
                <button className="pill" disabled=${iyiKapali || o.good <= 0} onClick=${() => iyiSayimOk('prod.fix') && undoable('İyi parça −1 · ' + fmt(o.good - 1), 'minus', 'var(--idle)', () => patch({ good: o.good - 1 }))} aria-label="İyi parça eksi bir"><${I} n="minus" s=${20} />İyi −1</button>
                <button className="pill good" disabled=${iyiArtiKapali || o.good >= o.target} onClick=${() => { if (!sayimOk('prod.run', iyiArtiNedeni(1))) return; shiftRef.current.good++; undoable('İyi parça +1 · ' + fmt(o.good + 1), 'plus', 'var(--run)', () => patch({ good: o.good + 1 })); }}><${I} n="plus" s=${20} />İyi +1</button>
                <button className="pill bad" disabled=${kapali || o.scrap <= 0} onClick=${() => sayimOk('prod.fix') && undoable('Hurda −1 · toplam ' + fmt(o.scrap - 1), 'minus', 'var(--idle)', () => patch({ scrap: o.scrap - 1 }))} aria-label="Hurda eksi bir"><${I} n="minus" s=${20} />Hurda −1</button>
                <button className="pill bad" disabled=${kapali} onClick=${addScrap}><${I} n="trash" s=${20} />Hurda +1</button>
              </div>
            </div>
            <${TopluPanel} key=${o.no} kalan=${o.target - o.good} disabled=${kapali} onSave=${topluKaydet} />
            <${Orbs} state=${o.state} act=${act} />
          </div>
        </section>
        <section className="col">
          <div className="tabs" role="tablist"><span className="tabind" style=${{ left: 'calc(5px + ' + Math.max(0, ti) + ' * (100% - 10px) / ' + tabs.length + ')', width: 'calc((100% - 10px) / ' + tabs.length + ')' }}></span>
            ${tabs.map(t => html`<button key=${t.id} role="tab" aria-selected=${tab === t.id} className=${'tab ' + (tab === t.id ? 'on' : '')} onClick=${() => setTab(t.id)}><${I} n=${t.i} s=${20} />${t.l}${t.n ? html`<span className=${'n ' + (t.id === 'draw' && D.due.length ? 'hot' : '')}>${t.n}</span>` : null}</button>`)}</div>
          <div className="pane">${tab === 'st' && Panel ? html`<${Panel} key=${o.no} api=${stApi} RL=${RL} />` : null}<div className="panewrap" style=${{ display: tab === 'draw' ? 'flex' : 'none' }}><${BlueprintM} say=${say} theme=${theme} ctl=${ctl} yuklemeYok=${true} /></div>${tab === 'steps' ? html`<${Steps} key=${o.no} steps=${o.pkg && o.pkg.steps} emirId=${tmiEmirId(o.pkg)} preview=${preview} />` : tab === 'ana' ? html`<div className="anawrap"><${ToolsCard} tools=${RL.prod.tools} o=${o} onChange=${changeTool} /><${Analytics} c=${SC} now=${now} o=${o} st=${MACHINE} /></div>` : null}</div>
        </section>
      </main>
    </div>
    ${overlays}
  </${Fragment}>`;
}

