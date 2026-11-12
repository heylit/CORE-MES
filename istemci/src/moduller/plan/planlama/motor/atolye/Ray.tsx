import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { hamleYapisi, useHamleci } from '../hamle/hamle.ts';
import {
  akis, elleSira, ga, malzemeDetay, malzemeGec, ONCELIK_KISA, parcaAyir, SIPARIS_GRUPLARI, siraKomsu, siraTasi, sure, suzUyar, tz, zs, type SiparisBilgisi,
} from './kurallar.ts';
import { ankraj, type Ortam } from './Pano.tsx';

// Sipariş rayı (cizRay): arama, sütunlar, durum ayraçlı liste; açılan siparişte ayrıntı, akış ve eylemler (cizSipAc, cizSipDetay).
// Sürükleyerek (ya da Alt+ok, açık siparişte Yukarı/Aşağı) elle sıra kurulur; kayıtlıysa liste o sıradadır ve bırakılabilir. Elle sıra
// yalnız rayın sırasıdır (planın girdisi değil); siparişi planda öne almak motorun "öne al" hamlesidir (2531 a).
export function Ray({ ort }: { ort: Ortam }) {
  const [ara, setAra] = useState('');
  const [tasinan, setTasinan] = useState<string | null>(null);
  const { c, suz, o } = ort;
  const elle = elleSira(c).length > 0;
  const siraBirak = () => { if (ort.yaz) o.komut?.degistir('Sipariş sırası riske göre', (t) => { (t as Record<string, unknown>).tpSira = []; }, { planKoru: true }); };
  const q = ara.toLocaleLowerCase('tr-TR');
  const L = ort.liste.filter((s) => (!q || `${ort.emirNo(s.id)} ${s.id} ${s.ad}`.toLocaleLowerCase('tr-TR').includes(q)) && (!suz || s.ops.some((r) => suzUyar(c.D, suz, r))));
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
        {q || elle ? L.map((s) => <Satir key={s.id} ort={ort} s={s} tasinan={tasinan} tasi={setTasinan} />) : SIPARIS_GRUPLARI.map(([d, ad, ik]) => {
          const G = L.filter((x) => x.durum === d); if (!G.length) return null;
          return (
            <div key={d} role="group" aria-label={ad}>
              <div className="tc-pym-tp-ayrac" data-durum={d}><Simge ad={ik} boyut="k" />{ad}<span>{G.length}</span></div>
              {G.map((s) => <Satir key={s.id} ort={ort} s={s} tasinan={tasinan} tasi={setTasinan} />)}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// Elle sırayı çalışmaya yazar (görünüm tercihi: plan güncel kalır, geri alınabilir).
export function siraYaz(ort: Ortam, l: string[] | null): void {
  if (!l || !ort.yaz) return;
  ort.o.komut?.degistir('Sipariş sırası', (t) => { (t as Record<string, unknown>).tpSira = l; }, { planKoru: true });
}
const SURUKLE_TURU = 'text/x-tc-siparis';

function Satir({ ort, s, tasinan, tasi }: { ort: Ortam; s: SiparisBilgisi; tasinan: string | null; tasi: (id: string | null) => void }) {
  const D = ort.c.D; const ac = ort.secJob === s.id;
  const [no, parca] = parcaAyir(ort.emirNo(s.id));
  const mg = malzemeGec(s);
  const ids = ort.liste.map((x) => x.id);
  const birak = (e: DragEvent) => { e.preventDefault(); const id = tasinan ?? e.dataTransfer.getData(SURUKLE_TURU); tasi(null); if (id) siraYaz(ort, siraTasi(ids, id, s.id)); };
  const tus = (e: KeyboardEvent) => {
    if (!ort.yaz || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault(); siraYaz(ort, siraKomsu(ids, s.id, e.key === 'ArrowUp' ? -1 : 1));
  };
  return (
    <div className="tc-pym-tp-sip" data-durum={s.durum === 'iyi' ? undefined : s.durum} data-acik={ac ? '' : undefined} data-tasinan={tasinan === s.id ? '' : undefined}
      title={ort.yaz ? 'Sürükleyerek ya da Alt+ok ile sırasını değiştir' : undefined} draggable={ort.yaz || undefined}
      onDragStart={ort.yaz ? (e) => { e.dataTransfer.setData(SURUKLE_TURU, s.id); e.dataTransfer.effectAllowed = 'move'; tasi(s.id); } : undefined}
      onDragEnd={ort.yaz ? () => tasi(null) : undefined}
      onDragOver={ort.yaz ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
      onDrop={ort.yaz ? birak : undefined}>
      <button type="button" className="tc-pym-tp-sip-tus" aria-expanded={ac} onClick={() => ort.sipSec(s.id)} onKeyDown={tus}>
        <div className="tc-pym-tp-sip-ad">
          <b><Simge ad={ac ? 'down' : 'chev-right'} boyut="k" />{no}{parca && <i>{parca}</i>}</b>
          {s.durum === 'gec' ? <span className="tc-pym-tp-rozet" data-durum="gec">{`${sure(s.T)} geç`}</span>
            : s.durum === 'risk' ? <span className="tc-pym-tp-rozet" data-durum="risk">{`${sure(s.pay)} pay`}</span> : null}
          <small>{`${s.ad} · ${s.adet} ad${s.oncelik === 1 ? ` · ${ONCELIK_KISA[1] ?? ''}` : ''}`}</small>
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
  const oneY = hamleYapisi(useHamleci(), (h) => { h.oneAl(s.id); });
  const ids = ort.liste.map((x) => x.id);
  const yukari = siraKomsu(ids, s.id, -1); const asagi = siraKomsu(ids, s.id, 1);
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
                <span><b>{x.ad}</b><small>{`${r.fas ? `Fason ${ort.ad.kaynak(r.m)}` : ort.ad.kaynak(r.m)} · ${tz(D, r.S)} → ${bitis} · ${sure(r.C - r.S)}`}</small></span>
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
        : <p className="tc-pym-tp-not"><Simge ad="rotate" boyut="k" />{ort.tasi
          ? ' Çözüm yolu: öne alın (motor önizler) ya da adımı seçip tezgâhını, saatini değiştirin, çubuğu sürükleyin.'
          : ' Çözüm yolu: öne alın; motor önizler, siz uygularsınız.'}</p>}
      <div className="tc-pym-tp-eylem">
        {s.durum !== 'iyi' && (
          <button type="button" className="tc-dugme" aria-disabled={oneY.yap ? undefined : 'true'} title={oneY.yap ? 'Motor bu siparişi öne alan planı arar; önizlersiniz.' : `Öne al: ${oneY.not}`}
            onClick={oneY.yap ?? undefined}><Simge ad="first" boyut="k" />Öne al</button>
        )}
        {ort.yaz && (
          <>
            <button type="button" className="tc-dugme tc-pym-simge-d" aria-label="Listede yukarı" title="Listede yukarı (Alt+↑)" aria-disabled={yukari ? undefined : 'true'}
              onClick={() => siraYaz(ort, yukari)}><Simge ad="up" boyut="k" /></button>
            <button type="button" className="tc-dugme tc-pym-simge-d" aria-label="Listede aşağı" title="Listede aşağı (Alt+↓)" aria-disabled={asagi ? undefined : 'true'}
              onClick={() => siraYaz(ort, asagi)}><Simge ad="down" boyut="k" /></button>
          </>
        )}
        {s.adet > 1 && !parcaAyir(s.id)[1] && ort.yaz && (
          <button type="button" className="tc-dugme" aria-disabled="true" title="Böl: iş emri Reçete ve Rota > Üretim emirlerinde bölünür."><Simge ad="layers" boyut="k" />Böl</button>
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
    if (r?.fas) kis.push(`${k} fason ${ort.ad.kaynak(r.m)}`);
    const tz2 = a.c.filter((m) => !m.startsWith('@')); if (tz2.length > 1) kis.push(`${k} ${tz2.length} tezgâhta yapılabilir (${tz2.map(ort.ad.kaynak).join(', ')})`);
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
