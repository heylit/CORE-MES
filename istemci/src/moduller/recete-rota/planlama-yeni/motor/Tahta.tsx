import { useCallback, useMemo, useState } from 'react';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, simdiSaati, sorunlar, type Donem } from './kurallar.ts';
import { HAZIRLANIYOR, MOTOR_NOTU } from './ortak.tsx';
import { Ozet, type OzetDurumu } from './ozet/Ozet.tsx';
import { ozetVerisi, type BolgeKimligi } from './ozet/veri.ts';
import { Cubuk } from './ust/Cubuk.tsx';
import { Gorunum, type TahtaGorunumu } from './ust/Gorunum.tsx';
import { nabizDurumu, sabitReferans } from './ust/nabiz.ts';
import { Yapilacaklar } from './Yapilacaklar.tsx';
import './motor.css';

// Planlama motoru (eski sayfanın "tahta"sı): plan çubuğu, görünüm ve dönem çubuğu, seçili görünüm, Yapılacaklar. Plan sunucuda çözülür
// (357 b); ekran kayıttaki planı okur, çalışmaya yalnız `komut.degistir`le yazar.
const GORUNUM_AD: Record<Exclude<TahtaGorunumu, 'genel'>, string> = { atolye: 'Harita', cizelge: 'Çizelge', kesif: 'Keşfet' };

export function PlanlamaMotoru(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  if (!c) return <div className="tc-pym"><div className="tc-pym-bos"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok." /></div></div>;
  return <Tahta {...o} c={c} />;
}

function Tahta(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi }) {
  const { c, komut, yetki } = o;
  const [gorunum, setGorunum] = useState<TahtaGorunumu>('genel');
  const [donem, setDonem] = useState<Donem>('hafta');
  const [kayma, setKayma] = useState(0);
  const [nbAcik, setNbAcik] = useState(false);
  const [menuAcik, setMenuAcik] = useState(false);
  const [ypAcik, setYpAcik] = useState(false);
  const [nasil, setNasil] = useState<BolgeKimligi | null>(null);
  const [acikGrup, setAcikGrup] = useState<string | null>(null);
  const [secJob, setSecJob] = useState<string | null>(null);
  const [secTez, setSecTez] = useState<string | null>(null);
  const [zamanSecimi, setZaman] = useState<number | null>(null);

  const emirler = o.depo.durum?.emirler ?? null;
  const p = useMemo(() => planOku(c), [c]);
  // Biten iş sunucunun iş emri durumundan; okunamazsa kayıtlı plandan.
  const cx = useMemo(() => derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p))), [c, p, emirler]);
  const tezGrup = useMemo(() => { const m = new Map(c.D.tezgahlar.map((t) => [t.id, t.grup ?? 'diger'])); return (id: string) => (id.startsWith('@') ? 'fason' : m.get(id) ?? 'diger'); }, [c]);
  const guncel = planGuncel(c);
  const v = useMemo(() => (p ? ozetVerisi(c, p, cx, donem, kayma) : null), [c, p, cx, donem, kayma]);
  const nabiz = useMemo(() => (p ? nabizDurumu(c, p, cx, donem, kayma) : null), [c, p, cx, donem, kayma]);
  const sor = useMemo(() => (p ? sorunlar(c, p, cx, guncel) : []), [c, p, cx, guncel]);
  const now = simdiSaati(c);
  const zaman = Math.max(now, zamanSecimi ?? now);

  const studyo = useCallback(() => o.git('studio'), [o]);
  const nabizAc = useCallback((v: boolean) => setNbAcik(v), []);
  const menuAc = useCallback((v: boolean) => setMenuAcik(v), []);
  const ypAc = useCallback((v: boolean) => setYpAcik(v), []);
  // Seçim tahtanındır: sipariş ya da tezgâh; aynısına yeniden dokunmak bırakır.
  const sipSec = useCallback((j: string, birak = true) => { setSecJob((x) => (birak && x === j ? null : j)); setSecTez(null); }, []);
  const tezSec = useCallback((m: string, birak = true) => { setSecTez((x) => (birak && x === m ? null : m)); setSecJob(null); }, []);
  const nasilAc = useCallback((id: BolgeKimligi) => setNasil((x) => (x === id ? null : id)), []);
  const grupAc = useCallback((g: string) => setAcikGrup((x) => (x === g ? null : g)), []);
  const gunSec = useCallback((d: number) => { if (v) setZaman(Math.max(now, v.T0 + d * v.kova * 24 + 8)); }, [v, now]);
  const donemSec = useCallback((d: Donem) => { setDonem(d); setKayma(0); }, []);
  const yazabilir = komut !== null && yetki.planYaz;
  const refSec = yazabilir ? (r: 'onceki' | 'sabit') => { komut.degistir('Nabız referansı değişti', (t) => { (t as Record<string, unknown>).nbRef = r; }, { planKoru: true }); } : null;
  const sabitle = yazabilir && p && nabiz ? () => {
    const x = sabitReferans(p, nabiz.cur, new Date());
    komut.degistir(`Şu anki plan referans alındı (${x.ad})`, (t) => { const y = t as Record<string, unknown>; y.nbSabit = x; y.nbRef = 'sabit'; }, { ayrinti: 'Değişiklikler buna göre ölçülür.', planKoru: true });
  } : null;
  const sabit = (c as Record<string, unknown>).nbSabit;
  const sabitAd = sabit && typeof sabit === 'object' && typeof (sabit as Record<string, unknown>).ad === 'string' ? (sabit as Record<string, string>).ad ?? null : null;
  const d: OzetDurumu = { nasil, acikGrup, secJob, secTez, zaman };

  return (
    <div className="tc-pym" data-gorunum={gorunum}>
      <Cubuk plan={!!p} guncel={guncel} planYaz={yetki.planYaz} nabiz={nabiz} nabizAcik={nbAcik} nabizAc={nabizAc} studyo={studyo}
        ozeteGit={() => setGorunum('genel')} refSec={refSec} sabitle={sabitle} sabitAd={sabitAd} />
      <Gorunum gorunum={gorunum} sec={setGorunum} studyo={studyo} donem={donem} kayma={kayma} donemSec={donemSec} kaydir={setKayma}
        donemYazi={nabiz?.donemYazi ?? ''} menuAcik={menuAcik} menuAc={menuAc} />
      {!p || !v ? (
        <div className="tc-pym-bos"><DurumKutusu durum="bos" mesaj={`Henüz plan yok. ${MOTOR_NOTU}`} /></div>
      ) : gorunum === 'genel' ? (
        <Ozet c={c} v={v} d={d} tezGrup={tezGrup} nasilAc={nasilAc} grupAc={grupAc} sipSec={sipSec} tezSec={tezSec} gunSec={gunSec} buyut={() => setGorunum('atolye')} />
      ) : (
        <div className="tc-pym-bos"><p className="tc-pym-oz-hazir"><Simge ad="layers" boyut="o" />{GORUNUM_AD[gorunum]}: {HAZIRLANIYOR}</p></div>
      )}
      {p && yetki.planYaz && <Yapilacaklar c={c} l={sor} acik={ypAcik} ac={ypAc} komut={komut} sipSec={(j) => sipSec(j, false)} />}
    </div>
  );
}
