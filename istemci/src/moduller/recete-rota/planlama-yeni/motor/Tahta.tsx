import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DurumKutusu, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import { DONEM_OLCEKLERI, type PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { otomatikOdak, tezgahGrubu, type OdakYeri } from '../ic/odak/kurallar.ts';
import { bolumOku } from '../ic/veri/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { CizelgeGorunumu } from './cizelge/CizelgeGorunumu.tsx';
import { HaritaGorunumu } from './harita/HaritaGorunumu.tsx';
import type { HaritaKomutu } from './harita/Harita.tsx';
import { KilavuzKarti } from './harita/Kilavuz.tsx';
import { aralik, durusOku, haritaGruplari, ornekTezgah, pencereSonu, sahneKur, yerlesim, zamanSinirla } from './harita/kurallar.ts';
import { BosCalisma, BosPlan } from './BosPlan.tsx';
import { usePlanKur } from './coz.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, simdiSaati, sorunlar } from './kurallar.ts';
import { Kesif, KESIF_ILK, type KesifDurumu } from './kesif/Kesif.tsx';
import { MOTOR_NOTU } from './ortak.tsx';
import { Ozet, type OzetDurumu } from './ozet/Ozet.tsx';
import { panelSecimi } from './secim/kurallar.ts';
import { SecimPaneli, type PanelSekmesi } from './secim/SecimPaneli.tsx';
import { ozetVerisi, type BolgeKimligi } from './ozet/veri.ts';
import { Cubuk } from './ust/Cubuk.tsx';
import { Gorunum, type TahtaGorunumu } from './ust/Gorunum.tsx';
import { nabizDurumu } from './ust/nabiz.ts';
import { nabizYazmalari, PlanSeridi } from './ust/PlanSeridi.tsx';
import type { KbPanel } from './Duzenle.tsx';
import { Yapilacaklar } from './Yapilacaklar.tsx';
import './motor.css';

// Planlama motoru (eski sayfanın "tahta"sı): plan çubuğu, görünüm ve dönem çubuğu, seçili görünüm, Yapılacaklar. Plan sunucuda çözülür
// (357 b, 576 coz.ts); ekran kayıttaki planı okur, çalışmaya yalnız `komut.degistir`le yazar. Dönem ve seçim iskeletin ortak durumundadır (görünümler arası).

// Veri ve kısıtlar (577b) motor sayfasının ekranıdır (eski b-kabuk EKRANLAR veri); Nasıl hesaplandı ve Bugünün kararları (577a) Plan ekranının
// sayfalarıdır (zk-kabuk Başka menüsü Sayfalar). Plan çubuğu üstte; bölüm adresin sorgusunda.
const VeriVeKisitlar = lazy(async () => ({ default: (await import('../ic/veri/index.tsx')).VeriVeKisitlar }));
const NasilHesaplandi = lazy(async () => ({ default: (await import('../ic/hesap/index.tsx')).NasilHesaplandi }));
const BugununKararlari = lazy(async () => ({ default: (await import('../ic/bugun/index.tsx')).BugununKararlari }));
// Odak tahtası (577a, zg-odak): görünümün yerinde bir bölüm ya da tek tezgâh; tezgâh kartının Odakla'sı ve O tuşu açar.
const OdakTahtasi = lazy(async () => ({ default: (await import('../ic/odak/index.tsx')).OdakTahtasi }));

export const veriAcici = (o: PlanlamaEkranOzellikleri) => (o.altSec ? (bolum?: string) => o.altSec?.({ ekran: 'veri', bolum: bolum ?? null }) : null);
export const sayfaAcici = (o: PlanlamaEkranOzellikleri) => (o.altSec ? (s: 'bugun' | 'hesap') => o.altSec?.({ ekran: s, bolum: null }) : null);

export function PlanlamaMotoru(o: PlanlamaEkranOzellikleri) {
  const c = o.calisma; const veriAc = veriAcici(o);
  const ekran = o.alt?.ekran ?? 'tahta';
  if (ekran === 'veri' || ekran === 'hesap' || ekran === 'bugun') {
    return (
      <>
        <PlanSeridi {...o} gorunum="plan" />
        <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
          {ekran === 'veri' ? <VeriVeKisitlar {...o} bolum={bolumOku(o.alt?.bolum) ?? undefined} bolumSec={(b) => veriAc?.(b)} />
            : ekran === 'hesap' ? <NasilHesaplandi {...o} /> : <BugununKararlari {...o} />}
        </Suspense>
      </>
    );
  }
  // Çalışma yokken de plan çubuğu üstte durur (497/10 a; eski sayfa her durumda çizerdi).
  if (!c) return <><PlanSeridi {...o} gorunum="plan" /><div className="tc-pym"><BosCalisma veriAc={veriAc && (() => veriAc())} /></div></>;
  return <Tahta {...o} c={c} />;
}

function Tahta(o: PlanlamaEkranOzellikleri & { c: PlanlamaCalismasi }) {
  const { c, komut, yetki, secim, sec } = o;
  const { olcek: donem, kayma } = o.olcek;
  const [gorunum, setGorunum] = useState<TahtaGorunumu>('genel');
  const [nbAcik, setNbAcik] = useState(false);
  const [menuAcik, setMenuAcik] = useState(false);
  const [ypAcik, setYpAcik] = useState(false);
  const [pan, setPan] = useState<KbPanel | null>(null);
  const [nasil, setNasil] = useState<BolgeKimligi | null>(null);
  const [acikGrup, setAcikGrup] = useState<string | null>(null);
  const [mercek, setMercek] = useState<'durum' | 'etki'>('durum');
  const [kilavuz, setKilavuz] = useState(false);
  const [ornek, setOrnek] = useState<string | null>(null);
  const [ks, setKs] = useState<KesifDurumu>(KESIF_ILK);
  const [sekD, setSekD] = useState<{ k: string | null; x: PanelSekmesi }>({ k: null, x: 'yon' });
  const [odak, setOdak] = useState<OdakYeri | null>(null);
  const harita = useRef<HaritaKomutu | null>(null);
  const dk = useRef<HTMLElement | null>(null);

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
  // Yan panel (zl-yan): Özet, Harita ve Keşfet'te seçim olunca açılır; tezgâh yerleri haritanınkiyle aynı sahneden.
  const sahne = useMemo(() => (p ? sahneKur(c.D, p, cx, yerlesim(haritaGruplari(c.D, p, cx), 1000, 600), r, now) : null), [c, p, cx, r, now]);
  const ps = p && sahne && gorunum !== 'cizelge' ? panelSecimi(p, sahne, secim, zaman) : null;
  // Sekme seçimle birlikte tutulur; yeni seçim "Yön ver"le açılır (tkSek seçimde sıfırlanır).
  const psAnahtar = ps ? `${ps.tur}:${ps.id}` : null;
  const sek = sekD.k === psAnahtar ? sekD.x : 'yon';
  const sekSec = (x: PanelSekmesi) => setSekD({ k: psAnahtar, x });

  const studyo = useCallback(() => o.git('studio'), [o]);
  const veriAc = veriAcici(o); const sayfaAc = sayfaAcici(o);
  const nabizAc = useCallback((x: boolean) => setNbAcik(x), []);
  const menuAc = useCallback((x: boolean) => setMenuAcik(x), []);
  const ypAc = useCallback((x: boolean) => { setYpAcik(x); if (x) setPan(null); }, []);
  // Düzenle, Değişiklikler ve kısayol listesi (zp-klavye kbPanAc): aynı tuş açıp kapatır; açılan Yapılacaklar'ı kapatır.
  const panAc = useCallback((x: KbPanel | null) => { setPan(x); if (x) setYpAcik(false); }, []);
  const panDegis = useCallback((x: KbPanel) => { setPan((y) => (y === x ? null : x)); setYpAcik(false); }, []);
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
  const secimBirak = useCallback(() => sec({ siparis: null, adim: null, tezgah: null }), [sec]);
  const opSec = useCallback((id: string) => sec({ adim: id, siparis: null, tezgah: null }), [sec]);
  const zamanSec = useCallback((t: number) => sec({ zaman: t }), [sec]);
  // Gün planı (at-gun): seçilen adımın ya da tezgâhın o günü Çizelge'nin gün ölçeğinde açılır; dönem Gün olur (Soru 485/2 b).
  const gunPlani = useCallback((t: number, x: { adim?: string; tezgah?: string }) => {
    sec({ siparis: null, adim: x.adim ?? null, tezgah: x.tezgah ?? null });
    o.olcekSec('gun'); const n = Math.floor(t / 24) - Math.floor(now / 24); if (n > 0) o.kaydir(n);
    setGorunum('cizelge');
  }, [sec, o, now]);
  const hazirlikAc = useCallback(() => { setKs((x) => ({ ...x, gor: 'hazir' })); setMenuAcik(false); setPan(null); setKilavuz(false); setGorunum('kesif'); }, []);
  // Özet'te "Kartı aç": panel görünür alana gelir ve odağı alır.
  const kartAc = useCallback(() => { setSekD({ k: null, x: 'yon' }); dk.current?.scrollIntoView?.({ block: 'nearest' }); dk.current?.focus(); }, []);
  // Örnek tezgâh açılışta bir kez seçilir; kamera ona uçar, görünüm değişince (Büyüt) yeniden.
  useEffect(() => {
    if (!kilavuz || !p) { setOrnek(null); return; }
    setOrnek(ornekTezgah(sahneKur(c.D, p, cx, yerlesim(haritaGruplari(c.D, p, cx), 1000, 600), r, now), durusOku(c), zaman));
  }, [kilavuz]);
  useEffect(() => {
    if (!ornek) return undefined;
    const z = requestAnimationFrame(() => harita.current?.kilavuzKamera(ornek)); return () => cancelAnimationFrame(z);
  }, [ornek, gorunum]);
  const gorunumSec = useCallback((g: TahtaGorunumu) => { setMenuAcik(false); setPan(null); setOdak(null); if (g !== 'atolye' && g !== 'genel') setKilavuz(false); setGorunum(g); }, []);
  // 'auto' en anlamlı yeri seçer (odOtomatik); açılınca menü, panel ve kılavuz kapanır.
  const odakAc = useCallback((y: OdakYeri | 'auto' | null) => {
    if (y === null) { setOdak(null); return; }
    if (!p) return;
    setMenuAcik(false); setPan(null); setKilavuz(false);
    setOdak(y === 'auto' ? otomatikOdak(c, p, cx, v, secim) : y);
  }, [c, p, cx, v, secim]);

  // Klavye (zd-tam, zp-klavye, zs-olcek-ortak): yazı alanında ve açık pencerede çalışmaz.
  const { bildir } = useBildirim();
  const uyar = useCallback((ileti: string) => bildir('hata', ileti), [bildir]);
  const planKur = usePlanKur(o, uyar);
  const tuslar = useRef({ gorunumSec, panDegis, ypAc, ypAcik, sec, secim, olcekSec: o.olcekSec, donem, planYaz: yetki.planYaz && !!p, bildir, odak, odakAc });
  tuslar.current = { gorunumSec, panDegis, ypAc, ypAcik, sec, secim, olcekSec: o.olcekSec, donem, planYaz: yetki.planYaz && !!p, bildir, odak, odakAc };
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null; if (t?.closest?.('input, textarea, select, dialog, [contenteditable], [role="dialog"], [role="menu"]')) return;
      if (document.querySelector('dialog[open]')) return;
      const x = tuslar.current; const k = e.key; const h = k.toLocaleLowerCase('tr-TR');
      const dur = () => { e.preventDefault(); e.stopPropagation(); };
      if (h === 'v') { dur(); const i = DONEM_OLCEKLERI.findIndex((d) => d[0] === x.donem); x.olcekSec(DONEM_OLCEKLERI[(i + (e.shiftKey ? DONEM_OLCEKLERI.length - 1 : 1)) % DONEM_OLCEKLERI.length]?.[0] ?? 'hafta'); return; }
      // Odakta Esc önce seçimi bırakır, sonra bir seviye çıkar; O odağı açıp kapatır (zg-odak).
      if (k === 'Escape') {
        if (x.secim.siparis || x.secim.adim || x.secim.tezgah) { dur(); x.sec({ siparis: null, adim: null, tezgah: null }); return; }
        if (x.odak) { dur(); x.odakAc(x.odak.m ? { g: x.odak.g, m: null } : null); }
        return;
      }
      if (h === 'o') { dur(); x.odakAc(x.odak ? null : 'auto'); return; }
      if (h === 'f') { dur(); harita.current?.sigdir(); return; }
      if (k === '+' || k === '=') { dur(); harita.current?.yakinlas(1.25); return; }
      if (k === '-') { dur(); harita.current?.yakinlas(0.8); return; }
      if (!x.planYaz) return;
      if (h === 'y') { dur(); x.ypAc(!x.ypAcik); return; }
      if (k === '?') { dur(); x.panDegis('kl'); return; }
      if (h === 'e') { dur(); x.panDegis('dz'); return; }
      if (h === 'd') { dur(); x.panDegis('sp'); return; }
      if ((k === '[' || k === ']') && x.secim.adim) { dur(); x.bildir('bilgi', `Kuyrukta sıra: ${MOTOR_NOTU}`); return; }
      const g = ({ g: 'genel', h: 'atolye', k: 'kesif', c: 'cizelge', ç: 'cizelge' } as Record<string, TahtaGorunumu>)[h];
      if (g) { dur(); x.gorunumSec(g); }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, []);

  const { refSec, sabitle, sabitAd } = nabizYazmalari(c, komut, yetki, p, nabiz);
  const d: OzetDurumu = { nasil, acikGrup, secJob, secTez: secim.tezgah, zaman };
  const cubukKur = (masa: boolean) => (
    <Gorunum gorunum={gorunum} sec={gorunumSec} studyo={studyo} donem={donem} donemSec={o.olcekSec} kaydir={o.kaydir}
      donemYazi={nabiz?.donemYazi ?? ''} menuAcik={menuAcik} menuAc={menuAc} masa={masa}
      baska={{ mercek, mercekSec: () => setMercek((x) => (x === 'etki' ? 'durum' : 'etki')), kilavuz, kilavuzAc: () => kilavuzAc(!kilavuz), kisayolAc: () => panAc('kl'), planYaz: yetki.planYaz, sayfaAc }} />
  );
  const cubuk = cubukKur(false);

  return (
    <div className="tc-pym" data-gorunum={gorunum} data-odak={odak ? '' : undefined}>
      <Cubuk etkin="plan" planaGit={null} veri={veriAc && (() => veriAc())} plan={!!p} guncel={guncel} planYaz={yetki.planYaz} nabiz={nabiz} nabizAcik={nbAcik} nabizAc={nabizAc} studyo={studyo}
        ozeteGit={() => gorunumSec('genel')} refSec={refSec} sabitle={sabitle} sabitAd={sabitAd} planKur={planKur} />
      <div className="tc-pym-govde">
        <div className="tc-pym-govde-ana">
          {odak && p ? (
            <>
              {cubuk}
              <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
                <OdakTahtasi c={c} p={p} cx={cx} v={v} now={now} yer={odak} ac={odakAc} secim={secim} sec={sec} komut={komut} planYaz={yetki.planYaz} />
              </Suspense>
            </>
          ) : gorunum === 'atolye' && p ? (
            <HaritaGorunumu c={c} p={p} cx={cx} olcek={donem} r={r} now={now} secim={secim} sec={sec} mercek={mercek}
              kilavuz={kilavuz} ornek={ornek} kilavuzAc={kilavuzAc} ciftTik={ciftTik} ust={cubuk} komut={komutKur} />
          ) : (
            <>
              {p && v && gorunum !== 'cizelge' && cubuk}
              {!p || !v ? (
                <BosPlan c={c} cx={cx} planKur={planKur} veriAc={veriAc && (() => veriAc())} />
              ) : gorunum === 'genel' ? (
                <>
                  {kilavuz && <div className="tc-pym-oz-kilavuz"><KilavuzKarti ornek={ornek} kapat={() => kilavuzAc(false)} /></div>}
                  <Ozet c={c} p={p} cx={cx} v={v} d={d} r={r} olcek={donem} now={now} secim={secim} sec={sec} mercek={mercek} komut={komutKur} kilavuz={kilavuz ? ornek : null}
                    kilavuzKapat={() => kilavuzAc(false)}
                    tezGrup={tezGrup} nasilAc={nasilAc} grupAc={grupAc} sipSec={sipSec} tezSec={tezSec} gunSec={gunSec} buyut={() => gorunumSec('atolye')} ciftTik={ciftTik}
                    kartAc={ps ? kartAc : null} />
                </>
              ) : gorunum === 'cizelge' ? (
                // Sayfa içi kilit (günü dondur, burada sabitle) 223 a ile ortak plan.yaz'dır; planKilitle sunucudaki iş emri kilididir.
                <CizelgeGorunumu c={c} p={p} cx={cx} olcek={donem} kayma={kayma} r={r} now={now} secim={secim} sec={sec} olcekSec={o.olcekSec} kaydir={o.kaydir}
                  planYaz={yetki.planYaz} planKilitle={yetki.planYaz} planCanliyaAl={yetki.planCanliyaAl} studyo={studyo} ust={cubukKur(true)}
                  sor={sor} guncel={guncel} komut={komut} veriAc={veriAc} hesapAc={sayfaAc && (() => sayfaAc('hesap'))} />
              ) : gorunum === 'kesif' ? (
                <Kesif c={c} v={v} secJob={secJob} tezGrup={tezGrup} durum={ks} durumDegis={setKs}
                  sipSec={sipSec} tezSec={tezSec} gunSec={gunSec} acikGrup={acikGrup} grupAc={grupAc} />
              ) : null}
            </>
          )}
        </div>
        {ps && p && sahne && !odak && (
          <SecimPaneli kok={dk} c={c} p={p} cx={cx} s={sahne} r={r} olcek={donem} t={zaman} secim={ps} sek={sek} sekSec={sekSec}
            komut={komut} planYaz={yetki.planYaz} planKilitle={yetki.planYaz} kapat={secimBirak} opSec={opSec} sipSec={(j) => sipSec(j, false)}
            rotaSec={(j) => { sipSec(j, false); setSekD({ k: `siparis:${j}`, x: 'rota' }); }}
            zamanSec={zamanSec} gunPlani={gunPlani} hazirlikAc={hazirlikAc} odakla={(m) => odakAc({ g: tezgahGrubu(c.D, m), m })} />
        )}
      </div>
      {p && yetki.planYaz && (
        <Yapilacaklar c={c} p={p} cx={cx} l={sor} acik={ypAcik} ac={ypAc} komut={komut} sipSec={(j) => sipSec(j, false)} secim={secim} pan={pan} panAc={panAc} studyo={studyo} veriAc={veriAc} />
      )}
    </div>
  );
}
