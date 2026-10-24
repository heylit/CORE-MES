import { useMemo, useState } from 'react';
import { Rozet, Sekmeler, Simge } from '../../../../ortak/arayuz/index.ts';
import { Cizelge, type CizelgeSatiri } from '../cizelge/Cizelge.tsx';
import { olcekKur } from '../cizelge/olcek.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  UFUKLAR, planOku, saatYaz, siparisler, simdiSaati, sureYaz, tezgahKodu, tezgahlar, ufukSaati,
  type OkunanPlan, type PlanIslemi, type SiparisDurumu, type Ufuk,
} from './kurallar.ts';
import { Onay } from './Onay.tsx';
import { MOTOR_KAPALI, MotorDugmesi, PlanDurumu, PlanYok, SiparisYolu } from './ortak.tsx';

// Planlama atölyesi (eski sayfa `studyo`: zz32 tek stüdyo, zz36 tezgâh panosu, zz22 ve zz40 onay). İki sekme: Plan (tezgâh panosu:
// sipariş listesi solda, tezgâh çizelgesi sağda, seçilen siparişin akışı listede açılır) ve Onay ve canlı (sunucudaki plan
// senaryoları, PLAN_ONAY_KOMUTLARI). Üstte akış: Düzenle, Sonuç, Onay ve canlı.

const SEKMELER = [{ anahtar: 'plan', baslik: 'Plan', simge: 'layers' }, { anahtar: 'onay', baslik: 'Onay ve canlı', simge: 'check' }] as const;
type Sekme = (typeof SEKMELER)[number]['anahtar'];

export function PlanlamaAtolyesi(o: PlanlamaEkranOzellikleri) {
  const [sekme, setSekme] = useState<Sekme>('plan');
  const onayda = o.depo.senaryolar?.senaryolar.filter((s) => s.durum === 'onayda').length ?? 0;
  return (
    <div className="tc-pym tc-pym-atolye">
      <ol className="tc-pym-akis" aria-label="Akış">
        <li aria-current={sekme === 'plan' ? 'step' : undefined}><i aria-hidden="true">1</i><Simge ad="edit" boyut="k" /><b>Düzenle</b><small>İşi sabitleyin, arıza ekleyin</small></li>
        <li><i aria-hidden="true">2</i><Simge ad="eye" boyut="k" /><b>Sonuç</b><small>{MOTOR_KAPALI}</small></li>
        <li aria-current={sekme === 'onay' ? 'step' : undefined}>
          <button type="button" onClick={() => { setSekme('onay'); }}>
            <i aria-hidden="true">3</i><Simge ad="check" boyut="k" /><b>Onay ve canlı</b>
            <small>{onayda ? `${onayda} plan onay bekliyor` : 'Onay bekleyen plan yok'}</small>
          </button>
        </li>
      </ol>
      <Sekmeler etiket="Atölye sekmeleri" sekmeler={SEKMELER} secili={sekme} sec={setSekme} />
      {sekme === 'plan' ? <PanoGirisi o={o} /> : <Onay o={o} />}
    </div>
  );
}

function PanoGirisi({ o }: { o: PlanlamaEkranOzellikleri }) {
  const c = o.calisma;
  const p = useMemo(() => planOku(c), [c]);
  if (c === null || p === null) return <PlanYok c={c} />;
  return <TezgahPanosu o={o} c={c} p={p} />;
}

const AYRACLAR: readonly [SiparisDurumu, string, 'alert' | 'clock' | 'check'][] = [
  ['gec', 'Geciken', 'alert'], ['risk', 'Riskli · 8 sa’ten az pay', 'clock'], ['iyi', 'Zamanında', 'check'],
];

function TezgahPanosu({ o, c, p }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan }) {
  const D = c.D;
  const [ufuk, setUfuk] = useState<Ufuk>('hafta');
  const [ara, setAra] = useState('');
  const [secJob, setSecJob] = useState<string | null>(null);
  const [secOp, setSecOp] = useState<string | null>(null);
  const [rayAcik, setRayAcik] = useState(false);
  const simdi = simdiSaati(c) ?? 0;
  const tez = useMemo(() => tezgahlar(c, p, simdi), [c, p, simdi]);
  const sip = useMemo(() => siparisler(c, p), [c, p]);
  const guncel = planGuncel(c);
  const q = ara.trim().toLocaleLowerCase('tr-TR');
  const L = q ? sip.filter((s) => `${s.id} ${s.urun}`.toLocaleLowerCase('tr-TR').includes(q)) : sip;
  const geciken = sip.filter((s) => s.durum === 'gec');
  const onayda = o.depo.senaryolar?.senaryolar.filter((s) => s.durum === 'onayda').length ?? 0;

  const secIslem = (r: PlanIslemi) => { setSecJob(r.job); setSecOp(r.id); };
  const t1 = simdi + ufukSaati(ufuk);
  const satirlar: CizelgeSatiri[] = tez.map((t) => ({
    anahtar: t.id, baslik: tezgahKodu(t.id), altBaslik: t.fason ? 'fason' : t.ad,
    cubuklar: Object.values(p.ops).filter((r) => r.m === t.id && r.C > simdi - 24 && r.S < t1).map((r) => ({
      anahtar: r.id, bas: r.S, bit: r.C, etiket: r.job,
      ipucu: `${r.id} · ${saatYaz(D, r.S)} → ${saatYaz(D, r.C)}${Object.hasOwn(c.locks, r.id) ? ' · sabit' : ''}`,
      sinif: [
        (p.J[r.job]?.T ?? 0) > 0.05 ? 'tc-pym-gec' : '', Object.hasOwn(c.locks, r.id) ? 'tc-pym-kilit' : '',
        secJob !== null ? (r.job === secJob ? 'tc-pym-sec' : 'tc-pym-soluk') : '',
      ].filter(Boolean).join(' '),
    })),
  }));

  const satir = (s: (typeof sip)[number]) => {
    const ac = secJob === s.id;
    return (
      <li key={s.id} className="tc-pym-sip" data-durum={s.durum}>
        <button type="button" aria-expanded={ac} onClick={() => { setSecJob(ac ? null : s.id); setSecOp(null); }}>
          <span className="tc-pym-sip-ad">
            <b className="mono"><Simge ad={ac ? 'down' : 'chev-right'} boyut="k" />{s.id}</b>
            {s.durum === 'gec' ? <Rozet ton="hata">{sureYaz(s.gecikme)} geç</Rozet> : s.durum === 'risk' ? <Rozet ton="uyari">{sureYaz(s.pay)} pay</Rozet> : null}
            <small>{s.urun} · {s.adet} ad{s.oncelik === 1 ? ' · acil' : ''}</small>
          </span>
          <span className="tc-pym-t mono"><small>Üretim</small>{saatYaz(D, s.ilk).slice(0, 9)}</span>
          <span className="tc-pym-t mono" data-gec={s.durum === 'gec' ? '' : undefined}><small>Bitiş</small>{saatYaz(D, s.bitis).slice(0, 9)}</span>
          <span className="tc-pym-t mono"><small>Termin</small>{saatYaz(D, s.termin).slice(0, 9)}</span>
        </button>
        {ac && (
          <div className="tc-pym-sip-ac">
            <SiparisYolu o={o} c={c} s={s} secili={secOp} secIslem={secIslem} />
            <p className="tc-pym-not">Çözüm yolları (öne al, tezgâh değiştir, böl): {MOTOR_KAPALI}</p>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="tc-pym-pano">
      <div className="tc-pym-cubuk">
        <button type="button" className="tc-pym-kapat tc-pym-dar" aria-expanded={rayAcik} aria-label="Siparişler" onClick={() => { setRayAcik((x) => !x); }}><Simge ad="list" boyut="k" /></button>
        <PlanDurumu p={p} guncel={guncel} />
        {onayda > 0 && <Rozet ton="uyari">{onayda} onayda</Rozet>}
        <span className="tc-pym-nabiz"><b className="mono" data-ton={geciken.length ? 'hata' : undefined}>{p.ozet.late}</b> geciken</span>
        <span className="tc-pym-nabiz"><b className="mono">{sureYaz(p.ozet.wT)}</b> gecikme</span>
        <span className="tc-pym-bosluk" />
        <div className="tc-pym-grup" role="group" aria-label="Ölçek">
          {UFUKLAR.map(([k, ad]) => <button key={k} type="button" aria-pressed={ufuk === k} onClick={() => { setUfuk(k); }}>{ad}</button>)}
        </div>
        <MotorDugmesi ad="Dene" simge="lab" />
        <MotorDugmesi ad="Olay" simge="plus" />
        <MotorDugmesi ad="İyileştir" simge="bolt" />
      </div>
      <div className="tc-pym-pano-govde" data-ray={rayAcik ? '' : undefined}>
        <aside className="tc-pym-ray" aria-label="Siparişler">
          <input
            className="tc-alan-kutu" value={ara} onChange={(e) => { setAra(e.target.value); }} placeholder="Sipariş ara" aria-label="Sipariş ara"
          />
          {L.length === 0 && <p className="tc-pym-not">{q ? 'Aramaya uyan sipariş yok.' : 'Planda sipariş yok.'}</p>}
          {q ? <ul className="tc-pym-sipler">{L.map(satir)}</ul> : AYRACLAR.map(([d, ad, simge]) => {
            const G = L.filter((s) => s.durum === d);
            return G.length === 0 ? null : (
              <section key={d} aria-label={ad}>
                <h3 className="tc-pym-ayrac" data-durum={d}><Simge ad={simge} boyut="k" />{ad}<span>{G.length}</span></h3>
                <ul className="tc-pym-sipler">{G.map(satir)}</ul>
              </section>
            );
          })}
        </aside>
        <section className="tc-pym-cizelge" aria-label="Tezgâh panosu">
          <Cizelge
            etiket="Tezgâh panosu" olcek={olcekKur(simdi - 6, t1, ufuk === 'gun' ? 40 : ufuk === 'hafta' ? 10 : 2)} satirlar={satirlar}
            simdi={simdi} secili={secOp} sec={(id) => { const r = p.ops[id]; if (r) secIslem(r); }}
            gunEtiketi={(t) => saatYaz(D, t).slice(0, 9)}
          />
          <p className="tc-pym-not">Çubuğa dokunun, siparişi seçilsin. İşi sürükleyip başka saate ya da tezgâha almak: {MOTOR_KAPALI}</p>
        </section>
      </div>
    </div>
  );
}
