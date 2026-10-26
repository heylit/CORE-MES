import { useMemo, useState, type ReactNode } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaSecimi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { eylemYapisi } from '../../motor/eylem.ts';
import { useCanliPlan } from '../../motor/fark.ts';
import { dilimNo, gecMetin, siparisRengi, tezgahDurumu, type Aralik, type Sahne } from '../../motor/harita/kurallar.ts';
import { KATEGORI_AD, ONCELIK_AD, saatYaz, saatYazi, type Derleme, type OkunanPlan, type Sorun } from '../../motor/kurallar.ts';
import { degisken, HAZIRLANIYOR, MOTOR_NOTU } from '../../motor/ortak.tsx';
import {
  agYakinlari, bitisFarki, etkiAgi, KUYRUK_GOSTERIM, kuyrukGrubu, kuyrukGruplari, kuyrukListesi, planKarti, siparisSatirlari, TUR_AD,
  type KartTuru, type SiparisSirasi, type SiparisSuzgeci,
} from './kurallar.ts';

// Kartların gövdeleri (z-komuta kmPlan; za-merkez mzSiparis, mzKuyruk, mzAg). Okurlar; çalışmaya yazan tek yol kararların eylemidir (eylem.ts).
// Motor isteyen hamleler (öne al, öncelik, sürükleyip sıralama, planı toparla) görünür ve pasiftir (357 b).
export interface KartBaglami {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; s: Sahne; r: Aralik; now: number; t: number; durus: { m: string; from: number; to: number }[];
  secim: PlanlamaSecimi; sor: Sorun[]; komut: CalismaKomutu | null; planYaz: boolean; canliSurum: number | null;
  mercek: 'durum' | 'etki'; mercekSec: () => void; kilavuzAc: () => void;
  sipSec: (j: string) => void; tezSec: (m: string) => void; opSec: (id: string) => void; kartAc: (t: KartTuru) => void;
  veriAc: ((bolum: string) => void) | null;
}
const YETKISIZ = 'Plan yazma yetkiniz yok.';

function Pasif({ ad, simge, not, kucuk = true, birincil = false }: { ad: string; simge?: SimgeAdi; not: string; kucuk?: boolean; birincil?: boolean }) {
  return (
    <button type="button" className={`tc-dugme${kucuk ? ' tc-pym-kucuk' : ''}${birincil ? ' tc-dugme-birincil' : ''}`} aria-disabled="true" title={`${ad}: ${not}`}>
      {simge && <Simge ad={simge} boyut="k" />}<span>{ad}</span>
    </button>
  );
}
const Bolum = ({ baslik, simge, children }: { baslik: string; simge: SimgeAdi; children: ReactNode }) => (
  <section className="tc-pyk-bolum"><h4><Simge ad={simge} boyut="k" />{baslik}</h4>{children}</section>
);
const Nokta = ({ D, j }: { D: PlanlamaCalismasi['D']; j: string }) => <i className="tc-pyk-nokta" ref={degisken({ '--c': `var(--tc-pym-is-${siparisRengi(D, j)})` })} />;

export function KartGovdesi({ tur, b }: { tur: KartTuru; b: KartBaglami }) {
  if (tur === 'plan') return <PlanGovdesi b={b} />;
  if (tur === 'siparis') return <SiparisGovdesi b={b} />;
  if (tur === 'kuyruk') return <KuyrukGovdesi b={b} />;
  if (tur === 'etki') return <EtkiGovdesi b={b} />;
  return <p className="tc-pym-kucuk-yazi">{HAZIRLANIYOR}</p>;
}

function PlanGovdesi({ b }: { b: KartBaglami }) {
  const { c, p, cx } = b; const k = useMemo(() => planKarti(c, p, cx), [c, p, cx]);
  return (
    <>
      <header className="tc-pyk-ust"><small>PLAN</small><b>Bütün atölye</b><small>{k.late}/{k.n} sipariş geç · toplam gecikme {saatYazi(k.wT)}</small></header>
      {k.en && (
        <p className="tc-pyk-yorum"><Simge ad="chart" boyut="k" />
          <span>Geç siparişleri en çok <button type="button" className="tc-pym-link tc-pym-mono" onClick={() => b.tezSec(k.en?.m ?? '')}>{k.en.m}</button> bekletiyor: {k.en.n} sipariş, toplam {saatYazi(k.en.v)}.
            {b.mercek !== 'etki' && <> <button type="button" className="tc-pym-link" onClick={b.mercekSec}>Resimde göster</button></>}
          </span>
        </p>
      )}
      <Bolum baslik={`Dikkat (${b.sor.length})`} simge="alert">
        <ul className="tc-pyk-liste">
          {b.sor.length ? b.sor.map((x) => {
            const { yap, not } = eylemYapisi(x.eylem, { c, komut: b.komut, sipSec: b.sipSec, veriAc: b.veriAc });
            return (
              <li key={`${x.baslik}-${x.eylem.v}`} data-ton={x.ton}><Simge ad={x.simge} boyut="k" /><span>{x.baslik}</span>
                <button type="button" className="tc-pym-link" aria-disabled={yap ? undefined : 'true'} title={yap ? undefined : `${x.eylem.ad}: ${not}`} onClick={yap ?? undefined}>{x.eylem.ad}</button>
              </li>
            );
          }) : <li className="tc-pym-kucuk-yazi">Sorun yok.</li>}
        </ul>
      </Bolum>
      <Bolum baslik="Bütün plana yön ver" simge="target">
        <div className="tc-pym-dugmeler">
          <Pasif ad="Planı toparla" simge="bolt" not={b.planYaz ? MOTOR_NOTU : YETKISIZ} />
          <Pasif ad="Bugünü dondur" simge="lock" not={b.planYaz ? HAZIRLANIYOR : YETKISIZ} />
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={b.kilavuzAc}><Simge ad="help" boyut="k" /><span>Nasıl okunur</span></button>
        </div>
        <p className="tc-pym-kucuk-yazi">Bir tezgâha, siparişe ya da sıra çipine tıklayın; onunla yapabilecekleriniz seçim panelinde çıkar.</p>
      </Bolum>
    </>
  );
}

const SUZGECLER: [SiparisSuzgeci, string][] = [['hepsi', 'Hepsi'], ['gec', 'Geç'], ['degisen', 'Bitişi değişen']];
const SIRALAR: [SiparisSirasi, string][] = [['gecikme', 'Gecikme'], ['termin', 'Termin'], ['bitis', 'Bitiş'], ['oncelik', 'Öncelik']];
function SiparisGovdesi({ b }: { b: KartBaglami }) {
  const { c, p, cx } = b; const D = c.D;
  const [suz, setSuz] = useState<SiparisSuzgeci>('hepsi'); const [sira, setSira] = useState<SiparisSirasi>('gecikme');
  // Bitişi değişen son canlı plana göredir (önceki planla fark, 577c).
  const canli = useCanliPlan(true, c, p, b.canliSurum);
  const fark = useMemo(() => bitisFarki(p, canli.tur === 'tamam' && Object.keys(canli.canli).length ? canli.canli : null), [p, canli]);
  const l = useMemo(() => siparisSatirlari(c, p, cx, suz, sira, fark), [c, p, cx, suz, sira, fark]);
  const sj = b.secim.adim ? p.ops[b.secim.adim]?.job ?? null : b.secim.siparis;
  const pasif = b.planYaz ? MOTOR_NOTU : YETKISIZ;
  return (
    <>
      <div className="tc-pyk-arac">
        <div className="tc-pyk-seg" role="group" aria-label="Süz">
          {SUZGECLER.map(([v, ad]) => <button key={v} type="button" aria-pressed={suz === v} onClick={() => setSuz(v)}>{ad}</button>)}
        </div>
        <label className="tc-pyk-sirala"><span>Sırala</span>
          <select value={sira} onChange={(e) => setSira(e.target.value as SiparisSirasi)}>{SIRALAR.map(([v, ad]) => <option key={v} value={v}>{ad}</option>)}</select>
        </label>
        <small className="tc-pym-kucuk-yazi">
          {l.length} sipariş. Öncelik değişince motor yeniden dizer; etkisi şeritte ve resimde görünür.
          {suz === 'degisen' && (canli.tur === 'okunuyor' ? ' Canlı plan okunuyor.' : canli.tur === 'hata' ? ` ${canli.ileti}` : canli.tur === 'tamam' && !Object.keys(canli.canli).length ? ' Henüz canlı plan yok.' : '')}
        </small>
      </div>
      <div className="tc-pyk-tablo">
        <table aria-label="Siparişler">
          <thead><tr><th>Sipariş</th><th>Ürün</th><th>Öncelik</th><th>Termin</th><th>Bitiş</th><th>Durum</th><th>Fark</th><th>Bitişi belirleyen</th><th><span className="tc-gizli-etiket">Hamle</span></th></tr></thead>
          <tbody>
            {l.length ? l.map((x) => (
              <tr key={x.id} data-secili={sj === x.id ? '' : undefined} data-gec={x.gec ? '' : undefined}>
                <td><button type="button" className="tc-pyk-sip" onClick={() => b.sipSec(x.id)}><Nokta D={D} j={x.id} /><b className="tc-pym-mono">{x.id}</b></button></td>
                <td><small>{x.urun}</small></td>
                <td>
                  <select value={x.oncelik} aria-label={`${x.id} önceliği`} disabled title={`Öncelik: ${pasif}`} onChange={() => undefined}>
                    {[1, 2, 3].map((v) => <option key={v} value={v}>{ONCELIK_AD[v]}</option>)}
                  </select>
                </td>
                <td className="tc-pym-mono">{x.due != null ? saatYaz(D, x.due) : '—'}</td>
                <td className="tc-pym-mono">{x.C != null && Number.isFinite(x.C) ? saatYaz(D, x.C) : '—'}</td>
                <td>{x.gec ? <span className="tc-pyk-gec">{gecMetin(x.T)} geç</span> : <span className="tc-pyk-tamam">yetişiyor</span>}</td>
                <td className="tc-pym-mono">{x.fark != null && <span data-ton={x.fark < 0 ? 'iyi' : 'kotu'}>{x.fark < 0 ? '−' : '+'}{saatYazi(Math.abs(x.fark))}</span>}</td>
                <td>
                  {x.belirleyen?.tur === 'kaynak' ? (
                    <><button type="button" className="tc-pym-link tc-pym-mono" title="Bitişini en çok bu bekletiyor"
                      onClick={() => { const k = x.belirleyen; if (k?.tur !== 'kaynak') return; if (k.k === 'tezgah') b.tezSec(k.ad); else b.kartAc('etki'); }}>{x.belirleyen.ad}</button> <small className="tc-pym-mono">{saatYazi(x.belirleyen.v)}</small></>
                  ) : x.belirleyen?.tur === 'kategori' ? <small>{KATEGORI_AD[x.belirleyen.k]}</small> : '—'}
                </td>
                <td>
                  <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-disabled="true" aria-label={`${x.id} öne al`} title={`${x.id} öne al: ${pasif}`}><Simge ad="flag" boyut="k" /></button>
                </td>
              </tr>
            )) : <tr><td colSpan={9} className="tc-pym-kucuk-yazi">Bu süzgeçte sipariş yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function KuyrukGovdesi({ b }: { b: KartBaglami }) {
  const { c, p, cx, s, now } = b; const D = c.D;
  const [secilen, setSecilen] = useState<string | null>(null);
  const g = kuyrukGrubu(c, p, b.secim, secilen); const gruplar = kuyrukGruplari(c);
  const tez = D.tezgahlar.filter((m) => m.grup === g).map((m) => m.id);
  const sj = b.secim.adim ? p.ops[b.secim.adim]?.job ?? null : b.secim.siparis; const gun = dilimNo(b.r, now);
  return (
    <>
      <div className="tc-pyk-arac">
        <div className="tc-pyk-seg" role="group" aria-label="Tezgâh grubu">
          {gruplar.map((x) => <button key={x} type="button" aria-pressed={x === g} onClick={() => setSecilen(x)}>{x}</button>)}
        </div>
        <small className="tc-pym-kucuk-yazi">
          {b.planYaz ? `Kartı tutup aynı sütunda sıralamak ya da başka tezgâha bırakmak: ${MOTOR_NOTU} Çalışan ve sabit iş yerinden oynamaz.` : 'Sırayı değiştirme yetkiniz yok; yalnız görürsünüz.'}
        </small>
      </div>
      <div className="tc-pyk-kolonlar">
        {tez.map((m) => {
          const l = kuyrukListesi(p, m, now); const st = s.ist[m] ? tezgahDurumu(s, b.durus, m, b.t) : null; const d = s.dol[m]?.[gun];
          return (
            <section key={m} className="tc-pyk-kol" aria-label={`${m} kuyruğu`} data-secili={b.secim.tezgah === m ? '' : undefined}>
              <header>
                <button type="button" onClick={() => b.tezSec(m)}><i className="tc-pyk-dur" data-dur={st?.dur ?? 'bos'} /><b className="tc-pym-mono">{m}</b></button>
                <small className="tc-pym-mono" title="Şimdiki dilimde doluluk" data-ton={d != null && d > 0.97 ? 'hata' : undefined}>{d == null ? 'kapalı' : `%${Math.round(d * 100)}`}</small>
                <small className="tc-pym-mono">{l.length} iş</small>
              </header>
              <ol>
                {l.length ? l.slice(0, KUYRUK_GOSTERIM).map((r) => {
                  const cal = r.S <= now; const kl = !!c.locks[r.id]; const gec = (p.J[r.job]?.T ?? 0) > 0.05;
                  return (
                    <li key={r.id} data-sabit={kl || cal ? '' : undefined} data-secili={b.secim.adim === r.id ? '' : undefined} data-is={b.secim.adim !== r.id && sj === r.job ? '' : undefined}
                      ref={degisken({ '--c': `var(--tc-pym-is-${siparisRengi(D, r.job)})` })}>
                      <button type="button" onClick={() => b.opSec(r.id)}>
                        <span><b className="tc-pym-mono">{r.id}</b><small className="tc-pym-mono">{saatYaz(D, r.S).slice(6)}</small></span>
                        <small>{cx.byId[r.id]?.ad ?? ''} · {saatYazi(r.C - r.S)}</small>
                      </button>
                      {cal ? <span className="tc-pyk-rozet" title="Şu an işleniyor"><Simge ad="play" boyut="k" /></span>
                        : kl ? <span className="tc-pyk-rozet" title="Sabit"><Simge ad="lock" boyut="k" /></span>
                          : gec ? <span className="tc-pyk-rozet" data-ton="hata" title="Siparişi geç">!</span> : null}
                    </li>
                  );
                }) : <li className="tc-pym-kucuk-yazi" data-bos="">Sırada iş yok.</li>}
              </ol>
              {l.length > KUYRUK_GOSTERIM && <small className="tc-pym-kucuk-yazi">+{l.length - KUYRUK_GOSTERIM} iş daha</small>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function EtkiGovdesi({ b }: { b: KartBaglami }) {
  const { c, p, cx } = b;
  const ag = useMemo(() => etkiAgi(c, p, cx), [c, p, cx]);
  const [ust, setUst] = useState<string | null>(null);
  const sj = b.secim.adim ? p.ops[b.secim.adim]?.job ?? null : b.secim.siparis;
  if (!ag) return <p className="tc-pym-kucuk-yazi">Geç sipariş yok; bekleten kaynak da yok.</p>;
  const yak = agYakinlari(ag, ust); const bas = ag.kaynak[0]; const bt = ag.tur[0];
  // Tür düğümü ve tezgâh dışı kaynak kısıtları Veri ve kısıtlar'da açar; kaynak tezgâhsa ya da arızaysa tezgâhı, sipariş düğümü siparişi seçer.
  const bas1 = (n: string) => {
    if (n.startsWith('j:')) { b.sipSec(n.slice(2)); return; }
    if (n.startsWith('t:')) { b.veriAc?.('kisitlar'); return; }
    const d = ag.kaynak.find((x) => x.n === n); if (!d) return;
    if (d.k === 'tezgah') b.tezSec(d.ad); else if (d.k === 'ariza') b.tezSec(d.ad.replace('Arıza · ', '')); else b.veriAc?.('kisitlar');
  };
  const dugum = (d: { n: string; x: number; y: number; ad: string }, alt: string, sag: boolean) => (
    <g key={d.n} className="tc-pyk-dugum" data-yak={yak.dugum.has(d.n) ? '' : undefined} data-sec={d.n === `j:${sj ?? ''}` ? '' : undefined} tabIndex={0} role="button" aria-label={`${d.ad} ${alt}`}
      onClick={() => bas1(d.n)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bas1(d.n); } }}
      onPointerEnter={() => setUst(d.n)} onPointerLeave={() => setUst(null)} onFocus={() => setUst(d.n)} onBlur={() => setUst(null)}>
      <circle cx={d.x} cy={d.y} r={5} />
      <text x={sag ? d.x + 10 : d.x - 10} y={d.y + 4} textAnchor={sag ? 'start' : 'end'}>{d.ad}<tspan className="tc-pyk-alt" dx={6}>{alt}</tspan></text>
    </g>
  );
  return (
    <>
      <p className="tc-pyk-yorum"><Simge ad="chart" boyut="k" />
        <span>En çok <b>{bas?.ad}</b> bekletiyor ({saatYazi(bas?.v)}); bekleme türlerinde başta <b>{(bt?.ad ?? '').toLocaleLowerCase('tr-TR')}</b> var. Düğüme basınca harita ve panel oraya gider; tür düğümü ilgili kısıtı açar.</span>
      </p>
      <div className="tc-pyk-ag-kap">
        <svg className="tc-pyk-ag" viewBox={`0 0 ${ag.W} ${ag.H}`} role="img" aria-label="Bekleme türü, kaynak ve geç sipariş arasındaki bağlar" data-hl={ust ? '' : undefined}>
          <text className="tc-pyk-kolad" x={ag.x[0]} y={14} textAnchor="end">Bekleme türü</text>
          <text className="tc-pyk-kolad" x={ag.x[1]} y={14} textAnchor="middle">Kaynak</text>
          <text className="tc-pyk-kolad" x={ag.x[2]} y={14}>Geç sipariş</text>
          {ag.bag.map((x) => (
            <path key={`${x.a}>${x.b}`} className="tc-pyk-bag" d={x.d} data-yak={yak.bag.has(x) ? '' : undefined} data-sec={x.j && x.j === sj ? '' : undefined}
              ref={degisken({ '--c': `var(--tc-pym-k-${x.k})`, '--k': x.kalinlik })}>
              <title>{x.j ? `${x.a.slice(2)} → ${x.j}: ${saatYazi(x.v)} bekletti` : `${TUR_AD[x.k] ?? KATEGORI_AD[x.k]} · ${x.b.slice(2)}: ${saatYazi(x.v)}`}</title>
            </path>
          ))}
          {ag.tur.map((d) => dugum(d, saatYazi(d.v), false))}
          {ag.kaynak.map((d) => dugum(d, saatYazi(d.v), false))}
          {ag.is.map((d) => dugum(d, `${gecMetin(d.v)} geç`, true))}
        </svg>
      </div>
    </>
  );
}
