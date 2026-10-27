import type { User } from '@shared/model';
import { AKStore } from '../data/store';
import { bekleyenKayitIletisi } from '../data/bekleyen-kayit';
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Fragment, I, T0, html, perf, useEffect, useMemo, useRef, useState } from './temel';
import { LS, preloadFiles } from './yukleyici';
import { MEU, POLICY, ROLE_L, canSee, currentShift, downWindows, expandDown, firstPage, initials, loadCfg, oeeCalc, permsFrom, shiftWindows, unionMs } from './ortak-ayarlar';
import { App } from './operator';
import { Bus, PrepApp } from './hazirlik';
import { QualityApp } from './kalite';
import { DrawLabApp } from './cizim-studyosu';
import { CallBanner, LoginApp, SettingsApp, useSrv } from './giris-ayarlar-spc';
import { gomuluMu, pinGirisiVar } from './gomulu';
import { BoardApp, KuyrukApp, PlanApp, availSlots, callsFrom, parseDue, schedule } from './pano-planlama';
import { MaintApp, ReportsApp } from './bakim-raporlar';
import { AnomaliApp } from './anomali';

export const MobCtx = React.createContext(false);
export function useMob() { return React.useContext(MobCtx); }
/* ── Gezinme: masaüstünde sol menü, mobilde logoya dokununca açılan menü. Sayfalar aynı sekmede değişir ── */
export const RAIL = 84;
export const NAV = [{ h: '', l: 'Operatör', i: 'gauge', d: 'Makine / istasyon ekranı' }, { h: 'pano', l: 'Pano', i: 'grid', d: 'Bütün istasyonlar canlı · TV modu' }, { h: 'planlama', l: 'Plan Kuyruğu', i: 'list', d: 'İş emri sırası, planlı duruşlar' }, { h: 'hazirlik', l: 'Üretim Terminali Hazırlık', i: 'layers', d: 'İş paketleri, kontrol planı' }, { h: 'anomali', l: 'Üretim Anomalisi', i: 'alert', d: 'Beklenen ve üretilen adet, eksikler' }, { h: 'kalite', l: 'Kalite', i: 'target', d: 'Numune, SPC, onay, ölçü aletleri' }, { h: 'bakim', l: 'Bakım', i: 'wrench', d: 'Arızalar, periyodik bakım, MTBF/MTTR' }, { h: 'raporlar', l: 'Raporlar', i: 'chart', d: 'OEE, duruş, hurda, çağrı, bakım' }, { h: 'cizim', l: 'Çizim', i: 'lab', d: 'PDF ve 3B okuma ayarları' }];
export const NavCtx = React.createContext<{ open: () => void } | null>(null);
/** Tema tüm sayfalarda ortak (sayfa değişince korunur) */
export function useTheme() {
  const [t, set] = useState(() => LS.get('theme') || 'dark');
  /* TMI çerçevesinde tema kabuktan gelir (istemci arkon/baglanti.ts temayiUygula) */
  useEffect(() => { const f = () => set(LS.get('theme') || 'dark'); window.addEventListener('arkon-tema', f); return () => window.removeEventListener('arkon-tema', f); }, []);
  return [t, (v: string) => { set(v); LS.set('theme', v); }];
}
export const navGo = (e: MouseEvent | null, h: string) => { if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return; if (e) e.preventDefault(); if (location.hash.replace(/^#/, '') !== h) { if (h) location.hash = h; else history.pushState(null, '', location.pathname + location.search), window.dispatchEvent(new HashChangeEvent('hashchange')); } };
export function Brand({ compact }: { compact?: boolean }) {
  const nav = React.useContext(NavCtx), mob = useMob();
  if (mob && nav) return html`<button className="brand bmenu" onClick=${nav.open} aria-label="Sayfalar menüsü"><span className="mark"></span><span className="bm"><${I} n="menu" s=${14} w=${3} /></span></button>`;
  return compact ? html`<span className="mark"></span>` : html`<div className="brand"><span className="mark"></span><b>ÜRETİM</b><i>HAZIRLIK</i></div>`;
}
export function RailStatus() {
  const st = useSrv(), me = MEU();
  // Cihaz deposu açılamadıysa (gizli pencere, dolu disk) kuyruk bellektedir: sekme kapanınca gönderilmemiş kayıt kaybolur, operatör görmeli.
  const tone = st.memory ? 'off' : st.mode !== 'server' ? 'loc' : st.online ? (st.pending ? 'pend' : 'on') : 'off';
  const tip = st.memory ? 'Cihaz deposu açılamadı · gönderilmemiş kayıtlar sekme kapanınca kaybolur' : st.mode !== 'server' ? 'Yerel mod · veriler bu cihazda' : st.online ? (st.pending ? st.pending + ' kayıt gönderiliyor' : 'Sunucuya bağlı · ' + st.base) : 'Sunucuya ulaşılamıyor · ' + (st.pending || 0) + ' kayıt bekliyor (bağlantı gelince gönderilir)';
  return html`<div className="rstat">${me && !gomuluMu() ? html`<button onClick=${() => window.dispatchEvent(new Event('arkon-switch'))} className="rme" title=${me.name + ' · ' + ROLE_L[me.role] + ' · dokun: kişi değiştir'}><span className="av">${initials(me.name)}</span></button>` : null}<span className=${'rdot ' + tone} title=${tip}><i></i>${st.memory ? 'Kayıt riski' : tone === 'loc' ? 'Yerel' : tone === 'off' ? 'Kopuk' : tone === 'pend' ? st.pending : 'Bağlı'}</span></div>`;
}
export function NavRail({ cur, nWait }: { cur: string; nWait: number }) {
  return html`<nav className="rail" aria-label="Sayfalar">
    <a className="rlogo" href="#" onClick=${(e: MouseEvent) => navGo(e, '')} title="Üretim Hazırlık"><span className="mark"></span></a>
    ${NAV.filter(n => canSee(n.h)).map(n => html`<a key=${n.h} href=${'#' + n.h} className=${'ri ' + (cur === n.h ? 'on' : '')} onClick=${(e: MouseEvent) => navGo(e, n.h)} aria-current=${cur === n.h ? 'page' : null} title=${n.l + ' · ' + n.d}>
      <span className="rico"><${I} n=${n.i} s=${24} />${n.h === 'kalite' && nWait ? html`<b className="rbad">${nWait}</b>` : null}</span><span className="rl">${n.l}</span></a>`)}
    <div className="rsp"></div>
    <${RailStatus} />
    <a href="#ayarlar" className=${'ri ' + (cur === 'ayarlar' ? 'on' : '')} onClick=${(e: MouseEvent) => navGo(e, 'ayarlar')} aria-current=${cur === 'ayarlar' ? 'page' : null} title="Ayarlar · ekran modülleri, performans, tema"><span className="rico"><${I} n="gear" s=${22} /></span><span className="rl">Ayarlar</span></a>
    <span className="rver">v26</span>
  </nav>`;
}
export function NavSheet({ cur, nWait, onClose }: { cur: string; nWait: number; onClose: () => void }) {
  const me = MEU();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return html`<div className="navov" onClick=${onClose}><nav className="navsheet glass" onClick=${(e: MouseEvent) => e.stopPropagation()} aria-label="Sayfalar">
    <div className="nsh"><div className="brand"><span className="mark"></span><b>ÜRETİM</b><i>HAZIRLIK</i></div><button className="x" onClick=${onClose} aria-label="Kapat"><${I} n="x" s=${20} /></button></div>
    ${NAV.filter(n => canSee(n.h)).map(n => html`<a key=${n.h} href=${'#' + n.h} className=${'nsi ' + (cur === n.h ? 'on' : '')} onClick=${(e: MouseEvent) => { navGo(e, n.h); onClose(); }}><span className="rico"><${I} n=${n.i} s=${24} /></span><div><b>${n.l}</b><small>${n.d}</small></div>${n.h === 'kalite' && nWait ? html`<em className="rbad">${nWait}</em>` : null}</a>`)}
    <a href="#ayarlar" className=${'nsi ' + (cur === 'ayarlar' ? 'on' : '')} onClick=${(e: MouseEvent) => { navGo(e, 'ayarlar'); onClose(); }}><span className="rico"><${I} n="gear" s=${24} /></span><div><b>Ayarlar</b><small>Ekran modülleri, performans, tema</small></div></a>
    ${me && !gomuluMu() ? html`<button className="nsi" onClick=${() => { onClose(); window.dispatchEvent(new Event('arkon-switch')); }}><span className="rico"><${I} n="user" s=${24} /></span><div><b>Kişi değiştir</b><small>${me.name} · ${ROLE_L[me.role]}</small></div></button>` : null}
    <small className="muted" style=${{ marginTop: 'auto', padding: '8px 4px' }}>Üretim Hazırlık v26 · internetsiz çalışır</small>
  </nav></div>`;
}
export function useFit() {
  const [mob, setMob] = useState(() => window.innerWidth < 900 || (window.innerWidth < 1200 && window.innerHeight > window.innerWidth * 1.05));
  useEffect(() => {
    const f = () => { const W = window.innerWidth, H = window.innerHeight; const m = W < 900 || (W < 1200 && H > W * 1.05); setMob(m); document.documentElement.classList.toggle('mob', m);
      const RL = m || /^#onizle/.test(location.hash) ? 0 : RAIL; document.documentElement.style.setProperty('--rail', RL + 'px');
      if (m) { const r = document.documentElement; r.style.zoom = '1'; r.style.setProperty('--vw', W + 'px'); r.style.setProperty('--vh', H + 'px'); r.style.setProperty('--u', (H / 100) + 'px'); r.style.setProperty('--z', '1'); return; }
      let z = Math.min(W / (1600 + RL), H / 900); try { const ov = parseFloat(localStorage.getItem('arkon:scale') ?? ''); if (ov) z *= ov; } catch (e) {} z = Math.max(0.5, Math.min(2, z)); const r = document.documentElement; r.style.zoom = String(z); r.style.setProperty('--vw', (W / z) + 'px'); r.style.setProperty('--vh', (H / z) + 'px'); r.style.setProperty('--u', (H / z / 100) + 'px'); r.style.setProperty('--z', String(z)); };
    f(); window.addEventListener('resize', f); window.addEventListener('orientationchange', f); window.addEventListener('hashchange', f); return () => { window.removeEventListener('resize', f); window.removeEventListener('orientationchange', f); window.removeEventListener('hashchange', f); };
  }, []);
  return mob;
}
export function Root() {
  const mob = useFit();
  const [sess, setSess] = useState(() => AKStore.Auth.current()), [needLogin, setNeedLogin] = useState<boolean | null>(null), [cfgTick, setCfgTick] = useState(0);
  useEffect(() => { AKStore.Auth.required().then(r => setNeedLogin(pinGirisiVar(r, gomuluMu()))); const f = () => setSess(null); window.addEventListener('arkon-logout', f); return () => window.removeEventListener('arkon-logout', f); }, []);
  // Açılışta ayar çizimden önce zaten yüklendi (aşağıda, render öncesi): ilk çalıştırma ikinci kez okumasın; kişi değişince yeniden okunur.
  const cfgIlk = useRef(true);
  useEffect(() => { if (cfgIlk.current) { cfgIlk.current = false; return; } if (sess) loadCfg().then(() => setCfgTick(t => t + 1)); }, [sess && sess.id]);
  useEffect(() => Bus.on(m => { if (m.type === 'cfg') loadCfg().then(() => setCfgTick(t => t + 1)); }), []);
  const [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => setH(location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const cur = h.replace(/^#/, '').split(':')[0], preview = cur === 'onizle';
  const [nWait, setNWait] = useState(0), [sheet, setSheet] = useState(false);
  useEffect(() => {
    const f = async () => { try { const rs = await AKStore.DB.all('requests'); setNWait(rs.filter(r => r.status === 'waiting' || r.status === 'measuring').length); } catch (e) {} };
    f(); const off = Bus.on(m => { if (m && /sample|result/.test(m.type)) setTimeout(f, 300); }); const t = setInterval(f, 20000);
    return () => { off && off(); clearInterval(t); };
  }, [h]);
  useEffect(() => { setSheet(false); window.scrollTo(0, 0); }, [h]);
  const nav = useMemo(() => ({ open: () => setSheet(true) }), []);
  /* yönetici ve amir girince, tablette başkasının gönderilmemiş kaydı varsa bir kez bilgi verilir (var olan toast kalıbı) */
  const srv = useSrv(), [bekleyenBilgi, setBekleyenBilgi] = useState<string | null>(null), bildirilen = useRef(new Set());
  useEffect(() => {
    if (!sess || preview || bildirilen.current.has(sess.id)) return;
    const m = bekleyenKayitIletisi(sess.role, srv.baskasi); if (!m) return;
    bildirilen.current.add(sess.id); setBekleyenBilgi(m);
  }, [sess && sess.id, srv.baskasi, preview]);
  useEffect(() => { if (!bekleyenBilgi) return; const t = setTimeout(() => setBekleyenBilgi(null), 7000); return () => clearTimeout(t); }, [bekleyenBilgi]);
  /* ortak tablet: vardiya değişince ve uzun süre dokunulmayınca kilit; "Kişi değiştir" ile hızlı geçiş. Ekran kilit altında açık kalır (iş kaydı kaybolmaz) */
  const [lock, setLock] = useState<{ why: 'idle' | 'shift' | 'switch'; pre?: User['id'] } | null>(null), lastAct = useRef(Date.now());
  const onLogin = (u: User) => { LS.set('loginShift', currentShift(Date.now()).s); LS.set('lastUser', u.id); return loadCfg().then(() => { setSess(u); setLock(null); setCfgTick(t => t + 1); if (!canSee(cur)) location.hash = firstPage(); }); };
  useEffect(() => { if (sess && !LS.get('loginShift')) LS.set('loginShift', currentShift(Date.now()).s); }, [sess && sess.id]);
  useEffect(() => {
    const f = (e: Event) => { const idle = POLICY.idleLock > 0 && sess && needLogin && !lock && Date.now() - lastAct.current > POLICY.idleLock * 60e3; lastAct.current = Date.now(); if (idle) { e.stopPropagation(); e.preventDefault(); setLock({ why: 'idle', pre: sess.id }); } };
    window.addEventListener('pointerdown', f, true); window.addEventListener('keydown', f, true);
    return () => { window.removeEventListener('pointerdown', f, true); window.removeEventListener('keydown', f, true); };
  }, [sess, needLogin, lock]);
  useEffect(() => {
    if (!sess || !needLogin) return;
    const chk = () => { if (!POLICY.shiftLogout || sess.role === 'admin' || lock) return; const s0 = LS.get('loginShift'), vr = currentShift(Date.now()), cs = vr.s; if (!vr.tanimsiz && s0 && s0 !== cs) setLock({ why: 'shift' }); };
    chk(); const t = setInterval(chk, 20000); return () => clearInterval(t);
  }, [sess, needLogin, lock]);
  useEffect(() => { if (gomuluMu()) return; const f = () => setLock({ why: 'switch' }); window.addEventListener('arkon-switch', f); return () => window.removeEventListener('arkon-switch', f); }, []);
  if (needLogin === null) return null;
  if (needLogin && !sess && cur !== 'ayarlar') return html`<${MobCtx.Provider} value=${mob}><${LoginApp} onDone=${(u: User | null, skip?: boolean) => { if (u) onLogin(u); }} /></${MobCtx.Provider}>`;
  if (sess && !canSee(cur) && cur !== 'onizle') { setTimeout(() => { location.hash = firstPage(); }, 0); return null; }
  void cfgTick; // ayar değişince sayfalar yeniden çizilir (yeniden kurulmaz: yazılmamış kayıt kaybolmaz)
  const page = h === '#pano' ? html`<${BoardApp} />` : h === '#planlama' ? html`<${PlanApp} />` : h === '#kuyruk' ? html`<${KuyrukApp} />` : h === '#bakim' ? html`<${MaintApp} />` : h === '#raporlar' ? html`<${ReportsApp} />` : h === '#kalite' ? html`<${QualityApp} />` : h.indexOf('#onizle:') === 0 ? html`<${App} preview=${decodeURIComponent(h.slice(8))} />` : h === '#hazirlik' ? html`<${PrepApp} />` : h === '#anomali' ? html`<${AnomaliApp} />` : h === '#cizim' ? html`<${DrawLabApp} />` : h === '#ayarlar' ? html`<${SettingsApp} />` : html`<${App} />`;
  return html`<${MobCtx.Provider} value=${mob}><${NavCtx.Provider} value=${preview ? null : nav}>
    ${!mob && !preview ? html`<${NavRail} cur=${cur} nWait=${nWait} />` : null}
    <${Fragment} key=${cur}>${page}</${Fragment}>
    ${!preview && !lock ? html`<${CallBanner} cur=${cur} />` : null}
    ${bekleyenBilgi ? html`<div className="toast" role="status"><span className="ti" style=${{ '--c': 'var(--hold)' }}><${I} n="alert" s=${18} /></span>${bekleyenBilgi}</div>` : null}
    ${lock && !preview ? html`<div className="lockov"><${LoginApp} lock=${lock} onCancel=${lock.why === 'switch' ? () => setLock(null) : null} onDone=${(u: User | null) => { if (u) onLogin(u); }} /></div>` : null}
    ${sheet && mob ? html`<${NavSheet} cur=${cur} nWait=${nWait} onClose=${() => setSheet(false)} />` : null}
  </${NavCtx.Provider}></${MobCtx.Provider}>`;
}
/* testler için (tests/duman.mjs) saf hesap işlevleri */
window.__arkonTest = { oeeCalc, parseDue, expandDown, downWindows, shiftWindows, permsFrom, unionMs, schedule, availSlots, callsFrom };
Promise.all([preloadFiles(), AKStore.init().catch(e => console.warn(e))]).then(() => loadCfg()).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(html`<${Root} />`);
  requestAnimationFrame(() => setTimeout(() => perf('acilis:ilk-cizim', T0), 0));
}).catch(e => { document.getElementById('root')!.innerHTML = '<p style="padding:24px;font:16px sans-serif;color:#f66">Dosyalar yüklenemedi: ' + e.message + '<br>Projeyi yerel bir sunucuyla açın (README).</p>'; });
