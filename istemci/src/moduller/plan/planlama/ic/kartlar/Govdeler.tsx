import { useMemo, useState, type ReactNode } from 'react';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaSecimi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { planGuncel } from '../../durum.ts';
import type { PlanKurucu } from '../../motor/coz.ts';
import { eylemYapisi } from '../../motor/eylem.ts';
import { grupAdi } from '../../motor/ozet/veri.ts';
import { GOSTERGE_SATIRLARI, gostergeFarki, SENARYO_DURUM_ADI, senaryoSirasi, senaryoZamani } from '../gecmis/kurallar.ts';
import { ParametreGirdisi } from '../veri/Kisitlar.tsx';
import { bedelOku, duruslar, ekMesailer, KATALOG, kisitDegistir, parametreDegeri, parametreOku, parametreYaz, type Durus, type EkMesai, type Parametre } from '../veri/kurallar.ts';
import { useCanliPlan } from '../../motor/fark.ts';
import { dilimNo, gecMetin, siparisRengi, tezgahDurumu, type Aralik, type Sahne } from '../../motor/harita/kurallar.ts';
import { grupDoluluk, KATEGORI_AD, ONCELIK_AD, saatYaz, saatYazi, sayiYaz, type Derleme, type OkunanPlan, type Sorun } from '../../motor/kurallar.ts';
import { degisken, HAZIRLANIYOR, MOTOR_NOTU, VERI_NOTU } from '../../motor/ortak.tsx';
import {
  agYakinlari, bitisFarki, canliOlcu, etkiAgi, GECIS_AD, gecisTuru, KUYRUK_GOSTERIM, kuyrukGrubu, kuyrukGruplari, kuyrukListesi, OLCU_SIRASI, planKarti,
  rotaRecetesi, rotaUrunu, siparisSatirlari, simdikiOlcu, TUR_AD, type KartTuru, type OlcuAnahtari, type PlanOlcusu, type SiparisSirasi, type SiparisSuzgeci,
} from './kurallar.ts';

// Kartların gövdeleri (z-komuta kmPlan; za-merkez mzSiparis, mzKuyruk, mzAg). Okurlar; çalışmaya yazan tek yol kararların eylemidir (eylem.ts).
// Motor isteyen hamleler (öne al, öncelik, sürükleyip sıralama, planı toparla) görünür ve pasiftir (357 b).
export interface KartBaglami {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; s: Sahne; r: Aralik; now: number; t: number; durus: { m: string; from: number; to: number }[];
  secim: PlanlamaSecimi; sor: Sorun[]; komut: CalismaKomutu | null; planYaz: boolean; canliSurum: number | null;
  mercek: 'durum' | 'etki'; mercekSec: () => void; kilavuzAc: () => void;
  sipSec: (j: string) => void; tezSec: (m: string) => void; opSec: (id: string) => void; kartAc: (t: KartTuru) => void;
  veriAc: ((bolum: string) => void) | null;
  planKur: PlanKurucu | null; uyar: (ileti: string) => void;
  // Reçete ve Rota kartının ürünü ve üstüne gelinen adım ya da makine: harita aynı ürünün rotasını yakar.
  rotaUrun: string | null; rotaUrunSec: (u: string) => void; rotaUst: (x: { k: string | null; m: string | null }) => void;
  // Plan modülünün taslakları (221 c); okunamadıysa null. Karşılaştırma Geçmiş > Senaryolar'da, yazma Planlama atölyesinde.
  senaryolar: SenaryolarCevabi | null; senaryolarAc: (() => void) | null; atolyeAc: () => void;
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
  <section className="tc-pyt-bolum"><h4><Simge ad={simge} boyut="k" />{baslik}</h4>{children}</section>
);
const Nokta = ({ D, j }: { D: PlanlamaCalismasi['D']; j: string }) => <i className="tc-pyt-nokta" ref={degisken({ '--c': `var(--tc-pym-is-${siparisRengi(D, j)})` })} />;

export function KartGovdesi({ tur, b }: { tur: KartTuru; b: KartBaglami }) {
  if (tur === 'plan') return <PlanGovdesi b={b} />;
  if (tur === 'siparis') return <SiparisGovdesi b={b} />;
  if (tur === 'kuyruk') return <KuyrukGovdesi b={b} />;
  if (tur === 'etki') return <EtkiGovdesi b={b} />;
  if (tur === 'kisit') return <KisitGovdesi b={b} />;
  if (tur === 'hesap') return <HesapGovdesi b={b} />;
  if (tur === 'rota') return <RotaGovdesi b={b} />;
  if (tur === 'senaryo') return <SenaryoGovdesi b={b} />;
  return <p className="tc-pym-kucuk-yazi">{HAZIRLANIYOR}</p>;
}

function PlanGovdesi({ b }: { b: KartBaglami }) {
  const { c, p, cx } = b; const k = useMemo(() => planKarti(c, p, cx), [c, p, cx]);
  return (
    <>
      <header className="tc-pyt-ust"><small>PLAN</small><b>Bütün atölye</b><small>{k.late}/{k.n} sipariş geç · toplam gecikme {saatYazi(k.wT)}</small></header>
      {k.en && (
        <p className="tc-pyt-yorum"><Simge ad="chart" boyut="k" />
          <span>Geç siparişleri en çok <button type="button" className="tc-pym-link tc-pym-mono" onClick={() => b.tezSec(k.en?.m ?? '')}>{k.en.m}</button> bekletiyor: {k.en.n} sipariş, toplam {saatYazi(k.en.v)}.
            {b.mercek !== 'etki' && <> <button type="button" className="tc-pym-link" onClick={b.mercekSec}>Resimde göster</button></>}
          </span>
        </p>
      )}
      <Bolum baslik={`Dikkat (${b.sor.length})`} simge="alert">
        <ul className="tc-pyt-liste">
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
      <div className="tc-pyt-arac">
        <div className="tc-pyt-seg" role="group" aria-label="Süz">
          {SUZGECLER.map(([v, ad]) => <button key={v} type="button" aria-pressed={suz === v} onClick={() => setSuz(v)}>{ad}</button>)}
        </div>
        <label className="tc-pyt-sirala"><span>Sırala</span>
          <select value={sira} onChange={(e) => setSira(e.target.value as SiparisSirasi)}>{SIRALAR.map(([v, ad]) => <option key={v} value={v}>{ad}</option>)}</select>
        </label>
        <small className="tc-pym-kucuk-yazi">
          {l.length} sipariş. Öncelik değişince motor yeniden dizer; etkisi şeritte ve resimde görünür.
          {suz === 'degisen' && (canli.tur === 'okunuyor' ? ' Canlı plan okunuyor.' : canli.tur === 'hata' ? ` ${canli.ileti}` : canli.tur === 'tamam' && !Object.keys(canli.canli).length ? ' Henüz canlı plan yok.' : '')}
        </small>
      </div>
      <div className="tc-pyt-tablo">
        <table aria-label="Siparişler">
          <thead><tr><th>Sipariş</th><th>Ürün</th><th>Öncelik</th><th>Termin</th><th>Bitiş</th><th>Durum</th><th>Fark</th><th>Bitişi belirleyen</th><th><span className="tc-gizli-etiket">Hamle</span></th></tr></thead>
          <tbody>
            {l.length ? l.map((x) => (
              <tr key={x.id} data-secili={sj === x.id ? '' : undefined} data-gec={x.gec ? '' : undefined}>
                <td><button type="button" className="tc-pyt-sip" onClick={() => b.sipSec(x.id)}><Nokta D={D} j={x.id} /><b className="tc-pym-mono">{x.id}</b></button></td>
                <td><small>{x.urun}</small></td>
                <td>
                  <select value={x.oncelik} aria-label={`${x.id} önceliği`} disabled title={`Öncelik: ${pasif}`} onChange={() => undefined}>
                    {[1, 2, 3].map((v) => <option key={v} value={v}>{ONCELIK_AD[v]}</option>)}
                  </select>
                </td>
                <td className="tc-pym-mono">{x.due != null ? saatYaz(D, x.due) : '—'}</td>
                <td className="tc-pym-mono">{x.C != null && Number.isFinite(x.C) ? saatYaz(D, x.C) : '—'}</td>
                <td>{x.gec ? <span className="tc-pyt-gec">{gecMetin(x.T)} geç</span> : <span className="tc-pyt-tamam">yetişiyor</span>}</td>
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
      <div className="tc-pyt-arac">
        <div className="tc-pyt-seg" role="group" aria-label="Tezgâh grubu">
          {gruplar.map((x) => <button key={x} type="button" aria-pressed={x === g} onClick={() => setSecilen(x)}>{x}</button>)}
        </div>
        <small className="tc-pym-kucuk-yazi">
          {b.planYaz ? `Kartı tutup aynı sütunda sıralamak ya da başka tezgâha bırakmak: ${MOTOR_NOTU} Çalışan ve sabit iş yerinden oynamaz.` : 'Sırayı değiştirme yetkiniz yok; yalnız görürsünüz.'}
        </small>
      </div>
      <div className="tc-pyt-kolonlar">
        {tez.map((m) => {
          const l = kuyrukListesi(p, m, now); const st = s.ist[m] ? tezgahDurumu(s, b.durus, m, b.t) : null; const d = s.dol[m]?.[gun];
          return (
            <section key={m} className="tc-pyt-kol" aria-label={`${m} kuyruğu`} data-secili={b.secim.tezgah === m ? '' : undefined}>
              <header>
                <button type="button" onClick={() => b.tezSec(m)}><i className="tc-pyt-dur" data-dur={st?.dur ?? 'bos'} /><b className="tc-pym-mono">{m}</b></button>
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
                      {cal ? <span className="tc-pyt-rozet" title="Şu an işleniyor"><Simge ad="play" boyut="k" /></span>
                        : kl ? <span className="tc-pyt-rozet" title="Sabit"><Simge ad="lock" boyut="k" /></span>
                          : gec ? <span className="tc-pyt-rozet" data-ton="hata" title="Siparişi geç">!</span> : null}
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
    <g key={d.n} className="tc-pyt-dugum" data-yak={yak.dugum.has(d.n) ? '' : undefined} data-sec={d.n === `j:${sj ?? ''}` ? '' : undefined} tabIndex={0} role="button" aria-label={`${d.ad} ${alt}`}
      onClick={() => bas1(d.n)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bas1(d.n); } }}
      onPointerEnter={() => setUst(d.n)} onPointerLeave={() => setUst(null)} onFocus={() => setUst(d.n)} onBlur={() => setUst(null)}>
      <circle cx={d.x} cy={d.y} r={5} />
      <text x={sag ? d.x + 10 : d.x - 10} y={d.y + 4} textAnchor={sag ? 'start' : 'end'}>{d.ad}<tspan className="tc-pyt-alt" dx={6}>{alt}</tspan></text>
    </g>
  );
  return (
    <>
      <p className="tc-pyt-yorum"><Simge ad="chart" boyut="k" />
        <span>En çok <b>{bas?.ad}</b> bekletiyor ({saatYazi(bas?.v)}); bekleme türlerinde başta <b>{(bt?.ad ?? '').toLocaleLowerCase('tr-TR')}</b> var. Düğüme basınca harita ve panel oraya gider; tür düğümü ilgili kısıtı açar.</span>
      </p>
      <div className="tc-pyt-ag-kap">
        <svg className="tc-pyt-ag" viewBox={`0 0 ${ag.W} ${ag.H}`} role="img" aria-label="Bekleme türü, kaynak ve geç sipariş arasındaki bağlar" data-hl={ust ? '' : undefined}>
          <text className="tc-pyt-kolad" x={ag.x[0]} y={14} textAnchor="end">Bekleme türü</text>
          <text className="tc-pyt-kolad" x={ag.x[1]} y={14} textAnchor="middle">Kaynak</text>
          <text className="tc-pyt-kolad" x={ag.x[2]} y={14}>Geç sipariş</text>
          {ag.bag.map((x) => (
            <path key={`${x.a}>${x.b}`} className="tc-pyt-bag" d={x.d} data-yak={yak.bag.has(x) ? '' : undefined} data-sec={x.j && x.j === sj ? '' : undefined}
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

// Plan eski veriyle kuruluysa kart başında yeniden kurma (mzKisit, rtKart pm-mz-bayat).
function Bayat({ b, metin }: { b: KartBaglami; metin: string }) {
  if (planGuncel(b.c)) return null;
  return (
    <p className="tc-pyt-bayat"><Simge ad="alert" boyut="k" /><span>{metin}</span>
      {b.planKur ? (
        <button type="button" className="tc-dugme tc-pym-kucuk tc-dugme-birincil" disabled={b.planKur.suruyor} onClick={b.planKur.kur}><Simge ad="play" boyut="k" /><span>Planı yeniden kur</span></button>
      ) : <Pasif ad="Planı yeniden kur" simge="play" not={YETKISIZ} birincil />}
    </p>
  );
}

// Kısıt ve veri (za-merkez mzKisit, zb-merkez2 mzTakvim): motorun saydığı kurallar, takvim, ayarlar ve seçili tezgâhın takvimi. Anahtar, ayar ve
// kaldırma çalışmaya yazar (plan.yaz, 223 a); etki ve bedel hesabı, arıza ve bakım denemesi motor ister; vardiya tezgâhın sahibindedir.
const GOSTERIM = 8;
function KisitGovdesi({ b }: { b: KartBaglami }) {
  const { c } = b; const D = c.D; const yaz = b.komut && b.planYaz ? b.komut : null; const pasif = b.planYaz ? MOTOR_NOTU : YETKISIZ;
  const bedel = bedelOku(c); const gevsek = KATALOG.flatMap((g) => g.l).filter((k) => k.g); const prm = KATALOG.flatMap((g) => g.l).flatMap((k) => k.p ?? []);
  const ar = [...duruslar(c)].sort((x, y) => x.from - y.from); const em = ekMesailer(c);
  const m = b.secim.tezgah; const T = m ? D.tezgahlar.find((x) => x.id === m) : null;
  const parametre = (p: Parametre, girdi: string) => {
    if (!yaz) return;
    const o = parametreOku(p, girdi); if ('hata' in o) { b.uyar(o.hata); return; }
    const once = parametreDegeri(c, p.yer, p.k); if (once === o.deger) return;
    yaz.degistir('Parametre değişti', (t) => parametreYaz(t, p.yer, p.k, o.deger), { ayrinti: `${p.etiket}: ${String(once ?? '—')} → ${String(o.deger ?? '—')}` });
  };
  const ilkiniSil = <T,>(l: T[], ayni: (x: T) => boolean): T[] | false => { const i = l.findIndex(ayni); return i < 0 ? false : [...l.slice(0, i), ...l.slice(i + 1)]; };
  const durusSil = (d: Durus) => yaz?.degistir('Arıza/bakım silindi', (t) => {
    const l = ilkiniSil(t.down, (x) => x.m === d.m && x.from === d.from && x.to === d.to); if (!l) return false; t.down = l;
  }, { ayrinti: `${d.m} ${saatYaz(D, d.from)}` });
  const mesaiSil = (e: EkMesai) => yaz?.degistir('Ek mesai silindi', (t) => {
    const l = ilkiniSil(t.ekMesai, (x) => x.m === e.m && x.gun === e.gun && x.vardiya === e.vardiya); if (!l) return false; t.ekMesai = l;
  });
  const sil = (ad: string, yap: () => void) => (yaz
    ? <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label={ad} title={ad} onClick={yap}><Simge ad="trash" boyut="k" /></button>
    : <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label={ad} aria-disabled="true" title={`${ad}: ${YETKISIZ}`}><Simge ad="trash" boyut="k" /></button>);
  const vr = T ? (Array.isArray(T.vardiyalar) ? T.vardiyalar.map(String) : (D.vardiyalar ?? []).map((v) => String(v.id))) : [];
  return (
    <>
      <Bayat b={b} metin="Veri değişti; haritadaki plan eski veriyle kurulu." />
      <div className="tc-pyt-izgara">
        <Bolum baslik="Motorun saydığı kurallar" simge="gear">
          <p className="tc-pym-kucuk-yazi">Anahtar kuralı açar ya da kapatır (plan yeniden kurulur). &quot;Etkisi&quot; kuralı kaldırmadan, kalksaydı ne olurdu diye kısa bir arama yapar; yaklaşıktır.</p>
          <ul className="tc-pyt-kisitlar">
            {gevsek.map((k) => {
              const kapali = c.kapali.includes(k.id); const x = bedel?.liste.find((z) => z.id === k.id);
              return (
                <li key={k.id} data-kapali={kapali ? '' : undefined}>
                  <label className="tc-pyt-anahtar" title={kapali ? 'Motor bu kuralı saymıyor' : 'Motor bu kuralı uyguluyor'}>
                    <input type="checkbox" role="switch" aria-label={k.ad} checked={!kapali} disabled={!yaz}
                      onChange={(e) => { const ac = e.target.checked; yaz?.degistir(ac ? 'Kısıt açıldı' : 'Kısıt kapatıldı', (t) => { kisitDegistir(t, k.id, ac); }, { ayrinti: k.ad }); }} />
                    <i aria-hidden="true" /><span className="tc-gizli-etiket">{kapali ? 'Kapalı' : 'Açık'}</span>
                  </label>
                  <span><b>{k.ad}</b>{x && <small className="tc-pym-mono">bedeli {saatYazi(x.dW)}</small>}</span>
                  {!kapali && <Pasif ad="Etkisi" simge="target" not={pasif} />}
                </li>
              );
            })}
          </ul>
          <div className="tc-pym-dugmeler">
            <Pasif ad={bedel ? 'Bedelleri yeniden hesapla' : 'Hepsinin bedelini hesapla'} simge="chart" not={pasif} />
            <BagDugmesi ad="Bütün kısıtlar" b={b} bolum="kisitlar" />
          </div>
        </Bolum>
        <Bolum baslik="Takvim: arıza ve ek mesai" simge="wrench">
          <ul className="tc-pyt-liste tc-pyt-sade">
            {ar.length ? ar.slice(0, GOSTERIM).map((d) => (
              <li key={`${d.m}-${d.from}-${d.to}`}><button type="button" className="tc-pym-link tc-pym-mono" onClick={() => b.tezSec(d.m)}>{d.m}</button><small className="tc-pym-mono">{saatYaz(D, d.from)} → {saatYaz(D, d.to).slice(6)}</small></li>
            )) : <li className="tc-pym-kucuk-yazi">Bilinen arıza yok.</li>}
          </ul>
          <ul className="tc-pyt-liste tc-pyt-sade">
            {em.length ? em.slice(0, GOSTERIM).map((x) => (
              <li key={`${x.m}-${x.gun}-${x.vardiya}`}><button type="button" className="tc-pym-link tc-pym-mono" onClick={() => b.tezSec(x.m)}>{x.m}</button><small className="tc-pym-mono">{saatYaz(D, x.gun * 24).slice(0, 9)} {x.vardiya}</small></li>
            )) : <li className="tc-pym-kucuk-yazi">Ek mesai yok.</li>}
          </ul>
          <div className="tc-pym-dugmeler">
            {m && !m.startsWith('@') ? <Pasif ad={`${m} için 4 sa arıza dene`} simge="wrench" not={pasif} /> : <small className="tc-pym-kucuk-yazi">Arıza denemek için haritada bir tezgâh seçin.</small>}
            <BagDugmesi ad="Takvim" b={b} bolum="takvim" />
          </div>
        </Bolum>
        <Bolum baslik="Ayarlar" simge="ruler">
          <div className="tc-pyt-paramlar">{prm.map((p) => <ParametreGirdisi key={`${p.yer}-${p.k}`} p={p} c={c} yaz={yaz ? parametre : null} />)}</div>
          <p className="tc-pym-kucuk-yazi">Ayar değişince plan eskir; &quot;Planı yeniden kur&quot; ile yeni ayarla kurulur.</p>
        </Bolum>
        <Bolum baslik={T ? `${T.id} takvimi` : 'Tezgâh takvimi'} simge="clock">
          {!T ? <p className="tc-pym-kucuk-yazi">Haritada ya da kuyrukta bir tezgâh seçin; vardiyaları ve kapalı pencereleri burada görünür.</p> : (
            <>
              <div className="tc-pyt-cipler" role="group" aria-label={`${T.id} vardiyaları`}>
                {(D.vardiyalar ?? []).map((v) => (
                  <label key={String(v.id)} className="tc-pyt-cip" title={`Vardiya: ${VERI_NOTU}`}>
                    <input type="checkbox" checked={vr.includes(String(v.id))} disabled onChange={() => undefined} />
                    <span>{String(v.id)} <small className="tc-pym-mono">{String(v.bas ?? '')}–{String(v.bit ?? '')}</small></span>
                  </label>
                ))}
              </div>
              <div className="tc-pym-dugmeler"><Pasif ad="Bakımı dene" simge="wrench" not={pasif} /></div>
              <ul className="tc-pyt-liste tc-pyt-sade">
                {ar.filter((d) => d.m === T.id).map((d) => (
                  <li key={`${d.from}-${d.to}`}><span className="tc-pym-mono">{saatYaz(D, d.from)} → {saatYaz(D, d.to).slice(6)}</span><small>kapalı</small>{sil('Kapalı pencereyi kaldır', () => durusSil(d))}</li>
                ))}
                {em.filter((x) => x.m === T.id).map((x) => (
                  <li key={`${x.gun}-${x.vardiya}`}><span className="tc-pym-mono">{saatYaz(D, x.gun * 24).slice(0, 9)} {x.vardiya}</span><small>ek mesai</small>{sil('Ek mesaiyi kaldır', () => mesaiSil(x))}</li>
                ))}
                {!ar.some((d) => d.m === T.id) && !em.some((x) => x.m === T.id) && <li className="tc-pym-kucuk-yazi">Kapalı pencere ya da ek mesai yok.</li>}
              </ul>
              <p className="tc-pym-kucuk-yazi">Bakım denemesi önizlemedir. Vardiya tezgâhın kaydında değişir; kaldırma plan verisini değiştirir, plan yeniden kurulunca etkisi görünür.</p>
            </>
          )}
        </Bolum>
      </div>
    </>
  );
}
// Veri ve kısıtlar'ın bölümüne gider; sayfa yoksa pasif.
function BagDugmesi({ ad, b, bolum }: { ad: string; b: KartBaglami; bolum: string }) {
  return b.veriAc
    ? <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={() => b.veriAc?.(bolum)}><Simge ad="edit" boyut="k" /><span>{ad}</span></button>
    : <Pasif ad={ad} simge="edit" not={HAZIRLANIYOR} />;
}

// Hesaplar (zb-merkez2 mzHesap): göstergeler son canlı plana göre, grup doluluğu.
const OLCU_AD: Record<OlcuAnahtari, [string, string]> = {
  wT: ['Ağırlıklı gecikme', 'Geç kalan saatlerin öncelik ağırlığıyla toplamı'], late: ['Geciken sipariş', ''], suH: ['Toplam ayar süresi', 'Bütün ayarların toplamı'],
  suN: ['Ayar sayısı', ''], Cmax: ['Son iş biter', 'Plandaki en son işin bitişi'], fas: ['Fason süresi', 'Fasonda geçen toplam süre'],
  dol: ['Ortalama doluluk', 'Tezgâhların açık saatlerinde dolu oldukları pay'],
};
const yuzdeYaz = (v: number) => `%${sayiYaz(v * 100, 0)}`;
function olcuYaz(b: KartBaglami, k: OlcuAnahtari, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (k === 'late' || k === 'suN') return String(v);
  if (k === 'Cmax') return saatYaz(b.c.D, v);
  if (k === 'dol') return yuzdeYaz(v);
  return saatYazi(v);
}
function Fark({ k, a, s }: { k: OlcuAnahtari; a: number | null; s: number | null }) {
  if (a == null || s == null || !Number.isFinite(a) || !Number.isFinite(s)) return null;
  const d = s - a; const esik = k === 'late' || k === 'suN' ? 0.5 : k === 'dol' ? 0.0005 : 0.05; if (Math.abs(d) < esik) return <small>aynı</small>;
  const iyi = k === 'dol' ? d > 0 : d < 0; const isaret = d < 0 ? '−' : '+';
  const deger = k === 'late' || k === 'suN' ? String(Math.abs(d)) : k === 'dol' ? `${sayiYaz(Math.abs(d) * 100, 0)} puan` : saatYazi(Math.abs(d));
  return <span data-ton={iyi ? 'iyi' : 'kotu'}>{isaret}{deger}</span>;
}
function HesapGovdesi({ b }: { b: KartBaglami }) {
  const { c, p, cx } = b;
  const canli = useCanliPlan(true, c, p, b.canliSurum);
  const s = useMemo(() => simdikiOlcu(c, p, cx), [c, p, cx]);
  const a: PlanOlcusu | null = useMemo(() => (canli.tur === 'tamam' && Object.keys(canli.canli).length ? canliOlcu(c, p, cx, canli.canli) : null), [c, p, cx, canli]);
  const gl = useMemo(() => grupDoluluk(c, p), [c, p]);
  return (
    <div className="tc-pyt-izgara">
      <Bolum baslik={`Göstergeler${a ? ' · son canlı plan ile' : ''}`} simge="chart">
        <div className="tc-pyt-tablo">
          <table aria-label="Göstergeler">
            <thead><tr><th>Gösterge</th><th>Son canlı</th><th>Şu anki</th><th>Fark</th></tr></thead>
            <tbody>
              {OLCU_SIRASI.map((k) => (
                <tr key={k}><td title={OLCU_AD[k][1] || undefined}>{OLCU_AD[k][0]}</td><td className="tc-pym-mono">{olcuYaz(b, k, a?.[k] ?? null)}</td>
                  <td className="tc-pym-mono"><b>{olcuYaz(b, k, s[k])}</b></td><td className="tc-pym-mono"><Fark k={k} a={a?.[k] ?? null} s={s[k]} /></td></tr>
              ))}
              <tr><td>Darboğaz</td><td className="tc-pym-mono">—</td><td className="tc-pym-mono"><b>{s.dar ? `${s.dar.m} ${yuzdeYaz(s.dar.u)}` : '—'}</b></td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="tc-pym-kucuk-yazi">
          {a ? 'Fark sütunu son canlı plana göredir; yeşil iyi, kırmızı kötü. Canlı planda ayar ve doluluk tutulmaz.'
            : canli.tur === 'okunuyor' ? 'Canlı plan okunuyor.' : canli.tur === 'hata' ? canli.ileti : 'Henüz karşılaştırılacak canlı plan yok; plan canlıya alınınca fark sütunu dolar.'}
        </p>
      </Bolum>
      <Bolum baslik="Grup doluluğu" simge="gauge">
        <ul className="tc-pyt-dolu">
          {gl.map((g) => (
            <li key={g.ad}><span>{grupAdi(g.ad)}</span>
              <span className="tc-pyt-bar" role="img" aria-label={`${grupAdi(g.ad)} doluluk ${yuzdeYaz(g.u)}`}><i data-ton={g.u > 0.9 ? 'hata' : undefined} ref={degisken({ '--w': `${Math.min(100, g.u * 100).toFixed(1)}%` })} /></span>
              <small className="tc-pym-mono">{yuzdeYaz(g.u)}</small>
            </li>
          ))}
        </ul>
        <p className="tc-pym-kucuk-yazi">Doluluk: tezgâhın şimdiden son işin bitişine kadarki açık saatlerinde dolu olduğu pay.</p>
      </Bolum>
    </div>
  );
}

// Reçete ve Rota (ze-rota rtKart): yukarıdan aşağı hammadde, adımlar, bitmiş ürün. Ürün ve rota Reçete ve Rota'nındır (222 a): alanlar okunur,
// düzenleme yerinde ve pasif. Kart açıkken ürünün rotası haritada yanar; üstüne gelinen adım ya da makine öne çıkar.
function RotaGovdesi({ b }: { b: KartBaglami }) {
  const { c, p } = b; const D = c.D;
  const sj = b.secim.adim ? p.ops[b.secim.adim]?.job ?? null : b.secim.siparis;
  const u = rotaUrunu(c, sj, b.rotaUrun);
  if (!u) return <p className="tc-pym-kucuk-yazi">Ürün yok.</p>;
  const kul = D.siparisler.filter((x) => x.urun === u.id && !x.havuz).length; const rec = rotaRecetesi(c, u); const rota = u.rota ?? [];
  const malz = (kod: string) => (D.malzemeler ?? []).find((x) => x.kod === kod);
  const fason = (id: string) => (D.fasoncular ?? []).find((f) => f.id === id)?.ad ?? id;
  const ust = (k: string | null, m: string | null) => () => b.rotaUst({ k, m });
  const not = `Düzenlemek: ${VERI_NOTU}`;
  return (
    <>
      <div className="tc-pyt-arac">
        <label className="tc-pyt-sirala"><span>Ürün</span>
          <select value={u.id} onChange={(e) => b.rotaUrunSec(e.target.value)}>{D.urunler.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.ad ?? ''}</option>)}</select>
        </label>
        <small className="tc-pym-kucuk-yazi">{kul} sipariş kullanıyor</small>
        <BagDugmesi ad="Rotalar" b={b} bolum="rotalar" />
      </div>
      <Bayat b={b} metin="Rota ya da reçete değişti; haritadaki plan eski." />
      <ol className="tc-pyt-rota" aria-label={`${u.ad ?? u.id} reçete ve rotası`} onPointerLeave={ust(null, null)}>
        <li className="tc-pyt-dugum" data-tur="ham">
          <header><Simge ad="box" boyut="k" /><b>Reçete</b><small>hammadde ve parçalar</small></header>
          <ul className="tc-pyt-liste tc-pyt-sade">
            {rec.length ? rec.map((m) => (
              <li key={m.kod}><span>{malz(m.kod)?.ad ?? m.kod}</span><small className="tc-pym-mono">{sayiYaz(m.miktar, 2)} {malz(m.kod)?.birim ?? ''}/adet</small></li>
            )) : <li className="tc-pym-kucuk-yazi">Reçetede malzeme yok.</li>}
          </ul>
        </li>
        {rota.map((o, i) => {
          const t = gecisTuru(u, i); const sec = new Set((o.tezgahlar ?? []).map((x) => x.id));
          const gr = [...new Set((o.tezgahlar ?? []).map((x) => D.tezgahlar.find((m) => m.id === x.id)?.grup).filter((g): g is string => !!g))];
          const aday = o.fason ? [] : D.tezgahlar.filter((m) => (m.grup && gr.includes(m.grup)) || sec.has(m.id));
          const bag = (o.bag ?? []).map((x) => String(x[0]));
          const ekler = [o.aile && `Aile ${o.aile}`, typeof o.aparat === 'string' && o.aparat && `Aparat ${o.aparat}`, o.minParti && `En küçük parti ${o.minParti}`,
            typeof o.kasa === 'number' && `Kasa ${o.kasa}`, i > 0 && o.ortusebilir && 'Örtüşebilir', o.fai === true && 'İlk parça onayı', o.program === false && 'NC programı hazır değil',
            !o.fason && o.fasonIzin === true && 'Fasona verilebilir'].filter((x): x is string => typeof x === 'string');
          return (
            <li key={o.k} className="tc-pyt-adim-kap">
              <span className="tc-pyt-ok" data-tip={t}><Simge ad={t === 'x' ? 'layers' : 'down'} boyut="k" />{i > 0 && <span>{GECIS_AD[t]}{bag.length && t !== 'x' ? ` · öncül: ${bag.join(', ')}` : ''}</span>}</span>
              <div className="tc-pyt-dugum" data-tur="adim" data-fason={o.fason ? '' : undefined} onPointerEnter={ust(o.k, null)}>
                <header><b className="tc-pym-mono">{o.k}</b><span>{o.ad ?? ''}</span></header>
                <div className="tc-pyt-sat"><small>İstasyon</small><span>{o.fason ? `Fason · ${fason(o.fason)}` : gr.map(grupAdi).join(', ') || '—'}</span></div>
                {o.fason ? <p className="tc-pym-kucuk-yazi"><Simge ad="truck" boyut="k" /> Dış tedarikçide; kapasite ve çıkış günleri Fason bölümünde.</p> : (
                  <ul className="tc-pyt-tezler" aria-label="Makineler">
                    {aday.map((m) => {
                      const x = (o.tezgahlar ?? []).find((z) => z.id === m.id);
                      return (
                        <li key={m.id} data-on={x ? '' : undefined} onPointerEnter={ust(o.k, m.id)}>
                          <button type="button" className="tc-pym-mono" aria-pressed={!!x} aria-disabled="true" title={not}>{m.id}</button>
                          {x && <small className="tc-pym-mono">{x.cevrim != null ? `${sayiYaz(x.cevrim, 1)} dk` : '—'} · ayar {x.ayar != null ? sayiYaz(x.ayar, 0) : '—'}</small>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!o.fason && !(o.tezgahlar ?? []).length && <p className="tc-pyt-uyari"><Simge ad="alert" boyut="k" /> Makine seçilmedi; bu adım planlanamaz.</p>}
                {ekler.length > 0 && <div className="tc-pyt-cipler">{ekler.map((x) => <span key={x} className="tc-pyt-cip">{x}</span>)}</div>}
              </div>
            </li>
          );
        })}
        <li className="tc-pyt-adim-kap"><span className="tc-pyt-ok"><Simge ad="down" boyut="k" /></span><div className="tc-pyt-dugum" data-tur="bitmis"><header><Simge ad="check" boyut="k" /><b>{u.ad ?? u.id}</b><small>bitmiş ürün</small></header></div></li>
      </ol>
      <div className="tc-pym-dugmeler"><Pasif ad="Adım ekle" simge="plus" not={VERI_NOTU} /></div>
      <p className="tc-pym-kucuk-yazi">Dolu makine adımın alternatifidir; motor en uygununu seçer. Kart açıkken bu ürünün rotası haritada yanar.</p>
    </>
  );
}

// Senaryolar kartı (za-merkez mzSenaryo, 641 a): canlıya gitmemiş taslaklar ve canlıya göre gecikme farkı. Kart okur; yan yana karşılaştırma
// Geçmiş > Senaryolar'da, kaydetme ve canlıya alma Planlama atölyesindedir.
export const SENARYO_KARTI_SINIRI = 8;
function SenaryoGovdesi({ b }: { b: KartBaglami }) {
  const v = b.senaryolar;
  if (!v) return <p className="tc-pym-kucuk-yazi">Senaryolar okunamadı.</p>;
  const l = senaryoSirasi(v.senaryolar).filter((s) => s.durum === 'acik' || s.durum === 'onayda');
  const [gec, ad] = [GOSTERGE_SATIRLARI[0], GOSTERGE_SATIRLARI[1]];
  return (
    <div className="tc-pyt-izgara">
      <p className="tc-pyt-yorum"><Simge ad="flag" boyut="k" />
        <span>{`Canlı plan sürüm ${String(v.canliSurum)}. Canlıya giden her değişiklik önce bir taslağa düşer; taslak kaydedilir, onaylanınca canlıya geçer.`}</span>
      </p>
      <Bolum baslik={`Açık taslaklar (${String(l.length)})`} simge="layers">
        <ul className="tc-pyt-liste tc-pyt-senaryo">
          {l.length ? l.slice(0, SENARYO_KARTI_SINIRI).map((s) => {
            const f = gec && s.gostergeler ? gostergeFarki(gec.al(v.canli), gec.al(s.gostergeler), true) : null;
            const g = ad && s.gostergeler ? ad.al(s.gostergeler) : null;
            return (
              <li key={s.id}>
                <Rozet ton={SENARYO_DURUM_ADI[s.durum][1]}>{SENARYO_DURUM_ADI[s.durum][0]}</Rozet>
                <span><b>{s.ad}</b><small>{`${s.acan ?? '—'} · ${senaryoZamani(s.acilma)} · ${String(s.degisiklikler.length)} değişiklik`}</small></span>
                <span className="tc-pym-mono">
                  {g === null ? '—' : `${String(g)} geç`}
                  {f && <small data-ton={f.iyi ? 'iyi' : 'kotu'}>{` ${f.d > 0 ? '+' : '−'}${saatYazi(Math.abs(f.d))}`}</small>}
                </span>
              </li>
            );
          }) : <li className="tc-pym-kucuk-yazi">Açık taslak yok. Planlamada yapılan değişiklik bir taslağa düşer.</li>}
        </ul>
      </Bolum>
      <div className="tc-pyt-arac">
        <button type="button" className="tc-dugme tc-pym-kucuk tc-dugme-birincil" aria-disabled={b.senaryolarAc ? undefined : 'true'} onClick={() => b.senaryolarAc?.()}>
          <Simge ad="eye" boyut="k" /><span>Yan yana karşılaştır</span>
        </button>
        <button type="button" className="tc-dugme tc-pym-kucuk" onClick={b.atolyeAc}><Simge ad="layers" boyut="k" /><span>Planlama atölyesi</span></button>
      </div>
    </div>
  );
}
