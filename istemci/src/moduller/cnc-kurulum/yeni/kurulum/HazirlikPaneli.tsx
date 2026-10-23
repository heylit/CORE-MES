import type { ReactNode } from 'react';
import type { EmirSecenegi, HazirlikCevabi, KurulumDurumu } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Simge } from '../../../../ortak/arayuz/Simge.tsx';
import { state } from '../depo.ts';
import { D } from '../durum.ts';
import { clamp, fmtN, num } from '../bicim.ts';
import { byId, invKey, machine, material, stockOf, toolById, tools } from '../secici.ts';
import { coolHint, cutData, holderOf } from '../hesap/kesme.ts';
import { fmtT } from '../hesap/gkod.ts';
import { cycleOf, fmtDur, lifeCard } from '../hesap/omur.ts';
import { capDefOf } from '../hesap/sinirlar.ts';
import {
  PR, PR_DESC, PS, STK_SRC, prChecks, prFixCap, prFixN, prGroup, prInfo, prIsDone, prLathe, prPendOk, prPerTool, prProg, prSrcText, prStep,
  prStk, prStkKg, prStkLabel, prStkVol, prSuggest, prToolEval, prToolNote, prTs, type HazirlikAdimi, type AdimSecimi, type KontrolMaddesi,
} from '../hesap/hazirlik.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';
import type { CncYetkisi } from '../veri.ts';
import { PRT, prtInit, prtTool } from './deneme.ts';
import {
  LVL_IC, MF, PU, TAPER_OPTS, izinli, kilitli, prAccAll, prCat, prCurStep, prGo, prMachMain, prPocket, prQ, prQty, prRemove, prSelIdx,
  prSetFixN, prSetMF, prStkAuto, prStkSet, prSug, prTitleOf, prToggle, prUI, prWcs, secimAl, secimCebi, secimListesi, type Secenek,
} from './hazirlik-eylem.ts';
import { KalemSimgesi } from './HazirlikSimgesi.tsx';
import { DegisinceGirdi, Kv, StokMetni, useOran } from './parcalar.tsx';
import { operasyon, saat } from './secim.ts';

// Hazırlık paneli (prototip prPanel 21310-21433), üretim emri kartı ve onay kaydı (cerceve-kopru.ts 388-425, 840-903).

export type PanelEylemi = 'ok' | 'file' | 'print' | 'sim' | 'life' | 'toTrial' | 'trApply' | 'toStock';

interface Ortam { yetki: CncYetkisi; eylem: (a: PanelEylemi) => void }

function Ayrinti({ o, depo }: { o: Secenek | null; depo?: boolean }) {
  if (!o) return null;
  return (
    <>
      <div className="tc-ck-hz-buyuk"><small>{o.code ?? ''}</small><b>{o.name}</b><span>{[o.tags, o.desc].filter(Boolean).join(' · ')}</span></div>
      {depo && <Kv k="Depo"><StokMetni s={stockOf(invKey(o))} /></Kv>}
    </>
  );
}
// Eksik sayı prototipte NaN olarak yazılır ("%NaN"); aynı kalır.
const nan = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
const uyariMetni = (w: unknown): string => {
  if (typeof w === 'string') return w;
  const u = w as { msg?: string; t?: string } | null;
  return u?.msg ?? u?.t ?? '';
};
function Hucre({ k, v, b }: { k: string; v: ReactNode; b: string }) { return <div><small>{k}</small><b>{v}</b><i>{b}</i></div>; }
function Uyari({ children }: { children: ReactNode }) { return <div className="tc-ck-hz-uyari"><Simge ad="alert" boyut="k" /> {children}</div>; }
function Seviye({ lvl }: { lvl: 'ok' | 'warn' | 'err' }) { return <i>{LVL_IC[lvl]}</i>; }

function OmurCubugu({ oran }: { oran: number }) {
  const ref = useOran<HTMLDivElement>(oran);
  return <div className="tc-ck-hz-omur" ref={ref}><i /></div>;
}

function TezgahFormu({ m, kapali }: { m: Tezgah; kapali: boolean }) {
  const I = prInfo(m), cdd = capDefOf(m);
  return (
    <div className="tc-ck-hz-form2 tc-ck-hz-mform">
      {MF.map((f) => {
        const ham: unknown = f.temel ? (f.k === 'name' ? m.baseName ?? m.name : (m as unknown as Record<string, unknown>)[f.k]) : I[f.k];
        const v = ham == null ? '' : String(ham as string | number), tam = f.k === 'note' || f.k === 'ctrlUnit', cd = (cdd as Record<string, number | string | undefined>)[f.k];
        let alan: ReactNode;
        if (f.tur === 'ctrl') {
          alan = (
            <select value={m.ctrl === 'heid' ? 'heid' : 'iso'} disabled={kapali} onChange={(e) => { prSetMF('ctrl', e.target.value); }}>
              <option value="heid">Heidenhain Klartext</option><option value="iso">ISO / G-kod</option>
            </select>
          );
        } else if (f.tur === 'taper') {
          alan = <select value={m.taper} disabled={kapali} onChange={(e) => { prSetMF('taper', e.target.value); }}>{TAPER_OPTS.map((t) => <option key={t}>{t}</option>)}</select>;
        } else {
          const ipucu = f.k === 'marka' && I['marka0'] ? String(I['marka0']) : cd != null ? `${String(cd)} (katalog)` : f.ipucu ?? '';
          alan = <DegisinceGirdi key={m.id} type={f.tur === 'num' ? 'number' : 'text'} deger={v} placeholder={ipucu} disabled={kapali} isle={(x) => { prSetMF(f.k, x); }} />;
        }
        return <label key={f.k} className={tam ? 'tc-ck-hz-tam' : undefined}>{f.ad}{alan}</label>;
      })}
    </div>
  );
}

function CepIzgarasi({ pk }: { pk: number }) {
  const m = machine(), arr = tools(), Ts = prTs(), req: Record<number, number> = {};
  Ts.forEach((T) => { req[T - 1] = T; });
  const cepler: ReactNode[] = [];
  for (let p = 0; p < m.pockets; p++) {
    const id = arr[p], t = id && id !== 'empty' ? toolById(id) : null, cls: string[] = [], T = req[p];
    if (p === pk) cls.push('on');
    if (T) { const ev = prToolEval(T), dn = prIsDone({ key: `T${String(T)}`, g: 'tools', T }); cls.push(ev.lvl === 'err' ? 'err' : dn ? 'ok' : 'pend'); } else if (Ts.length) cls.push('dim');
    if (!t) cls.push('emp');
    cepler.push(
      <button type="button" key={p} className={cls.join(' ')} title={`Cep ${String(p + 1)}${t ? ` · ${t.name}` : ' · boş'}`} onClick={() => { prPocket(p); }}>
        <u>{p + 1}</u>{t ? <KalemSimgesi o={t} /> : <em>boş</em>}<span>{t ? t.name.replace(/Freze|Frezesi/, 'Fr.').replace('Matkap', 'Mt.') : ''}</span>
      </button>,
    );
  }
  Ts.filter((T) => T > m.pockets).forEach((T) => { cepler.push(<span key={`y${String(T)}`} className="err nopk"><u>{T}</u><em>cep yok</em></span>); });
  return (
    <>
      <div className="tc-ck-sh">{m.type === 'lathe' ? 'Taret' : 'Magazin'} yerleşimi <em>{arr.filter((x) => x !== 'empty').length} / {m.pockets} dolu</em></div>
      <div className="tc-ck-hz-lejant"><span className="l-on">şu an</span><span className="l-ok">onaylı</span><span className="l-pend">programda</span><span className="l-err">sorunlu</span></div>
      <div className="tc-ck-hz-cepler">{cepler}</div>
    </>
  );
}

function Ozet() {
  const m = machine();
  return (
    <>
      <div className="tc-ck-sh">Hazırlık özeti</div>
      <div className="tc-ck-hz-ozet">
        {PR.seq.map((st, i) => {
          if (st.g === 'final' || st.g === 'trial') return null;
          const S = prStep(st); let v = '';
          if (st.g === 'prog') { const s = prSrcText(); v = s ? `${s.name} · ${String(PS().qty)} adet` : 'Programsız'; }
          else if (st.g === 'material') v = `${material().name} · ${prStkLabel(prStk())}`;
          else if (st.T) { const id = tools()[st.T - 1]; v = st.T > m.pockets ? 'cep yok' : id && id !== 'empty' ? toolById(id).name : 'BOŞ'; }
          else if (st.key === 'mag') v = `${String(tools().filter((x) => x !== 'empty').length)} / ${String(m.pockets)} cep dolu`;
          else if (S?.kind === 'multi') v = `${String(S.list().length)} kalem`;
          else {
            const o = S ? byId<Secenek>(S.opts, secimAl(S)) : null; v = o ? o.name : '—';
            if (st.g === 'fixture' && prFixN() > 1) v += ` ×${String(prFixN())}`;
            if (st.g === 'zero') { const w = byId(D.WCS[m.ctrl], state.wcs[m.ctrl]); if (w) v += ` · ${w.name}`; }
          }
          const dn = prIsDone(st), lv = st.T ? prToolEval(st.T).lvl : 'ok';
          return (
            <button type="button" key={st.key} className={`${i === PR.at ? 'on ' : ''}${dn ? 'dn' : ''}`} onClick={() => { prGo(i); }}>
              <i className={dn ? lv : 'wait'}>{dn ? LVL_IC[lv] : '○'}</i><span>{st.T ? `T${String(st.T)}` : prGroup(st.g).t}</span><b>{v}</b>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Denetimler({ ch }: { ch: KontrolMaddesi[] }) {
  return (
    <div className="tc-ck-hz-mesaj">
      {ch.map((c, i) => (c.go != null
        ? <button type="button" key={i} className={`${c.lvl} lnk`} onClick={() => { if (c.go != null) prGo(c.go); }}><Seviye lvl={c.lvl} />{c.txt}</button>
        : <div key={i} className={c.lvl}><Seviye lvl={c.lvl} />{c.txt}</div>))}
    </div>
  );
}

function Takimlar({ st, S, kapali }: { st: HazirlikAdimi; S: AdimSecimi; kapali: boolean }) {
  const m = machine(), pk = secimCebi(S), mag = st.key === 'mag', arrT = tools(), curId = arrT[pk], curT = curId && curId !== 'empty' ? toolById(curId) : null;
  PU.sug = {};
  let ust: ReactNode = null;
  if (!mag && st.T) {
    const T = st.T, e = prToolEval(T), note = prToolNote(T), sg = prSuggest(T);
    sg.forEach((x) => { PU.sug[x.t.id] = true; });
    const cd = e.t ? cutData(e.t, material(), m) : null, qty = num(PS().qty, 1);
    ust = (
      <>
        {note && <div className="tc-ck-hz-not"><small>Programdaki not · T{T}</small>{note}</div>}
        {sg.length > 0 && (
          <>
            <div className="tc-ck-sh">Programa uygun takımlar <em>tıkla → cep {T}</em></div>
            <div className="tc-ck-hz-oneri">
              {sg.map((x) => {
                const on = curId === x.t.id;
                return (
                  <button type="button" key={x.t.id} className={on ? 'on' : undefined} disabled={kapali} onClick={() => { prSug(x.t.id); }}>
                    <KalemSimgesi o={x.t} /><span><b>{x.t.name}</b><small>{x.t.code ?? ''}{x.why.length ? ` · uyan: ${x.why.join(', ')}` : ''}</small></span><i>{on ? '✓ takılı' : 'Tak'}</i>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="tc-ck-hz-mesaj">{e.msgs.map((x, i) => { const lv = /yeterli/.test(x) ? 'ok' : e.lvl; return <div key={i} className={lv}><Seviye lvl={lv} />{x}</div>; })}</div>
        {e.t && (
          <>
            <div className="tc-ck-hz-buyuk"><small>Cep {T} · {e.t.code ?? ''}</small><b>{e.t.name}</b><span>{holderOf(e.t, m)}</span></div>
            {e.cutT != null && <Kv k="Parça başı kesme">{fmtN(e.cutT, 2)} dk{e.cutT ? ` · parti ${fmtN(e.cutT * qty, 0)} dk` : ''}</Kv>}
            {e.S ? <Kv k="Programdaki devir">{fmtN(e.S)} dev/dk{cd?.n ? <span className="tc-ck-mut"> (önerilen {fmtN(cd.n)})</span> : null}</Kv> : null}
            {e.c && e.c.st !== 'na' && <Kv k="Ömür · yedek">%{Math.round(nan(e.c.pct) * 100)} · ≈{fmtN(e.c.parts)} parça · yedek {e.c.spare == null ? '—' : e.c.spare}</Kv>}
            <Kv k="Depo"><StokMetni s={stockOf(invKey(e.t))} /></Kv>
          </>
        )}
      </>
    );
  } else {
    let omur: ReactNode = null;
    if (curT) {
      try { const lc0 = lifeCard(m, pk, curT, material(), arrT, cycleOf(m, arrT)); if (lc0.st !== 'na') omur = <Kv k="Ömür">%{Math.round(nan(lc0.pct) * 100)} · ≈{fmtN(nan(lc0.parts))} parça kaldı</Kv>; } catch { /* ömür modeli tanımıyorsa satır yok */ }
    }
    ust = (
      <>
        <div className="tc-ck-hz-buyuk"><small>Cep {pk + 1}</small><b>{curT ? curT.name : 'Boş cep'}</b><span>{curT ? holderOf(curT, m) : 'Çarktan takım seçin ya da boş bırakın'}</span></div>
        {omur}
        {curT && <Kv k="Depo"><StokMetni s={stockOf(invKey(curT))} /></Kv>}
      </>
    );
  }
  let arama: ReactNode = null;
  if (pk < m.pockets) {
    const ck = `p${String(pk)}`, cat = PS().cat[ck] ?? (curT && curT.kind !== 'probe' ? curT.cat ?? '*' : '*');
    const cats = D.TOOL_CATS.filter((c) => m.type === 'millturn' || c.lib === (m.type === 'lathe' ? 'lathe' : 'mill'));
    arama = (
      <>
        <div className="tc-ck-sh">Çarkta göster</div>
        <input type="search" className="tc-ck-hz-ara" placeholder="Ara: ad, kod, çap (ör. ø10, matkap, M8)" value={PR.q[ck] ?? ''} disabled={kapali} onChange={(e) => { prQ(pk, e.target.value); }} />
        <div className="tc-ck-hz-kat">
          <button type="button" className={cat === '*' ? 'on' : undefined} disabled={kapali} onClick={() => { prCat(pk, '*'); }}>Tümü</button>
          {cats.map((c) => <button type="button" key={c.k} className={cat === c.k ? 'on' : undefined} disabled={kapali} onClick={() => { prCat(pk, c.k); }}>{c.t}</button>)}
        </div>
      </>
    );
  }
  return <>{ust}{arama}<CepIzgarasi pk={pk} /></>;
}

function Liste({ st, S, dn, kapali }: { st: HazirlikAdimi; S: AdimSecimi; dn: boolean; kapali: boolean }) {
  const foc = S.opts[prSelIdx(st, S)], L1 = secimListesi(S) ?? [], inL = !!foc && L1.includes(foc.id);
  return (
    <>
      <div className={`tc-ck-hz-secim ${L1.length ? 'ok' : 'none'}`}>
        <b>{L1.length ? `✓ ${String(L1.length)} kalem seçili` : 'Henüz seçili kalem yok'}</b>
        <span>{dn ? 'Liste onaylandı' : L1.length ? 'Liste tamamsa Enter / “Onayla” ile onaylayın' : 'Çarktan kart seçip Boşluk ya da tıklama ile ekleyin'}</span>
      </div>
      <div className="tc-ck-hz-liste">
        {L1.length ? L1.map((id) => {
          const o = byId<Secenek>(S.opts, id); if (!o) return null;
          return (
            <div key={id}>
              <button type="button" className="tc-ck-hz-odak" onClick={() => { PU.focus[st.key] = (S.opts as readonly Secenek[]).indexOf(o); prUI(); }}><KalemSimgesi o={o} /><b>{o.name}</b></button>
              <button type="button" className="tc-ck-hz-cikar" title="Listeden çıkar" aria-label="Listeden çıkar" disabled={kapali} onClick={() => { prRemove(id); }}><Simge ad="x" boyut="k" /></button>
            </div>
          );
        }) : <div className="tc-ck-mut"><b>—</b></div>}
      </div>
      {foc && (
        <>
          <div className="tc-ck-sh">Çarkta seçili kart</div>
          <Ayrinti o={foc} depo />
          <div className="tc-ck-dugmeler">
            <Dugme tur={inL ? 'ikincil' : 'birincil'} simge={inL ? 'minus' : 'plus'} disabled={kapali} onClick={prToggle}>{inL ? 'Listeden çıkar' : 'Listeye ekle'} <kbd>Boşluk</kbd></Dugme>
          </div>
        </>
      )}
    </>
  );
}

export function DenemeCanli() {
  const mat = material(), kg = PRT.removed / 1e6 * ((mat as { rho?: number }).rho || 7.85);
  const degisim = Object.values(PRT.chg).reduce((a, n) => a + n, 0);
  return (
    <>
      <div className="tc-ck-hz-hucreler">
        <Hucre k="Biten parça" v={PRT.part} b={`/ ${String(PRT.target)}`} />
        <Hucre k="Kaldırılan talaş" v={fmtN(PRT.removed / 1000, PRT.removed < 1e4 ? 1 : 0)} b={`cm³ · ${fmtN(kg, kg < 1 ? 3 : 2)} kg`} />
        <Hucre k="Takım değişimi" v={degisim} b="adet" />
      </div>
      <div className="tc-ck-sh">Takım ömürleri <em>güvenli değişim süresine göre</em></div>
      <div className="tc-ck-hz-tomur">
        {Object.keys(PRT.wear).map((k) => {
          const T = Number(k), t = prtTool(T), TR = PRT.TR[T], w = PRT.wear[T] ?? 0, pct = TR ? clamp(1 - w / TR, 0, 1) : null, per = prPerTool(T)?.t ?? 0;
          const left = TR && per ? Math.max(0, Math.floor((TR - w) / per)) : null;
          const cls = PRT.over[T] === 2 ? 'err' : PRT.over[T] ? 'warn' : pct == null ? '' : pct < 0.2 ? 'warn' : 'ok';
          return (
            <div key={k} className={`${T === PRT.curT ? 'on ' : ''}${cls}`}>
              <span>T{T}</span><b>{t ? t.name : '—'}</b><OmurCubugu oran={pct ?? 0} />
              <small>{pct == null ? 'takip yok' : `%${String(Math.round(pct * 100))}${left != null ? ` · ≈${String(left)} parça` : ''}`} · değişim {PRT.chg[T] ?? 0}{PRT.spK[T] ? ` · yedek ${String(PRT.spare[T] ?? 0)}` : ''}</small>
            </div>
          );
        })}
      </div>
      <div className="tc-ck-sh">Olaylar</div>
      <div className="tc-ck-hz-olay">
        {PRT.log.length ? PRT.log.slice(0, 14).map((l, i) => <div key={i} className={l.c}>{l.t}</div>) : <div className="tc-ck-mut">Henüz olay yok — ▶ ile başlatın</div>}
      </div>
    </>
  );
}

function Govde({ st, S, o }: { st: HazirlikAdimi; S: AdimSecimi | null; o: Ortam }) {
  const m = machine(), dn = prIsDone(st), kapali = kilitli(o.yetki), ize = (a: string) => izinli(o.yetki, a);
  const sel = S?.kind === 'single' ? byId<Secenek>(S.opts, S.get()) : null;
  switch (st.g) {
    case 'machine': {
      const I = prInfo(m), tip = ({ mill: 'Freze', lathe: 'Torna', millturn: 'Freze-torna' } as Record<string, string>)[m.type] ?? m.type;
      return (
        <>
          <div className="tc-ck-hz-buyuk">
            <small>{[I['ctrlUnit'] || (m.ctrl === 'heid' ? 'Heidenhain' : 'ISO / G-kod'), I['loc']].filter(Boolean).join(' · ')}</small>
            <b>{prMachMain(m)}</b><span>{m.code ?? ''}{I['seri'] ? ` · S/N ${String(I['seri'])}` : ''}{I['yil'] ? ` · ${String(I['yil'])}` : ''}</span>
          </div>
          <div className="tc-ck-hz-hucreler">
            <Hucre k={m.type === 'lathe' ? 'Taret' : 'Magazin'} v={m.pockets} b="cep" />
            <Hucre k="Aparat" v={prFixCap(m)} b="aynı anda" />
            <Hucre k="Devir" v={`${fmtN(m.rpm / 1000, m.rpm % 1000 ? 1 : 0)}k`} b="dev/dk" />
          </div>
          <Kv k="Tip">{tip}</Kv>
          <Kv k="Program dili">{m.ctrl === 'heid' ? 'Heidenhain Klartext' : 'ISO / G-kod'}</Kv>
          <Kv k="Takım bağlantısı">{m.taper || '—'}</Kv>
          {(I['xT'] || I['yT'] || I['zT']) && <Kv k="Kurslar X/Y/Z">{[I['xT'], I['yT'], I['zT']].map((v) => (v ? fmtN(Number(v)) : '—')).join(' / ')} mm</Kv>}
          {(I['tbl'] || I['load']) && <Kv k="Tabla">{[I['tbl'], I['load'] ? `${fmtN(Number(I['load']))} kg` : ''].filter(Boolean).join(' · ')}</Kv>}
          {I['kw'] ? <Kv k="İş mili gücü">{fmtN(Number(I['kw']), Number(I['kw']) % 1 ? 1 : 0)} kW</Kv> : null}
          {I['pallet'] ? <Kv k="Palet">{String(I['pallet'])} adet</Kv> : null}
          {I['note'] ? <p className="tc-ck-not">{String(I['note'])}</p> : null}
          <details className="tc-ck-hz-form" open={PU.mfOpen} onToggle={(e) => { PU.mfOpen = e.currentTarget.open; }}>
            <summary><Simge ad="edit" boyut="k" /> Tezgâh bilgilerini düzenle</summary>
            <TezgahFormu m={m} kapali={kapali} />
            <p className="tc-ck-not">Değişiklikler bu tezgâha kaydedilir; Kurulum, Takım Ömrü ve diğer sayfalar da aynı bilgiyi kullanır.</p>
          </details>
        </>
      );
    }
    case 'prog': {
      const p = prProg(), src = prSrcText(), qty = num(PS().qty, 1);
      return (
        <>
          <div className="tc-ck-hz-form2">
            <label>Parti adedi<DegisinceGirdi type="number" min="1" deger={PS().qty ?? ''} disabled={kapali} isle={prQty} /></label>
            {ize('file') && <div className="tc-ck-hz-dosya"><Dugme simge="upload" disabled={kapali} onClick={() => { o.eylem('file'); }}>Dosyadan yükle</Dugme></div>}
          </div>
          {!src && <p className="tc-ck-not">Programsız hazırlıkta takım adımı magazin kontrolüne dönüşür.</p>}
          {src && p?.err && <Uyari>Program okunamadı: {p.err}</Uyari>}
          {src && p && !p.err && (
            <>
              <div className="tc-ck-hz-buyuk"><small>{p.heid ? 'Heidenhain Klartext' : 'ISO G-kod'}</small><b>{p.name}</b><span>{fmtN(p.lines.length)} satır</span></div>
              <div className="tc-ck-hz-hucreler">
                <Hucre k="Çevrim" v={fmtT(p.total)} b="dk:sn" /><Hucre k="Kesme" v={fmtT(p.stat?.feedT)} b="dk:sn" /><Hucre k="Takım" v={p.tools.length} b="adet" />
              </div>
              <Kv k="Takımlar">{p.tools.map((T) => `T${String(T)}`).join(' · ') || '—'}</Kv>
              {p.blk && <Kv k="BLK FORM">{[p.blk.max.x - p.blk.min.x, p.blk.max.y - p.blk.min.y, p.blk.max.z - p.blk.min.z].map((v) => fmtN(Math.abs(v), 1)).join(' × ')} mm</Kv>}
              <Kv k="Parti süresi">{fmtDur(nan(p.total) * qty / 60)}</Kv>
              {!!p.heid !== (m.ctrl === 'heid') && <Uyari>{p.heid ? 'Heidenhain programı, tezgâh ISO kontrollü' : 'ISO program, tezgâh Heidenhain kontrollü'}</Uyari>}
              {p.warn.length > 0 && <p className="tc-ck-not">{p.warn.slice(0, 3).map((w, i) => <span key={i}>• {uyariMetni(w)}<br /></span>)}</p>}
            </>
          )}
        </>
      );
    }
    case 'material': {
      const s = prStk(), kg = prStkKg(s), qty = num(PS().qty, 1), ms = sel as (Kalem & { iso?: string; rho?: number }) | null;
      const alan = (k: 'd' | 'l' | 'x' | 'y' | 'z', ad: string, v: number | undefined) => (
        <label key={k}>{ad}<DegisinceGirdi type="number" min="1" step="0.5" deger={v ?? ''} disabled={kapali} isle={(x) => { prStkSet(k, x, s); }} /></label>
      );
      return (
        <>
          <Ayrinti o={ms ? { ...ms, code: `ISO ${ms.iso ?? '?'} · ρ ${fmtN(ms.rho || 7.85, 2)} g/cm³` } : null} />
          <div className="tc-ck-sh">Ham ölçü <em>{STK_SRC[s.src]}</em></div>
          {s.bar
            ? <div className="tc-ck-hz-form2">{alan('d', 'Çap Ø (mm)', s.d)}{alan('l', 'Boy (mm)', s.l)}</div>
            : <div className="tc-ck-hz-form3">{alan('x', 'X (mm)', s.x)}{alan('y', 'Y (mm)', s.y)}{alan('z', 'Z (mm)', s.z)}</div>}
          <div className="tc-ck-hz-hucreler">
            <Hucre k="Ağırlık" v={fmtN(kg, kg < 10 ? 2 : 1)} b="kg / adet" /><Hucre k="Parti" v={fmtN(kg * qty, 1)} b="kg" /><Hucre k="Hacim" v={fmtN(prStkVol(s) / 1000, 0)} b="cm³" />
          </div>
          <div className="tc-ck-dugmeler">
            {ize('stkAuto') && <Dugme onClick={prStkAuto}>Otomatik ölçü</Dugme>}
            {ize('toStock') && <Dugme simge="chev-right" onClick={() => { o.eylem('toStock'); }}>Ham Malzeme sayfası</Dugme>}
          </div>
        </>
      );
    }
    case 'fixture': case 'jaw': {
      const cap = prFixCap(m), fn0 = prFixN();
      return (
        <>
          <Ayrinti o={sel} depo />
          {st.g === 'fixture' && !prLathe() && (
            <>
              <div className="tc-ck-sh">Tablaya bağlanacak aparat</div>
              <div className="tc-ck-hz-sayac">
                {ize('fixN-') && <Dugme simge="minus" aria-label="Azalt" disabled={fn0 <= 1} onClick={() => { prSetFixN(fn0 - 1); }} />}
                <b>{fn0}</b>
                {ize('fixN+') && <Dugme simge="plus" aria-label="Artır" disabled={fn0 >= cap} onClick={() => { prSetFixN(fn0 + 1); }} />}
                <span>adet · tezgâh kapasitesi {cap}{cap === 1 && ize('mfEdit') ? <> — <button type="button" className="tc-ck-hz-bag" onClick={() => { PU.mfOpen = true; prGo(0); prUI(); }}>kapasiteyi değiştir</button></> : null}</span>
              </div>
              {fn0 > 1 && <p className="tc-ck-not">Her aparata bir ham parça bağlanır; sıfır noktaları sırayla {m.ctrl === 'heid' ? 'Preset' : 'G54, G55…'} olarak gösterilir.</p>}
            </>
          )}
        </>
      );
    }
    case 'zero':
      return (
        <>
          <Ayrinti o={sel} depo />
          <label className="tc-ck-hz-etiket">{m.ctrl === 'heid' ? 'Preset satırı' : 'İş koordinatı'}
            <select value={state.wcs[m.ctrl] ?? ''} disabled={kapali} onChange={(e) => { prWcs(e.target.value); }}>
              {D.WCS[m.ctrl].map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <p className="tc-ck-not">Turuncu küre = iş sıfırı: {prLathe() ? 'parça alın yüzeyi, eksen merkezi.' : 'ham parçanın sol-ön-üst köşesi.'}</p>
        </>
      );
    case 'tools': return S ? <Takimlar st={st} S={S} kapali={kapali} /> : null;
    case 'cool': {
      const hc = byId(D.COOL, coolHint(material()));
      return (
        <>
          <Ayrinti o={sel} />
          {hc && <div className={hc.id === state.coolant ? 'tc-ck-hz-iyi' : 'tc-ck-hz-uyari'}>{hc.id === state.coolant ? '✓ ' : '! '}{material().name} için önerilen: <b>{hc.name}</b></div>}
        </>
      );
    }
    case 'gauges': case 'cons': return S ? <Liste st={st} S={S} dn={dn} kapali={kapali} /> : null;
    case 'trial': {
      const trel = num((state.life as { trel?: unknown } | null)?.trel, 80);
      return (
        <>
          {PRT.err && <div className="tc-ck-hz-uyari">{PRT.err}</div>}
          {PRT.L?.lathe && <p className="tc-ck-not">Tornada talaş görselleştirmesi yok; takım ömrü denemesi süre üzerinden çalışır.</p>}
          <label className="tc-ck-hz-kutu"><input type="checkbox" checked={PRT.fromCur} disabled={kapali} onChange={(e) => { PRT.fromCur = e.target.checked; prtInit(); prUI(); }} /> Takımların mevcut aşınmasından başla</label>
          <DenemeCanli />
          <div className="tc-ck-dugmeler">
            {ize('trApply') && <Dugme tur="birincil" disabled={!PRT.part} onClick={() => { o.eylem('trApply'); }}>Sonucu takım ömrüne işle</Dugme>}
            {ize('life') && <Dugme simge="chev-right" onClick={() => { o.eylem('life'); }}>Takım ömrü sayfası</Dugme>}
          </div>
          <p className="tc-ck-not">Kesim yüksekliği haritası takımın çapı ve uç şekliyle (düz, küresel, konik) hesaplanır. Ömür: genişletilmiş Taylor + %{trel} güvenle değişim süresi; her parça sonunda dolan takım yedekle değiştirilir.</p>
        </>
      );
    }
    case 'final': {
      const ch = prChecks(), ne = ch.filter((c) => c.lvl === 'err').length, nw = ch.filter((c) => c.lvl === 'warn').length, fin = dn, bek = prPendOk().length;
      const ts0 = PS().fin?.['ts'], ts = typeof ts0 === 'number' ? ts0 : null;
      return (
        <>
          <div className={`tc-ck-hz-hazir ${fin ? 'fin' : ne ? 'bad' : 'go'}`}>
            {fin ? <><b>✓ HAZIR</b><span>{ts ? new Date(ts).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''} · {m.name}</span></>
              : ne ? <><b>{ne} engel var</b><span>Kırmızı maddeleri çözün</span></>
                : <><b>Tamamlanabilir</b><span>{nw ? `${String(nw)} uyarı var — gözden geçirin` : 'Her şey yolunda'}</span></>}
          </div>
          <Denetimler ch={ch} />
          <div className="tc-ck-dugmeler">
            {!fin && ize('ok') && <Dugme tur="birincil" simge="check" disabled={ne > 0} onClick={() => { o.eylem('ok'); }}>Hazırlığı tamamla</Dugme>}
            {bek > 0 && !fin && ize('accAll') && <Dugme simge="check" onClick={prAccAll}>Bekleyen {bek} adımı onayla</Dugme>}
            {ize('toTrial') && <Dugme simge="play" onClick={() => { o.eylem('toTrial'); }}>Kesim / ömür denemesi</Dugme>}
            {ize('print') && <Dugme simge="printer" onClick={() => { o.eylem('print'); }}>Hazırlık formu</Dugme>}
            {ize('sim') && <Dugme simge="play" onClick={() => { o.eylem('sim'); }}>Simülasyonda aç</Dugme>}
            {ize('life') && <Dugme simge="chev-right" onClick={() => { o.eylem('life'); }}>Takım ömrü</Dugme>}
          </div>
        </>
      );
    }
    default: return null;
  }
}

// Onay kaydı: yalnız imzası bugünkü durumla eşleşen onaylar gösterilir (köprüdeki gibi).
const ADLAR: Record<string, string> = {
  machine: 'Tezgâh', prog: 'Program', fixture: 'Bağlama', jaw: 'Çene', material: 'Ham malzeme', zero: 'Sıfır noktası',
  mag: 'Magazin', cool: 'Soğutma', gauges: 'Ölçüm', cons: 'Sarf', final: 'Hazırlık tamamlandı',
};
export const adimAdi = (adim: string): string => ADLAR[adim] ?? (/^T\d+$/.test(adim) ? `Takım ${adim}` : adim);
export function gecerliOnaylar(kayit: HazirlikCevabi | null): HazirlikCevabi['onaylar'] {
  const p = PS();
  return (kayit?.onaylar ?? []).filter((o) => (o.olay === 'tamam' ? p.fin?.sig === o.imza : p.done[o.adim] === o.imza));
}
function OnayKaydi({ kayit, emir }: { kayit: HazirlikCevabi | null; emir: EmirSecenegi | null }) {
  const liste = gecerliOnaylar(kayit), k = kayit?.kurulum ?? null;
  const satir = (sol: string, sag: string, a: string) => <div className="tc-ck-srow" key={a}><span>{sol}</span><b>{sag}</b></div>;
  return (
    <div className="tc-ck-hz-onaylar">
      <div className="tc-ck-sh">Onay kaydı</div>
      {emir && satir('Üretim emri', `${emir.emirNo} · ${emir.parcaNo}`, 'emir')}
      {k && satir('Kurulum tamam', `${k.kisi.ad} · ${saat(k.zaman)}${k.gecerli ? '' : ' (seçimler değişti)'}`, 'kurulum')}
      {liste.length === 0 && satir('Onaylanan adım', 'yok', 'yok')}
      {liste.map((o, i) => satir(adimAdi(o.adim), `${o.kisi.ad} · ${saat(o.zaman)}`, `${o.adim}-${String(i)}`))}
    </div>
  );
}

export function kurulumMetni(e: EmirSecenegi | null, k: KurulumDurumu | null): string {
  if (e === null) return '';
  return k?.gecerli === true ? `✓ Kurulum tamam · ${k.kisi.ad} · ${saat(k.zaman)}` : k !== null ? 'Kurulum tamamlandıktan sonra seçimler değişti' : 'Kurulum henüz tamamlanmadı';
}

// Hazırlıkta emir seçilmez; hangi emrin hazırlığı olduğu ve kurulumunun durumu okunur.
export function EmirKarti({ emir, acik, kurulum }: { emir: EmirSecenegi | null; acik: boolean; kurulum: KurulumDurumu | null }) {
  return (
    <div className="tc-ck-hz-emir">
      <small>Üretim emri</small>
      <b>{emir === null ? 'Seçilmedi' : `${operasyon(emir)}${acik ? '' : ' (açık değil)'}`}</b>
      <span>{emir === null ? 'Emri Kurulum ekranında seçin; hazırlık o emrin kurulumuyla açılır.' : `${emir.parcaNo} ${emir.parcaAd} · ${String(emir.adet)} adet · ${emir.istasyon}`}</span>
      {emir !== null && <em className={kurulum?.gecerli === true ? 'tamam' : undefined}>{kurulumMetni(emir, kurulum)}</em>}
    </div>
  );
}

export function HazirlikPaneli({ yetki, eylem, kayit, emir }: Ortam & { kayit: HazirlikCevabi | null; emir: EmirSecenegi | null }) {
  const st = prCurStep(); if (!st) return null;
  const S = prStep(st), G = prGroup(st.g), dn = prIsDone(st), n = S?.kind === 'multi' ? S.list().length : 0;
  return (
    <div className="tc-ck-hz-panel">
      <div className="tc-ck-hz-bas">
        <small>Adım {PR.at + 1} / {PR.seq.length} · {G.t}</small>
        <b>{prTitleOf(st)}</b>
        <span className={`tc-ck-hz-hap ${dn ? 'ok' : 'wait'}`}>{dn ? '✓ Onaylandı' : st.g === 'final' ? 'Kontrol' : n ? `${String(n)} seçili · onay bekliyor` : 'Onay bekliyor'}</span>
      </div>
      <p className="tc-ck-not tc-ck-hz-aciklama">{PR_DESC[st.key === 'mag' ? 'mag' : st.g]}</p>
      <Govde st={st} S={S} o={{ yetki, eylem }} />
      {st.g !== 'trial' && <Ozet />}
      <OnayKaydi kayit={kayit} emir={emir} />
    </div>
  );
}
