import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { renkleriOku, type HaritaRenkleri } from '../../motor/harita/renk.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, saatYaz } from '../../motor/kurallar.ts';
import { degisken } from '../../motor/ortak.tsx';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { ekipSonOku } from '../hesap/kurallar.ts';
import { KucukDugme, VeriKarti } from '../veri/ortak.tsx';
import { ciz } from './ciz.ts';
import {
  AG_KATMAN, AG_KIPLERI, atolyeOzeti, atolyeSahnesi, baglar, bul, ilkKamera, ilkOto, kararSahnesi, RX_SINIR, sinirla, tezgahListesi, uretimSahnesi, UZ_SINIR,
  type AgDugumu, type AgKipi, type AgSahnesi, type Kamera, type Konum,
} from './kurallar.ts';
import '../../motor/motor.css';
import './ag.css';

// Akış ağı (3B) (bugünkü sayfa j-ag3b.betik agKart, agBagla, agDetay; k-gorunum.betik atölye akışı): "Nasıl hesaplandı"nın ikinci sekmesi.
// Sürükle döndürür, tekerlek ve artı eksi yakınlaştırır, ok tuşları döndürür; düğüme basmak bağlarını yan panelde açar. Yalnız okur.

const az = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const tema = () => `${document.documentElement.getAttribute('data-theme') ?? ''}|${typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches}`;

export function AkisAgi({ o, c }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi }) {
  const emirler = o.depo.durum?.emirler ?? null;
  const p = useMemo(() => planOku(c), [c]);
  const cx = useMemo(() => derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, p))), [c, p, emirler]);
  const son = useMemo(() => ekipSonOku(c), [c]);
  const [kip, setKip] = useState<AgKipi>('karar');
  const [oto, setOto] = useState(() => ilkOto('karar', az()));
  const [tur, setTur] = useState(-1);
  const [sec, setSec] = useState<string | null>(null);
  const [zaman, setZaman] = useState<number | null>(null);
  const [oynat, setOynat] = useState(false);
  const [ipucu, setIpucu] = useState<{ n: AgDugumu; x: number; y: number } | null>(null);
  const s: AgSahnesi = useMemo(
    () => (kip === 'karar' ? kararSahnesi(son, p) : kip === 'uretim' ? uretimSahnesi(c.D, p, cx) : atolyeSahnesi(c.D, p, cx)),
    [kip, son, p, cx, c.D],
  );
  const t = zaman ?? s.at?.now ?? 0;

  const kok = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const d = useRef({
    k: ilkKamera('karar') as Kamera, raf: 0, surukle: null as { x: number; y: number; rx: number; ry: number; oynadi: boolean } | null,
    ust: null as string | null, yer: new Map<string, Konum>(), renk: null as { anah: string; R: HaritaRenkleri } | null,
  });
  const durum = useRef({ s, sec, tur, t, oto, D: c.D, p });
  durum.current = { s, sec, tur, t, oto, D: c.D, p };

  const cizBir = (): boolean => {
    const el = cv.current; const kk = kok.current; if (!el || !kk) return false;
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return true;
    const g = el.getContext('2d'); if (!g) return false;
    const x = d.current; if (!x.renk || x.renk.anah !== tema()) { const R = renkleriOku(kk); if (!R) return false; x.renk = { anah: tema(), R }; }
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const u = durum.current;
    x.yer = ciz(g, { W, H, k: x.k, R: x.renk.R, s: u.s, D: u.D, p: u.p, tur: u.tur, sec: u.sec, ust: x.ust, t: u.t, yazi: getComputedStyle(el).fontFamily || 'sans-serif' });
    return true;
  };
  const dongu = () => {
    const x = d.current; x.raf = 0;
    if (durum.current.oto && !x.surukle) { x.k.faz += 0.008; x.k.ry = x.k.ryBas + 0.5 * Math.sin(x.k.faz); }
    if (!cizBir()) return;
    if (durum.current.oto) x.raf = requestAnimationFrame(dongu);
  };
  const tetikle = () => { if (!d.current.raf && typeof requestAnimationFrame === 'function') d.current.raf = requestAnimationFrame(dongu); };
  const otoKapat = () => { if (durum.current.oto) { d.current.k.ryBas = d.current.k.ry; setOto(false); } };

  useEffect(() => { tetikle(); });
  useEffect(() => () => { if (d.current.raf) cancelAnimationFrame(d.current.raf); }, []);
  useEffect(() => {
    const el = cv.current; if (!el) return undefined;
    const tek = (e: WheelEvent) => { e.preventDefault(); const k = d.current.k; k.uz = sinirla(k.uz * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), UZ_SINIR[0], UZ_SINIR[1]); tetikle(); };
    el.addEventListener('wheel', tek, { passive: false });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => tetikle()) : null; ro?.observe(el);
    return () => { el.removeEventListener('wheel', tek); ro?.disconnect(); };
  });
  // Planı oynat: yarım saat adımlarla ileri; sona gelince durur.
  useEffect(() => {
    if (!oynat || !s.at) return undefined;
    const at = s.at;
    const id = setInterval(() => setZaman((z) => { const n = (z ?? at.now) + 0.5; if (n >= at.t1) { setOynat(false); return at.t1; } return n; }), 60);
    return () => clearInterval(id);
  }, [oynat, s.at]);

  const kipSec = (k: AgKipi) => {
    if (k === kip) return;
    d.current.k = ilkKamera(k); setKip(k); setSec(null); setTur(-1); setOynat(false); setIpucu(null);
    if (k === 'atolye') setOto(false);
  };
  const sifirla = () => { d.current.k = ilkKamera(kip); setSec(null); tetikle(); };
  const otoDegistir = () => { if (oto) otoKapat(); else { d.current.k.ryBas = d.current.k.ry; d.current.k.faz = 0; setOto(true); } };
  const turGit = (n: number) => { setTur(n); if (n >= 0) otoKapat(); };

  const nokta = (e: { clientX: number; clientY: number }): [number, number] => { const r = cv.current?.getBoundingClientRect(); return r ? [e.clientX - r.left, e.clientY - r.top] : [0, 0]; };
  const bas = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const k = d.current.k; d.current.surukle = { x: e.clientX, y: e.clientY, rx: k.rx, ry: k.ry, oynadi: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const gez = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const x = d.current; const sr = x.surukle;
    if (sr) {
      const dx = e.clientX - sr.x, dy = e.clientY - sr.y;
      if (Math.abs(dx) + Math.abs(dy) > 3 && !sr.oynadi) { sr.oynadi = true; otoKapat(); }
      if (sr.oynadi) { x.k.ry = sr.ry + dx * 0.008; x.k.rx = sinirla(sr.rx + dy * 0.008, -RX_SINIR, RX_SINIR); tetikle(); }
      return;
    }
    const [px, py] = nokta(e); const n = bul(s.N, x.yer, px, py);
    if ((n?.id ?? null) !== x.ust) { x.ust = n?.id ?? null; tetikle(); }
    setIpucu(n ? { n, x: px, y: py } : null);
  };
  const birak = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sr = d.current.surukle; d.current.surukle = null;
    if (sr && !sr.oynadi) { const [px, py] = nokta(e); const n = bul(s.N, d.current.yer, px, py); setSec(n?.id ?? null); }
    tetikle();
  };
  const ayril = () => { if (d.current.ust) { d.current.ust = null; tetikle(); } setIpucu(null); };
  const tus = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const k = d.current.k; let ok = true;
    if (e.key === 'ArrowLeft') k.ry -= 0.12; else if (e.key === 'ArrowRight') k.ry += 0.12;
    else if (e.key === 'ArrowUp') k.rx = Math.max(-RX_SINIR, k.rx - 0.12); else if (e.key === 'ArrowDown') k.rx = Math.min(RX_SINIR, k.rx + 0.12);
    else if (e.key === '+' || e.key === '=') k.uz = Math.min(UZ_SINIR[1], k.uz * 1.15); else if (e.key === '-') k.uz = Math.max(UZ_SINIR[0], k.uz / 1.15);
    else ok = false;
    if (ok) { e.preventDefault(); otoKapat(); tetikle(); }
  };

  const tahtadaGoster = (j: string) => { o.sec({ siparis: j, adim: null, tezgah: null }); o.git('plan'); };
  const tezgahiGoster = (m: string) => { o.sec({ tezgah: m, adim: null, siparis: null }); o.git('plan'); };
  const kisitlar = o.altSec ? () => o.altSec?.({ ekran: 'veri', bolum: 'kisitlar' }) : null;
  const baslik = kip === 'karar' ? 'Veriden plana: akış ağı' : kip === 'atolye' ? 'Atölye akışı' : 'Planın zaman ağı';
  const etiket = kip === 'karar' ? 'Veriden plana akış ağı: veri, kısıt, çözücü, karar ve sipariş katmanları'
    : kip === 'atolye' ? 'Atölye akışı: tezgâhlar rota sırasıyla, üstlerinde sıradaki işler' : 'Planın üç boyutlu görünümü: zaman, tezgâh ve sipariş';
  const katmanTur = kip === 'karar' ? tur : -1;

  return (
    <div className="tc-pya tc-pym-renk" ref={kok} data-kip={kip}>
      <VeriKarti baslik={baslik} simge="cube" ek="sürükle: döndür · tekerlek: yakınlaştır">
        {kip === 'atolye' && (
          <p className="tc-pyi-alt">
            Atölye akışında tezgâhlar rotadaki sırasıyla soldan sağa dizilir. Her tezgâhın üstündeki yığın sıradaki işlerdir; en alttaki ilk çalışacak olandır.
            Yaylar parçaların hangi tezgâhtan hangisine gittiğini, kalınlıkları kaç geçişin o yoldan olduğunu gösterir. Zaman çubuğunu kaydırın ya da oynatın:
            renkli noktalar tezgâhlar arasında bekleyen partilerdir.
          </p>
        )}
        <div className="tc-pya-ust">
          <div className="tc-pyi-seg" role="tablist" aria-label="Ağ görünümü">
            {AG_KIPLERI.map(([id, ad, sm]) => (
              <button key={id} type="button" role="tab" aria-selected={kip === id} aria-pressed={kip === id} onClick={() => kipSec(id)}><Simge ad={sm} boyut="k" />{ad}</button>
            ))}
          </div>
          <div className="tc-pyi-dugmeler">
            <KucukDugme ad={oto ? 'Dönmeyi durdur' : 'Kendiliğinden döndür'} simge={oto ? 'pause' : 'play'} yap={otoDegistir} />
            <KucukDugme ad="Görünümü sıfırla" simge="rotate" yap={sifirla} />
            {kip === 'karar' && <KucukDugme ad={tur < 0 ? 'Akışı adım adım göster' : 'Turu bitir'} metin={tur < 0 ? 'Akışı adım adım göster' : 'Turu bitir'} simge={tur < 0 ? 'next' : 'x'} yap={() => turGit(tur < 0 ? 0 : -1)} />}
          </div>
        </div>
        {kip === 'atolye' && s.at && (
          <div className="tc-pya-zaman">
            <KucukDugme ad={oynat ? 'Durdur' : 'Planı oynat'} simge={oynat ? 'pause' : 'play'} yap={() => {
              if (!oynat && s.at && (zaman == null || zaman >= s.at.t1)) setZaman(s.at.now);
              if (!oynat) otoKapat(); setOynat(!oynat);
            }} />
            <input type="range" min={s.at.now} max={s.at.t1} step={0.25} value={t} aria-label="Plan saati" onChange={(e) => setZaman(Number(e.target.value))} />
            <span className="tc-pyi-k" role="status">{atolyeOzeti(c.D, s, t)}</span>
          </div>
        )}
        {kip === 'karar' && tur >= 0 && (
          <div className="tc-pya-tur" role="status">
            <span className="tc-pyh-mono">{`${tur + 1} / ${AG_KATMAN.length}`}</span>
            <b>{AG_KATMAN[tur]?.[1]}</b>
            <div className="tc-pyi-dugmeler">
              <KucukDugme ad="Önceki adım" simge="chev-left" yap={() => turGit(Math.max(0, tur - 1))} />
              <KucukDugme ad="Sonraki adım" simge="chev-right" yap={() => turGit(Math.min(AG_KATMAN.length - 1, tur + 1))} />
            </div>
            <p>{AG_KATMAN[tur]?.[2]}</p>
          </div>
        )}
        {s.bos ? <p className="tc-pyi-alt">Plan yok. Önce bir plan çözün.</p> : (
          <div className="tc-pya-kap">
            {kip === 'karar' && (
              <div className="tc-pya-katmanlar" aria-hidden="true">
                {AG_KATMAN.map(([id, ad], i) => <span key={id} data-etkin={katmanTur < 0 || katmanTur === i}>{ad}</span>)}
              </div>
            )}
            <div className="tc-pya-tuval">
              <canvas
                ref={cv} tabIndex={0} role="img" aria-label={`${etiket}. Sürükleyerek döndürün, tekerlekle yakınlaştırın; ok tuşları ve artı eksi da çalışır.`}
                onPointerDown={bas} onPointerMove={gez} onPointerUp={birak} onPointerCancel={() => { d.current.surukle = null; }} onPointerLeave={ayril} onKeyDown={tus}
              />
              {ipucu && !d.current.surukle && (
                <div className="tc-pya-ipucu" ref={degisken({ '--x': `${ipucu.x}px`, '--y': `${ipucu.y}px` })}>
                  <b>{ipucu.n.ad}</b><span>{ipucu.n.alt}</span>
                </div>
              )}
            </div>
            <aside className="tc-pya-detay" aria-label="Seçili düğüm">
              <Detay s={s} kip={kip} sec={sec} setSec={setSec} t={t} c={c} cx={cx} tahtadaGoster={tahtadaGoster} tezgahiGoster={tezgahiGoster}
                kisitlar={kisitlar} />
            </aside>
          </div>
        )}
        <Lejant kip={kip} s={s} />
      </VeriKarti>
    </div>
  );
}

function Detay({ s, kip, sec, setSec, t, c, cx, tahtadaGoster, tezgahiGoster, kisitlar }: {
  s: AgSahnesi; kip: AgKipi; sec: string | null; setSec: (id: string | null) => void; t: number; c: PlanlamaCalismasi; cx: ReturnType<typeof derle>;
  tahtadaGoster: (j: string) => void; tezgahiGoster: (m: string) => void; kisitlar: (() => void) | null;
}) {
  const n = sec ? s.ix[sec] : undefined;
  const kaldir = <KucukDugme ad="Seçimi kaldır" metin="Seçimi kaldır" simge="x" yap={() => setSec(null)} />;
  if (s.at) {
    if (!n) return <p className="tc-pyi-k">Bir tezgâha tıklayın: şu an ne çalıştığı ve sıradaki işler burada listelenir.</p>;
    const l = tezgahListesi(s.at, n.m ?? '', t);
    return (
      <div className="tc-pya-sec">
        <span className="tc-pyi-k">{n.tur === 'fason' ? 'Fason' : 'Tezgâh'}</span><b>{n.ad}</b><p className="tc-pyi-k">{n.alt}</p>
        {l.length ? (
          <ol className="tc-pya-liste">
            {l.map((r) => (
              <li key={r.id}>
                <span className="tc-pyh-mono">{saatYaz(c.D, r.S).slice(6)}</span> <b className="tc-pyh-mono">{r.job}</b> {cx.byId[r.id]?.ad ?? r.id}
                {r.S <= t && <> <Rozet ton="tamam">şimdi</Rozet></>}
              </li>
            ))}
          </ol>
        ) : <p className="tc-pyi-k">Bu saatten sonra iş yok.</p>}
        <div className="tc-pyi-dugmeler">
          {n.tur !== 'fason' && n.m && <KucukDugme ad="Tahtada göster" metin="Tahtada göster" simge="gantt" yap={() => tezgahiGoster(n.m ?? '')} />}
          {kaldir}
        </div>
      </div>
    );
  }
  if (!n) return <p className="tc-pyi-k">{kip === 'karar' ? 'Bir düğüme tıklayın: neye bağlı olduğu ve neyi etkilediği burada listelenir.' : 'Bir işleme tıklayın: tezgâhı, saati ve rota bağları burada listelenir.'}</p>;
  const { gel, git } = baglar(s, n.id);
  const liste = (b: string, l: AgDugumu[]) => (l.length ? (
    <div className="tc-pya-bag">
      <span className="tc-pyi-k">{`${b} (${l.length})`}</span>
      <div>
        {l.slice(0, 16).map((x) => <button key={x.id} type="button" className="tc-pyh-fis" onClick={() => setSec(x.id)}>{x.ad}</button>)}
        {l.length > 16 && <span className="tc-pyi-k">{`+${l.length - 16}`}</span>}
      </div>
    </div>
  ) : null);
  const j = n.id.startsWith('s:') ? n.id.slice(2) : n.id.startsWith('o:') ? n.job ?? null : null;
  return (
    <div className="tc-pya-sec">
      <span className="tc-pyi-k">{kip === 'karar' ? AG_KATMAN[n.katman]?.[1] : 'İşlem'}</span><b>{n.ad}</b><p className="tc-pyi-k">{n.alt}</p>
      {liste(kip === 'karar' ? 'Beslendiği' : 'Önceki işlem', gel)}
      {liste(kip === 'karar' ? 'Etkilediği' : 'Sonraki işlem', git)}
      <div className="tc-pyi-dugmeler">
        {j && <KucukDugme ad="Tahtada göster" metin="Tahtada göster" simge="gantt" yap={() => tahtadaGoster(j)} />}
        {n.id.startsWith('k:') && kisitlar && <KucukDugme ad="Kısıtlar" metin="Kısıtlar" simge="target" yap={kisitlar} />}
        {kaldir}
      </div>
    </div>
  );
}

function Lejant({ kip, s }: { kip: AgKipi; s: AgSahnesi }) {
  if (kip === 'karar') {
    return (
      <div className="tc-pyh-lejant tc-pya-lejant">
        <span><i data-tur="veri" />Veri</span><span><i data-tur="kisit" />Kısıt</span><span><i data-tur="cozucu" />Çözücü</span>
        <span><i data-tur="azal" />Alınan karar</span><span><i data-tur="aday" />Alınmayan</span><span><i data-tur="art" />Geciken sipariş</span>
        <span><i data-tur="zaman" />Zamanında</span><span className="tc-pyh-k">Kalın çizgi: kısıt o çözücüde tam; ince: yaklaşık ya da gevşek.</span>
      </div>
    );
  }
  if (kip === 'atolye') {
    return (
      <div className="tc-pyh-lejant tc-pya-lejant">
        <span><i data-tur="tezgah" />Tezgâh</span><span><i data-tur="calisiyor" />Çalışıyor</span><span><i data-tur="ayarda" />Ayarda</span>
        <span><i data-tur="bos" />Boş</span><span><i data-tur="gec" />Geciken sipariş</span>
        <span className="tc-pyh-k">Yığın: sıradaki işler · yay: parça akışı · nokta: yoldaki parti</span>
      </div>
    );
  }
  return (
    <div className="tc-pyh-lejant tc-pya-lejant">
      <span className="tc-pyh-k">
        {`Yatay eksen zaman, yükseklik tezgâh, derinlik sipariş; renk siparişi, ince çizgi rota bağını gösterir.${s.say ? ` ${s.say.is} işlem, ${s.say.tez} tezgâh, ${s.say.sip} sipariş.` : ''}`}
      </span>
    </div>
  );
}
