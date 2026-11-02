import { Dugme, Kart, SayiKarti, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { save, state, useCncSurum } from '../depo.ts';
import { fmtN, num, pad2 } from '../bicim.ts';
import { allMachines, byId, material } from '../secici.ts';
import { fmtDur } from '../hesap/omur.ts';
import { fmtT } from '../hesap/gkod.ts';
import {
  PR, PR_GROUPS, prChecks, prFinalDone, prInfo, prIsDone, prMachineChanged, prProg, prProgress, prSeq, prSrcText, prStk, prStkKg, prStkLabel, PS, STK_SRC,
} from '../hesap/hazirlik.ts';
import { hazirlikYazdir } from '../kurulum/disari.ts';
import { HazirlikSimgesi } from '../kurulum/HazirlikSimgesi.tsx';
import { S } from '../parca-durumu.ts';
import { useParca } from '../parca.ts';
import { gorunumAdresi, useGorunum, type Gorunum } from '../gorunum.ts';
import { useCncYetkisi } from '../veri.ts';
import { hData, hazirlananTezgah, hPct, hStat, hStatOf, MSTAT, setMstat, type MakineDurumuAnahtari, type OmurDurumu } from './ana.ts';
import './ana.css';

const yol = (v: Gorunum): string => gorunumAdresi(v);

// Hazırlık grubu simgeleri (prototipteki işaretlerin ortak simge karşılığı, T4).
const GRUP_SIMGESI: Record<string, SimgeAdi> = {
  machine: 'cpu', prog: 'file', fixture: 'wrench', jaw: 'grid', material: 'box', zero: 'target', tools: 'tool', cool: 'drop',
  gauges: 'ruler', cons: 'plus', final: 'check', trial: 'play',
};

// Halka grafik (prototipin hDonut'u): dilim rengi sınıftan, tasarım değişkeninden gelir.
function Halka({ parcalar, etiket, alt }: { parcalar: [number, string][]; etiket: string; alt?: string }) {
  const tot = parcalar.reduce((a, p) => a + p[0], 0), r = 15.9155;
  let off = 25;
  return (
    <svg viewBox="0 0 42 42" width="96" height="96" className="tc-cl-halka" role="img" aria-label={`${etiket} ${alt ?? ''}`}>
      <circle cx="21" cy="21" r={r} className="tc-cl-halka-zemin" />
      {tot > 0 && parcalar.map(([n, sinif]) => {
        if (!n) return null;
        const v = n / tot * 100;
        const el = <circle key={sinif} cx="21" cy="21" r={r} className={`tc-cl-halka-dilim tc-cl-ton-${sinif}`} strokeDasharray={`${Math.max(0, v - 0.6).toFixed(2)} ${(100 - v + 0.6).toFixed(2)}`} strokeDashoffset={off.toFixed(2)} />;
        off -= v;
        return el;
      })}
      <text x="21" y="21" className="tc-cl-halka-deger">{etiket}</text>
      <text x="21" y="27.5" className="tc-cl-halka-alt">{alt ?? ''}</text>
    </svg>
  );
}

// Yüzde çubuğu: genişlik SVG özniteliğidir (inline stil yok).
function Cubuk({ oran, ton }: { oran: number; ton: string }) {
  return (
    <svg className="tc-cl-oran" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
      <rect width="100" height="6" className="tc-cl-oran-zemin" />
      <rect width={Math.max(0, Math.min(100, oran))} height="6" className={`tc-cl-ton-${ton}`} />
    </svg>
  );
}


// Prototipin homeRender'ı: KPI şeridi, tezgâhlar, hazırlık, takım ömrü, depo, program ve ham malzeme, son üretim kayıtları.
export function AnaSayfa() {
  useCncSurum();
  useParca();
  const yetki = useCncYetkisi();
  const { git } = useGorunum();
  PR.seq = prSeq();
  const D0 = hData();
  const pm = hazirlananTezgah(), pr = prProgress(), fin = prFinalDone();
  let ch: { lvl: string }[] = [];
  try { ch = prChecks() as { lvl: string }[]; } catch { ch = []; }
  const ne = ch.filter((c) => c.lvl === 'err').length, nw = ch.filter((c) => c.lvl === 'warn').length;
  const running = D0.machines.filter((x) => hStat(x.m.id) === 'run').length;
  const ariza = D0.machines.filter((x) => hStat(x.m.id) === 'down').length;
  const tarih = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tezgahaGit = (id: string, a: 'prep' | 'life' | 'setup'): void => {
    if (state.machine !== id) { state.machine = id; prMachineChanged(); save(); }
    if (a === 'life') git('life', { tezgah: id, cep: null }); else git(a);
  };

  const src = prSrcText() as { name: string } | null, p = prProg() as { err?: unknown; name: string; heid: boolean; tools: unknown[]; lines: unknown[]; total: number } | null;
  const s0 = prStk(), mat = material() as { name: string };
  const log = ((state.wearLog ?? []) as { ts: number; mid: string; n: number }[]).slice(0, 8);
  const ton = (st: OmurDurumu): string => (st === 'over' ? 'kirmizi' : st === 'crit' ? 'turuncu' : st === 'warn' ? 'sari' : st === 'ok' ? 'yesil' : 'gri');

  return (
    <div className="tc-cl-ana">
      <header className="tc-cl-ana-ust">
        <div>
          <small>CNC ATÖLYE · GENEL BAKIŞ</small>
          <h2>Ana sayfa</h2>
          <span>{tarih}</span>
        </div>
        <div className="tc-cl-ana-hizli">
          <Dugme tur="birincil" simge="play" onClick={() => { git('prep'); }}>Tezgâh hazırla</Dugme>
          <Dugme simge="gauge" onClick={() => { git('life'); }}>Takım ömrü</Dugme>
          <Dugme simge="layers" onClick={() => { git('lib'); }}>Kütüphane</Dugme>
          <Dugme simge="route" onClick={() => { git('gcode'); }}>Simülasyon</Dugme>
        </div>
      </header>

      <div className="tc-cl-kpi">
        <SayiKarti baslik="Tezgâhlar" simge="cpu" sayi={D0.machines.length} altMetin={`${String(running)} çalışıyor · ${String(ariza)} arıza`} yol={yol('setup')} />
        <SayiKarti baslik="Ömrü dolan takım" simge="alert" ton="hata" sayi={D0.tot.over} altMetin="hemen değiştirilmeli" yol={yol('life')} />
        <SayiKarti baslik="Yakında değişecek" simge="clock" ton="uyari" sayi={D0.tot.crit} altMetin={`${String(D0.tot.warn)} takım yarılandı`} yol={yol('life')} />
        <SayiKarti
          baslik="Depo uyarısı" simge="box" ton={D0.dep.short ? 'hata' : 'uyari'} sayi={D0.dep.short + D0.dep.low}
          altMetin={`${String(D0.dep.short)} eksik · ${String(D0.dep.low)} kritik`} yol={yol('lib')}
        />
        <SayiKarti
          baslik={`Hazırlık · ${pm.name}`} simge={fin ? 'check' : 'clipboard-check'} metin={fin ? 'HAZIR' : `%${String(hPct(pr.pct))}`}
          altMetin={fin ? 'tamamlandı' : `${String(pr.d)} / ${String(pr.n)} adım`} yol={yol('prep')}
        />
        <SayiKarti baslik="Bugünkü üretim" simge="chart" sayi={D0.today} altMetin={D0.today === null ? 'bugün kayıt yok' : 'adet kaydedildi'} yol={yol('life')} />
      </div>

      <Kart baslik="Tezgâhlar" sag={<span className="tc-cl-soluk">{`${String(D0.machines.length)} tezgâh · durumları elle seçin`}</span>}>
        <div className="tc-cl-tezgahlar-izgara">
          {D0.machines.map((x) => {
            const m = x.m, I = prInfo(m) as { ctrlUnit?: string }, st = hStatOf(hStat(m.id)), w = x.worst, isPrep = m.id === pm.id;
            const tot = x.cards.length;
            return (
              <article key={m.id} className="tc-cl-tezgah-kart" data-durum={st.k}>
                <div className="tc-cl-tk-ust">
                  <span className="tc-cl-tk-resim"><HazirlikSimgesi tur="tezgah" nesne={m} /></span>
                  <div className="tc-cl-tk-ad">
                    <b>{m.name}</b>
                    <small>{`${I.ctrlUnit || (m.ctrl === 'heid' ? 'Heidenhain' : 'ISO / G-kod')} · ${m.taper ?? ''}`}</small>
                    {yetki.yazabilir
                      ? (
                        <select
                          className="tc-alan-kutu tc-cl-tk-durum" aria-label={`${m.name}: durum`} value={st.k}
                          onChange={(o) => { setMstat(m.id, o.target.value as MakineDurumuAnahtari); save(); }}
                        >
                          {MSTAT.map((s) => <option key={s.k} value={s.k}>{`● ${s.t}`}</option>)}
                        </select>
                      )
                      : <span className="tc-cl-tk-durum-metin"><i aria-hidden="true" />{st.t}</span>}
                  </div>
                </div>
                <svg className="tc-cl-tk-omur" viewBox={`0 0 ${String(Math.max(1, tot))} 4`} preserveAspectRatio="none" role="img" aria-label="Takım ömrü dağılımı">
                  {(['over', 'crit', 'warn', 'ok', 'na'] as const).reduce<{ x: number; el: JSX.Element[] }>((a, k) => {
                    if (x.n[k]) a.el.push(<rect key={k} x={a.x} width={x.n[k]} height="4" className={`tc-cl-ton-${ton(k)}`} />);
                    a.x += x.n[k] || 0;
                    return a;
                  }, { x: 0, el: [] }).el}
                </svg>
                <div className="tc-cl-tk-satir">
                  <span>{m.type === 'lathe' ? 'Taret' : 'Magazin'} <b>{`${String(x.fill)}/${String(m.pockets)}`}</b></span>
                  {x.n.over + x.n.crit
                    ? <b className="tc-cl-kirmizi"><Simge ad="alert" boyut="k" /> {x.n.over + x.n.crit} değişmeli</b>
                    : <b className="tc-cl-yesil"><Simge ad="check" boyut="k" /> ömürler iyi</b>}
                </div>
                <div className="tc-cl-tk-kritik">
                  {w
                    ? <>En kritik: <b>{`T${pad2(w.p + 1)} ${w.t.name}`}</b>{` · %${String(hPct(w.pct ?? 0))}`}{w.spare === 0 && <> · <b className="tc-cl-kirmizi">yedek yok</b></>}</>
                    : 'Takip edilen takım yok'}
                </div>
                {isPrep && (fin || pr.d > 0) && (
                  <div className="tc-cl-tk-hazirlik" data-tamam={fin ? '' : undefined}>
                    {fin ? <><Simge ad="check" boyut="k" /> Hazırlık tamam</> : `Hazırlık sürüyor · %${String(hPct(pr.pct))}`}
                    <Cubuk oran={hPct(pr.pct)} ton={fin ? 'yesil' : 'turuncu'} />
                  </div>
                )}
                <div className="tc-cl-tk-eylem">
                  <Dugme simge="clipboard-check" onClick={() => { tezgahaGit(m.id, 'prep'); }}>Hazırla</Dugme>
                  <Dugme simge="gauge" onClick={() => { tezgahaGit(m.id, 'life'); }}>Ömürler</Dugme>
                  <Dugme simge="wrench" onClick={() => { tezgahaGit(m.id, 'setup'); }}>Kurulum</Dugme>
                </div>
              </article>
            );
          })}
        </div>
      </Kart>

      <div className="tc-cl-ana-izgara">
        <Kart baslik="Tezgâh hazırlığı" sag={<Dugme simge="chev-right" onClick={() => { git('prep'); }}>Devam et</Dugme>}>
          <div className="tc-cl-bolunmus">
            <Halka parcalar={[[pr.d, fin ? 'yesil' : 'turuncu'], [pr.n - pr.d, 'gri']]} etiket={fin ? '✓' : `%${String(hPct(pr.pct))}`} alt={fin ? 'hazır' : `${String(pr.d)}/${String(pr.n)}`} />
            <div className="tc-cl-hazirlik-bilgi">
              <b>{pm.name}</b>
              <span>{`${src ? src.name : 'Programsız'} · ${String(PS().qty)} adet`}</span>
              <span>
                {ne > 0 && <><b className="tc-cl-kirmizi">{ne} engel</b> · </>}
                {nw > 0 ? `${String(nw)} uyarı` : ne ? '' : <b className="tc-cl-yesil">engel yok</b>}
              </span>
            </div>
          </div>
          <div className="tc-cl-cipler">
            {PR_GROUPS.filter((G) => G.g !== 'trial').map((G) => {
              const steps = PR.seq.filter((s) => s.g === G.g);
              if (!steps.length) return null;
              const d = steps.filter((s) => prIsDone(s)).length, all = d === steps.length;
              return (
                <span key={G.g} className="tc-cl-cip" data-durum={all ? 'tamam' : d ? 'kismi' : undefined}>
                  <Simge ad={all ? 'check' : GRUP_SIMGESI[G.g] ?? 'dash'} boyut="k" /> {G.t}{steps.length > 1 ? ` ${String(d)}/${String(steps.length)}` : ''}
                </span>
              );
            })}
          </div>
          <div className="tc-cl-dugmeler">
            <Dugme tur="birincil" onClick={() => { git('prep'); }}>{fin ? 'Hazırlığı aç' : 'Hazırlığa devam'}</Dugme>
            <Dugme simge="printer" onClick={() => { PR.seq = prSeq(); hazirlikYazdir(); }}>Hazırlık formu</Dugme>
            <Dugme simge="play" onClick={() => { git('prep', { adim: 'son' }); }}>Deneme</Dugme>
          </div>
        </Kart>

        <Kart baslik="Takım ömrü" sag={<Dugme simge="chev-right" onClick={() => { git('life'); }}>Çark</Dugme>}>
          <div className="tc-cl-bolunmus">
            <Halka
              parcalar={[[D0.tot.over, 'kirmizi'], [D0.tot.crit, 'turuncu'], [D0.tot.warn, 'sari'], [D0.tot.ok, 'yesil']]}
              etiket={String(D0.tot.over + D0.tot.crit + D0.tot.warn + D0.tot.ok)} alt="takım"
            />
            <ul className="tc-cl-lejant">
              <li><i className="tc-cl-ton-kirmizi" />Ömrü doldu <b>{D0.tot.over}</b></li>
              <li><i className="tc-cl-ton-turuncu" />Yakında <b>{D0.tot.crit}</b></li>
              <li><i className="tc-cl-ton-sari" />Yarılandı <b>{D0.tot.warn}</b></li>
              <li><i className="tc-cl-ton-yesil" />İyi <b>{D0.tot.ok}</b></li>
            </ul>
          </div>
          <div className="tc-cl-liste-kisa">
            {D0.urgent.length
              ? D0.urgent.slice(0, 7).map((c) => (
                <button key={`${c.m.id}:${String(c.p)}`} type="button" onClick={() => { git('life', { tezgah: c.m.id, cep: c.p }); }}>
                  <span className="tc-cl-lk-bas">{c.m.name}<em>{`T${pad2(c.p + 1)}`}</em></span>
                  <b>{c.t.name}</b>
                  <Cubuk oran={Math.max(3, hPct(c.pct ?? 0))} ton={c.st === 'over' ? 'kirmizi' : 'turuncu'} />
                  <small>
                    {c.st === 'over' ? 'değiştir' : `≈${fmtN(c.parts)} parça`}
                    {c.spare === 0 ? <> · <b className="tc-cl-kirmizi">yedek yok</b></> : c.spare != null ? ` · yedek ${String(c.spare)}` : ''}
                  </small>
                </button>
              ))
              : <p className="tc-cl-not">Acil değişim gereken takım yok.</p>}
          </div>
        </Kart>

        <Kart baslik="Depo · stok" sag={<Dugme simge="chev-right" onClick={() => { git('lib'); }}>Kütüphane</Dugme>}>
          <div className="tc-cl-bolunmus">
            <Halka parcalar={[[D0.dep.short, 'kirmizi'], [D0.dep.low, 'sari'], [D0.dep.ok, 'yesil']]} etiket={String(D0.dep.short + D0.dep.low + D0.dep.ok)} alt="kalem" />
            <ul className="tc-cl-lejant">
              <li><i className="tc-cl-ton-kirmizi" />Eksik <b>{D0.dep.short}</b></li>
              <li><i className="tc-cl-ton-sari" />Kritik <b>{D0.dep.low}</b></li>
              <li><i className="tc-cl-ton-yesil" />Yeterli <b>{D0.dep.ok}</b></li>
            </ul>
          </div>
          <div className="tc-cl-liste-kisa">
            {D0.depot.length
              ? D0.depot.slice(0, 7).map((c) => (
                <button key={c.key} type="button" onClick={() => { git('lib'); }}>
                  <span className="tc-cl-lk-bas">{c.shelf.split(' · ').pop()}</span>
                  <b>{c.t.name}</b>
                  <span className={c.stock.st === 'short' ? 'tc-cl-kirmizi' : 'tc-cl-sari'}>{c.stock.avail}<small>{`/${String(c.stock.qty)}`}</small></span>
                  <small>{`depoda · ${String(c.stock.used)} tezgâhta · min ${String(c.stock.min)}`}</small>
                </button>
              ))
              : <p className="tc-cl-not">{`Stok uyarısı yok${D0.dep.ok ? '' : ' — kütüphaneden adet girin'}.`}</p>}
          </div>
        </Kart>

        <Kart baslik="Program ve ham malzeme" sag={<Dugme simge="chev-right" onClick={() => { git('gcode'); }}>Simülasyon</Dugme>}>
          {p && !p.err
            ? (
              <div className="tc-cl-program">
                <div><small>Program</small><b>{p.name}</b><span>{`${p.heid ? 'Heidenhain' : 'ISO'} · ${String(p.tools.length)} takım · ${fmtN(p.lines.length)} satır`}</span></div>
                <div><small>Çevrim</small><b>{fmtT(p.total)}</b><span>{`parti ${fmtDur(p.total * num(PS().qty, 1) / 60)}`}</span></div>
              </div>
            )
            : <p className="tc-cl-not">Program seçilmedi.</p>}
          <div className="tc-cl-program">
            <div><small>Ham malzeme</small><b>{prStkLabel(s0)}</b><span>{`${mat.name} · ${(STK_SRC as Record<string, string>)[s0.src] ?? ''}`}</span></div>
            <div><small>Ağırlık</small><b>{`${fmtN(prStkKg(s0), 2)} kg`}</b><span>{`parti ${fmtN(prStkKg(s0) * num(PS().qty, 1), 1)} kg`}</span></div>
          </div>
          {S.res?.ok && (
            <div className="tc-cl-program">
              <div><small>Ham Malzeme sayfası</small><b>{S.res.label}</b><span>{S.name || 'elle girilen'}</span></div>
              <div><small>Talaş oranı</small><b>{S.res.Vp ? `%${fmtN(S.res.ratio * 100, 0)}` : '—'}</b><span>{`${fmtN(S.res.ms, 2)} kg ham`}</span></div>
            </div>
          )}
          <div className="tc-cl-dugmeler">
            <Dugme simge="box" onClick={() => { git('stock'); }}>Ham malzeme</Dugme>
            <Dugme simge="route" onClick={() => { git('gcode'); }}>G-kod simülasyonu</Dugme>
          </div>
        </Kart>

        <Kart baslik="Son üretim kayıtları" sag={<Dugme simge="chev-right" onClick={() => { git('life'); }}>Kaydet</Dugme>}>
          <div className="tc-cl-gunluk">
            {log.length
              ? log.map((l, i) => {
                const mm = byId(allMachines(), l.mid) as { name: string } | null;
                return (
                  <div key={`${String(l.ts)}-${String(i)}`}>
                    <span>{new Date(l.ts).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <b>{mm ? mm.name : l.mid}</b>
                    <em>{`${String(l.n)} adet`}</em>
                  </div>
                );
              })
              : <p className="tc-cl-not">Henüz üretim kaydı yok. Takım Ömrü sayfasından ya da Deneme sonucundan kaydedilir.</p>}
          </div>
        </Kart>
      </div>
    </div>
  );
}
