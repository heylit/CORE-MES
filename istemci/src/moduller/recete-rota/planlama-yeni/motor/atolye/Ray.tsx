import { useMemo, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { MOTOR_NOTU } from '../ortak.tsx';
import {
  akis, elleSira, ga, malzemeDetay, malzemeGec, ONCELIK_KISA, parcaAyir, SIPARIS_GRUPLARI, sure, suzUyar, tz, zs, type SiparisBilgisi,
} from './kurallar.ts';
import { ankraj, type Ortam } from './Pano.tsx';

// Sipariş rayı (cizRay): arama, sütunlar, durum ayraçlı liste; açılan siparişte ayrıntı, akış ve eylemler (cizSipAc, cizSipDetay).
// Elle sıra kayıtlıysa liste o sıradadır ve bırakılabilir; sürükleyerek sıra değiştirmek ve çözüm yolları motor ister (357 b).
export function Ray({ ort }: { ort: Ortam }) {
  const [ara, setAra] = useState('');
  const { c, suz, o } = ort;
  const elle = elleSira(c).length > 0;
  const siraBirak = () => { if (ort.yaz) o.komut?.degistir('Sipariş sırası riske göre', (t) => { (t as Record<string, unknown>).tpSira = []; }, { planKoru: true }); };
  const q = ara.toLocaleLowerCase('tr-TR');
  const L = ort.liste.filter((s) => (!q || `${s.id} ${s.ad}`.toLocaleLowerCase('tr-TR').includes(q)) && (!suz || s.ops.some((r) => suzUyar(c.D, suz, r))));
  return (
    <aside className="tc-pym-tp-ray" aria-label="Siparişler">
      <div className="tc-pym-tp-ray-bas">
        <Simge ad="search" boyut="k" />
        <input type="search" placeholder="Sipariş ara" value={ara} aria-label="Sipariş ara" onChange={(e) => setAra(e.target.value)} />
        {elle && (
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-simge-d" aria-label="Elle sırayı bırak" title="Elle sırayı bırak, riske göre sırala" aria-disabled={!ort.yaz} onClick={siraBirak}>
            <Simge ad="sort" boyut="k" />
          </button>
        )}
      </div>
      <div className="tc-pym-tp-sutun"><span title={elle ? 'Elle sıra' : 'En riskli üstte'}>Sipariş</span><span>Başl.</span><span>Üretim</span><span>Bitiş</span><span>Termin</span></div>
      <div className="tc-pym-tp-liste">
        {!L.length && <p className="tc-pym-tp-not tc-pym-bos"><Simge ad="search" boyut="k" />{` ${suz ? 'Süzgece' : 'Aramaya'} uyan sipariş yok.`}</p>}
        {q || elle ? L.map((s) => <Satir key={s.id} ort={ort} s={s} />) : SIPARIS_GRUPLARI.map(([d, ad, ik]) => {
          const G = L.filter((x) => x.durum === d); if (!G.length) return null;
          return (
            <div key={d} role="group" aria-label={ad}>
              <div className="tc-pym-tp-ayrac" data-durum={d}><Simge ad={ik} boyut="k" />{ad}<span>{G.length}</span></div>
              {G.map((s) => <Satir key={s.id} ort={ort} s={s} />)}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function Satir({ ort, s }: { ort: Ortam; s: SiparisBilgisi }) {
  const D = ort.c.D; const ac = ort.secJob === s.id;
  const [no, parca] = parcaAyir(s.id);
  const mg = malzemeGec(s);
  return (
    <div className="tc-pym-tp-sip" data-durum={s.durum === 'iyi' ? undefined : s.durum} data-acik={ac ? '' : undefined} title={ort.yaz ? `Sürükleyerek sırasını değiştir: ${MOTOR_NOTU}` : undefined}>
      <button type="button" className="tc-pym-tp-sip-tus" aria-expanded={ac} onClick={() => ort.sipSec(s.id)}>
        <div className="tc-pym-tp-sip-ad">
          <b><Simge ad={ac ? 'down' : 'chev-right'} boyut="k" />{no}{parca && <i>{parca}</i>}</b>
          {s.durum === 'gec' ? <span className="tc-pym-tp-rozet" data-durum="gec">{`${sure(s.T)} geç`}</span>
            : s.durum === 'risk' ? <span className="tc-pym-tp-rozet" data-durum="risk">{`${sure(s.pay)} pay`}</span> : null}
          <small>{`${s.ad} · ${s.adet} ad${s.oncelik === 1 ? ' · acil' : ''}`}</small>
        </div>
        <Zaman D={D} t={s.bas} uyar={mg} title={mg ? 'Malzeme tahmini üretim başlangıcından sonra geliyor' : undefined} />
        <Zaman D={D} t={s.ur} />
        <Zaman D={D} t={s.C} gec={s.durum === 'gec'} />
        <Zaman D={D} t={s.due} />
      </button>
      {ac && <SipAc ort={ort} s={s} />}
    </div>
  );
}

function Zaman({ D, t, gec, uyar, title }: { D: Ortam['c']['D']; t: number | null; gec?: boolean; uyar?: boolean; title?: string | undefined }) {
  return <div className="tc-pym-tp-t" data-durum={gec ? 'gec' : undefined} data-uyar={uyar ? '' : undefined} title={title}>{ga(D, t)}<b>{zs(D, t)}</b></div>;
}

function SipAc({ ort, s }: { ort: Ortam; s: SiparisBilgisi }) {
  const { c, p, cx, hazir } = ort; const D = c.D;
  const A = akis(p, cx, hazir, s.id);
  const malzemeVar = !!A?.malzeme && A.bas0 > cx.now + 0.01;
  return (
    <div className="tc-pym-tp-ac">
      <Detay ort={ort} s={s} />
      <div className="tc-pym-tp-akis">
        {malzemeVar && A && <div className="tc-pym-tp-akis-uc"><Simge ad="box" boyut="k" /> Malzeme hazır <b>{tz(D, A.bas0)}</b></div>}
        {A?.L.map((x) => {
          const r = x.r;
          const bitis = Math.floor(r.S / 24) === Math.floor(r.C / 24) ? zs(D, r.C) : tz(D, r.C);
          return (
            <div key={x.id}>
              {x.bek >= 0.25 && (
                <div className="tc-pym-tp-akis-bek" data-kritik={x.kritik ? '' : undefined}><Simge ad="clock" boyut="k" />{` ${sure(x.bek)} bekleme${x.neden ? ` · ${x.neden}` : ''}`}</div>
              )}
              <button type="button" className="tc-pym-tp-akis-op" data-kritik={x.kritik ? '' : undefined} aria-current={ort.secOp === x.id} title="Çizelgede göster" onClick={() => ort.opGit(x.id)}>
                <i>{x.k}</i>
                <span><b>{x.ad}</b><small>{`${r.fas ? `Fason ${r.m.slice(1)}` : r.m} · ${tz(D, r.S)} → ${bitis} · ${sure(r.C - r.S)}`}</small></span>
                {c.locks[x.id] ? <Simge ad="lock" boyut="k" /> : <span />}
              </button>
            </div>
          );
        })}
        <div className="tc-pym-tp-akis-uc" data-durum={s.durum === 'gec' ? 'gec' : undefined}>
          <Simge ad="flag" boyut="k" /> Bitiş <b>{tz(D, s.C)}</b>{` · termin ${tz(D, s.due)} · ${s.durum === 'gec' ? `${sure(s.T)} geç` : `${sure(s.pay)} pay`}`}
        </div>
      </div>
      <p className="tc-pym-tp-not">Kalın çizgili adımlar bitişi belirleyen zincir. Adıma dokun, çizelgede açılsın.</p>
      {s.durum === 'iyi'
        ? <p className="tc-pym-tp-not"><Simge ad="check" boyut="k" />{` Termine ${sure(s.pay)} pay var.`}</p>
        : <p className="tc-pym-tp-not" title={MOTOR_NOTU}><Simge ad="rotate" boyut="k" />{` Çözüm yolları (öne al, tezgâh değiştir): ${MOTOR_NOTU}`}</p>}
      <div className="tc-pym-tp-eylem">
        {s.adet > 1 && !parcaAyir(s.id)[1] && ort.yaz && (
          <button type="button" className="tc-dugme" aria-disabled="true" title={`Böl: ${MOTOR_NOTU}`}><Simge ad="layers" boyut="k" />Böl</button>
        )}
        {s.durum !== 'iyi' && (
          <button type="button" className="tc-dugme" onClick={(e) => ort.kartAc({ tur: 'termin', j: s.id }, ankraj(e))}><Simge ad="clock" boyut="k" />Termin konuş</button>
        )}
        <button type="button" className="tc-dugme" onClick={() => ort.sipSec(s.id)}><Simge ad="x" boyut="k" />Kapat</button>
      </div>
    </div>
  );
}

// Ayrıntı (cizSipDetay): adet, öncelik, uyarılar, malzeme, kısıtlar; fiyat ve kâr yalnız maliyet okuyana (223 a). Kâr kayıtlı planda yoktur.
function Detay({ ort, s }: { ort: Ortam; s: SiparisBilgisi }) {
  const { c, p, cx, o } = ort; const D = c.D;
  const j = cx.jobs[s.id]; const sp = D.siparisler.find((x) => x.id === s.id);
  const maliyet = o.yetki.maliyetOku;
  const tl = (v: number) => `${Math.round(v).toLocaleString('tr-TR')} TL`;
  const uy = p.warn.filter((w) => w.j === s.id);
  const md = useMemo(() => malzemeDetay(cx)[s.id] ?? [], [cx, s.id]);
  const mats = new Map((D.malzemeler ?? []).map((m) => [m.kod, m]));
  const kis: string[] = [];
  if (j?.rel != null) kis.push(`serbest bırakma ${tz(D, j.rel)}`);
  const J = p.J[s.id];
  if (J?.dueB != null && j?.due != null && j.due - J.dueB > 0.05) kis.push(`termin tamponu ${sure(j.due - J.dueB)}`);
  for (const a of j?.ops ?? []) {
    const k = a.id.slice(s.id.length + 1); const r = p.ops[a.id]; const l = c.locks[a.id] as { S?: unknown } | undefined;
    if (l) kis.push(`${k} kilitli ${typeof l.S === 'number' ? tz(D, l.S) : ''}`.trim());
    if (a.aparat) kis.push(`${k} aparat ${a.aparat}`);
    if (r?.fas) kis.push(`${k} fason ${r.m.slice(1)}`);
    const tz2 = a.c.filter((m) => !m.startsWith('@')); if (tz2.length > 1) kis.push(`${k} ${tz2.length} tezgâhta yapılabilir (${tz2.join(', ')})`);
  }
  return (
    <details className="tc-pym-tp-detay">
      <summary>
        <Simge ad="clipboard-check" boyut="k" />{`Ayrıntı · ${s.adet} adet · ${ONCELIK_KISA[s.oncelik] ?? '—'}${maliyet && sp?.gelir != null ? ` · ${tl(sp.gelir)}` : ''}`}
        {uy.length > 0 && <> · <span className="tc-pym-tp-rozet" data-durum="risk">{`${uy.length} uyarı`}</span></>}
      </summary>
      <div className="tc-pym-tp-detay-ic">
        {uy.map((w, i) => <p key={i} className="tc-pym-tp-not" data-uyari=""><Simge ad="alert" boyut="k" />{` ${w.txt}`}</p>)}
        <h5>Malzeme</h5>
        {md.length ? md.map((d) => {
          const t = mats.get(d.kod); const birim = t?.birim ?? '';
          const kay = d.kaynak.map((u) => (u.stok ? `${Math.round(u.miktar)} ${birim} stoktan`
            : `${Math.round(u.miktar)} ${birim} satın alma, ${u.gelis ? `${u.gelis.slice(8, 10)}.${u.gelis.slice(5, 7)} ${u.gelis.slice(11)}` : '?'}${u.tedarikci ? ` · ${u.tedarikci}` : ''}`)).join('; ');
          return (
            <div key={d.kod}>
              <div className="tc-pym-tp-satir2">
                <span>{`${t?.ad ?? d.kod} · ${Math.round(d.ihtiyac)} ${birim}`.trim()}</span>
                {d.eksik > 0 ? <b className="tc-pym-tp-rozet" data-durum="gec">{`eksik ${Math.round(d.eksik)}`}</b> : <b>{`hazır ${tz(D, d.t)}`}</b>}
              </div>
              {kay && <p className="tc-pym-tp-not">{kay}</p>}
            </div>
          );
        }) : <p className="tc-pym-tp-not">Malzeme tanımı yok.</p>}
        <h5>Kısıtlar</h5>
        {kis.length ? <ul>{kis.map((k) => <li key={k}>{k}</li>)}</ul> : <p className="tc-pym-tp-not">Özel kısıt yok.</p>}
        {maliyet && <><h5>Kâr dökümü</h5><p className="tc-pym-tp-not">Kâr hesaplanamıyor: kayıtlı planda yok.</p></>}
        {maliyet && sp?.cezaGun ? <p className="tc-pym-tp-not">{`Gecikme bedeli günde ${tl(sp.cezaGun)}.`}</p> : null}
      </div>
    </details>
  );
}
