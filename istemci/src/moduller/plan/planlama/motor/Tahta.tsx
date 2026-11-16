import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import { DONEM_OLCEKLERI, type PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { HaritaGorunumu } from './harita/HaritaGorunumu.tsx';
import type { HaritaKomutu } from './harita/Harita.tsx';
import { aralik, haritaGruplari, pencereSonu, sahneKur, yerlesim, zamanSinirla } from './harita/kurallar.ts';
import { BosCalisma, BosPlan } from './BosPlan.tsx';
import { useBekleyenUygula, usePlanKur } from './coz.ts';
import { bekleyenSiparisler, bitenler, derle, girdiKur, planOku, plandanBitenler, saatYaz, simdiSaati } from './kurallar.ts';
import { Kesif, KESIF_ILK, type KesifDurumu } from './kesif/Kesif.tsx';
import { Ozet, type OzetDurumu } from './ozet/Ozet.tsx';
import { panelSecimi } from './secim/kurallar.ts';
import { SecimPaneli } from './secim/SecimPaneli.tsx';
import { ozetVerisi, type BolgeKimligi } from './ozet/veri.ts';
import { Cubuk } from './ust/Cubuk.tsx';
import { Gorunum, type TahtaGorunumu } from './ust/Gorunum.tsx';
import { nabizDurumu } from './ust/nabiz.ts';
import { nabizYazmalari, PlanSeridi } from './ust/PlanSeridi.tsx';
import './motor.css';
import { useAn } from './saat.ts';
import { useEmirNo } from '../ortak/emir-no.ts';
import { DegisiklikOzeti, Degisiklikler } from '../kokpit/Degisiklikler.tsx';
import { bekleyenDegisiklikleri, degisiklikler } from '../kokpit/degisiklikler.ts';
import { modelKur } from '../kokpit/kurallar.ts';
import { SeritYuvasi } from './ust/yuva.ts';

// Planlama motoru (3308-2 a): plan şeridi, görünüm ve dönem çubuğu, üç görünüm (Özet, Harita, Keşfet) ve seçim kartı. Sayfa planı okur ve
// yeniden kurar (357 b, 576 coz.ts); iş taşıma ve düzenleme Kokpit'tedir. Dönem ve seçim iskeletin ortak durumundadır (görünümler arası).

// Veri ikinci menüde ayrı sayfadır; bölümü adrestedir (`veri?bolum=kisitlar`).
export const veriAcici = (o: PlanlamaEkranOzellikleri) => (o.altSec ? (bolum?: string) => { o.altSec?.({ ekran: 'veri', bolum: bolum ?? null }); } : null);

export function PlanlamaMotoru(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma; const veriAc = veriAcici(o);
  // Çalışma yokken de plan şeridi üstte durur (497/10 a).
  if (!c) return <><PlanSeridi {...o} gorunum="plan" /><div className="tc-pym"><BosCalisma veriAc={veriAc && (() => veriAc())} /></div></>;
  return <Tahta {...o} c={c} />;
}

function Tahta(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi }) {
  const { c, komut, yetki, secim, sec } = o;
  const { olcek: donem, kayma } = o.olcek;
  const [gorunum, setGorunum] = useState<TahtaGorunumu>('genel');
  const [nbAcik, setNbAcik] = useState(false);
  const [nasil, setNasil] = useState<BolgeKimligi | null>(null);
  const [acikGrup, setAcikGrup] = useState<string | null>(null);
  const [ks, setKs] = useState<KesifDurumu>(KESIF_ILK);
  const harita = useRef<HaritaKomutu | null>(null);
  const dk = useRef<HTMLElement | null>(null);

  const emirler = o.depo.durum?.emirler ?? null;
  const emirNo = useEmirNo(o.depo.receteRotaKaydi, o.depo.durum?.emirler);
  const p = useMemo(() => planOku(c), [c]);
  // Biten iş sunucunun iş emri durumundan; okunamazsa kayıtlı plandan.
  const an = useAn();
  const cx = useMemo(() => derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p), an)), [c, p, emirler, an]);
  const tezGrup = useMemo(() => { const m = new Map(c.D.tezgahlar.map((t) => [t.id, t.grup ?? 'diger'])); return (id: string) => (id.startsWith('@') ? 'fason' : m.get(id) ?? 'diger'); }, [c]);
  const guncel = planGuncel(c);
  const v = useMemo(() => (p ? ozetVerisi(c, p, cx, donem, kayma, emirNo) : null), [c, p, cx, donem, kayma, emirNo]);
  const bekleyen = useMemo(() => bekleyenSiparisler(emirler), [emirler]);
  const nabiz = useMemo(() => (p ? nabizDurumu(c, p, cx, donem, kayma, bekleyen) : null), [c, p, cx, donem, kayma, bekleyen]);
  const now = simdiSaati(c, an);
  const r = useMemo(() => aralik(now, donem, kayma), [now, donem, kayma]);
  // Zaman imleci şimdi ile dönemin sonu arasında kalır (rsT).
  const zaman = zamanSinirla(secim.zaman, now, pencereSonu(now, r));
  // Seçili adımın siparişi seçili sipariş sayılır (atSecJob).
  const secJob = secim.adim && p?.ops[secim.adim] ? p.ops[secim.adim]?.job ?? null : secim.siparis;
  // Seçim kartı: üç görünümde de seçim olunca açılır; tezgâh yerleri haritanınkiyle aynı sahneden.
  const sahne = useMemo(() => (p ? sahneKur(c.D, p, cx, yerlesim(haritaGruplari(c.D, p, cx), 1000, 600), r, now) : null), [c, p, cx, r, now]);
  const ps = p && sahne ? panelSecimi(p, sahne, secim, zaman) : null;

  const veriAc = veriAcici(o);
  const nabizAc = useCallback((x: boolean) => setNbAcik(x), []);
  // Seçim: sipariş ya da tezgâh; aynısına yeniden dokunmak bırakır.
  const sipSec = useCallback((j: string, birak = true) => { sec({ siparis: birak && secJob === j ? null : j, adim: null, tezgah: null }); }, [sec, secJob]);
  const tezSec = useCallback((m: string, birak = true) => { sec({ tezgah: birak && secim.tezgah === m ? null : m, siparis: null, adim: null }); }, [sec, secim.tezgah]);
  const nasilAc = useCallback((id: BolgeKimligi) => setNasil((x) => (x === id ? null : id)), []);
  const grupAc = useCallback((g: string) => setAcikGrup((x) => (x === g ? null : g)), []);
  const gunSec = useCallback((d: number) => { if (v) sec({ zaman: Math.max(now, v.T0 + d * v.kova * 24 + 8) }); }, [v, now, sec]);
  const gorunumSec = useCallback((g: TahtaGorunumu) => { setGorunum(g); }, []);
  // Çift tık tezgâhı seçer ve Harita'yı açar.
  const ciftTik = useCallback((m: string) => { sec({ tezgah: m, siparis: null, adim: null }); setGorunum('atolye'); }, [sec]);
  const komutKur = useCallback((k: HaritaKomutu | null) => { harita.current = k; }, []);
  const secimBirak = useCallback(() => sec({ siparis: null, adim: null, tezgah: null }), [sec]);
  const opSec = useCallback((id: string) => sec({ adim: id, siparis: null, tezgah: null }), [sec]);
  const zamanSec = useCallback((t: number) => sec({ zaman: t }), [sec]);
  const hazirlikAc = useCallback(() => { setKs((x) => ({ ...x, gor: 'hazir' })); setGorunum('kesif'); }, []);
  // Özet'te "Kartı aç": seçim kartı görünür alana gelir ve odağı alır.
  const kartAc = useCallback(() => { dk.current?.scrollIntoView?.({ block: 'nearest' }); dk.current?.focus(); }, []);
  const kilavuzYok = useCallback(() => undefined, []);

  // Planı etkileyen değişiklikler (3317-1b): Kokpit'in şeridindeki listenin aynısı; bu sayfa yalnız gösterir, düzeltme Kokpit'tedir.
  const dis = useContext(SeritYuvasi).dis ?? null;
  const [dgAcik, setDgAcik] = useState(false);
  const degisiklikListesi = useMemo(() => (p === null ? [] : degisiklikler({
    m: modelKur(c, p, cx, emirNo), zaman: (t) => saatYaz(c.D, t), an: (ms) => new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }),
    bekleyen: bekleyenDegisiklikleri(c, dis), olaylar: o.depo.planSurumu?.bayat?.olaylar ?? [],
  })), [c, p, cx, emirNo, dis, o.depo.planSurumu]);
  const veriSayisi = degisiklikListesi.filter((x) => x.baslik === 'veri').length;
  const git = o.git;
  const degisiklikEki = p === null ? null : {
    satir: <DegisiklikOzeti l={degisiklikListesi} acik={dgAcik} ac={setDgAcik} salt />,
    alt: dgAcik && degisiklikListesi.length > 0
      ? <Degisiklikler l={degisiklikListesi} kart={null} suzgec={false} suzgecKoy={() => undefined} goster={null} toplu={yetki.planYaz && komut !== null && veriSayisi > 0 ? veriSayisi : null} kokpiteGit={() => { git('kokpit'); }} />
      : null,
  };

  const { bildir } = useBildirim();
  const uyar = useCallback((ileti: string) => bildir('hata', ileti), [bildir]);
  const planKur = usePlanKur(o, uyar);
  const bekleyenUygula = useBekleyenUygula(o, uyar);

  // Klavye: yazı alanında ve açık pencerede çalışmaz. V dönem, G H K görünüm, F sığdır, + ve - yakınlık, Esc seçimi bırakır.
  const tuslar = useRef({ gorunumSec, sec, secim, olcekSec: o.olcekSec, donem });
  tuslar.current = { gorunumSec, sec, secim, olcekSec: o.olcekSec, donem };
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
      const g = ({ g: 'genel', h: 'atolye', k: 'kesif' } as Record<string, TahtaGorunumu>)[h];
      if (g) { dur(); x.gorunumSec(g); }
    };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); };
  }, []);

  const { refSec, sabitle, sabitAd } = nabizYazmalari(c, komut, yetki, p, nabiz);
  const d: OzetDurumu = { nasil, acikGrup, secJob, secTez: secim.tezgah, zaman };
  const cubuk = <Gorunum gorunum={gorunum} sec={gorunumSec} donem={donem} donemSec={o.olcekSec} kaydir={o.kaydir} donemYazi={nabiz?.donemYazi ?? ''} />;

  return (
    <div className="tc-pym" data-gorunum={gorunum}>
      <Cubuk plan={!!p} guncel={guncel} planYaz={yetki.planYaz} nabiz={nabiz} nabizAcik={nbAcik} nabizAc={nabizAc}
        ozeteGit={() => gorunumSec('genel')} refSec={refSec} sabitle={sabitle} sabitAd={sabitAd} planKur={planKur} bekleyenUygula={bekleyenUygula} olaylar={c.olaylar} ek={degisiklikEki} />
      <div className="tc-pym-govde">
        <div className="tc-pym-govde-ana">
          {gorunum === 'atolye' && p ? (
            <HaritaGorunumu c={c} p={p} cx={cx} olcek={donem} r={r} now={now} secim={secim} sec={sec} mercek="durum"
              kilavuz={false} ornek={null} kilavuzAc={kilavuzYok} ciftTik={ciftTik} ust={cubuk} komut={komutKur} />
          ) : (
            <>
              {p && v && cubuk}
              {!p || !v ? (
                <BosPlan c={c} cx={cx} planKur={planKur} planYaz={o.yetki.planYaz} veriAc={veriAc && (() => veriAc())} />
              ) : gorunum === 'genel' ? (
                <Ozet c={c} p={p} cx={cx} v={v} d={d} r={r} olcek={donem} now={now} secim={secim} sec={sec} mercek="durum" komut={komutKur} kilavuz={null}
                  kilavuzKapat={kilavuzYok}
                  tezGrup={tezGrup} nasilAc={nasilAc} grupAc={grupAc} sipSec={sipSec} tezSec={tezSec} gunSec={gunSec} buyut={() => gorunumSec('atolye')} ciftTik={ciftTik}
                  kartAc={ps ? kartAc : null} />
              ) : (
                <Kesif c={c} v={v} secJob={secJob} tezGrup={tezGrup} durum={ks} durumDegis={setKs}
                  sipSec={sipSec} tezSec={tezSec} gunSec={gunSec} acikGrup={acikGrup} grupAc={grupAc} />
              )}
            </>
          )}
        </div>
        {ps && p && sahne && (
          <SecimPaneli kok={dk} c={c} p={p} cx={cx} s={sahne} r={r} olcek={donem} t={zaman} secim={ps} planYaz={yetki.planYaz}
            kapat={secimBirak} opSec={opSec} sipSec={(j) => sipSec(j, false)} zamanSec={zamanSec} hazirlikAc={hazirlikAc} kokpitAc={() => o.git('kokpit')} />
        )}
      </div>
    </div>
  );
}
