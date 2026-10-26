import { useCallback, useMemo, useState } from 'react';
import { Rozet, Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { planGuncel } from '../../durum.ts';
import { BosCalisma, BosPlan } from '../../motor/BosPlan.tsx';
import { GunCizelgesi } from '../../motor/cizelge/GunCizelgesi.tsx';
import '../../motor/cizelge/cizelge.css';
import { useCanliFarki } from '../../motor/atolye/canli-farki.ts';
import { usePlanKur } from '../../motor/coz.ts';
import { eylemYapisi } from '../../motor/eylem.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, saatYaz, simdiSaati, type OkunanPlan } from '../../motor/kurallar.ts';
import { HAZIRLANIYOR, MetinYaz, MOTOR_NOTU } from '../../motor/ortak.tsx';
import '../../motor/motor.css';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import '../veri/veri.css';
import {
  BUGUN_ADIMLARI, BUGUN_YARDIM, dokum, dokumEtkisi, dokumOzeti, durumCumlesi, gelenler, gosterGunu, kabulYaz, kararlar, terminEtkili, tezAd,
  type BugunAdimi, type BugunEylemi, type BugunKarti, type DokumSatiri,
} from './kurallar.ts';
import './bugun.css';

// "Bugünün kararları" (u-bugun.betik sBugun; Başka menüsünün Sayfalar'ından açılır): solda dört adımlı günlük akış, sağda seçili günün saatlik
// planı. Öneriyi deneyen eylemler (öne al, plana al, söz tarihi, planı güncelle) motor ister (357 b), pasiftir; gecikme kabulü, duruşu kaldırmak
// ve kısıtları açmak çalışmaya komutla yazılır. Yayın Planlama stüdyosunun Onay sekmesindedir (sunucu senaryosu, 221 c).

const YETKISIZ = 'Plan yazma yetkiniz yok.';
interface Eylem { yap: (() => void) | null; not: string }

export function BugununKararlari(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  const veriAc = o.altSec ? () => o.altSec?.({ ekran: 'veri', bolum: null }) : null;
  if (!c) return <div className="tc-pym" data-parca="bugun"><BosCalisma veriAc={veriAc} /></div>;
  return <Bugun o={o} c={c} />;
}

function Bugun({ o, c }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi }) {
  const emirler = o.depo.durum?.emirler ?? null;
  const p = useMemo(() => planOku(c), [c]);
  const cx = useMemo(() => derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p))), [c, p, emirler]);
  const { bildir } = useBildirim();
  const planKur = usePlanKur(o, useCallback((ileti: string) => bildir('hata', ileti), [bildir]));
  const veriAc = useMemo(() => (o.altSec ? (bolum: string | null) => o.altSec?.({ ekran: 'veri', bolum }) : null), [o]);
  const [secAdim, setSecAdim] = useState<BugunAdimi | null>(null);
  const [g, setG] = useState(0);
  const now = simdiSaati(c); const guncel = planGuncel(c);
  const gel = useMemo(() => gelenler(c, cx, guncel, now), [c, cx, guncel, now]);
  const kar = useMemo(() => (p ? kararlar(c, p, cx) : []), [c, p, cx]);
  const taban = useMemo(() => planOku(o.depo.calisma), [o.depo.calisma]);
  const dok = useMemo(() => (p ? dokum(taban, p, cx) : []), [taban, p, cx]);
  if (!p) return <div className="tc-pym" data-parca="bugun"><BosPlan c={c} cx={cx} planKur={planKur} veriAc={veriAc && (() => veriAc(null))} /></div>;

  const komut = o.yetki.planYaz ? o.komut : null;
  const { secim, sec } = o;
  const secJob = secim.adim && p.ops[secim.adim] ? p.ops[secim.adim]?.job ?? null : secim.siparis;
  const goster = (j: string) => { sec({ siparis: j, adim: null, tezgah: null }); const n = gosterGunu(p, j, now); if (n !== null) setG(n); };
  const eylemi = (e: BugunEylemi): Eylem => {
    const tur = e.tur;
    if (tur === 'goster') return { yap: () => goster(e.v), not: '' };
    if (tur === 'motor') return { yap: null, not: MOTOR_NOTU };
    if (tur === 'kabul') return { yap: komut ? () => { komut.degistir('Gecikme kabul edildi', (t) => kabulYaz(t, e.v, true), { ayrinti: e.v, planKoru: true }); } : null, not: YETKISIZ };
    return eylemYapisi({ ...e, tur }, { c, komut, sipSec: goster, veriAc: veriAc && ((b: string) => veriAc(b)) });
  };
  const yenidenAc = (j: string): Eylem => ({ yap: komut ? () => { komut.degistir('Gecikme kararı yeniden açıldı', (t) => kabulYaz(t, j, false), { ayrinti: j, planKoru: true }); } : null, not: YETKISIZ });

  const acik = kar.filter((x) => !x.kabul).length;
  const say: Record<BugunAdimi, number> = { gelen: gel.length, karar: acik, gozden: dok.length, yayin: 0 };
  const adim = secAdim ?? (gel.length ? 'gelen' : 'karar');
  const i = BUGUN_ADIMLARI.findIndex((x) => x[0] === adim); const sonraki = BUGUN_ADIMLARI[i + 1];
  const adimAd = BUGUN_ADIMLARI[i]?.[1] ?? '';
  const kartlar = (l: BugunKarti[]) => (
    <ul className="tc-pyb-liste">{l.map((x) => <Kart key={x.id} x={x} secili={!!x.job && x.job === secJob} eylemi={eylemi} yenidenAc={yenidenAc} />)}</ul>
  );

  return (
    <div className="tc-pyi tc-pyb" data-parca="bugun" data-adim={adim}>
      <header className="tc-pyb-ust">
        <div className="tc-pyb-ust-satir">
          <p className="tc-pyb-durum" data-ton={p.ozet.late ? 'hata' : 'tamam'}><Simge ad={p.ozet.late ? 'flag' : 'check'} boyut="k" /><span>{durumCumlesi(c, p, acik)}</span></p>
          <Dugme ad="Tur" simge="help" e={{ yap: null, not: HAZIRLANIYOR }} baslik="Bu ekranı adım adım tanıt" hayalet />
        </div>
        <ol className="tc-pyb-adimlar" role="tablist" aria-label="Günlük plan adımları">
          {BUGUN_ADIMLARI.map(([id, ad, sm], n) => (
            <li key={id} role="presentation">
              <button type="button" role="tab" aria-selected={adim === id} aria-label={say[id] ? `${ad} (${say[id]})` : ad} onClick={() => setSecAdim(id)}>
                <span className="tc-pyb-no" aria-hidden="true">{n + 1}</span><Simge ad={sm} boyut="k" /><span className="tc-pyb-ad">{ad}</span>
                {say[id] > 0 && <span className="tc-pyb-say tc-pym-mono" aria-hidden="true">{say[id]}</span>}
              </button>
            </li>
          ))}
        </ol>
      </header>
      <div className="tc-pyb-govde">
        <section className="tc-pyb-sol" role="tabpanel" aria-label={adimAd}>
          <p className="tc-pyb-yardim">{BUGUN_YARDIM[adim]}</p>
          {adim === 'gelen' && (gel.length ? kartlar(gel) : <p className="tc-pyb-bos">Gelen yok: bütün siparişler planda, açık arıza ya da veri uyarısı yok.</p>)}
          {adim === 'karar' && (kar.length ? kartlar(kar) : <p className="tc-pyb-bos">Karar bekleyen yok: bütün siparişler termine yetişiyor.</p>)}
          {adim === 'gozden' && <GozdenGecir o={o} c={c} dok={dok} secJob={secJob} goster={goster} yaz={!!komut} />}
          {adim === 'yayin' && <Yayin o={o} c={c} p={p} />}
          {sonraki && (
            <div className="tc-pyb-alt">
              <button type="button" className="tc-dugme tc-dugme-ikincil tc-pyi-kucuk" onClick={() => setSecAdim(sonraki[0])}><Simge ad="next" boyut="k" />{`Sonraki: ${sonraki[1]}`}</button>
            </div>
          )}
        </section>
        <section className="tc-pym tc-pyb-plan" aria-label="Gün planı">
          <GunCizelgesi c={c} p={p} cx={cx} g={g} planYaz={false} planKilitle={false} secili={secim.adim} secJob={secJob}
            isSec={(id) => sec({ adim: secim.adim === id ? null : id, siparis: null, tezgah: null })}
            tezSec={(m) => sec({ tezgah: m, adim: null, siparis: null })} gunSec={setG} />
        </section>
      </div>
    </div>
  );
}

function Dugme({ ad, simge, e, birincil, hayalet, baslik }: { ad: string; simge?: SimgeAdi; e: Eylem; birincil?: boolean; hayalet?: boolean; baslik?: string }) {
  const tur = birincil ? 'tc-dugme-birincil' : 'tc-dugme-ikincil';
  return (
    <button
      type="button" className={`tc-dugme ${tur} tc-pyi-kucuk${hayalet ? ' tc-pyi-hayalet' : ''}`} aria-disabled={e.yap ? undefined : 'true'}
      title={e.yap ? baslik : `${ad}: ${e.not}`} onClick={() => e.yap?.()}
    >
      {simge && <Simge ad={simge} boyut="k" />}{ad}
    </button>
  );
}

function Kart({ x, secili, eylemi, yenidenAc }: { x: BugunKarti; secili: boolean; eylemi: (e: BugunEylemi) => Eylem; yenidenAc: (j: string) => Eylem }) {
  return (
    <li className="tc-pyb-kart" data-ton={x.ton} data-kapali={x.kabul ? '' : undefined} data-secili={secili ? '' : undefined}>
      <span className="tc-pyb-simge"><Simge ad={x.simge} boyut="k" /></span>
      <div className="tc-pyb-kart-govde">
        <b className="tc-pyb-baslik">{x.baslik}</b>
        {x.kabul && <Rozet ton="pasif">Gecikme kabul edildi</Rozet>}
        <p><MetinYaz m={x.metin} /></p>
        <div className="tc-pyb-dugmeler">
          {x.kabul ? <Dugme ad="Yeniden aç" e={yenidenAc(x.id)} hayalet /> : x.eylemler.map((e) => <Dugme key={e.ad} ad={e.ad} e={eylemi(e)} birincil={e.birincil} />)}
        </div>
      </div>
    </li>
  );
}

function AdimSatiri({ x, D }: { x: DokumSatiri['l'][number]; D: PlanlamaCalismasi['D'] }) {
  const yer = x.e ? (x.e.m !== x.r.m ? <b>{`${tezAd(x.e.m)} → ${tezAd(x.r.m)}`}</b> : tezAd(x.r.m)) : <b>{`yeni, ${tezAd(x.r.m)}`}</b>;
  return <li>{`${x.ad}: `}{yer}{', '}<span className="tc-pym-mono">{x.e ? `${saatYaz(D, x.e.S)} → ` : ''}{saatYaz(D, x.r.S)}</span></li>;
}

function GozdenGecir({ o, c, dok, secJob, goster, yaz }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; dok: DokumSatiri[]; secJob: string | null; goster: (j: string) => void; yaz: boolean }) {
  const adimlar = [...(o.komut?.geriAdimlari() ?? [])].reverse();
  const geriDon = (n: number): Eylem => ({ yap: yaz && o.komut ? () => { o.komut?.geriDon(n); } : null, not: YETKISIZ });
  const ozet = dokumOzeti(dok);
  const ana = dok.filter((d) => terminEtkili(d) || secJob === d.job);
  const diger = dok.filter((d) => !terminEtkili(d) && secJob !== d.job);
  return (
    <>
      {dok.length ? (
        <>
          <p className="tc-pyb-yardim"><b>{ozet.bas}</b>{` ${ozet.metin}`}</p>
          <ul className="tc-pyb-dokum">
            {ana.map((d) => {
              const f = dokumEtkisi(d);
              return (
                <li key={d.job} data-secili={secJob === d.job ? '' : undefined}>
                  <button type="button" className="tc-pyb-dokum-bas" onClick={() => goster(d.job)}><b className="tc-pym-mono">{d.job}</b><Rozet ton={f.ton}>{f.m}</Rozet></button>
                  <ul>
                    {d.l.slice(0, 4).map((x) => <AdimSatiri key={x.id} x={x} D={c.D} />)}
                    {d.l.length > 4 && <li className="tc-pyb-k">{`ve ${d.l.length - 4} adım daha`}</li>}
                  </ul>
                </li>
              );
            })}
          </ul>
          {diger.length > 0 && (
            <details className="tc-pyb-ac">
              <summary>{`Termini etkilenmeyen ${diger.length} sipariş`}</summary>
              <ul>
                {diger.map((d) => (
                  <li key={d.job}>
                    <button type="button" className="tc-pyb-dokum-bas" onClick={() => goster(d.job)}><b className="tc-pym-mono">{d.job}</b></button>
                    {` ${d.l.length} adım, ${[...new Set(d.l.map((x) => tezAd(x.r.m)))].join(', ')}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : <p className="tc-pyb-bos">Bu oturumda planda değişiklik yapılmadı.</p>}
      {adimlar.length > 0 && (
        <details className="tc-pyb-ac">
          <summary>{`Yapılan ${adimlar.length} değişiklik`}</summary>
          <ol>
            {adimlar.map((a, n) => (
              <li key={`${a.t}-${n}`} className="tc-pyb-degisiklik">
                <span>{a.ne}</span>
                <Dugme ad="Öncesine dön" simge="rotate" e={geriDon(adimlar.length - n)} baslik="Bu değişiklikten öncesine dön" hayalet />
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

function Yayin({ o, c, p }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan }) {
  const sen = o.depo.senaryolar;
  const cf = useCanliFarki(c, sen?.canliSurum ?? null);
  const onayda = sen?.senaryolar.filter((s) => s.durum === 'onayda') ?? [];
  const son = onayda[onayda.length - 1] ?? null;
  return (
    <div className="tc-pyb-yayin">
      {cf === null ? <p>Canlı planla fark okunamadı.</p>
        : !cf.var ? <p>Henüz canlıya alınmış plan yok. Canlıya alınınca atölye ekranları ve operatör kuyrukları bu planı gösterir.</p>
          : <p>{`Canlıdaki plan: sürüm ${sen?.canliSurum ?? '—'}.`}</p>}
      <ul className="tc-pyb-kiyas">
        <li><small>Canlıya göre yeri değişen iş</small><b className="tc-pym-mono">{cf?.var ? cf.say : '—'}</b></li>
        <li><small>Geciken sipariş</small><b className="tc-pym-mono">{p.ozet.late}</b><span className="tc-pyb-k">{`${p.ozet.n} siparişte`}</span></li>
        <li><small>Onay bekleyen plan</small><b className="tc-pym-mono">{sen ? onayda.length : '—'}</b></li>
      </ul>
      {son && (
        <div className="tc-pyb-kart" data-ton="uyari">
          <span className="tc-pyb-simge"><Simge ad="flag" boyut="k" /></span>
          <div className="tc-pyb-kart-govde">
            <b className="tc-pyb-baslik">Onay bekleyen plan</b>
            <p>{`${son.acan ?? '—'} gönderdi: ${son.ad}${son.gostergeler ? `, ${son.gostergeler.geciken} geciken emir` : ''}.`}</p>
          </div>
        </div>
      )}
      {cf?.var && !cf.farkli && <p className="tc-pyb-k">Taslak canlıdaki planla aynı.</p>}
      <div className="tc-pyb-dugmeler">
        <Dugme ad="Onay ve canlıya alma" simge="check" birincil e={{ yap: () => o.git('studio'), not: '' }} />
      </div>
      <p className="tc-pyb-k">Planı onaya gönderme ve canlıya alma Planlama stüdyosunun Onay sekmesindedir; canlıya almayı yetkili kişi yapar.</p>
    </div>
  );
}
