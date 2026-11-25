import { useCallback, useEffect, useState } from 'react';
import { KAYIT_GITMEDI, KAYIT_REDDI_OLAYI } from '../../../../../../arkon/web/src/data/gonderim-hatasi.ts';
import { aqlPlani } from '../../../../../../arkon/web/src/data/muayene-lotu.ts';
import { numuneReddiEksigi, numuneTeslimi, yoldaMi } from '../../../../../../arkon/web/src/data/numune.ts';
import { Link } from 'react-router-dom';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { useKaliteKuyrugu, useTerminalFormlari } from '../../../kalite-merkezi/disari.ts';
import { sayi, iki } from '../cekirdek/bicim.ts';
import { useArkon } from '../veri/baglam.ts';
import { NumuneOlcumu, kmNumunesi } from './NumuneOlcumu.tsx';
import { FormSec } from './kalite-terminali/FormSec.tsx';
import { KararKuyrugu } from './kalite-terminali/KararKuyrugu.tsx';
import { kuyrukToplami } from './kalite-terminali/kurallar.ts';
import './kalite-terminali/kalite-terminali.css';
import { LOT_SINIFLARI, NUMUNE_KART_TESLIMI_OLAYI, kaliteIstasyonuNumuneleri, lotKarariEksigi, lotKarariOku, lotSayisi, okutulanNumuneler } from './kurallar.ts';
import type { Is, KaliteNumunesi, LotKarari, LotSinifi, Result } from './tipler.ts';

// 564 1 b, 6 a, 600 a: kalite istasyonu terminalinin orta sütunu. Sayaç yerine iki iş: "Teslim al" ile gelen numunelerin Kabul/Red'i ve
// aktif işin lotunun Kabul/Red'i. Kararın kendisi Kalite Merkezi'nindir: numune kararı ilk parça kararı olarak, lot kararı lot kaydı olarak
// sunucuda Kalite Merkezi'ne yazılır; Arkon ayrı karar tutmaz. Red ölçü ve gerekçe ister; ölçüm kalite formundadır ("Ölç", 798).
// İlk parça numunesinin kararı Kalite Merkezi'nin uçlarıyla verilir: Kalite Merkezi'nde ya da bu terminalin karar kuyruğunda (2196-1 a).
// 2196, 2196-2 a: kuyruk "kalite-merkezi.onayla" işlemi olana, formlar "kalite-merkezi.yaz" işlemi olana görünür; yetki kart okutan kişinindir.
type Sekme = 'numune' | 'karar' | 'form';

export function KaliteGorunumu(p: {
  istasyon: string; is: Is; izinli: boolean; olcebilir: boolean; soyle: (metin: string, ton: 'ok' | 'stop') => void; okut?: (() => void) | null;
}) {
  const kuyruk = useKaliteKuyrugu();
  const formlar = useTerminalFormlari();
  const [sekme, sekmeYaz] = useState<Sekme>('numune');
  const sekmeler: { s: Sekme; ad: string; simge: 'target' | 'check' | 'clipboard-check' }[] = [
    { s: 'numune', ad: 'Numune ve lot', simge: 'target' },
    ...(kuyruk.onaylayabilir ? [{ s: 'karar' as const, ad: `Karar kuyruğu · ${String(kuyrukToplami(kuyruk))}`, simge: 'check' as const }] : []),
    ...(formlar.yazabilir ? [{ s: 'form' as const, ad: 'Formlar', simge: 'clipboard-check' as const }] : []),
  ];
  const acik = sekmeler.some((x) => x.s === sekme) ? sekme : 'numune';
  return (
    <div className="tc-kt">
      {sekmeler.length > 1 ? (
        <div className="tc-kt-sekmeler" role="tablist" aria-label="Kalite istasyonu">
          {sekmeler.map((x) => (
            <button key={x.s} type="button" role="tab" aria-selected={acik === x.s} onClick={() => sekmeYaz(x.s)}><Simge ad={x.simge} boyut="k" />{x.ad}</button>
          ))}
        </div>
      ) : null}
      {acik === 'karar' ? <KararKuyrugu kuyruk={kuyruk} soyle={p.soyle} />
        : acik === 'form' ? <FormSec bolum={`${p.istasyon} · ${p.is.no}${p.is.op ? ` ${p.is.op}` : ''}`} soyle={p.soyle} />
          : <NumuneVeLot {...p} kuyrugaGec={kuyruk.onaylayabilir ? () => sekmeYaz('karar') : null} />}
    </div>
  );
}

function NumuneVeLot({ istasyon, is: o, izinli, olcebilir, soyle, kuyrugaGec, okut = null }: {
  istasyon: string; is: Is; izinli: boolean; olcebilir: boolean; soyle: (metin: string, ton: 'ok' | 'stop') => void; kuyrugaGec: (() => void) | null;
  okut?: (() => void) | null;
}) {
  const { depo, kisi } = useArkon();
  const [numuneler, numunelerYaz] = useState<KaliteNumunesi[]>([]);
  const [sonuc, sonucYaz] = useState<Result | null>(null);
  const [olculen, olculenYaz] = useState<KaliteNumunesi | null>(null);
  const pkgId = o.pkg?.id ?? null;

  const yenile = useCallback(async () => {
    numunelerYaz(kaliteIstasyonuNumuneleri((await depo.DB.all('requests')) as KaliteNumunesi[], istasyon));
    sonucYaz(pkgId ? ((await depo.DB.get('results', pkgId)) as Result | undefined) ?? null : null);
  }, [depo, istasyon, pkgId]);
  useEffect(() => {
    void yenile();
    return depo.Bus.on((m) => {
      if (m.type === 'sample' || m.type === 'sample-result' || (m.type === '$merged' && (m.store === 'requests' || m.store === 'results'))) void yenile();
    });
  }, [depo, yenile]);
  // Sunucunun reddi (rol, eksik, AQL ile tutmayan karar) burada görünür; yerel kopya sunucudakiyle tazelenir.
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ store?: string; msg?: string }>).detail;
      if (d?.store !== 'results' && d?.store !== 'requests') return;
      soyle(`${KAYIT_GITMEDI} · ${d.msg || ''}`, 'stop');
      void yenile();
    };
    window.addEventListener(KAYIT_REDDI_OLAYI, f);
    return () => window.removeEventListener(KAYIT_REDDI_OLAYI, f);
  }, [soyle, yenile]);

  // 3718 a: yoldaki numuneyi kalite teslim alır (refakat kartı okutarak ya da düğmeyle); damgayı sunucu yazar, ret iletisi KAYIT_REDDI ile gelir.
  const teslimAlabilir = izinli || olcebilir;
  const teslimAl = useCallback(async (r: KaliteNumunesi, yol: 'okutma' | 'dugme') => {
    if (!teslimAlabilir) return;
    await depo.DB.put('requests', { ...r, teslimAl: yol });
    soyle(`Numune teslim alındı · ${r.no}`, 'ok');
    await yenile();
  }, [depo, soyle, teslimAlabilir, yenile]);
  useEffect(() => {
    const f = (e: Event) => {
      const ids = (e as CustomEvent<{ teslimIdler?: number[] }>).detail?.teslimIdler ?? [];
      for (const r of okutulanNumuneler(numuneler.filter(yoldaMi), ids)) void teslimAl(r, 'okutma');
    };
    window.addEventListener(NUMUNE_KART_TESLIMI_OLAYI, f);
    return () => window.removeEventListener(NUMUNE_KART_TESLIMI_OLAYI, f);
  }, [numuneler, teslimAl]);
  const yolda = numuneler.filter(yoldaMi);
  const gelen = numuneler.filter((r) => !yoldaMi(r));

  const numuneKarari = async (r: KaliteNumunesi, status: 'approved' | 'rejected', not: string) => {
    if (!izinli) return;
    const n: KaliteNumunesi = { ...r, status, decidedAt: Date.now(), decidedBy: kisi?.name ?? '', note: not.trim() };
    await depo.DB.put('requests', n);
    depo.Bus.send({ type: 'sample-result', reqId: r.id, id: r.pkgId, no: r.no, status, machine: r.machine });
    soyle(status === 'rejected' ? `Numune reddedildi · ${r.no}` : `Numune kabul edildi · ${r.no}`, status === 'rejected' ? 'stop' : 'ok');
    await yenile();
  };
  const lotKarariVer = async (lk: LotKarari) => {
    if (!izinli || !pkgId) return;
    const res = ((await depo.DB.get('results', pkgId)) as Result | undefined) ?? ({ id: pkgId, no: o.no, meas: {}, pins: [] } as unknown as Result);
    await depo.DB.put('results', { ...res, lotKarari: lk, at: Date.now() });
    depo.Bus.send({ type: 'result', id: pkgId, no: o.no });
    await yenile();
  };

  return (
    <div className="tc-ay1-kalite">
      {yolda.length ? (
        <section className="tc-ay1-toplu" aria-label="Yoldaki numuneler">
          <div className="tc-ay1-toplu-ust">
            <Simge ad="truck" boyut="k" /><span className="tc-ay1-ust-yazi">Yolda</span>
            <small className="tc-ay1-soluk">{sayi(yolda.length)} numune</small>
          </div>
          <div className="tc-ay1-not" role="note">
            <Simge ad="scan" boyut="k" /><span>Numunenin refakat kartını okutun: yoldaki numune teslim alınır, ölçüm açılır.</span>
            {okut ? <Dugme tur="ikincil" simge="camera" onClick={okut}>Kamerayla okut</Dugme> : null}
          </div>
          {yolda.map((r) => <YoldakiNumune key={r.id} r={r} teslimAlabilir={teslimAlabilir} teslimAl={() => { void teslimAl(r, 'dugme'); }} />)}
        </section>
      ) : null}
      <section className="tc-ay1-toplu" aria-label="Gelen numuneler">
        <div className="tc-ay1-toplu-ust">
          <Simge ad={yolda.length ? 'cube' : 'target'} boyut="k" /><span className="tc-ay1-ust-yazi">{yolda.length ? 'Teslim alındı' : 'Gelen numuneler'}</span>
          <small className="tc-ay1-soluk">{gelen.length ? `${sayi(gelen.length)} numune bekliyor` : 'Bekleyen numune yok'}</small>
        </div>
        {gelen.map((r) => <NumuneSatiri key={r.id} r={r} izinli={izinli} kuyrugaGec={kuyrugaGec} olc={() => olculenYaz(r)} karar={(s, n) => { void numuneKarari(r, s, n); }} />)}
      </section>
      {olculen ? <NumuneOlcumu r={olculen} yazabilir={olcebilir} kapat={() => { olculenYaz(null); void yenile(); }} /> : null}
      {o.pkg && !o.empty ? <LotKarti is={o} sonuc={sonuc} izinli={izinli} ver={(lk) => { void lotKarariVer(lk); }} /> : null}
    </div>
  );
}

// Ölçüm Kalite Merkezi kaydındadır; sunucu numuneye ölçülen balon sayısını yazar (`kmOlculen`). Eski numune kendi sonucunu sayar.
const olculenSayisi = (r: KaliteNumunesi): number => { const n = (r as { kmOlculen?: unknown }).kmOlculen; return typeof n === 'number' ? n : Object.keys(r.results || {}).length; };
const teslimMetni = (r: KaliteNumunesi): string => {
  const t = numuneTeslimi(r);
  if (!t) return '';
  const z = new Date(t.at);
  return ` · teslim alındı ${iki(z.getHours())}:${iki(z.getMinutes())}${t.kisi ? ` · ${t.kisi}` : ''}`;
};
const ilkParcaNumunesi = (r: KaliteNumunesi): boolean => (r as { ilkParca?: unknown }).ilkParca === true;

function IlkParcaNotu({ kuyrugaGec }: { kuyrugaGec: (() => void) | null }) {
  const kaliteMerkezi = useYetki().var('sayfa.kalite-merkezi');
  if (kuyrugaGec) {
    return (
      <small role="note"><Simge ad="check" boyut="k" /> İlk parça kararı karar kuyruğunda · <button type="button" className="tc-kt-bag" onClick={kuyrugaGec}>Kuyruğu aç</button></small>
    );
  }
  return (
    <small role="note"><Simge ad="check" boyut="k" /> İlk parça kararı Kalite Merkezi'nde{kaliteMerkezi ? <> · <Link to="/kalite-merkezi">Kalite Merkezi'ni aç</Link></> : null}</small>
  );
}

// 3718 a: yoldaki numunede ölçüm ve karar yoktur; teslim alınınca "Teslim alındı" bölümüne geçer.
function YoldakiNumune({ r, teslimAlabilir, teslimAl }: { r: KaliteNumunesi; teslimAlabilir: boolean; teslimAl: () => void }) {
  const t = new Date(r.at);
  return (
    <div className="tc-ay1-kart" data-durum="yolda">
      <span className="tc-ay1-kart-govde">
        <b>{r.no} · {r.part}</b>
        <small>{r.machine} · gönderildi {iki(t.getHours())}:{iki(t.getMinutes())} · {sayi(r.items.length)} ölçü{r.reason ? ` · ${r.reason}` : ''}</small>
      </span>
      <span className="tc-ay1-kalite-dugmeler">
        {teslimAlabilir ? <Dugme tur="ikincil" simge="cube" onClick={teslimAl}>Teslim al</Dugme> : null}
      </span>
    </div>
  );
}

function NumuneSatiri({ r, izinli, kuyrugaGec, olc, karar }: {
  r: KaliteNumunesi; izinli: boolean; kuyrugaGec: (() => void) | null; olc: () => void; karar: (s: 'approved' | 'rejected', not: string) => void;
}) {
  const [red, redYaz] = useState(false);
  const [not, notYaz] = useState('');
  const olculen = olculenSayisi(r);
  const ilk = ilkParcaNumunesi(r);
  const eksik = numuneReddiEksigi(olculen, not);
  const t = new Date(r.at);
  return (
    <div className="tc-ay1-kart" data-durum={r.status === 'measuring' ? 'ayar' : undefined}>
      <span className="tc-ay1-kart-govde">
        <b>{r.no} · {r.part}</b>
        <small>{r.machine} · {iki(t.getHours())}:{iki(t.getMinutes())} · {r.status === 'measuring' ? 'ölçülüyor' : 'bekliyor'} · {sayi(olculen)} ölçü{r.reason ? ` · ${r.reason}` : ''}{teslimMetni(r)}</small>
        {ilk ? <IlkParcaNotu kuyrugaGec={kuyrugaGec} /> : null}
        {red ? (
          <>
            <textarea className="tc-ay1-kalite-not" rows={2} value={not} placeholder="Red gerekçesi" aria-label="Red gerekçesi" onChange={(e) => notYaz(e.target.value)} />
            {eksik ? <small className="tc-ay1-hata">{eksik}</small> : null}
          </>
        ) : null}
      </span>
      <span className="tc-ay1-kalite-dugmeler">
        {kmNumunesi(r) !== null ? <Dugme tur="ikincil" simge="ruler" onClick={olc}>Ölç</Dugme> : null}
        {izinli && !red && !ilk ? <Dugme simge="check" onClick={() => karar('approved', '')}>Kabul</Dugme> : null}
        {izinli && !red && !ilk ? <Dugme tur="tehlike" simge="x" onClick={() => redYaz(true)}>Red</Dugme> : null}
        {izinli && red ? <Dugme tur="tehlike" simge="x" disabled={!!eksik} onClick={() => karar('rejected', not)}>Reddet</Dugme> : null}
        {izinli && red ? <Dugme tur="ikincil" onClick={() => { redYaz(false); notYaz(''); }}>Vazgeç</Dugme> : null}
      </span>
    </div>
  );
}

function LotKarti({ is: o, sonuc, izinli, ver }: { is: Is; sonuc: Result | null; izinli: boolean; ver: (lk: LotKarari) => void }) {
  const [metin, metinYaz] = useState<Record<LotSinifi, string>>({ Kritik: '', Majör: '', Minör: '' });
  const [not, notYaz] = useState('');
  const plan = aqlPlani(o.pkg);
  const kayitli = lotKarariOku(sonuc);
  const bulunan = Object.fromEntries(LOT_SINIFLARI.map((s) => [s, lotSayisi(metin[s])])) as Record<LotSinifi, number | null | 'hata'>;
  const eksik = (k: LotKarari['karar']) => lotKarariEksigi(k, bulunan, not);
  const gonder = (karar: LotKarari['karar']) => {
    if (eksik(karar)) return;
    ver({ karar, bulunan: bulunan as Record<LotSinifi, number | null>, not: not.trim() || null, at: Date.now() });
  };
  return (
    <section className="tc-ay1-toplu" aria-label="Lot kararı">
      <div className="tc-ay1-toplu-ust">
        <Simge ad="layers" boyut="k" /><span className="tc-ay1-ust-yazi">Lot kararı · {o.no}</span>
        <small className="tc-ay1-soluk">Lot {sayi(o.target)} parça</small>
      </div>
      {plan && 'durduruldu' in plan ? (
        <div className="tc-ay1-not" role="status"><Simge ad="alert" boyut="k" /><span>Bu parçanın lot muayenesi Kalite Merkezi'nde durduruldu; düzeltici faaliyet kapanınca plan gelir.</span></div>
      ) : plan ? (
        <small className="tc-ay1-soluk">Kalite Merkezi AQL planı: numune {sayi(Math.min(plan.n, o.target))} parça, kabul (Ac) {plan.ac}{plan.re !== null ? `, red (Re) ${plan.re}` : ''}</small>
      ) : (
        <small className="tc-ay1-soluk">Bu paketin AQL planı yok; karar yine Kalite Merkezi'nin planıyla hesaplanır.</small>
      )}
      {kayitli?.kayit ? (
        <div className="tc-ay1-kart" data-durum={kayitli.kayit.karar === 'Ret' ? 'durdu' : 'calisiyor'}>
          <Simge ad={kayitli.kayit.karar === 'Ret' ? 'x' : 'check'} />
          <span className="tc-ay1-kart-govde">
            <b>{kayitli.kayit.karar === 'Ret' ? 'Lot reddedildi' : 'Lot kabul edildi'} · {kayitli.kayit.no}</b>
            <small>{[kayitli.by, ...LOT_SINIFLARI.map((s) => (kayitli.bulunan[s] === null ? null : `${s} ${kayitli.bulunan[s]}`)), kayitli.kayit.redde ? `redde ${kayitli.kayit.redde} parça` : null, kayitli.not].filter(Boolean).join(' · ')}</small>
          </span>
        </div>
      ) : kayitli ? (
        <small className="tc-ay1-soluk">Karar gönderildi · Kalite Merkezi kaydı bekleniyor</small>
      ) : izinli && !(plan && 'durduruldu' in plan) ? (
        <>
          <div className="tc-ay1-toplu-satir">
            {LOT_SINIFLARI.map((s) => (
              <label key={s} className="tc-ay1-toplu-alan" data-tur={s === 'Kritik' ? 'hurda' : undefined}>
                <span className="tc-ay1-ust-yazi">{s} kusurlu</span>
                <input className="tc-ay1-mono" inputMode="numeric" pattern="[0-9]*" value={metin[s]} placeholder="—" aria-label={`Bulunan ${s} kusurlu`}
                  onChange={(e) => metinYaz((m) => ({ ...m, [s]: e.target.value }))} />
              </label>
            ))}
          </div>
          <textarea className="tc-ay1-kalite-not" rows={2} value={not} placeholder="Gerekçe (Red için zorunlu)" aria-label="Lot kararı gerekçesi" onChange={(e) => notYaz(e.target.value)} />
          <div className="tc-ay1-kalite-dugmeler">
            <Dugme simge="check" disabled={!!eksik('kabul')} onClick={() => gonder('kabul')}>Kabul</Dugme>
            <Dugme tur="tehlike" simge="x" disabled={!!eksik('ret')} onClick={() => gonder('ret')}>Red</Dugme>
          </div>
          {eksik('ret') && eksik('kabul') ? <small className="tc-ay1-soluk">{eksik('kabul')}</small> : null}
        </>
      ) : !izinli ? <p className="tc-ay1-soluk tc-ay1-izin">Bu rol lot kararı veremez</p> : null}
    </section>
  );
}
