import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import { DONEM_OLCEKLERI, type PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { CizelgeGorunumu } from './cizelge/CizelgeGorunumu.tsx';
import { HaritaGorunumu } from './harita/HaritaGorunumu.tsx';
import type { HaritaKomutu } from './harita/Harita.tsx';
import { KilavuzKarti } from './harita/Kilavuz.tsx';
import { aralik, durusOku, haritaGruplari, ornekTezgah, pencereSonu, sahneKur, yerlesim, zamanSinirla } from './harita/kurallar.ts';
import { BosPlan } from './BosPlan.tsx';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, simdiSaati, sorunlar } from './kurallar.ts';
import { HAZIRLANIYOR, MOTOR_NOTU } from './ortak.tsx';
import { Ozet, type OzetDurumu } from './ozet/Ozet.tsx';
import { ozetVerisi, type BolgeKimligi } from './ozet/veri.ts';
import { Cubuk } from './ust/Cubuk.tsx';
import { Gorunum, type TahtaGorunumu } from './ust/Gorunum.tsx';
import { nabizDurumu, sabitReferans } from './ust/nabiz.ts';
import { Yapilacaklar } from './Yapilacaklar.tsx';
import './motor.css';

// Planlama motoru (eski sayfanın "tahta"sı): plan çubuğu, görünüm ve dönem çubuğu, seçili görünüm, Yapılacaklar. Plan sunucuda çözülür
// (357 b); ekran kayıttaki planı okur, çalışmaya yalnız `komut.degistir`le yazar. Dönem ve seçim iskeletin ortak durumundadır (görünümler arası).
const GORUNUM_AD: Record<Exclude<TahtaGorunumu, 'genel' | 'atolye'>, string> = { cizelge: 'Çizelge', kesif: 'Keşfet' };

export function PlanlamaMotoru(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma;
  if (!c) return <div className="tc-pym"><div className="tc-pym-bos"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok." /></div></div>;
  return <Tahta {...o} c={c} />;
}

function Tahta(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi }) {
  const { c, komut, yetki, secim, sec } = o;
  const { olcek: donem, kayma } = o.olcek;
  const [gorunum, setGorunum] = useState<TahtaGorunumu>('genel');
  const [nbAcik, setNbAcik] = useState(false);
  const [menuAcik, setMenuAcik] = useState(false);
  const [ypAcik, setYpAcik] = useState(false);
  const [kisayol, setKisayol] = useState(false);
  const [nasil, setNasil] = useState<BolgeKimligi | null>(null);
  const [acikGrup, setAcikGrup] = useState<string | null>(null);
  const [mercek, setMercek] = useState<'durum' | 'etki'>('durum');
  const [kilavuz, setKilavuz] = useState(false);
  const [ornek, setOrnek] = useState<string | null>(null);
  const harita = useRef<HaritaKomutu | null>(null);

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
  const r = useMemo(() => aralik(now, donem, kayma), [now, donem, kayma]);
  // Zaman imleci şimdi ile dönemin sonu arasında kalır (rsT).
  const zaman = zamanSinirla(secim.zaman, now, pencereSonu(now, r));
  // Seçili adımın siparişi seçili sipariş sayılır (atSecJob).
  const secJob = secim.adim && p?.ops[secim.adim] ? p.ops[secim.adim]?.job ?? null : secim.siparis;

  const studyo = useCallback(() => o.git('studio'), [o]);
  const nabizAc = useCallback((x: boolean) => setNbAcik(x), []);
  const menuAc = useCallback((x: boolean) => setMenuAcik(x), []);
  const ypAc = useCallback((x: boolean) => { setYpAcik(x); if (x) setKisayol(false); }, []);
  const kisayolAc = useCallback((x: boolean) => { setKisayol(x); if (x) setYpAcik(false); }, []);
  // Seçim: sipariş ya da tezgâh; aynısına yeniden dokunmak bırakır.
  const sipSec = useCallback((j: string, birak = true) => { sec({ siparis: birak && secJob === j ? null : j, adim: null, tezgah: null }); }, [sec, secJob]);
  const tezSec = useCallback((m: string, birak = true) => { sec({ tezgah: birak && secim.tezgah === m ? null : m, siparis: null, adim: null }); }, [sec, secim.tezgah]);
  const nasilAc = useCallback((id: BolgeKimligi) => setNasil((x) => (x === id ? null : id)), []);
  const grupAc = useCallback((g: string) => setAcikGrup((x) => (x === g ? null : g)), []);
  const gunSec = useCallback((d: number) => { if (v) sec({ zaman: Math.max(now, v.T0 + d * v.kova * 24 + 8) }); }, [v, now, sec]);
  // Kılavuz açılınca seçim kalkar; Özet'te de Harita'da da açılır (atKilavuz görünüm değiştirmez).
  const kilavuzAc = useCallback((x: boolean) => { setKilavuz(x); if (x) sec({ siparis: null, adim: null, tezgah: null }); }, [sec]);
  // Çift tık tezgâhın gün planını açar (Çizelge).
  const ciftTik = useCallback((m: string) => { sec({ tezgah: m, siparis: null, adim: null }); setGorunum('cizelge'); }, [sec]);
  const komutKur = useCallback((k: HaritaKomutu | null) => { harita.current = k; }, []);
  // Örnek tezgâh açılışta bir kez seçilir; kamera ona uçar, görünüm değişince (Büyüt) yeniden.
  useEffect(() => {
    if (!kilavuz || !p) { setOrnek(null); return; }
    setOrnek(ornekTezgah(sahneKur(c.D, p, cx, yerlesim(haritaGruplari(c.D, p, cx), 1000, 600), r, now), durusOku(c), zaman));
  }, [kilavuz]);
  useEffect(() => {
    if (!ornek) return undefined;
    const z = requestAnimationFrame(() => harita.current?.kilavuzKamera(ornek)); return () => cancelAnimationFrame(z);
  }, [ornek, gorunum]);
  const gorunumSec = useCallback((g: TahtaGorunumu) => { setMenuAcik(false); if (g !== 'atolye' && g !== 'genel') setKilavuz(false); setGorunum(g); }, []);

  // Klavye (zd-tam, zp-klavye, zs-olcek-ortak): yazı alanında ve açık pencerede çalışmaz.
  const tuslar = useRef({ gorunumSec, kisayolAc, ypAc, ypAcik, sec, secim, olcekSec: o.olcekSec, donem, planYaz: yetki.planYaz && !!p });
  tuslar.current = { gorunumSec, kisayolAc, ypAc, ypAcik, sec, secim, olcekSec: o.olcekSec, donem, planYaz: yetki.planYaz && !!p };
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null; if (t?.closest?.('input, textarea, select, dialog, [contenteditable], [role="dialog"], [role="menu"]')) return;
      if (document.querySelector('dialog[open]')) return;
      const x = tuslar.current; const k = e.key; const h = k.toLocaleLowerCase('tr-TR');
      const dur = () => { e.preventDefault(); e.stopPropagation(); };
      if (h === 'v') { dur(); const i = DONEM_OLCEKLERI.findIndex((d) => d[0] === x.donem); x.olcekSec(DONEM_OLCEKLERI[(i + (e.shiftKey ? DONEM_OLCEKLERI.length - 1 : 1)) % DONEM_OLCEKLERI.length]?.[0] ?? 'hafta'); return; }
      if (k === 'Escape') { if (x.secim.siparis || x.secim.adim || x.secim.tezgah) { dur(); x.sec({ siparis: null, adim: null, tezgah: null }); } return; }
      if (h === 'f') { dur(); harita.current?.sigdir(); return; }
      if (k === '+' || k === '=') { dur(); harita.current?.yakinlas(1.25); return; }
      if (k === '-') { dur(); harita.current?.yakinlas(0.8); return; }
      if (!x.planYaz) return;
      if (h === 'y') { dur(); x.ypAc(!x.ypAcik); return; }
      if (k === '?') { dur(); x.kisayolAc(true); return; }
      const g = ({ g: 'genel', h: 'atolye', k: 'kesif', c: 'cizelge', ç: 'cizelge' } as Record<string, TahtaGorunumu>)[h];
      if (g) { dur(); x.gorunumSec(g); }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, []);

  const yazabilir = komut !== null && yetki.planYaz;
  const refSec = yazabilir ? (x: 'onceki' | 'sabit') => { komut.degistir('Nabız referansı değişti', (t) => { (t as Record<string, unknown>).nbRef = x; }, { planKoru: true }); } : null;
  const sabitle = yazabilir && p && nabiz ? () => {
    const x = sabitReferans(p, nabiz.cur, new Date());
    komut.degistir(`Şu anki plan referans alındı (${x.ad})`, (t) => { const y = t as Record<string, unknown>; y.nbSabit = x; y.nbRef = 'sabit'; }, { ayrinti: 'Değişiklikler buna göre ölçülür.', planKoru: true });
  } : null;
  const sabit = (c as Record<string, unknown>).nbSabit;
  const sabitAd = sabit && typeof sabit === 'object' && typeof (sabit as Record<string, unknown>).ad === 'string' ? (sabit as Record<string, string>).ad ?? null : null;
  const d: OzetDurumu = { nasil, acikGrup, secJob, secTez: secim.tezgah, zaman };
  const cubukKur = (masa: boolean) => (
    <Gorunum gorunum={gorunum} sec={gorunumSec} studyo={studyo} donem={donem} donemSec={o.olcekSec} kaydir={o.kaydir}
      donemYazi={nabiz?.donemYazi ?? ''} menuAcik={menuAcik} menuAc={menuAc} masa={masa}
      baska={{ mercek, mercekSec: () => setMercek((x) => (x === 'etki' ? 'durum' : 'etki')), kilavuz, kilavuzAc: () => kilavuzAc(!kilavuz), kisayolAc: () => kisayolAc(true), planYaz: yetki.planYaz }} />
  );
  const cubuk = cubukKur(false);

  return (
    <div className="tc-pym" data-gorunum={gorunum}>
      <Cubuk plan={!!p} guncel={guncel} planYaz={yetki.planYaz} nabiz={nabiz} nabizAcik={nbAcik} nabizAc={nabizAc} studyo={studyo}
        ozeteGit={() => gorunumSec('genel')} refSec={refSec} sabitle={sabitle} sabitAd={sabitAd} />
      {gorunum === 'atolye' && p ? (
        <HaritaGorunumu c={c} p={p} cx={cx} olcek={donem} r={r} now={now} secim={secim} sec={sec} mercek={mercek}
          kilavuz={kilavuz} ornek={ornek} kilavuzAc={kilavuzAc} ciftTik={ciftTik} ust={cubuk} komut={komutKur} />
      ) : (
        <>
          {p && v && gorunum !== 'cizelge' && cubuk}
          {!p || !v ? (
            <BosPlan c={c} cx={cx} />
          ) : gorunum === 'genel' ? (
            <>
              {kilavuz && <div className="tc-pym-oz-kilavuz"><KilavuzKarti ornek={ornek} kapat={() => kilavuzAc(false)} /></div>}
              <Ozet c={c} p={p} cx={cx} v={v} d={d} r={r} olcek={donem} now={now} secim={secim} sec={sec} mercek={mercek} komut={komutKur} kilavuz={kilavuz ? ornek : null}
                kilavuzKapat={() => kilavuzAc(false)}
              tezGrup={tezGrup} nasilAc={nasilAc} grupAc={grupAc} sipSec={sipSec} tezSec={tezSec} gunSec={gunSec} buyut={() => gorunumSec('atolye')} ciftTik={ciftTik} />
            </>
          ) : gorunum === 'cizelge' ? (
            // Sayfa içi kilit (günü dondur, burada sabitle) 223 a ile ortak plan.yaz'dır; planKilitle sunucudaki iş emri kilididir.
            <CizelgeGorunumu c={c} p={p} cx={cx} olcek={donem} kayma={kayma} r={r} now={now} secim={secim} sec={sec} olcekSec={o.olcekSec} kaydir={o.kaydir}
              planYaz={yetki.planYaz} planKilitle={yetki.planYaz} planCanliyaAl={yetki.planCanliyaAl} studyo={studyo} ust={cubukKur(true)}
              sor={sor} guncel={guncel} komut={komut} />
          ) : gorunum !== 'atolye' ? (
            <div className="tc-pym-bos"><p className="tc-pym-oz-hazir"><Simge ad="layers" boyut="o" />{GORUNUM_AD[gorunum]}: {HAZIRLANIYOR}</p></div>
          ) : null}
        </>
      )}
      {p && yetki.planYaz && (
        <Yapilacaklar c={c} l={sor} acik={ypAcik} ac={ypAc} komut={komut} sipSec={(j) => sipSec(j, false)} kisayol={kisayol} kisayolAc={kisayolAc} />
      )}
    </div>
  );
}
