import type { Pkg as PkgT } from '@shared/model';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../data/cakisma';
import { AKStore } from '../data/store';
import { ISTASYONSUZ_GONDERIM, PLAN_ETIKETI, SIRA_ONAYI, gonderimUyarisi, istasyonsuzMu, planEtiketi, rotaEksigi, siraOnayi, tmiPlani } from '../data/tmi-plan';
import type { GonderimUyarisi } from '../data/tmi-plan';
import { sablonUygula, tmiPaketiMi, tmiyeGit } from '../data/yeni-paket';
import { PAKET_GRUPLARI, paketGrubuOku, paketleriGrupla } from '../data/paket-grup';
import type { GrupAdi } from '../data/paket-grup';
import { SUZGEC_ALANLARI, paketleriSuz, suzgecOku, suzgecSayisi, suzgecSecenekleri } from '../data/paket-suzgec';
import type { PaketSuzgeci, SuzgecAlani } from '../data/paket-suzgec';
import { herNParcaYap, olculeriSil } from '../data/kontrol-plani';
import { KAYIT_GITMEDI, KAYIT_REDDI_OLAYI } from '../data/gonderim-hatasi';
import { araOnayNedenleri, paketImzasi } from '../data/ara-onay';
import { MERKEZDEN_EKLENIR, merkezDosyasiniKoy } from '../../../../istemci/src/ortak/cizim/cekirdek/cizim-merkezi';
import { STUDYO_KAPALI, studyoAcilir } from '../data/studyo-yonu';
import { MerkezRozeti, MerkezSecici, merkezVar, useMerkezUyarilari } from './cizim-merkezi';
import { Fragment, I, ST, fmt, html, pad, pl, useCallback, useEffect, useMemo, useNow, useRef, useState } from './temel';
import { LS, b64bytes, download } from './yukleyici';
import { APPMODE, ME, MEU, POLICY, ROLE_L, allowed, audit, canSee, initials, machineOf, mcOf, stationList } from './ortak-ayarlar';
import { LOOK_KEYS, PDF_KEYS, RCFG, cfgFix, cfgSig } from './pdf';
import { MODEL_KEYS, fileHash, processModel } from './model-3b';
import { BlueprintM, methOf } from './teknik-resim';
import { PreviewOv, SEED_PLAN, beep, sampOf } from './operator-parcalar';
import { RulesTab, defaultRulesFor } from './kurallar';
import { OPTYPES, ST_DEFAULT, SampTab, StEditor, StationSelect, TypePicker, numunePlaniYaz, opOf, seedStations, stValidate } from './istasyonlar';
import { Brand, navGo, useMob, useTheme } from './baslat';

/* ══════════ HAZIRLIK STÜDYOSU ══════════ */
export const { DB, Bus, Pkg, Folder } = AKStore;
export const FREQ = ['İlk parça', 'Her 10 parça', 'Her 50 parça', 'Saatlik', 'Vardiya başı', 'Son parça'];
/* yayın onayı: Ayarlar'da açıksa paket, son değişikliğinden sonra kalitece onaylanmadan yayınlanamaz */
export const apOk = p => !!(p && p.approval && p.approval.ok && p.approval.at >= (p.updatedAt || 0));
export const apRejected = p => !!(p && p.approval && p.approval.ok === false && (!p.apReq || p.approval.at >= p.apReq.at));
export const apPending = p => !!(p && p.apReq && !(p.approval && p.approval.at >= p.apReq.at));
export const needApproval = p => POLICY.approval && !apOk(p);
export const PSTAT = { draft: { l: 'Taslak', c: 'var(--idle)' }, review: { l: 'Onayda', c: 'var(--done)' }, published: { l: 'Yayında', c: 'var(--run)' }, production: { l: 'Üretimde', c: 'var(--hazard)' }, done: { l: 'Tamamlandı', c: 'var(--done)' } };
export const STEP_TEMPLATES = {
  'CNC ilk parça': [
    { t: 'Ayna / pens ve sıkma basıncını kontrol et', d: 'Sıkma basıncı talimattaki değerde', r: true },
    { t: 'Takım ofsetlerini ve programı doğrula', d: 'Program no ve takım listesi iş paketindeki ile aynı', r: true },
    { t: 'İlk parçayı ölç ve kaliteye onaylat', d: 'Kontrol planındaki "İlk parça" noktaları', r: true },
    { t: 'Talaş konveyörünü boşalt', d: 'Her 250 parçada bir', r: false }],
  'Pres kalıp': [
    { t: 'Kalıp bağlantı cıvatalarını kontrol et', d: 'Tork değerleri kalıp kartında', r: true },
    { t: 'Sac kalınlığını ölç', d: 'Malzeme sertifikası ile karşılaştır', r: true },
    { t: 'İlk 3 parçayı gözle ve mastarla kontrol et', d: 'Çapak, ezik, çatlak', r: true }]
};
export const uidg = () => Math.random().toString(36).slice(2, 9);
/* rotalı TMI emrinin iş emri paketi: emir, operasyon, istasyon, adet, süreler, termin ve öncelik TMI planından gelir, burada değişmez */
export const tmiIsEmri = p => String((p && p.id) || '').startsWith('tmi-ie-');
const TMI_KILIT = 'TMI planından gelir';
// Rotalı işin plan durumu (data/tmi-plan.ts): operatöre yalnız canlı planda eşleşen iş düşer; sıra canlı plandandır.
const PLAN_RENGI = { planlanmadi: 'var(--idle)', 'kaynak-farkli': 'var(--stop)', 'hazirlik-bekliyor': 'var(--hold)' };
const SIRA_RENGI = { taslakta: 'var(--idle)', onayda: 'var(--hold)' };
export const PlanChip = ({ p, sira = false }) => {
  const e = planEtiketi(p), d = tmiPlani(p), o = siraOnayi(p);
  return html`${e ? html`<span className="chip" style=${{ '--c': PLAN_RENGI[e] }}><${I} n=${e === 'hazirlik-bekliyor' ? 'clock' : 'alert'} s=${12} />${PLAN_ETIKETI[e]}</span>` : null}${o ? html`<span className="chip" style=${{ '--c': SIRA_RENGI[o] }} title="Sıra canlıya plan onaylanıp canlıya alınınca geçer"><${I} n="clock" s=${12} />${SIRA_ONAYI[o]}</span>` : null}${sira && d && d.canli && d.sira ? html`<span className="mini">Plan sırası ${d.sira}</span>` : null}`;
};
export function newPkg(): PkgT {
  const n = new Date(); const no = 'İE-' + n.getFullYear() + '-' + String(4900 + Math.floor(Math.random() * 99)).padStart(5, '0');
  return { id: uidg(), no, opType: 'cnc', st: {}, partNo: '', part: '', rev: 'A', op: 'Op 10 · CNC Torna', machine: (stationList()[0] || {}).id || '', target: 500, cycle: 40, due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status: 'draft', version: 0, dirty: true, createdAt: Date.now(), updatedAt: Date.now(), by: ME() };
}
export function validate(p): { k: string; ok: any; l: string; d: string; soft?: boolean }[] {
  const pdf = p.files.find(f => f.kind === 'pdf'), mdl = p.files.find(f => f.kind === 'model'), ty = opOf(p), typed = ty !== 'cnc';
  return stValidate(p).concat([
    { k: 'info', ok: !istasyonsuzMu(p), l: 'İstasyon seçildi', d: istasyonsuzMu(p) ? ISTASYONSUZ_GONDERIM : machineOf(p.machine).name || p.machine },
    ...(rotaEksigi(p) ? [{ k: 'info', ok: false, l: 'Rotada girdi seçildi', d: rotaEksigi(p) + ' · Reçete ve Rota\'da tamamlayın' }] : []),
    { k: 'info', ok: !!(p.no && p.part && p.rev && p.op && p.target > 0), l: 'İş emri bilgileri tam', d: 'No, parça adı, revizyon, operasyon ve hedef adet' },
    { k: 'docs', ok: !!p.primary, l: 'Ana teknik resim seçildi', d: pdf ? pdf.name : mdl ? mdl.name + ' (modelden resim)' : typed ? 'İsteğe bağlı · bu iş türünde resim şart değil' : 'PDF veya 3B model ekle', soft: typed },
    { k: 'docs', ok: !!mdl, l: '3B model eklendi', d: mdl ? mdl.name : 'İsteğe bağlı · STEP önerilir', soft: true },
    { k: 'plan', ok: p.plan.length > 0, l: 'Kontrol planı hazır', d: p.plan.length ? p.plan.length + ' nokta · ' + p.plan.filter(b => b.crit).length + ' kritik' : typed && ty !== 'kalite' ? 'İsteğe bağlı' : 'En az bir kontrol noktası', soft: typed && ty !== 'kalite' },
    { k: 'steps', ok: p.steps.length > 0, l: 'Operasyon adımları', d: p.steps.length ? p.steps.length + ' adım · ' + p.steps.filter(s => s.r).length + ' zorunlu' : 'En az bir adım' }
  ]);
}

export const SEED_RULES = () => ({
  warns: [{ id: 'sw1', t: 'Ayna sıkma basıncı 32 bar olmalı · kontrol et', lvl: 'warn', when: 'start', ack: true }, { id: 'sw2', t: 'Ø40 H7 deliği kritik · her 10 parçada tampon mastar', lvl: 'crit', when: 'start', ack: true }, { id: 'sw3', t: 'Çapakları al, keskin kenarları kır', lvl: 'info', when: 'every', n: 50, ack: false }, { id: 'sw4', t: 'Yeni takımın ofsetini ilk parçada doğrula', lvl: 'warn', when: 'tool', ack: true }],
  q: { who: 'quality', firstPiece: true, nok: 'stop', band: 80, critTwice: true, autoSend: false },
  prod: { scrapPct: 3, scrapMin: 20, maxPauseMin: 15, tools: [{ id: 'tl1', name: 'T01 Kaba torna', life: 600, warnPct: 85 }, { id: 'tl4', name: 'T04 İnce torna', life: 400, warnPct: 85 }] }
});
export async function seedIfEmpty() {
  if (!APPMODE.demo) return; // gerçek kullanımda örnek paket yüklenmez
  const all = await DB.all('pkgs');
  // önceki sürümden kalan örnek pakete örnek kurallar (bir kez)
  if (all.length) { await seedStations(); const sd = all.find(p => p.id === 'seed-fln120'); if (sd && !sd.rules && !(await DB.get('kv', 'seedRules'))) { sd.rules = SEED_RULES(); await DB.put('pkgs', sd); await DB.put('kv', 1, 'seedRules'); } return; }
  await DB.put('kv', 1, 'seedRules');
  const p = Object.assign(newPkg(), { id: 'seed-fln120', no: 'İE-2026-04817', partNo: 'FLN-120', part: 'FLN-120 Flanş', rev: 'C', op: 'Op 30 · CNC Torna', machine: 'TZG-04', target: 1500, cycle: 38, due: '14:30', priority: 'urgent', material: 'S355J2', note: 'Ø40 H7 deliğini her 10 parçada tampon mastarla kontrol et. T04 aşınma takibi.',
    files: [{ name: 'FLN-120.pdf', kind: 'pdf', bytes: b64bytes('smp-pdf') }, { name: 'FLN-120.step', kind: 'model', bytes: b64bytes('smp-step-fln') }], primary: 'FLN-120.pdf', plan: SEED_PLAN.map(b => Object.assign({}, b)),
    steps: STEP_TEMPLATES['CNC ilk parça'].map((s, i) => Object.assign({ id: 'st' + i }, s)), rules: SEED_RULES(), status: 'published', version: 1, dirty: false, publishedAt: Date.now() - 3600e3 });
  await DB.put('pkgs', p);
  await seedStations();
}

export function PrepTop({ theme, onTheme, sync, onFolder }) {
  const now = useNow(30000), d = new Date(now);
  const opUrl = location.href.split('#')[0];
  return html`<header className="top">
    <${Brand} />
    <span className="vsep"></span>
    <div className="sbig prepmode"><${I} n="layers" s=${20} /><span className="sname">Üretim Terminali Hazırlık</span></div>
    <div className="sp"></div>
    <div className="syncs">
      <span className=${'sync ' + (sync.bus ? 'on' : '')} title="Aynı bilgisayardaki operatör ekranlarına anında iletim"><i></i>Bu bilgisayar</span>
      <button className=${'sync ' + (sync.folder ? 'on' : '')} onClick=${onFolder} title="Ağ klasörü ile paylaşım"><i></i>${sync.folder ? 'Klasör: ' + sync.folder : Folder.supported ? 'Klasör bağla' : 'Klasör (desteklenmiyor)'}</button>
    </div>
    <a className="iconbtn tnav" ...${pl('cizim')} title="Çizim stüdyosu · PDF ve 3B okuma ayarları"><${I} n="lab" s=${22} /></a>
    <a className="callbtn tnav" ...${pl('')}><${I} n="gauge" s=${20} />Operatör ekranı</a>
    <div className="clock"><b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><small>Kalite & proses</small></div>
    <button className="iconbtn" onClick=${onTheme} aria-label="Tema değiştir"><${I} n=${theme === 'dark' ? 'sun' : 'moon'} /></button>
    <div className="op"><span className="av">${initials(ME())}</span><div><b>${ME()}</b><small>${ROLE_L[(MEU() || {}).role] || 'Proses / hazırlık'}</small></div></div>
  </header>`;
}

// Süzgeç bu sekme açıkken hatırlanır; yeni oturum bütün listeyle açılır (unutulmuş süzgeç paket gizlemesin).
const OTURUM = { get(k) { try { return JSON.parse(sessionStorage.getItem('arkon:' + k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem('arkon:' + k, JSON.stringify(v)); } catch (e) {} } };
const grupAdi: GrupAdi = (tur, kod) => (tur === 'istasyon' ? machineOf(kod).name : mcOf(kod)?.name) || undefined;

export function Field({ l, children, w }) { return html`<label className="pf" style=${w ? { gridColumn: 'span ' + w } : null}><span className="over">${l}</span>${children}</label>`; }

export function PrepApp() {
  const mob = useMob();
  const [mEdit, setMEdit] = useState(false);
  const [theme, setTheme] = useTheme();
  const [pkgs, setPkgs] = useState([]);
  const [cur, setCur] = useState(null);
  const [tab, setTab] = useState('info');
  const [q, setQ] = useState('');
  const [grup, setGrup] = useState(() => paketGrubuOku(LS.get('prepGrup')));
  const grupSec = k => { setGrup(k); LS.set('prepGrup', k); };
  const [suz, setSuz] = useState<PaketSuzgeci>(() => suzgecOku(OTURUM.get('prepSuzgec')));
  const suzKoy = (n: PaketSuzgeci) => { setSuz(n); OTURUM.set('prepSuzgec', n); };
  const suzSec = (a: SuzgecAlani, d: string | undefined) => { const n = Object.assign({}, suz); if (d === undefined) delete n[a]; else n[a] = d; suzKoy(n); };
  const [kapali, setKapali] = useState<string[]>([]);
  // Süzgeç ve gruplama paneli varsayılan kapalı: liste kalan yüksekliği alır; açıklığı cihazda hatırlanır.
  const [suzAcik, setSuzAcik] = useState(() => LS.get('prepSuzAcik') === true);
  const suzAc = (v: boolean) => { setSuzAcik(v); LS.set('prepSuzAcik', v); };
  const [toast, setToast] = useState(null);
  const [draws, setDraws] = useState([]);
  useEffect(() => { if (tab === 'docs') DB.all('draws').then(d => setDraws(d.sort((a, b) => b.updatedAt - a.updatedAt))).catch(() => {}); }, [tab]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [istekler, setIstekler] = useState<any[]>([]);
  const [sync, setSync] = useState({ bus: !!Bus, folder: null });
  const [folderH, setFolderH] = useState(null);
  const [planSel, setPlanSel] = useState(null);
  const [delArm, setDelArm] = useState(false);
  const [pv, setPv] = useState(false);
  const [gonderOnay, setGonderOnay] = useState<GonderimUyarisi | null>(null);
  const openPreview = async () => { if (cur) { if (saveT.current) { clearTimeout(saveT.current); saveT.current = 0; await DB.put('pkgs', cur); } LS.set('pvStation', cur.machine); } setPv(true); };
  const impRef = useRef(null), saveT = useRef(0);
  const say = useCallback((m, i = 'check', c = 'var(--hazard)', extra?) => setToast(Object.assign({ m, i, c, k: Date.now() }, extra || null)), []);
  useEffect(() => { const f = (e: any) => say((e.detail && e.detail.msg) || CAKISMA_ILETISI, 'alert', 'var(--hold)'); window.addEventListener(CAKISMA_OLAYI, f); return () => window.removeEventListener(CAKISMA_OLAYI, f); }, [say]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.undo ? 5200 : 2800); return () => clearTimeout(t); }, [toast]);
  const [olcuSec, setOlcuSec] = useState<(string | number)[]>([]);
  const [nSor, setNSor] = useState(null);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); document.documentElement.setAttribute('data-state', 'setup'); }, [theme]);
  const reload = async () => { const all = (await DB.all('pkgs')).sort((a, b) => b.updatedAt - a.updatedAt); setPkgs(all); const rs = await DB.all('results'); setResults(Object.fromEntries(rs.map(r => [r.id, r]))); setIstekler(await DB.all('requests').catch(() => [])); return all; };
  useEffect(() => { (async () => { await seedIfEmpty(); const all = await reload(); if (all[0]) setCur(all[0]); const h = await Folder.handle(); if (h) { setFolderH(h); const ok = await Folder.ready(h); setSync(s => Object.assign({}, s, { folder: h.name + (ok ? '' : ' (izin gerek)') })); } })(); }, []);
  useEffect(() => Bus.on(m => { if (m.type === 'pkg-approved' || (m.type === '$merged' && m.store === 'pkgs')) reload().then(all => { const n = all.find(x => x.id === m.id); if (n) setCur(c => c && c.id === n.id ? n : c); if (m.type === 'pkg-approved' && n) { beep(m.ok ? 'ok' : 'nok'); say(m.ok ? n.no + ' kalitece onaylandı · yayınlayabilirsin' : n.no + ' geri gönderildi · ' + (m.note || ''), m.ok ? 'check' : 'x', m.ok ? 'var(--run)' : 'var(--stop)'); } }); else if (m.type === 'pkg-draft') reload().then(all => { const n = all.find(x => x.id === m.id); if (n) setCur(c => c && c.id === n.id ? n : c); }); else if (m.type === 'result') reload().then(() => say('Operatörden ölçüm geldi · ' + (m.no || ''), 'target', 'var(--done)')); else if (m.type === 'feedback') reload().then(() => { beep('call'); say('Operatörden resim notu · ' + (m.no || ''), 'flag', 'var(--hazard)'); }); else if (m.type === 'progress') reload(); }), []);
  const p = cur;
  // Çizim Merkezi (kart #800): seçici ve "Yeni revizyon var" güncellemesi.
  const [mSec, setMSec] = useState(false), [mBusy, setMBusy] = useState(false);
  const mUyari = useMerkezUyarilari(cur ? cur.files : null);
  useEffect(() => { const f = (e: any) => say(KAYIT_GITMEDI + ' · ' + ((e.detail && e.detail.msg) || ''), 'alert', 'var(--stop)'); window.addEventListener(KAYIT_REDDI_OLAYI, f); return () => window.removeEventListener(KAYIT_REDDI_OLAYI, f); }, []);
  const merkezdenAl = async (belgeId, guncelleme) => {
    if (!p || !allowed('pkg.edit', say)) return;
    setMBusy(true);
    try {
      const f = await AKStore.Server.merkezdenAl(belgeId), r = merkezDosyasiniKoy(p, f);
      patch({ files: r.files, primary: r.primary, plan: r.planSifirla ? [] : p.plan, partNo: p.partNo || f.name.replace(/\.[^.]+$/, '') });
      say(f.name + (guncelleme ? ' güncellendi' : ' Çizim Merkezi’nden eklendi'), 'upload', 'var(--run)');
      setMSec(false);
    } catch (e) { say('Çizim Merkezi’nden alınamadı: ' + (e.message || e), 'alert', 'var(--stop)'); }
    setMBusy(false);
  };
  // Silinen ölçü numune kurallarından da düşer (data/kontrol-plani.ts); geri al, silmeden önceki planı ve numune planını yazar.
  const olcuSil = ids => {
    if (!p || !ids.length) return;
    const geri = { plan: p.plan, samp: p.samp }, s = olculeriSil(p.plan, p.samp || [], ids);
    patch(p.samp && p.samp.length ? s : { plan: s.plan }); setOlcuSec([]);
    say((ids.length === 1 ? (p.plan.find(b => b.id === ids[0]) || {}).nom || 'Ölçü' : ids.length + ' ölçü') + ' kontrol planından silindi', 'trash', 'var(--stop)', { undo: () => patch(geri) });
  };
  const herN = (id, n) => {
    if (!p) return;
    patch(numunePlaniYaz(p, herNParcaYap(sampOf(p), id, n, uidg))); setNSor(null);
    say((p.plan.find(b => b.id === id) || {}).nom + ' · her ' + Math.max(1, Math.floor(n)) + ' parçada bir kaliteye', 'target', 'var(--run)');
  };
  const patch = (ch) => { if (!allowed('pkg.edit', say)) return; setCur(o => { const n = Object.assign({}, o, ch, { updatedAt: Date.now(), dirty: true }); clearTimeout(saveT.current); saveT.current = setTimeout(() => { saveT.current = 0; DB.put('pkgs', n).then(reload); }, 500); return n; }); };
  const select = async (x) => { if (cur && saveT.current) { clearTimeout(saveT.current); saveT.current = 0; await DB.put('pkgs', cur); } setCur(x); setTab('info'); setPlanSel(null); setMEdit(true); reload(); };
  // A5 (kart #541): paket TMI'de emir açılınca oluşur; Arkon yerel paket açmaz.
  const create = () => { if (!allowed('pkg.edit', say)) return; if (!tmiyeGit('emir-ac')) say('Yeni paket TMI’de emir açılınca oluşur: Rota > Üretim emirleri’nde emri aç', 'alert', 'var(--hold)'); };
  const remove = async () => { if (!p || !allowed('pkg.del', say)) return; audit('paket', 'silindi', p.no, p.part); await DB.del('pkgs', p.id); Bus.send({ type: 'pkg-removed', id: p.id }); const all = await reload(); setCur(all[0] || null); say('Paket silindi', 'trash', 'var(--stop)'); };
  /** Çizim stüdyosunda kaydedilmiş çizimi pakete al: dosyalar + ana resim + okuma ayarı (+ balonlar varsa kontrol planı) */
  const useDraw = d => {
    const plan = d.bal && d.bal.length ? d.bal.map(b => Object.assign({ freq: 'İlk parça', crit: false }, b)) : (d.primary !== p.primary ? [] : p.plan);
    patch({ files: d.files.map(f => Object.assign({}, f)), primary: d.primary, readCfg: cfgFix(d.cfg), plan, partNo: p.partNo || d.name });
    say('“' + d.name + '” pakete eklendi' + (d.bal && d.bal.length ? ' · ' + d.bal.length + ' kontrol noktası' : ''), 'lab', 'var(--run)');
  };
  const openInLab = async e => { e.preventDefault(); if (!studyoAcilir(canSee)) return say(STUDYO_KAPALI, 'lock', 'var(--hold)'); if (cur) { clearTimeout(saveT.current); await DB.put('pkgs', cur); } LS.set('labOpen', { pkg: p.id }); navGo(null, 'cizim'); };
  const rmFile = kind => { const files = p.files.filter(x => x.kind !== kind); const primary = files.some(x => x.name === p.primary) ? p.primary : (files[0] && files[0].name) || null; patch({ files, primary, plan: primary !== p.primary ? [] : p.plan }); };
  const pickFolder = async () => {
    if (!Folder.supported) return say('Bu tarayıcı klasör erişimini desteklemiyor · paket dosyası kullan', 'alert', 'var(--hold)');
    try { let h = folderH; if (h && !(await Folder.ready(h, true))) h = null; if (!h) h = await Folder.pick(); setFolderH(h); setSync(s => Object.assign({}, s, { folder: h.name })); say('Paylaşım klasörü bağlandı: ' + h.name, 'layers', 'var(--run)'); } catch (e) { if (e.name !== 'AbortError') say('Klasör bağlanamadı: ' + e.message, 'alert', 'var(--stop)'); }
  };
  const publish = async (planOnayli = false) => { if (!allowed('pkg.publish', say)) return;
    const v = validate(p); if (v.some(x => !x.ok && !x.soft)) { say(istasyonsuzMu(p) ? ISTASYONSUZ_GONDERIM : rotaEksigi(p) ? rotaEksigi(p) + ' · yayınlanamadı' : 'Eksikler var · yayınlanamadı', 'alert', 'var(--stop)'); return; }
    clearTimeout(saveT.current);
    if (needApproval(p)) {
      if (apPending(p)) { say('Kalite onayı bekleniyor', 'clock', 'var(--hold)'); return; }
      const n = Object.assign({}, p, { apReq: { at: Date.now(), by: ME(), version: (p.version || 0) + 1 } }); await DB.put('pkgs', n); setCur(n); await reload();
      Bus.send({ type: 'pkg-approval', id: n.id, no: n.no }); audit('paket', 'onaya gönderildi', n.no, 'Rev ' + n.rev + ' · v' + ((p.version || 0) + 1)); say('Kaliteye onaya gönderildi · onaylanınca yayınlayabilirsin', 'target', 'var(--done)'); return;
    }
    // Kart #1257: canlı planda olmayan iş onaysız gönderilmez; pencere nedeni ve plan bağlantısını gösterir.
    const uyari = planOnayli ? null : gonderimUyarisi(p);
    if (uyari) { setGonderOnay(uyari); return; }
    const n = Object.assign({}, p, { status: p.status === 'draft' ? 'published' : p.status, version: (p.version || 0) + 1, dirty: false, publishedAt: Date.now(), updatedAt: Date.now(), apReq: null });
    // Ara onay (Terminal kural 1/5): sonraki değişiklik bu yayına göre bulunur.
    n.yayinImza = paketImzasi(n);
    n.history = (p.history || []).concat([{ v: n.version, rev: n.rev, at: Date.now(), by: ME(), ap: p.approval && p.approval.ok ? p.approval.by : null, st: n.machine }]).slice(-60);
    // okuma ayarı pakete sabitlenir: operatör tableti aynı ayarla açar (önbellek anahtarı aynı kalır)
    n.readCfg = cfgFix(p.readCfg || RCFG); const mcfg = n.readCfg, msig = cfgSig(mcfg, MODEL_KEYS);
    // 3B modeli bir kez burada işle, sonuçları pakete koy: operatör tabletinde çekirdek yüklenmez, model anında açılır
    const derived: Record<string, any> = {};
    for (const f of n.files.filter(f => f.kind === 'model')) {
      try { say('3B model operatör için hazırlanıyor…', 'cube', 'var(--done)'); const rec = await processModel(f.bytes, f.name, () => {}, { need: n.primary === f.name ? 'draw' : '3d', cfg: mcfg }); derived[(await fileHash(f.bytes)) + msig] = Object.assign({ kind: rec.kind, fa: rec.fa, V: rec.V }, n.primary === f.name && rec.D ? { D: rec.D } : null); } catch (e) { console.warn(e); }
    }
    n.derived = derived;
    await DB.put('pkgs', n); setCur(n); await reload();
    Bus.send({ type: 'pkg', id: n.id, no: n.no, rev: n.rev, version: n.version, machine: n.machine });
    let msg = n.no + ' · Rev ' + n.rev + ' operatöre gönderildi';
    if (folderH) { try { if (await Folder.ready(folderH, true)) { await Folder.write(folderH, n); msg += ' · klasöre yazıldı'; } } catch (e) { msg += ' · klasöre yazılamadı'; } }
    say(msg, 'check', 'var(--run)'); audit('paket', 'yayınlandı', n.no, 'Rev ' + n.rev + ' · v' + n.version + ' · ' + n.machine + (p.approval && p.approval.ok ? ' · onay: ' + p.approval.by : ''));
  };
  // Ara onay kararı içeriği değiştirmez: `updatedAt` ilerlemez (kalite onayı geçerli kalır). Kişi, an ve o ana kadarki numuneler sunucuda damgalanır.
  const yenidenKarar = async (on: boolean) => { if (!allowed('pkg.publish', say)) return; const ao = araOnayNedenleri(p, istekler); if (!ao) return;
    if (saveT.current) { clearTimeout(saveT.current); saveT.current = 0; }
    const n = Object.assign({}, p, { fpRe: { on, key: ao.anahtar, why: ao.nedenler[0].tur } }); await DB.put('pkgs', n); const all = await reload(); setCur(all.find(x => x.id === n.id) || n);
    audit('paket', on ? 'yeniden ilk parça istendi' : 'yeniden ilk parça istenmedi', n.no, ao.nedenler.map(x => x.etiket).join(' · '));
    say(on ? 'Yeniden başlatmada ilk parça onayı istenecek' : 'Yeniden başlatmada ilk parça onayı istenmeyecek', on ? 'target' : 'check', on ? 'var(--hold)' : 'var(--run)'); };
  const unpublish = async () => { if (!allowed('pkg.publish', say)) return; const n = Object.assign({}, p, { status: 'draft', dirty: true }); await DB.put('pkgs', n); setCur(n); await reload(); Bus.send({ type: 'pkg-removed', id: n.id }); audit('paket', 'geri çekildi', n.no); say('Operatörden geri çekildi', 'back', 'var(--hold)'); };
  const resolvePin = async (id, reply?) => { const r = await DB.get('results', p.id); if (!r) return; reply = reply || 'Hazırlık: incelendi ve düzeltildi'; r.pins = (r.pins || []).map(x => x.id === id ? Object.assign({}, x, { status: 'done', reply }) : x); await DB.put('results', r); Bus.send({ type: 'pin-resolved', id: p.id, reply }); await reload(); say('Not çözüldü · operatöre bildirildi', 'check', 'var(--run)'); };
  const exportPkg = () => download(Pkg.fileName(p), Pkg.toFile(p), 'application/json');
  const importPkg = async f => { if (!f || !allowed('pkg.edit', say)) return; if (!tmiPaketiMi(cur)) { say('Önce bir TMI paketi seç: dosya ona şablon olarak uygulanır', 'alert', 'var(--hold)'); return; } try { const n = sablonUygula(cur, Pkg.fromFile(await f.text()), Date.now()); await DB.put('pkgs', n); await reload(); setCur(n); say('Dosya şablon olarak uygulandı: ' + n.no, 'download', 'var(--run)'); } catch (e) { say('İçe aktarılamadı: ' + e.message, 'alert', 'var(--stop)'); } };

  const list = paketleriSuz(pkgs, suz, q);
  const gruplar = paketleriGrupla(list, grup, grupAdi);
  const nSuzAlan = suzgecSayisi(suz);
  const nSuz = nSuzAlan + (q.trim() ? 1 : 0);
  const katla = k => setKapali(x => x.includes(k) ? x.filter(y => y !== k) : x.concat(k));
  const hepsiKapali = gruplar.length > 0 && gruplar.every(g => kapali.includes(grup + ':' + g.anahtar));
  const v = p ? validate(p) : [];
  const done = k => v.filter(x => x.k === k).every(x => x.ok || x.soft);
  const TABS = [{ id: 'info', l: 'Bilgiler', i: 'list' }, { id: 'docs', l: 'Dokümanlar', i: 'upload' }, p && opOf(p) !== 'cnc' ? { id: 'st', l: OPTYPES[opOf(p)].tab, i: OPTYPES[opOf(p)].i } : null, { id: 'plan', l: 'Kontrol planı', i: 'target' }, p && opOf(p) === 'cnc' ? { id: 'samp', l: 'Numune', i: 'clock' } : null, { id: 'steps', l: 'Adımlar', i: 'check' }, { id: 'rules', l: 'Kurallar', i: 'bell' }, { id: 'pub', l: 'Yayınla', i: 'next' }].filter(Boolean);
  const ctl = useMemo(() => p && p.primary ? { key: p.id + ':' + p.primary + ':' + p.files.length, files: p.files, primary: p.primary, derived: p.derived, cfg: p.readCfg, bal: p.plan, setBal: nb => patch({ plan: (typeof nb === 'function' ? nb(p.plan) : nb).map(b => Object.assign({ freq: 'İlk parça', crit: false }, b)) }), meas: {}, setMeas: () => {}, readOnly: false, pins: (results[p.id] && results[p.id].pins) || [], onPinResolve: resolvePin } : null, [p && p.id, p && p.primary, p && p.files.length, p && p.plan, results]);
  const res = p && results[p.id];
  // Ara onay yalnız bir kez çalışmış işte sorulur: ilk çalışmada ilk parça kapısı zaten vardır.
  const calisti = !!(res && res.state && res.state !== 'queued');
  const araOnay = p && POLICY.fpRestart !== false && calisti ? araOnayNedenleri(p, istekler) : null;
  const araOnaySor = araOnay && !(p.fpRe && p.fpRe.key === araOnay.anahtar) ? araOnay : null;
  const S = p ? (k, val) => patch({ [k]: val }) : null;
  const pdfF = p && p.files.find(f => f.kind === 'pdf'), mdlF = p && p.files.find(f => f.kind === 'model');
  const pkKart = x => { const r = results[x.id]; const nm = r ? Object.keys(r.meas || {}).length : 0, nb = r ? Object.values<any>(r.meas || {}).filter(m => !m.ok).length : 0; const stt = PSTAT[r && r.state === 'done' ? 'done' : r && r.state && r.state !== 'queued' && x.status !== 'draft' ? 'production' : x.status];
            return html`<button key=${x.id} className=${'qc pk ' + (p && x.id === p.id ? 'sel' : '')} onClick=${() => select(x)}>
              <div><div className="no">${x.no}</div><div className="pt">${x.part || 'Adsız parça'}<span className="revc">Rev ${x.rev}</span>${x.priority === 'urgent' ? html`<span className="tag urgent">Acil</span>` : null}</div>
              <div className="mt"><span><${I} n=${OPTYPES[opOf(x)].i} s=${13} /> ${x.op || 'Operasyon girilmedi'}</span><span>${x.machine}</span><span>${x.target ? fmt(x.target) + ' adet' : 'Adet yok'}</span></div>
              <div style=${{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><span className="chip" style=${{ '--c': stt.c }}><i></i>${stt.l}</span><${PlanChip} p=${x} sira=${true} />${x.dirty && x.status !== 'draft' ? html`<span className="chip" style=${{ '--c': 'var(--hold)' }}>Değişiklik var</span>` : null}${r && (r.pins || []).some(z => z.status !== 'done') ? html`<span className="chip" style=${{ '--c': 'var(--hazard-ink)' }}><i></i>${r.pins.filter(z => z.status !== 'done').length} not</span>` : null}${nm ? html`<span className="mini">${nm}/${(x.plan || []).length} ölçüldü${nb ? html` · <b style=${{ color: 'var(--stop)' }}>${nb} red</b>` : null}</span>` : null}</div></div></button>`; };

  return html`<${Fragment}>
    <div className="aura"></div><div className="gridbg"></div><div className="grain"></div>
    <div className="app">
      <${PrepTop} theme=${theme} onTheme=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} sync=${sync} onFolder=${pickFolder} />
      <main className="pmain">
        <div className="col" style=${mob && mEdit ? { display: 'none' } : null}>
          <div className="qhead"><b>İş paketleri</b><span className="over">${pkgs.length} paket</span></div>
          <div className="pust">
            <div className="psearch glass"><${I} n="search" s=${18} /><input placeholder="Ara: iş emri, parça, istasyon…" aria-label="İş paketlerinde ara" value=${q} onChange=${e => setQ(e.target.value)} />${q ? html`<button className="pszx" aria-label="Aramayı temizle" onClick=${() => setQ('')}><${I} n="x" s=${16} /></button>` : null}</div>
            <button className=${'iconbtn psuzd ' + (suzAcik ? 'on' : '')} aria-expanded=${suzAcik} aria-label="Süzgeç ve gruplama" title="Süzgeç ve gruplama" onClick=${() => suzAc(!suzAcik)}><${I} n="filter" s=${18} />${nSuzAlan ? html`<em>${nSuzAlan}</em>` : null}</button>
            <button className="iconbtn psuzd pri" aria-label="Yeni paket" title="Yeni paket" onClick=${create}><${I} n="plus" s=${20} /></button>
            <button className="iconbtn psuzd" onClick=${() => impRef.current.click()} aria-label="Paket dosyası uygula" title="Paket dosyasını seçili pakete şablon olarak uygula"><${I} n="download" s=${18} /></button>
          </div>
          <input ref=${impRef} type="file" accept=".arkon,application/json" style=${{ display: 'none' }} onChange=${e => { importPkg(e.target.files[0]); e.target.value = ''; }} />
          ${suzAcik ? html`<div className="psuzpan">
            <div className="psuz" role="group" aria-label="Süzgeç">${SUZGEC_ALANLARI.map(([a, l]) => { const on = suz[a] !== undefined; return html`<label key=${a} className=${'psz ' + (on ? 'on' : '')}><span className="over">${l}</span><select value=${on ? 'v:' + suz[a] : ''} onChange=${e => suzSec(a, e.target.value ? e.target.value.slice(2) : undefined)}><option value="">Hepsi</option>${suzgecSecenekleri(pkgs, suz, a, grupAdi).map(o => html`<option key=${o.deger} value=${'v:' + o.deger}>${o.etiket} (${o.sayi})</option>`)}</select></label>`; })}</div>
            <span className="over">Grupla</span>
            <div className="pgrpbar"><div className="segs pgrp" role="group" aria-label="Paketleri grupla">${PAKET_GRUPLARI.map(([k, l]) => html`<button key=${k} className=${'seg ' + (grup === k ? 'on' : '')} aria-pressed=${grup === k} onClick=${() => grupSec(k)}>${l}</button>`)}</div>${gruplar.length > 1 ? html`<button className="iconbtn pgrpk" title=${hepsiKapali ? 'Grupları aç' : 'Grupları kapat'} aria-label=${hepsiKapali ? 'Grupları aç' : 'Grupları kapat'} onClick=${() => setKapali(x => hepsiKapali ? x.filter(y => !y.startsWith(grup + ':')) : x.concat(gruplar.map(g => grup + ':' + g.anahtar)))}><${I} n=${hepsiKapali ? 'chevd' : 'chevu'} s=${18} /></button>` : null}</div>
          </div>` : null}
          ${nSuz ? html`<div className="pszbar"><span className="over">${list.length + ' / ' + pkgs.length + ' paket'}</span><button className="pszt" onClick=${() => { suzKoy({}); setQ(''); }}><${I} n="x" s=${14} />Süzgeci temizle</button></div>` : null}
          <div className="queue">${gruplar.map(g => { const k = grup + ':' + g.anahtar, kp = kapali.includes(k); return html`<div key=${g.anahtar} className="pkgrp"><button className="pkgh" aria-expanded=${!kp} onClick=${() => katla(k)}><${I} n=${kp ? 'chev' : 'chevd'} s=${16} /><b className="mono">${g.baslik}</b><small className="muted">${g.alt}</small>${grup === 'emir' ? html`<span className="pkn">${g.paketler.length}</span>` : null}</button>${kp ? null : g.paketler.map(pkKart)}</div>`; })}${pkgs.length && !list.length ? html`<div className="pszbos muted">Süzgece uyan paket yok.<button className="pszt" onClick=${() => { suzKoy({}); setQ(''); }}><${I} n="x" s=${14} />Süzgeci temizle</button></div>` : null}</div>
        </div>
        ${p ? html`<section className="col pedit" style=${mob && !mEdit ? { display: 'none' } : null}>
          ${mob ? html`<button className="mback" onClick=${() => setMEdit(false)}><${I} n="back" s=${18} />Paketler</button>` : null}
          <div className="glass order"><div><span className="over">İş paketi · v${p.version || 0} ${p.dirty ? '· kaydedildi (yayınlanmadı)' : '· yayında'}</span><h1>${p.no}<span className="revbig">Rev ${p.rev}</span></h1><p>${p.part || 'Parça adı girilmedi'} · ${p.op} · ${p.machine}</p></div>
            <div className="facts"><button className="btn" style=${{ alignSelf: 'center' }} onClick=${openPreview}><${I} n="eye" s=${18} />Operatör gözüyle</button><div><span className="over">Hedef</span><b>${fmt(p.target || 0)}</b></div><div><span className="over">Kontrol</span><b>${p.plan.length}</b></div><div><span className="over">Adım</span><b>${p.steps.length}</b></div></div></div>
          <div className="stepper">${TABS.map((t, i) => html`<button key=${t.id} className=${'stp ' + (tab === t.id ? 'on ' : '') + (t.id !== 'pub' && done(t.id) ? 'ok' : '')} onClick=${() => setTab(t.id)}><span className="sn">${t.id !== 'pub' && done(t.id) ? html`<${I} n="check" s=${14} w=${3} />` : i + 1}</span>${t.l}</button>`)}</div>
          <div className="pbody">
          ${tab === 'info' ? html`<div className="glass pform fadein">
            <${Field} l="Operasyon tipi · operatör ekranı buna göre şekillenir" w=${3}><${TypePicker} v=${opOf(p)} onChange=${t => { const keep = tmiIsEmri(p) || machineOf(p.machine).t === t; patch({ opType: t, st: Object.assign(ST_DEFAULT[t](), opOf(p) === t ? p.st : {}), machine: keep ? p.machine : ((stationList().find(m => m.t === t) || {}).id || p.machine), mc: keep ? p.mc : '', op: keep ? p.op : OPTYPES[t].l }); }} /></${Field}>
            ${tmiIsEmri(p) ? html`<${Field} l="TMI iş emri" w=${3}><span className="muted">İş emri, operasyon, istasyon, adet, süreler, termin ve öncelik TMI planından gelir; burada resim, kontrol planı, adım ve kurallar hazırlanır.</span></${Field}>` : null}
            <${Field} l="İş emri no"><input value=${p.no} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('no', e.target.value)} /></${Field}>
            <${Field} l="Parça no"><input value=${p.partNo} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('partNo', e.target.value)} placeholder="FLN-120" /></${Field}>
            <${Field} l="Revizyon"><input value=${p.rev} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('rev', e.target.value.toUpperCase())} style=${{ fontWeight: 800 }} /></${Field}>
            <${Field} l="Parça adı" w=${2}><input value=${p.part} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('part', e.target.value)} placeholder="örn. FLN-120 Flanş" /></${Field}>
            <${Field} l="Malzeme"><input value=${p.material} onChange=${e => S('material', e.target.value)} placeholder="S355J2" /></${Field}>
            <${Field} l="Operasyon" w=${2}><input value=${p.op} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('op', e.target.value)} /></${Field}>
            <${Field} l="İstasyon">${tmiIsEmri(p) ? html`<input value=${p.machine} disabled title=${TMI_KILIT} />` : html`<${StationSelect} v=${p.machine} onChange=${v => patch({ machine: v, mc: '' })} />`}</${Field}>
            <${Field} l="Makine"><select value=${p.mc || ''} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('mc', e.target.value)}><option value="">${machineOf(p.machine).mcs.length ? 'İstasyondaki makine (seçilmedi)' : 'İstasyonda makine yok'}</option>${machineOf(p.machine).mcs.map(m => html`<option key=${m.id} value=${m.id}>${m.id} · ${m.name}</option>`)}</select></${Field}>
            <${Field} l="Hedef adet"><input type="number" min="1" value=${p.target} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('target', +e.target.value)} /></${Field}>
            <${Field} l="Çevrim süresi (sn)"><input type="number" min="1" value=${p.cycle ?? ''} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('cycle', +e.target.value)} /></${Field}>
            <${Field} l="Hazırlık süresi (dk)"><input type="number" min="0" value=${p.setup ?? ''} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('setup', e.target.value === '' ? null : +e.target.value)} /></${Field}>
            <${Field} l="Termin"><input value=${p.due} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onChange=${e => S('due', e.target.value)} placeholder="14:30 veya 05.10" /></${Field}>
            <${Field} l="Öncelik" w=${2}><div className="segs" style=${{ marginTop: 0 }}>${[['normal', 'Normal'], ['urgent', 'Acil']].map(([k, l]) => html`<button key=${k} className=${'seg ' + (p.priority === k ? 'on' : '')} disabled=${tmiIsEmri(p)} title=${tmiIsEmri(p) ? TMI_KILIT : null} onClick=${e => { e.preventDefault(); S('priority', k); }}>${l}</button>`)}</div></${Field}>
            <${Field} l="Operatöre not (iş açılınca ekranda görünür)" w=${3}><textarea rows="3" value=${p.note} onChange=${e => S('note', e.target.value)} placeholder="Dikkat edilecek noktalar, özel talimatlar…"></textarea></${Field}>
          </div>` : null}
          ${tab === 'docs' ? html`<div className="docs fadein">
            <div className="glass dcard wide2 labpick">
              <div className="dch"><span className="dk lab"><${I} n="lab" s=${20} /></span><div><b>Çizim stüdyosundan</b><span>Stüdyoda hazırlanan çizimler · PDF + 3B model, balonlar ve okuma ayarı birlikte gelir</span></div><a className="btn" href="#cizim" onClick=${openInLab}><${I} n="lab" s=${18} />Bu paketi stüdyoda aç</a></div>
              ${draws.length ? html`<div className="lplist">${draws.map(d => { const on = p.files.length && d.files.every(f => p.files.some(x => x.name === f.name && x.bytes.length === f.bytes.length)); return html`<div key=${d.id} className=${'lpi ' + (on ? 'on' : '')}>
                <div className="lpf">${d.files.map(f => html`<span key=${f.name} className=${'dk ' + (f.kind === 'pdf' ? 'pdf' : 'step')}>${f.kind === 'pdf' ? 'PDF' : '3B'}</span>`)}</div>
                <div><b>${d.name}</b><span>${d.files.map(f => f.name).join(' + ')}${d.bal && d.bal.length ? ' · ' + d.bal.length + ' balon' : ''}${d.cfg && cfgSig(cfgFix(d.cfg), PDF_KEYS.concat(LOOK_KEYS, MODEL_KEYS)) ? ' · özel ayar' : ''} · ${new Date(d.updatedAt).toLocaleDateString('tr-TR')}</span></div>
                ${on ? html`<span className="chip" style=${{ '--c': 'var(--run)' }}><i></i>Pakette</span>` : html`<button className="btn pri" onClick=${() => useDraw(d)}><${I} n="plus" s=${18} />Pakete ekle</button>`}
              </div>`; })}</div>` : html`<p className="muted" style=${{ margin: 0 }}>Henüz kayıtlı çizim yok. Çizim stüdyosunda PDF'i ve 3B modeli ekleyip <b>Kaydet</b> de; burada listelenir.</p>`}
            </div>
            ${merkezVar() ? html`<div className="glass dcard wide2">
              <div className="dch"><span className="dk lab"><${I} n="layers" s=${20} /></span><div><b>Çizim Merkezi’nden</b><span>Yayındaki PDF ve 3B model · merkezde yeni revizyon yayınlanınca burada görünür</span></div><button className="btn" onClick=${() => setMSec(true)}><${I} n="plus" s=${18} />Çizim Merkezi’nden ekle</button></div>
            </div>` : null}
            ${mSec ? html`<${MerkezSecici} onPick=${b => merkezdenAl(b.id, false)} onClose=${() => setMSec(false)} />` : null}
            <div className="glass dcard">
              <div className="dch"><span className="dk pdf">PDF</span><div><b>Teknik resim</b><span>CAD'den çıkmış PDF · ölçüler otomatik okunur</span></div></div>
              ${pdfF ? html`<div className="fileline"><${I} n="check" s=${18} w=${3} /><b>${pdfF.name}</b><span>${(pdfF.bytes.length / 1024).toFixed(0)} KB</span><${MerkezRozeti} f=${pdfF} uyari=${mUyari} mesgul=${mBusy} onGuncelle=${f => merkezdenAl(f.merkez, true)} /><button className="btn" onClick=${() => rmFile('pdf')}><${I} n="trash" s=${16} /></button></div>`
                : html`<p className="muted" style=${{ margin: 0 }}>${MERKEZDEN_EKLENIR}</p>`}
            </div>
            <div className="glass dcard">
              <div className="dch"><span className="dk step">3B</span><div><b>3B model</b><span>STEP önerilir · IGES, STL de olur</span></div></div>
              ${mdlF ? html`<div className="fileline"><${I} n="check" s=${18} w=${3} /><b>${mdlF.name}</b><span>${(mdlF.bytes.length / 1024).toFixed(0)} KB</span><${MerkezRozeti} f=${mdlF} uyari=${mUyari} mesgul=${mBusy} onGuncelle=${f => merkezdenAl(f.merkez, true)} /><button className="btn" onClick=${() => rmFile('model')}><${I} n="trash" s=${16} /></button></div>`
                : html`<p className="muted" style=${{ margin: 0 }}>${MERKEZDEN_EKLENIR}</p>`}
            </div>
            <div className="glass dcard wide2">
              <span className="over">Operatör ekranında ana resim</span>
              <div className="segs">${p.files.map(f => html`<button key=${f.name} className=${'seg ' + (p.primary === f.name ? 'on' : '')} onClick=${() => patch({ primary: f.name, plan: f.name !== p.primary ? [] : p.plan })}>${f.kind === 'pdf' ? 'PDF · ' + f.name : 'Modelden üret · ' + f.name}</button>`)}${!p.files.length ? html`<span className="muted" style=${{ padding: '0 10px' }}>Önce dosya ekle</span>` : null}</div>
              <p className="muted" style=${{ margin: '8px 0 0' }}>Ana resmi değiştirirsen kontrol planı sıfırlanır (balonlar resme bağlıdır).</p>
            </div>
            <div className="glass dcard wide2 fmt">
              <span className="over" style=${{ color: 'var(--hazard-ink)' }}>Hangi 3B format?</span>
              <div className="fmtgrid">
                ${[['STEP AP242 / AP214', 'Önerilen', 'Tam (B-rep) geometri. Çaplar, delikler, kademeler hassas okunur; teknik resim ve ölçüler üretilir. Tüm CAD\'ler verir.', 'run'],
                  ['IGES', 'Olur', 'Eski ama yaygın; yüzey tabanlı, bazen boşluklu. STEP yoksa kullan.', 'hold'],
                  ['STL', 'Sadece görüntü', 'Üçgen ağ; ölçüler yaklaşık. Görselleştirme için yeterli, ölçüm kaynağı olmamalı.', 'hold'],
                  ['SLDPRT, IPT, CATPart…', 'Desteklenmez', 'Üretici formatları kapalı; CAD\'den STEP olarak dışa aktar.', 'stop']].map(([a, b, c, t]) => html`<div key=${a} className="fmtc"><b>${a}</b><span className="chip" style=${{ '--c': 'var(--' + t + ')' }}><i></i>${b}</span><p>${c}</p></div>`)}
              </div>
            </div>
          </div>` : null}
          ${tab === 'plan' ? html`<div className="planwrap fadein">
            ${ctl ? html`<div className="planbp"><${BlueprintM} say=${say} theme=${theme} ctl=${ctl} /></div>` : html`<div className="glass empty"><${I} n="upload" s=${40} /><b>Önce bir teknik resim veya 3B model ekle</b><button className="btn pri" onClick=${() => setTab('docs')}>Dokümanlar</button></div>`}
            <div className="glass plantbl">
              <div className="dh"><b>Kontrol planı</b><span className="over">${p.plan.length} nokta</span>${olcuSec.length ? html`<button className="btn" style=${{ marginLeft: 'auto', color: 'var(--stop)' }} onClick=${() => olcuSil(olcuSec)}><${I} n="trash" s=${16} />Seçilenleri sil (${olcuSec.length})</button>` : null}</div>
              ${res && (res.pins || []).length ? html`<div className="pinlist"><span className="over" style=${{ color: 'var(--hazard-ink)' }}>Operatör notları · ${(res.pins || []).filter(x => x.status !== 'done').length} açık</span>${res.pins.map(x => html`<div key=${x.id} className=${'pinrow ' + (x.status === 'done' ? 'done' : '')}><span className="pn">${x.status === 'done' ? '✓' : '!'}</span><div><b>${x.text}</b><small>${x.by} · ${new Date(x.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small></div>${x.status !== 'done' ? html`<button className="btn" style=${{ height: 36 }} onClick=${() => resolvePin(x.id)}>Çözüldü</button>` : null}</div>`)}</div>` : null}
              ${p.plan.length ? (() => { const nc = p.plan.filter(b => methOf(b) === 'cmm').length; const setAllM = mm => patch({ plan: p.plan.map(x => Object.assign({}, x, { m: mm })) }); return html`<div className="mbulk"><span className="mleg" style=${{ marginRight: 'auto' }}><span><i></i><b style=${{ color: 'var(--man)' }}>${p.plan.length - nc}</b> elle</span><span><i className="c"></i><b style=${{ color: 'var(--cmm)' }}>${nc}</b> CMM</span></span><span className="muted" style=${{ fontSize: 12 }}>Tümü:</span><button className="btn" style=${{ color: 'var(--man)' }} onClick=${() => setAllM('man')}>Elle</button><button className="btn" style=${{ color: 'var(--cmm)' }} onClick=${() => setAllM('cmm')}><${I} n="hex" s=${14} />CMM</button></div>`; })() : null}
              ${!p.plan.length ? html`<p className="muted">Resimdeki önerileri onayla veya <b>◎</b> ile ölçünün yanına dokunarak nokta ekle.</p>` : null}
              <div className="insp">${p.plan.map(b => html`<div key=${b.id} className="prow">
                <label className="psel" title="Toplu silmek için seç"><input type="checkbox" checked=${olcuSec.includes(b.id)} onChange=${e => setOlcuSec(l => e.target.checked ? l.concat([b.id]) : l.filter(x => x !== b.id))} aria-label=${b.nom + ' seç'} /><span className=${'n ' + (methOf(b) === 'cmm' ? 'hx' : '')}>${b.id}</span></label>
                <div><b className="mono">${b.nom}</b><span>${b.tol} · ${b.tool}</span></div>
                <div className="pctl">${nSor === b.id ? html`<form className="nsor" onSubmit=${e => { e.preventDefault(); herN(b.id, +e.currentTarget.elements.n.value || 1); }}><span>Her</span><input name="n" type="number" min="1" defaultValue="10" autoFocus aria-label="Kaç parçada bir" /><span>parçada</span><button className="btn pri" type="submit">Tamam</button><button className="tool" type="button" onClick=${() => setNSor(null)} aria-label="Vazgeç"><${I} n="x" s=${14} /></button></form>`
                  : p.samp && p.samp.length ? html`<select value="" title="Numune planından gelir" onChange=${e => { if (e.target.value === 'n') setNSor(b.id); else if (e.target.value === 'tab') setTab('samp'); }}><option value="">${b.freq}</option>${opOf(p) === 'cnc' ? html`<option value="n">Her N parçada bir…</option>` : null}<option value="tab">Numune sekmesinde düzenle</option></select>`
                  : html`<select value=${b.freq || 'İlk parça'} onChange=${e => { if (e.target.value === 'n') setNSor(b.id); else patch({ plan: p.plan.map(x => x.id === b.id ? Object.assign({}, x, { freq: e.target.value }) : x) }); }}>${FREQ.map(f => html`<option key=${f}>${f}</option>`)}${opOf(p) === 'cnc' ? html`<option value="n">Her N parçada bir…</option>` : null}</select>`}
                <button className=${'mtog ' + methOf(b)} title="Ölçüm yöntemi: elle / CMM" onClick=${() => patch({ plan: p.plan.map(x => x.id === b.id ? Object.assign({}, x, { m: methOf(x) === 'cmm' ? 'man' : 'cmm' }) : x) })}>${methOf(b) === 'cmm' ? html`<${I} n="hex" s=${14} />CMM` : 'ELLE'}</button>
                  <button className="tool" title="Ölçülmeyecek: kontrol planından sil" onClick=${() => olcuSil([b.id])} aria-label=${b.nom + ' sil'}><${I} n="trash" s=${16} /></button></div>
                <button className=${'crit ' + (b.crit ? 'on' : '')} title="Kritik karakteristik" onClick=${() => patch({ plan: p.plan.map(x => x.id === b.id ? Object.assign({}, x, { crit: !x.crit }) : x) })}>KK</button>
              </div>`)}</div>
            </div>
          </div>` : null}
          ${tab === 'steps' ? html`<div className="glass steps-ed fadein">
            <div className="dh"><b>Operasyon adımları</b><span className="over">${p.steps.length} adım</span>
              <div style=${{ marginLeft: 'auto', display: 'flex', gap: 6 }}>${Object.keys(STEP_TEMPLATES).map(k => html`<button key=${k} className="btn" style=${{ height: 40 }} onClick=${() => patch({ steps: p.steps.concat(STEP_TEMPLATES[k].map(s => Object.assign({ id: uidg() }, s))) })}><${I} n="plus" s=${16} />${k}</button>`)}</div></div>
            <div className="sedl">${p.steps.map((s, i) => html`<div key=${s.id} className="sed">
              <span className="sn2">${i + 1}</span>
              <div className="sedf"><input className="st" value=${s.t} placeholder="Adım başlığı" onChange=${e => patch({ steps: p.steps.map(x => x.id === s.id ? Object.assign({}, x, { t: e.target.value }) : x) })} /><input className="sd" value=${s.d} placeholder="Açıklama / değer" onChange=${e => patch({ steps: p.steps.map(x => x.id === s.id ? Object.assign({}, x, { d: e.target.value }) : x) })} /></div>
              <button className=${'crit ' + (s.r ? 'on' : '')} onClick=${() => patch({ steps: p.steps.map(x => x.id === s.id ? Object.assign({}, x, { r: !x.r }) : x) })}>Zorunlu</button>
              <button className="tool" disabled=${i === 0} onClick=${() => { const a = p.steps.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; patch({ steps: a }); }} aria-label="Yukarı">↑</button>
              <button className="tool" onClick=${() => patch({ steps: p.steps.filter(x => x.id !== s.id) })} aria-label="Sil"><${I} n="trash" s=${18} /></button>
            </div>`)}</div>
            <button className="upl" style=${{ justifyContent: 'center' }} onClick=${() => patch({ steps: p.steps.concat([{ id: uidg(), t: '', d: '', r: false }]) })}><${I} n="plus" s=${22} /><b>Adım ekle</b></button>
          </div>` : null}
          ${tab === 'st' ? html`<${StEditor} p=${p} patch=${patch} say=${say} />` : null}
          ${tab === 'rules' ? html`<${RulesTab} p=${p} patch=${patch} say=${say} res=${res} />` : null}
          ${tab === 'samp' ? html`<${SampTab} p=${p} patch=${patch} say=${say} />` : null}
          ${tab === 'pub' ? html`<div className="pubwrap fadein">
            <div className="glass pubcard">
              <span className="over">Yayın öncesi kontrol</span>
              ${v.map((x, i) => html`<div key=${i} className=${'chk ' + (x.ok ? 'ok' : x.soft ? 'soft' : 'bad')}><span>${x.ok ? html`<${I} n="check" s=${16} w=${3} />` : '!'}</span><div><b>${x.l}</b><small>${x.d}</small></div>${!x.ok ? html`<button className="linkbtn" onClick=${() => setTab(x.k)}>Düzelt</button>` : null}</div>`)}
              <div className="pubgo">
                <div><span className="over">Hedef makine</span><b title=${p.machine}>${machineOf(p.machine).name || p.machine}</b><small>${p.status === 'draft' ? 'İlk yayın' : 'Güncelleme · v' + ((p.version || 0) + 1)}${['planlanmadi', 'kaynak-farkli'].includes(planEtiketi(p)) ? ' · operatöre plan canlıya alınınca düşer' : ''}</small></div>
                <button className="btn lg" onClick=${openPreview}><${I} n="eye" s=${20} />Önizle</button>
                <button className="btn lg pri" disabled=${v.some(x => !x.ok && !x.soft) || (!p.dirty && p.status !== 'draft') || apPending(p)} onClick=${() => publish()}><${I} n=${needApproval(p) ? 'target' : 'next'} s=${22} />${apPending(p) ? 'Onay bekleniyor' : needApproval(p) ? 'Kaliteye onaya gönder' : p.status === 'draft' ? 'Operatöre gönder' : p.dirty ? 'Güncellemeyi gönder' : 'Gönderildi'}</button>
              </div>
              ${POLICY.approval ? html`<div className=${'chk ' + (apOk(p) ? 'ok' : apRejected(p) ? 'bad' : 'soft')}><span>${apOk(p) ? html`<${I} n="check" s=${16} w=${3} />` : '!'}</span><div><b>Kalite onayı ${apOk(p) ? '· ' + p.approval.by + ' · ' + new Date(p.approval.at).toLocaleString('tr-TR') : apRejected(p) ? '· geri gönderildi' : apPending(p) ? '· bekleniyor' : '· gerekli'}</b><small>${apRejected(p) ? (p.approval.note || 'Not yok') + ' · ' + p.approval.by : apOk(p) ? 'Onaydan sonra değişiklik yapılırsa yeniden onay gerekir' : 'Ayarlar › Üretim › Çalışma kurallarında açık'}</small></div></div>` : null}
              ${araOnaySor ? html`<div className="chk soft"><span>!</span><div><b>Ara onay · ${araOnaySor.nedenler.map(x => x.etiket).join(' · ')}</b><small>Yeniden başlatmada ilk parça onayı istensin mi? İstenirse operatör kaliteden yeni onay almadan işi başlatamaz.</small></div><div className="araonay"><button className="btn" onClick=${() => yenidenKarar(true)}><${I} n="target" s=${16} />İstensin</button><button className="btn" onClick=${() => yenidenKarar(false)}><${I} n="check" s=${16} />İstenmesin</button></div></div>`
                : p.fpRe ? html`<div className=${'chk ' + (p.fpRe.on ? 'soft' : 'ok')}><span>${p.fpRe.on ? '!' : html`<${I} n="check" s=${16} w=${3} />`}</span><div><b>Yeniden ilk parça onayı ${p.fpRe.on ? 'istendi' : 'istenmedi'}${p.fpRe.by ? ' · ' + p.fpRe.by : ''}${p.fpRe.at ? ' · ' + new Date(p.fpRe.at).toLocaleString('tr-TR') : ''}</b><small>Ara onay kararı · yeni bir değişiklikte yeniden sorulur</small></div></div>` : null}
              ${(p.history || []).length ? html`<details className="phist"><summary>Yayın geçmişi · ${p.history.length}</summary>${p.history.slice().reverse().map((h, i) => html`<div key=${i} className="phrow"><b>v${h.v}</b><span>Rev ${h.rev}</span><span>${new Date(h.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span>${h.by}${h.ap ? ' · onay ' + h.ap : ''}</span><span>${h.st || ''}</span></div>`)}</details>` : null}
            </div>
            <div className="glass pubcard">
              <span className="over">İletim kanalları</span>
              <div className="chan"><${I} n="gauge" s=${22} /><div><b>Bu bilgisayardaki operatör ekranları</b><small>Anında · ${p.status !== 'draft' ? 'iletildi' : 'yayınlanınca'}</small></div><span className="chip" style=${{ '--c': 'var(--run)' }}><i></i>Hazır</span></div>
              <div className="chan"><${I} n="layers" s=${22} /><div><b>Ağ klasörü</b><small>${folderH ? folderH.name + ' · makine ekranları buradan alır' : 'Paylaşılan klasör seç (\\\\sunucu\\mes\\paketler gibi)'}</small></div><button className="btn" onClick=${pickFolder}>${folderH ? 'Değiştir' : 'Bağla'}</button></div>
              <div className="chan"><${I} n="download" s=${22} /><div><b>Paket dosyası (.arkon)</b><small>USB veya e-posta ile taşı · operatör içe aktarır</small></div><button className="btn" onClick=${exportPkg}>İndir</button></div>
              ${p.status !== 'draft' ? html`<button className="linkbtn" style=${{ color: 'var(--stop)' }} onClick=${unpublish}>Operatörden geri çek</button>` : null}
              <button className="linkbtn" style=${{ color: 'var(--stop)' }} onClick=${() => { if (delArm) { setDelArm(false); remove(); } else { setDelArm(true); setTimeout(() => setDelArm(false), 3000); } }}>${delArm ? 'Emin misin? Silmek için tekrar bas' : 'Paketi sil'}</button>
            </div>
            ${res ? html`<div className="glass pubcard">
              <span className="over">Üretimden gelen</span>
              <div className="chan"><${I} n="box" s=${22} /><div><b>${fmt(res.good || 0)} / ${fmt(p.target)} iyi · ${res.scrap || 0} hurda</b><small>Durum: ${ST[res.state] ? ST[res.state].l : '—'} · ${new Date(res.at).toLocaleTimeString('tr-TR')}</small></div></div>
              <div className="insp" style=${{ maxHeight: 220 }}>${p.plan.map(b => { const m = (res.meas || {})[b.id]; return html`<div key=${b.id} className="irow"><span className=${'n ' + (m ? (m.ok ? 'ok' : 'nok') : '')}>${b.id}</span><div><b className="mono">${b.nom}</b><span>${b.tol}</span></div><em className=${m ? (m.ok ? 'ok' : 'nok') : ''}>${m ? m.v : '—'}</em></div>`; })}</div>
            </div>` : null}
          </div>` : null}
          </div>
        </section>` : html`<section className="col"><div className="glass empty"><b>Paket yok</b><button className="btn pri" onClick=${create}>Yeni paket</button></div></section>`}
      </main>
    </div>
    ${pv && p ? html`<${PreviewOv} id=${p.id} onClose=${() => setPv(false)} />` : null}
    ${gonderOnay && p ? html`<${PlanOnayOv} uyari=${gonderOnay} onClose=${() => setGonderOnay(null)} onSend=${() => { setGonderOnay(null); publish(true); }} />` : null}
    ${toast ? html`<div key=${toast.k} className=${'toast ' + (toast.undo ? 'act' : '')} role="status"><span className="ti" style=${{ '--c': toast.c }}><${I} n=${toast.i} s=${18} /></span>${toast.m}
      ${toast.undo ? html`<button className="tbtn" onClick=${() => { const f = toast.undo; setToast(null); f(); }}><${I} n="rotate" s=${16} />Geri al</button><i className="tbar"></i>` : null}</div>` : null}
  </${Fragment}>`;
}

/** Kart #1257: canlı planda olmayan işi operatöre gönderirken onay penceresi (neden, plana bağlantı, "Yine de gönder"). */
function PlanOnayOv({ uyari, onClose, onSend }: { uyari: GonderimUyarisi; onClose: () => void; onSend: () => void }) {
  const plana = () => { if (tmiyeGit('plan')) onClose(); };
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" role="dialog" aria-label="Plan dışı gönderim" style=${{ width: 'min(560px, 100%)' }}>
    <div className="ov-h"><div><span className="over">Operatöre gönder</span><h2>${uyari.neden}</h2>${uyari.taslakta ? html`<p>Plana git ve taslağı "Canlıya al" ile yayınla (plan canlıya alma yetkisi gerekir); iş o zaman canlı plana geçer.</p>` : null}<p>${uyari.gorunmez ? 'Ayar açık: iş, plan canlıya alınana kadar Üretim Terminali\'nde görünmez ve başlatılamaz.' : 'İş operatöre düşer ve plansız başlatılabilir. Plan sırası ve süreleri bu işi içermez.'}</p></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    <div className="ov-f"><button className="btn lg" onClick=${plana}><${I} n="calendar" s=${20} />Plana git</button><button className="btn lg" onClick=${onClose}>Vazgeç</button><button className="btn lg pri" onClick=${onSend}><${I} n="next" s=${20} />Yine de gönder</button></div>
  </div></div>`;
}
