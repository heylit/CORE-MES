import { useEffect, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import { Dg } from '../../motor/cizelge/Dugme.tsx';
import '../../motor/cizelge/cizelge.css';
import { ONCELIK_AD, saatYaz, saatYazi, type Derleme, type OkunanPlan } from '../../motor/kurallar.ts';
import { degisken, MOTOR_NOTU, yuzde } from '../../motor/ortak.tsx';
import { grupAdi, type OzetVerisi } from '../../motor/ozet/veri.ts';
import { mesaiAdaylari } from '../../motor/secim/kurallar.ts';
import { TakvimSekmesi } from '../../motor/secim/Sekmeler.tsx';
import '../../motor/secim/secim.css';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { useDar } from '../veri/ortak.tsx';
import {
  bekleyenler, eksen, GUN_SECENEKLERI, kaydirma, kuyruk, odakAdi, odakDolulugu, odakGruplari, odakTezgahlari, pencere, serit, varsayilanGun,
  type OdakYeri,
} from './kurallar.ts';
import './odak.css';

// Odak tahtası (zg-odak.betik odHtml): tahtanın içinde bir bölüm ya da tek tezgâh. Konum izi, kardeş seçimi, görünen süre; etki satırı,
// şeritler ve lejant; yanda seçili iş, bekleyenler ya da kuyruk, ek mesai ve takvim. Sürükleyip taşımak, sıra ve ek mesai denemesi motor
// ister (357 b): işler seçilir, düğmeler yerinde ve pasiftir.

const YETKISIZ = 'Plan yazma yetkiniz yok.';

export interface OdakOzellikleri {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; v: OzetVerisi | null; now: number; yer: OdakYeri; ac: (y: OdakYeri | null) => void;
  secim: PlanlamaSecimi; sec: (s: Partial<PlanlamaSecimi>) => void; komut: CalismaKomutu | null; planYaz: boolean;
}

export function OdakTahtasi(o: OdakOzellikleri) {
  const { c, p, cx, now, yer } = o; const D = c.D; const { g, m } = yer;
  const dar = useDar();
  const [gunSec, setGunSec] = useState<number | null>(null);
  const [kay, setKay] = useState(0);
  // Bölümle tezgâh arasında geçince süre varsayılana döner (odAc odGun).
  useEffect(() => { setGunSec(null); }, [m === null]);
  const gun = gunSec ?? varsayilanGun(m !== null, dar);
  const pen = pencere(now, gun, kay);
  const secJob = o.secim.adim && p.ops[o.secim.adim] ? p.ops[o.secim.adim]?.job ?? null : o.secim.siparis;
  const isSec = (id: string) => o.sec({ adim: o.secim.adim === id ? null : id, siparis: null, tezgah: null });
  const ad = m ? odakAdi(m) : grupAdi(g);
  const kardes = m ? odakTezgahlari(c, p, g) : odakGruplari(c, p, cx);
  const secenek = (m ? GUN_SECENEKLERI.tez : GUN_SECENEKLERI.grup).slice(0, dar ? 3 : 4);
  const ozet = p.ozet;

  const satirlar = m
    ? Array.from({ length: gun }, (_, i) => {
      const a = pen.a + i * 24, b = a + 24; const d = odakDolulugu(cx, p, m, a, b);
      return (
        <div key={a} className="tc-pyo-satir" data-gun={i}>
          <div className="tc-pyo-tez"><b>{saatYaz(D, a + 1).slice(0, 9)}</b><small className="tc-pym-mono">{d == null ? 'kapalı' : `%${Math.round(d * 100)} dolu`}</small></div>
          <Serit o={o} m={m} a={a} b={b} secJob={secJob} isSec={isSec} />
        </div>
      );
    })
    : odakTezgahlari(c, p, g).map((x) => {
      const d = odakDolulugu(cx, p, x, pen.a, pen.b); const n = kuyruk(p, x, now).length; const T = D.tezgahlar.find((t) => t.id === x);
      return (
        <div key={x} className="tc-pyo-satir" data-secili={o.secim.tezgah === x ? '' : undefined}>
          <button type="button" className="tc-pyo-tez" title={`${odakAdi(x)} tezgâhına odaklan`} onClick={() => o.ac({ g, m: x })}>
            <b className="tc-pym-mono">{odakAdi(x)}</b><small>{T?.ad ?? ''}</small><small className="tc-pym-mono">{`${d == null ? 'kapalı' : `%${Math.round(d * 100)} dolu`} · ${n} iş`}</small>
          </button>
          <Serit o={o} m={x} a={pen.a} b={pen.b} secJob={secJob} isSec={isSec} />
        </div>
      );
    });

  return (
    <section className="tc-pyo" data-sev={m ? 'tez' : 'grup'} aria-label={`Odak: ${ad}`}>
      <header className="tc-pyo-bas">
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label={m ? 'Bölüme çık (Esc)' : 'Tahtaya dön (Esc)'}
          title={m ? 'Bölüme çık (Esc)' : 'Tahtaya dön (Esc)'} onClick={() => o.ac(m ? { g, m: null } : null)}>
          <Simge ad="zout" boyut="k" />
        </button>
        <nav className="tc-pyo-iz" aria-label="Konum">
          <button type="button" title="Bütün tahtaya dön" onClick={() => o.ac(null)}><Simge ad="home" boyut="k" /><span>Fabrika</span></button>
          <span aria-hidden="true">›</span>
          {m ? (
            <><button type="button" onClick={() => o.ac({ g, m: null })}>{grupAdi(g)}</button><span aria-hidden="true">›</span><b className="tc-pym-mono" aria-current="page">{odakAdi(m)}</b></>
          ) : <b aria-current="page">{grupAdi(g)}</b>}
        </nav>
        <label className="tc-pyo-kardes">
          <select className="tc-alan-kutu" aria-label={m ? 'Başka tezgâh' : 'Başka bölüm'} value={m ?? g} onChange={(e) => o.ac(m ? { g, m: e.target.value } : { g: e.target.value, m: null })}>
            {kardes.map((x) => <option key={x} value={x}>{m ? odakAdi(x) : grupAdi(x)}</option>)}
          </select>
        </label>
        <div className="tc-pyo-zaman" role="group" aria-label="Görünen süre">
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label="Geri" title="Geri" onClick={() => setKay((k) => k - kaydirma(gun))}><Simge ad="chev-left" boyut="k" /></button>
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={() => setKay(0)}>Bugün</button>
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label="İleri" title="İleri" onClick={() => setKay((k) => k + kaydirma(gun))}><Simge ad="chev-right" boyut="k" /></button>
          <div className="tc-pym-seg">
            {secenek.map((x) => <button key={x} type="button" aria-pressed={gun === x} onClick={() => setGunSec(x)}>{`${x} gün`}</button>)}
          </div>
        </div>
      </header>
      <p className="tc-pyo-etki" role="status">
        <Simge ad="gauge" boyut="k" />
        <span>Planın şu hâli: toplam gecikme <b className="tc-pym-mono">{saatYazi(ozet.wT)}</b>, geç sipariş <b className="tc-pym-mono">{ozet.late}</b>.</span>
        <span className="tc-pyo-ipucu">{`${dar ? 'Bir işe dokunun' : 'Bir işe basın'}; ayrıntısı ve sırası ${dar ? 'aşağıda' : 'yanda'} açılır. Sürükleyip taşımak: ${MOTOR_NOTU}`}</span>
      </p>
      <div className="tc-pyo-govde">
        <div className="tc-pyo-ana">
          <div className="tc-pyo-gantt">
            <div className="tc-pyo-ic" ref={degisken({ '--tc-pyo-gun': m ? 1 : gun })}>
              <div className="tc-pyo-eksen" data-iki={!m && gun <= 3 ? '' : undefined} aria-hidden="true">
                <span className="tc-pyo-eksen-bas" />
                <div>
                  {eksen(D, pen.a, m ? pen.a + 24 : pen.b, m !== null).map((x) => (
                    <span key={`${x.tur}-${x.x}`} data-tur={m ? undefined : x.tur} ref={degisken({ '--x': yuzde(x.x) })}>{x.e}</span>
                  ))}
                </div>
              </div>
              {satirlar.length ? satirlar : <p className="tc-pyo-k">Bu bölümde tezgâh yok.</p>}
            </div>
          </div>
          <ul className="tc-pyo-lejant" aria-label="Renkler">
            <li><i data-r="zam" />zamanında biten sipariş</li><li><i data-r="gec" />geç biten sipariş</li><li><i data-r="ayar" />ayar süresi</li>
            <li><i data-r="kapali" />tezgâh kapalı</li><li><i data-r="simdi" />şimdi</li>
          </ul>
        </div>
        <aside className="tc-pyo-yan">
          <SeciliIs o={o} izin={(x) => (m ? x === m : odakTezgahlari(c, p, g).includes(x))} />
          {m ? (
            <>
              <Kuyruk o={o} m={m} />
              <Mesai o={o} m={m} />
              {!m.startsWith('@') && <div className="tc-pyo-blok tc-pyo-takvim"><TakvimSekmesi c={c} cx={cx} t={now} m={m} komut={o.komut} planYaz={o.planYaz} /></div>}
            </>
          ) : <Bekleyenler o={o} g={g} secJob={secJob} />}
        </aside>
      </div>
    </section>
  );
}

function Serit({ o, m, a, b, secJob, isSec }: { o: OdakOzellikleri; m: string; a: number; b: number; secJob: string | null; isSec: (id: string) => void }) {
  const s = serit(o.c, o.p, o.cx, m, a, b, o.now);
  return (
    <div className="tc-pyo-serit" data-m={m}>
      {s.kapali.map(([x, w]) => <i key={`k${x}`} className="tc-pyo-kapali" ref={degisken({ '--x': yuzde(x), '--w': yuzde(w) })} />)}
      {s.ariza.map(([x, w]) => <i key={`a${x}`} className="tc-pyo-kapali" data-ariza="" title="Arıza ya da bakım" ref={degisken({ '--x': yuzde(x), '--w': yuzde(w) })} />)}
      {s.gunc.map((x) => <i key={`g${x}`} className="tc-pyo-gunc" ref={degisken({ '--x': yuzde(x) })} />)}
      {s.simdi !== null && <i className="tc-pyo-simdi" ref={degisken({ '--x': yuzde(s.simdi) })} />}
      {s.isler.map((x) => (
        <button
          key={x.id} type="button" className="tc-pyo-is" title={x.baslik} aria-pressed={o.secim.adim === x.id}
          data-gec={x.gec ? '' : undefined} data-durum={x.durum ?? undefined} data-sabit={x.sabit ? '' : undefined}
          data-ilgili={secJob && x.job === secJob ? '' : undefined} data-soluk={secJob && x.job !== secJob ? '' : undefined}
          ref={degisken({ '--x': yuzde(x.x), '--w': yuzde(x.w), '--ayar': yuzde(x.ayar) })} onClick={() => isSec(x.id)}
        >
          <span className="tc-pym-mono">{x.job}</span>
        </button>
      ))}
    </div>
  );
}

function SeciliIs({ o, izin }: { o: OdakOzellikleri; izin: (m: string) => boolean }) {
  const { c, p } = o; const D = c.D; const id = o.secim.adim; const r = id ? p.ops[id] : undefined;
  if (!id || !r || !izin(r.m)) return null;
  const s = D.siparisler.find((x) => x.id === r.job); const J = p.J[r.job];
  const pasif = o.planYaz ? MOTOR_NOTU : YETKISIZ;
  return (
    <section className="tc-pyo-blok tc-pyo-secili" aria-label={`Seçili iş ${id}`}>
      <h4><Simge ad="target" boyut="k" /><span className="tc-pym-mono">{id}</span></h4>
      <p className="tc-pyo-k">{`${D.urunler.find((u) => u.id === s?.urun)?.ad ?? s?.urun ?? '—'}${s ? `, ${ONCELIK_AD[Number(s.oncelik)] ?? ''} öncelik` : ''}`}</p>
      <p><span className="tc-pym-mono">{odakAdi(r.m)}</span>{' · '}<span className="tc-pym-mono">{`${saatYaz(D, r.S)} → ${saatYaz(D, r.C)}`}</span></p>
      <p className="tc-pyo-k">{`ayar ${saatYazi(r.su)}, işleme ${saatYazi(r.run)}${J?.T != null && J.T > 0.05 ? ` · sipariş ${saatYazi(J.T)} geç` : ' · sipariş termine yetişiyor'}`}</p>
      <div className="tc-pyo-dugmeler">
        <Dg ad="Sırada öne" simge="up" not={pasif} />
        <Dg ad="Sırada geriye" simge="down" not={pasif} />
        {o.yer.m !== r.m && <Dg ad={`${odakAdi(r.m)} tezgâhına odaklan`} simge="zin" hayalet yap={() => o.ac({ g: o.yer.g, m: r.m })} />}
      </div>
    </section>
  );
}

function Bekleyenler({ o, g, secJob }: { o: OdakOzellikleri; g: string; secJob: string | null }) {
  if (!o.v) return null;
  const { l, top } = bekleyenler(o.v, g); const pasif = o.planYaz ? MOTOR_NOTU : YETKISIZ;
  return (
    <section className="tc-pyo-blok">
      <h4><Simge ad="clock" boyut="k" />Bu bölümde bekleyenler</h4>
      <p className="tc-pyo-k">{l.length ? <>{`${l.length} adım tezgâh sırası bekliyor, toplam `}<b className="tc-pym-mono">{saatYazi(top)}</b>. Geç siparişler önde.</> : 'Bu bölümde sıra bekleyen sipariş yok.'}</p>
      {l.length > 0 && (
        <ul className="tc-pyo-liste">
          {l.slice(0, 8).map((x) => (
            <li key={`${x.j}-${x.m}`} data-gec={x.gec ? '' : undefined} data-secili={secJob === x.j ? '' : undefined}>
              <button type="button" className="tc-pym-link tc-pym-mono" onClick={() => o.sec({ siparis: secJob === x.j ? null : x.j, adim: null, tezgah: null })}>{x.j}</button>
              <span><span className="tc-pym-mono">{odakAdi(x.m)}</span>{' · bekler '}<b className="tc-pym-mono">{saatYazi(x.bek)}</b>{x.gec && <>{' · '}<b data-ton="hata">{`${saatYazi(x.T)} geç`}</b></>}</span>
              <Dg ad="Öne al" simge="flag" hayalet={!x.gec} not={pasif} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kuyruk({ o, m }: { o: OdakOzellikleri; m: string }) {
  const l = kuyruk(o.p, m, o.now); const pasif = o.planYaz ? MOTOR_NOTU : YETKISIZ;
  return (
    <section className="tc-pyo-blok">
      <h4><Simge ad="list" boyut="k" />{`Kuyruk (${l.length})`}</h4>
      <ol className="tc-pyo-kuyruk">
        {l.length ? l.map((r, i) => (
          <li key={r.id} data-gec={(o.p.J[r.job]?.T ?? 0) > 0.05 ? '' : undefined} data-secili={o.secim.adim === r.id ? '' : undefined}>
            <b className="tc-pym-mono">{i + 1}</b>
            <button type="button" className="tc-pym-link tc-pym-mono" onClick={() => o.sec({ adim: o.secim.adim === r.id ? null : r.id, siparis: null, tezgah: null })}>{r.id}</button>
            <small className="tc-pym-mono">{saatYaz(o.c.D, r.S).slice(6)}</small>
            <span className="tc-pyo-kuyruk-d">
              {([['Sırada öne al', 'up'], ['Sırada geriye al', 'down']] as const).map(([ad, simge]) => (
                <button key={ad} type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label={ad} aria-disabled="true" title={`${ad}: ${pasif}`}><Simge ad={simge} boyut="k" /></button>
              ))}
            </span>
          </li>
        )) : <li className="tc-pyo-k">Kuyrukta iş yok.</li>}
      </ol>
    </section>
  );
}

function Mesai({ o, m }: { o: OdakOzellikleri; m: string }) {
  const l = o.planYaz && !m.startsWith('@') ? mesaiAdaylari(o.c, o.cx, m).slice(0, 6) : [];
  if (!l.length) return null;
  return (
    <section className="tc-pyo-blok">
      <h4><Simge ad="clock" boyut="k" />Ek mesai dene</h4>
      <p className="tc-pyo-k">Seçtiğiniz vardiya bu tezgâha eklenir, motor işleri yeniden dizer; önce önizleme açılır.</p>
      <div className="tc-pyo-dugmeler">{l.map((x) => <Dg key={`${x.gun}|${x.vardiya}`} ad={x.ad} not={MOTOR_NOTU} />)}</div>
    </section>
  );
}
