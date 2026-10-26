import { useCallback, useEffect, useState } from 'react';
import { KAYIT_GITMEDI, KAYIT_REDDI_OLAYI } from '../../../../../../arkon/web/src/data/gonderim-hatasi.ts';
import { aqlPlani } from '../../../../../../arkon/web/src/data/muayene-lotu.ts';
import { numuneReddiEksigi } from '../../../../../../arkon/web/src/data/numune.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, iki } from '../cekirdek/bicim.ts';
import { useArkon } from '../veri/baglam.ts';
import { LOT_SINIFLARI, kaliteIstasyonuNumuneleri, lotKarariEksigi, lotKarariOku, lotSayisi } from './kurallar.ts';
import type { Is, KaliteNumunesi, LotKarari, LotSinifi, Result } from './tipler.ts';

// 564 1 b, 6 a, 600 a: kalite istasyonu terminalinin orta sütunu. Sayaç yerine iki iş: "Teslim al" ile gelen numunelerin Kabul/Red'i ve
// aktif işin lotunun Kabul/Red'i. Kararın kendisi Kalite Merkezi'nindir: numune kararı ilk parça kararı olarak, lot kararı lot kaydı olarak
// sunucuda Kalite Merkezi'ne yazılır; Arkon ayrı karar tutmaz. Red ölçü ve gerekçe ister; ölçüm Kalite sayfasındadır ("Ölç").
export function KaliteGorunumu({ istasyon, is: o, izinli, olc, soyle }: {
  istasyon: string; is: Is; izinli: boolean; olc: () => void; soyle: (metin: string, ton: 'ok' | 'stop') => void;
}) {
  const { depo, kisi } = useArkon();
  const [numuneler, numunelerYaz] = useState<KaliteNumunesi[]>([]);
  const [sonuc, sonucYaz] = useState<Result | null>(null);
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
      <section className="tc-ay1-toplu" aria-label="Gelen numuneler">
        <div className="tc-ay1-toplu-ust">
          <Simge ad="target" boyut="k" /><span className="tc-ay1-ust-yazi">Gelen numuneler</span>
          <small className="tc-ay1-soluk">{numuneler.length ? `${sayi(numuneler.length)} numune bekliyor` : 'Bekleyen numune yok'}</small>
        </div>
        {numuneler.map((r) => <NumuneSatiri key={r.id} r={r} izinli={izinli} olc={olc} karar={(s, n) => { void numuneKarari(r, s, n); }} />)}
      </section>
      {o.pkg && !o.empty ? <LotKarti is={o} sonuc={sonuc} izinli={izinli} ver={(lk) => { void lotKarariVer(lk); }} /> : null}
    </div>
  );
}

function NumuneSatiri({ r, izinli, olc, karar }: {
  r: KaliteNumunesi; izinli: boolean; olc: () => void; karar: (s: 'approved' | 'rejected', not: string) => void;
}) {
  const [red, redYaz] = useState(false);
  const [not, notYaz] = useState('');
  const olculen = Object.keys(r.results || {}).length;
  const eksik = numuneReddiEksigi(olculen, not);
  const t = new Date(r.at);
  return (
    <div className="tc-ay1-kart" data-durum={r.status === 'measuring' ? 'ayar' : undefined}>
      <span className="tc-ay1-kart-govde">
        <b>{r.no} · {r.part}</b>
        <small>{r.machine} · {iki(t.getHours())}:{iki(t.getMinutes())} · {r.status === 'measuring' ? 'ölçülüyor' : 'bekliyor'} · {sayi(olculen)} ölçü{r.reason ? ` · ${r.reason}` : ''}</small>
        {red ? (
          <>
            <textarea className="tc-ay1-kalite-not" rows={2} value={not} placeholder="Red gerekçesi" aria-label="Red gerekçesi" onChange={(e) => notYaz(e.target.value)} />
            {eksik ? <small className="tc-ay1-hata">{eksik}</small> : null}
          </>
        ) : null}
      </span>
      <span className="tc-ay1-kalite-dugmeler">
        <Dugme tur="ikincil" simge="ruler" onClick={olc}>Ölç</Dugme>
        {izinli && !red ? <Dugme simge="check" onClick={() => karar('approved', '')}>Kabul</Dugme> : null}
        {izinli && !red ? <Dugme tur="tehlike" simge="x" onClick={() => redYaz(true)}>Red</Dugme> : null}
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
