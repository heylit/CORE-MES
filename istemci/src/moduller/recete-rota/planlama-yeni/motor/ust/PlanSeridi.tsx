import { useCallback, useMemo, useState } from 'react';
import { useBildirim } from '../../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../../durum.ts';
import type { PlanlamaEkranOzellikleri, PlanlamaGorunumu } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaYetkisi } from '../../yetki.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import { usePlanKur } from '../coz.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, type OkunanPlan } from '../kurallar.ts';
import { Cubuk } from './Cubuk.tsx';
import { nabizDurumu, sabitReferans, type NabizDurumu } from './nabiz.ts';
import '../motor.css';

// Nabız referansını seçmek ve şu anki planı sabitlemek çalışmaya yazar (zr-agirlik sdNabiz); motor ve öteki sayfalar aynı yazmayı kullanır.
export function nabizYazmalari(c: PlanlamaCalismasi, komut: CalismaKomutu | null, yetki: PlanlamaYetkisi, p: OkunanPlan | null, nabiz: NabizDurumu | null) {
  const yazabilir = komut !== null && yetki.planYaz;
  const refSec = yazabilir ? (x: 'onceki' | 'sabit') => { komut.degistir('Nabız referansı değişti', (t) => { (t as Record<string, unknown>).nbRef = x; }, { planKoru: true }); } : null;
  const sabitle = yazabilir && p && nabiz ? () => {
    const x = sabitReferans(p, nabiz.cur, new Date());
    komut.degistir(`Şu anki plan referans alındı (${x.ad})`, (t) => { const y = t as Record<string, unknown>; y.nbSabit = x; y.nbRef = 'sabit'; }, { ayrinti: 'Değişiklikler buna göre ölçülür.', planKoru: true });
  } : null;
  const sabit = (c as Record<string, unknown>).nbSabit;
  const sabitAd = sabit && typeof sabit === 'object' && typeof (sabit as Record<string, unknown>).ad === 'string' ? (sabit as Record<string, string>).ad ?? null : null;
  return { refSec, sabitle, sabitAd };
}

// Her planlama sayfasının üstündeki plan çubuğu (eski b-kabuk/zk-kabuk pm-sb; Soru 497/10 a). Motor sayfası kendi çubuğunu çizer;
// iskelet bunu öteki sayfaların üstüne koyar; motor çalışma yokken de bunu çizer. Çalışma ya da plan yoksa çubuk nabızsız ve "Plan yok"la çizilir;
// "Planı kur" çalışma varsa ve kişi yazabiliyorsa sunucudaki motorla açıktır (576), yoksa pasif.
export function PlanSeridi(o: PlanlamaEkranOzellikleri & { gorunum: PlanlamaGorunumu }) {
  const c = o.calisma; const emirler = o.depo.durum?.emirler ?? null;
  const { olcek: donem, kayma } = o.olcek;
  const [acik, setAcik] = useState(false);
  const p = useMemo(() => (c ? planOku(c) : null), [c]);
  const cx = useMemo(() => (c ? derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p))) : null), [c, p, emirler]);
  const nabiz = useMemo(() => (c && p && cx ? nabizDurumu(c, p, cx, donem, kayma) : null), [c, p, cx, donem, kayma]);
  const y = c ? nabizYazmalari(c, o.komut, o.yetki, p, nabiz) : { refSec: null, sabitle: null, sabitAd: null };
  const { bildir } = useBildirim();
  const planKur = usePlanKur(o, useCallback((ileti: string) => bildir('hata', ileti), [bildir]));
  return (
    <div className="tc-pym" data-serit="">
      <Cubuk plan={!!p} guncel={c ? planGuncel(c) : false} planYaz={o.yetki.planYaz} nabiz={nabiz} nabizAcik={acik} nabizAc={setAcik}
        etkin={o.gorunum === 'plan' ? 'plan' : o.gorunum === 'studio' ? 'studyo' : null} planaGit={() => o.git('plan')} studyo={() => o.git('studio')} ozeteGit={() => o.git('plan')} planKur={planKur} {...y} />
    </div>
  );
}
