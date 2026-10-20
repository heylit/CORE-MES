import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DurumKutusu, Dugme } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import {
  calismaOrani, canliAni, cerceveKur, etiketleriYerlestir, ekranda, gecisler, gecmisAni, gunBasi, ikizKaydi, ikizPlani, isabet, nesneKutusu, saatDakika,
} from './ikiz.ts';
import type { Cerceve, Gecis, IkizDurumu, IkizNesnesi, IkizPlani, NesneAni } from './ikiz.ts';
import type { NesneCanli } from './kurallar.ts';
import { sayiMetni } from './kurallar.ts';
import { IKIZ_OLAY_SAYISI, useIkizOlaylari } from './veri.ts';

// Dijital ikiz: fabrika planının düz çizimi; nesneler seçilen andaki durum renginde. Zaman makinesi günün başından şimdiye
// kaydırılır; "Canlı" haritanın canlı okumasına döner. Çizim tuvaldedir; renkler tasarım değişkenlerinden okunur.

// Parçanın bir nesneden öbürüne geçişi bu süre boyunca akar (geçiş anından geriye).
const AKIS_PENCERESI_MS = 2 * 60 * 60 * 1000;
const SIMDI_ARALIK_MS = 30_000;
const DAKIKA = 60_000;

const DURUM_DEGISKENI: Record<IkizDurumu, string> = {
  calisiyor: '--run', durakli: '--hold', durdu: '--stop', ayar: '--hazard', sirada: '--idle', bitti: '--done', bilinmiyor: '--faint',
};
const RENKLER = ['--run', '--hold', '--stop', '--hazard', '--idle', '--done', '--faint', '--ink', '--muted', '--edge', '--edge2', '--panel-solid', '--plan-zemin'] as const;
type RenkAdi = (typeof RENKLER)[number];

interface Palet {
  renk: (ad: RenkAdi) => string;
  yazi: string;
  yaziBoy: number;
}

// Değişken yoksa (test ortamı, tema yüklenmeden) nötr gri; renk değeri uydurulmaz.
function paletOku(el: Element): Palet {
  const stil = getComputedStyle(el);
  const tablo = new Map(RENKLER.map((ad) => [ad, stil.getPropertyValue(ad).trim() || 'gray']));
  const boy = Number.parseFloat(stil.getPropertyValue('--yazi-xs')) || 12;
  return { renk: (ad) => tablo.get(ad) ?? 'gray', yazi: stil.getPropertyValue('--font-mono').trim() || 'monospace', yaziBoy: boy };
}

// Hareketi azaltma tercihi ya da kabuğun "sade" hareket ayarı ortam animasyonunu (dönen mil, akan parça) durdurur.
function hareketliMi(): boolean {
  const azalt = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !azalt && !['sade', 'kapali'].includes(document.documentElement.dataset.hareket ?? '');
}

function useHareketli(): boolean {
  const [deger, degerYaz] = useState(hareketliMi);
  useEffect(() => {
    const guncelle = () => degerYaz(hareketliMi());
    const sorgu = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    sorgu?.addEventListener?.('change', guncelle);
    const gozcu = new MutationObserver(guncelle);
    gozcu.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hareket'] });
    return () => { sorgu?.removeEventListener?.('change', guncelle); gozcu.disconnect(); };
  }, []);
  return deger;
}

interface CizimVerisi {
  plan: IkizPlani;
  anlar: ReadonlyMap<string, NesneAni>;
  oranlar: ReadonlyMap<string, number | null> | null;
  akanlar: readonly Gecis[];
  // Geçiş kaydı yokken parçanın gösterildiği nesneler: başlamış emri olanlar.
  yerinde: readonly string[];
  yollar: readonly Gecis[];
  uzerinde: string | null;
  hareketli: boolean;
}

const yolAnahtari = (g: Gecis) => `${g.kaynak}>${g.hedef}`;
const yumusak = (f: number) => (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2);

function ciz(x: CanvasRenderingContext2D, W: number, H: number, an: number, v: CizimVerisi, p: Palet, donus: Map<string, number>, adim: number): Cerceve {
  const pay = p.yaziBoy * 2.6;
  const c = cerceveKur(v.plan.kutu, W, H, pay, p.yaziBoy * 5);
  const enAz = p.yaziBoy * 2.2;
  const merkez = new Map(v.plan.nesneler.map((n) => [n.anahtar, ekranda(c, n)]));
  x.clearRect(0, 0, W, H);
  x.font = `700 ${p.yaziBoy}px ${p.yazi}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';

  // Bölümler ve harfli ızgara
  for (const b of v.plan.bolumler) {
    x.beginPath();
    b.koseler.forEach((k, i) => { const e = ekranda(c, k); if (i === 0) x.moveTo(e.x, e.y); else x.lineTo(e.x, e.y); });
    x.closePath();
    x.fillStyle = p.renk('--plan-zemin');
    x.fill();
    x.strokeStyle = p.renk('--edge2');
    x.lineWidth = 1.5;
    x.stroke();
    x.strokeStyle = p.renk('--edge');
    x.lineWidth = 1;
    for (const [a, z] of b.cizgiler) {
      const ea = ekranda(c, a);
      const ez = ekranda(c, z);
      x.beginPath(); x.moveTo(ea.x, ea.y); x.lineTo(ez.x, ez.y); x.stroke();
    }
    x.fillStyle = p.renk('--muted');
    for (const e of b.etiketler) { const s = ekranda(c, e.p); x.fillText(e.metin, s.x, s.y); }
  }

  // Bugünkü geçiş yolları
  x.setLineDash([3, 6]);
  x.strokeStyle = p.renk('--edge2');
  x.lineWidth = 2;
  for (const g of v.yollar) {
    const a = merkez.get(g.kaynak);
    const b = merkez.get(g.hedef);
    if (!a || !b) continue;
    x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
  }
  x.setLineDash([]);

  // Nesneler
  for (const n of v.plan.nesneler) {
    const ani = v.anlar.get(n.anahtar);
    const durum = ani?.durum ?? 'bilinmiyor';
    const rk = p.renk(DURUM_DEGISKENI[durum] as RenkAdi);
    const k = nesneKutusu(c, n, enAz);
    const oran = v.oranlar?.get(n.anahtar);
    if (oran !== undefined && oran !== null) {
      x.globalAlpha = 0.28;
      x.fillStyle = p.renk(oran >= 0.7 ? '--run' : oran >= 0.4 ? '--hold' : '--stop');
      x.beginPath(); x.arc(k.x, k.y, Math.max(k.g, k.d) * 0.8, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1;
    }
    x.save();
    x.translate(k.x, k.y);
    x.rotate((n.donus * Math.PI) / 180);
    x.shadowColor = rk;
    x.shadowBlur = durum === 'durdu' ? (v.hareketli ? 18 + Math.sin(an / 150) * 10 : 22) : durum === 'sirada' || durum === 'bilinmiyor' ? 0 : 14;
    x.fillStyle = p.renk('--panel-solid');
    x.strokeStyle = rk;
    x.lineWidth = v.uzerinde === n.anahtar ? 3 : 2;
    x.beginPath(); x.roundRect(-k.g / 2, -k.d / 2, k.g, k.d, Math.min(8, k.g / 4, k.d / 4)); x.fill(); x.stroke();
    x.shadowBlur = 0;
    // İş mili: çalışırken hızlı, hazırlıkta yavaş döner; başka durumda durur.
    const r0 = Math.min(k.g, k.d) * 0.22;
    if (r0 >= 4) {
      const hiz = durum === 'calisiyor' ? 0.012 : durum === 'ayar' ? 0.003 : 0;
      const aci = (donus.get(n.anahtar) ?? 0) + (v.hareketli ? hiz * adim : 0);
      donus.set(n.anahtar, aci);
      const mx = -k.g / 2 + r0 + 4;
      x.lineWidth = 2;
      x.beginPath(); x.arc(mx, 0, r0, 0, Math.PI * 2); x.stroke();
      for (let i = 0; i < 3; i++) {
        const a = aci + i * 2.094;
        x.beginPath(); x.moveTo(mx, 0); x.lineTo(mx + Math.cos(a) * r0, Math.sin(a) * r0); x.stroke();
      }
    }
    x.restore();
    // Durum yazısı yalnız kutuya sığıyorsa kutunun içinde.
    if (ani && k.d >= p.yaziBoy * 2 && x.measureText(ani.metin).width <= k.g - 8) {
      x.fillStyle = p.renk('--muted');
      x.fillText(ani.metin, k.x, k.y);
    }
  }

  // Adlar kutunun altında; çakışan ad yazılmaz (ipucunda görünür). Okunsun diye altında zemin rengi plaka.
  const adaylar = v.plan.nesneler.map((n) => ({
    anahtar: n.anahtar, genislik: x.measureText(n.kod).width + 8, kutu: nesneKutusu(c, n, enAz), zorunlu: v.uzerinde === n.anahtar,
  }));
  const yerler = etiketleriYerlestir(adaylar, p.yaziBoy);
  for (const n of v.plan.nesneler) {
    const yer = yerler.get(n.anahtar);
    if (!yer) continue;
    const g = x.measureText(n.kod).width + 8;
    x.fillStyle = p.renk('--panel-solid');
    x.globalAlpha = 0.85;
    x.fillRect(yer.x - g / 2, yer.y - p.yaziBoy * 0.65, g, p.yaziBoy * 1.3);
    x.globalAlpha = 1;
    x.fillStyle = p.renk('--ink');
    x.fillText(n.kod, yer.x, yer.y);
  }

  // Parçalar: geçişte olan emir kaynaktan hedefe akar; hareket yoksa yolun ortasında durur.
  const parca = p.renk('--hazard');
  const kare = Math.max(5, p.yaziBoy * 0.55);
  v.akanlar.forEach((g, i) => {
    const a = merkez.get(g.kaynak);
    const b = merkez.get(g.hedef);
    if (!a || !b) return;
    const f = v.hareketli ? (an / 2400 + i * 0.37) % 1 : 0.5;
    for (let iz = 5; iz >= 0; iz--) {
      const e = yumusak(Math.max(0, f - iz * 0.03));
      x.globalAlpha = iz === 0 ? 1 : (1 - iz / 6) * 0.45;
      x.fillStyle = parca;
      const s = iz === 0 ? kare : kare * 0.6;
      x.fillRect(a.x + (b.x - a.x) * e - s / 2, a.y + (b.y - a.y) * e - s / 2, s, s);
      if (!v.hareketli) break;
    }
    x.globalAlpha = 1;
  });
  for (const anahtar of v.yerinde) {
    const n = v.plan.nesneler.find((o) => o.anahtar === anahtar);
    if (!n) continue;
    const k = nesneKutusu(c, n, enAz);
    x.globalAlpha = v.hareketli ? 0.65 + Math.sin(an / 400) * 0.35 : 1;
    x.fillStyle = parca;
    x.fillRect(k.x + k.g / 2 - kare / 2, k.y - k.d / 2 - kare / 2, kare, kare);
  }
  x.globalAlpha = 1;
  return c;
}

interface Ozellikler {
  bolumler: readonly YerlesimCevabi[];
  fabrika: boolean;
  baslik: string;
  canli: ReadonlyMap<string, NesneCanli>;
  tumEmirler: readonly Emir[] | null;
}

export function DijitalIkiz({ bolumler, fabrika, baslik, canli, tumEmirler }: Ozellikler) {
  const plan = useMemo(() => ikizPlani(bolumler, fabrika), [bolumler, fabrika]);
  const olaylar = useIkizOlaylari(true);
  const kayit = useMemo(() => ikizKaydi(olaylar.data, IKIZ_OLAY_SAYISI), [olaylar.data]);
  const [simdi, simdiYaz] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => simdiYaz(Date.now()), SIMDI_ARALIK_MS);
    return () => clearInterval(z);
  }, []);
  const [canliMi, canliMiYaz] = useState(true);
  const [secilen, secilenYaz] = useState(simdi);
  const [isi, isiYaz] = useState(false);
  const [uzerinde, uzerindeYaz] = useState<string | null>(null);
  const hareketli = useHareketli();
  const bas = gunBasi(simdi);
  const t = canliMi ? simdi : Math.min(Math.max(secilen, bas), simdi);

  const anlar = useMemo(() => new Map((plan?.nesneler ?? []).map((n) => [
    n.anahtar, canliMi ? canliAni(bolumler, n, canli.get(n.anahtar), tumEmirler, t) : gecmisAni(bolumler, n, kayit, tumEmirler, t),
  ] as const)), [plan, bolumler, canliMi, canli, tumEmirler, kayit, t]);
  const oranlar = useMemo(
    () => (isi ? new Map((plan?.nesneler ?? []).map((n) => [n.anahtar, calismaOrani(bolumler, n.anahtar, kayit, bas, t)] as const)) : null),
    [isi, plan, bolumler, kayit, bas, t],
  );
  const tumGecisler = useMemo(() => gecisler(bolumler, kayit), [bolumler, kayit]);
  const akanlar = useMemo(() => tumGecisler.filter((g) => g.zaman <= t && g.zaman > t - AKIS_PENCERESI_MS), [tumGecisler, t]);
  const yollar = useMemo(() => {
    const tekil = new Map<string, Gecis>();
    for (const g of tumGecisler) if (g.zaman >= bas && g.zaman <= t) tekil.set(yolAnahtari(g), g);
    return [...tekil.values()];
  }, [tumGecisler, bas, t]);
  const sayilar = useMemo(() => {
    let calisan = 0;
    let duran = 0;
    for (const a of anlar.values()) { if (a.durum === 'calisiyor') calisan += 1; if (a.durum === 'durdu') duran += 1; }
    const biten = tumEmirler === null ? null : tumEmirler.filter((e) => { const b = e.bitis === null ? null : Date.parse(e.bitis); return b !== null && b >= bas && b <= t; }).length;
    return { calisan, duran, biten };
  }, [anlar, tumEmirler, bas, t]);

  const tuval = useRef<HTMLCanvasElement>(null);
  const ipucu = useRef<HTMLDivElement>(null);
  const veri = useRef<CizimVerisi | null>(null);
  const cerceve = useRef<Cerceve | null>(null);
  const enAzRef = useRef(24);
  const imlecKonumu = useRef({ x: 0, y: 0 });
  // Konum CSS değişkeniyle verilir; satır içi stil yazılmaz, sınıf yerleştirir.
  const ipucuYerlestir = () => {
    const el = ipucu.current;
    if (!el) return;
    el.style.setProperty('--x', `${Math.round(imlecKonumu.current.x)}px`);
    el.style.setProperty('--y', `${Math.round(imlecKonumu.current.y)}px`);
  };
  useLayoutEffect(ipucuYerlestir, [uzerinde]);
  // Geçiş kaydı yetmezse parça yalnız başlamış emrin bulunduğu nesnede gösterilir (akış çizilmez).
  const yerinde = useMemo(
    () => (akanlar.length > 0 ? [] : [...anlar].filter(([, a]) => a.emirNo !== null && a.durum !== 'sirada').map(([k]) => k)),
    [akanlar, anlar],
  );
  veri.current = plan ? { plan, anlar, oranlar, akanlar, yerinde, yollar, uzerinde, hareketli } : null;

  // Hareket varken her karede, yoksa yalnız veri değişince çizilir.
  useEffect(() => {
    const el = tuval.current;
    const x = el?.getContext('2d') ?? null;
    if (!el || !x) return;
    const donus = new Map<string, number>();
    let palet = paletOku(el);
    let paletAni = performance.now();
    let son = performance.now();
    let kare = 0;
    const tek = (an: number) => {
      const v = veri.current;
      if (!v) return;
      if (an - paletAni > 1000) { palet = paletOku(el); paletAni = an; }
      const r = el.getBoundingClientRect();
      const oran = window.devicePixelRatio || 1;
      const W = Math.max(r.width, 1);
      const H = Math.max(r.height, 1);
      if (el.width !== Math.round(W * oran) || el.height !== Math.round(H * oran)) { el.width = Math.round(W * oran); el.height = Math.round(H * oran); }
      x.setTransform(oran, 0, 0, oran, 0, 0);
      enAzRef.current = palet.yaziBoy * 2.2;
      cerceve.current = ciz(x, W, H, an, v, palet, donus, Math.min(64, an - son));
      son = an;
    };
    if (!hareketli) { tek(performance.now()); return; }
    const dongu = (an: number) => { tek(an); kare = requestAnimationFrame(dongu); };
    kare = requestAnimationFrame(dongu);
    return () => cancelAnimationFrame(kare);
  }, [hareketli, plan, anlar, oranlar, akanlar, yerinde, yollar, uzerinde]);

  const imlec = (o: PointerEvent<HTMLCanvasElement>) => {
    const c = cerceve.current;
    const el = tuval.current;
    if (!c || !el || !plan) return;
    const r = el.getBoundingClientRect();
    const px = o.clientX - r.left;
    const py = o.clientY - r.top;
    const n = isabet(c, plan.nesneler, enAzRef.current, px, py);
    imlecKonumu.current = { x: px, y: py };
    uzerindeYaz(n?.anahtar ?? null);
    ipucuYerlestir();
  };

  if (!plan || plan.nesneler.length === 0) {
    return <DurumKutusu durum="bos" mesaj="Haritada makine ya da istasyon yok; dijital ikiz çizilecek nesne bulamadı." />;
  }

  const hedef: IkizNesnesi | undefined = uzerinde === null ? undefined : plan.nesneler.find((n) => n.anahtar === uzerinde);
  const hedefAni = hedef ? anlar.get(hedef.anahtar) : undefined;
  const dakika = Math.round((t - bas) / DAKIKA);
  const sonDakika = Math.max(Math.round((simdi - bas) / DAKIKA), 0);
  const kapsamDisi = !canliMi && kayit.kapsamBasi !== null && t < kayit.kapsamBasi;
  const yerindeGosterim = akanlar.length === 0;

  return (
    <div className="tc-ikiz" data-hareket={hareketli ? undefined : 'yok'}>
      <div className="tc-ikiz-sahne">
        <canvas
          ref={tuval}
          className="tc-ikiz-tuval"
          role="img"
          aria-label={`Dijital ikiz · ${baslik} · ${saatDakika(t)}`}
          onPointerMove={imlec}
          onPointerLeave={() => uzerindeYaz(null)}
        />
        <div className="tc-ikiz-ust">
          <div className="tc-ikiz-rozetler">
            <span className="tc-ikiz-rz">Dijital ikiz · {baslik}</span>
            <span className="tc-ikiz-rz">Çalışan <b>{sayiMetni(sayilar.calisan)}</b></span>
            <span className="tc-ikiz-rz">Duran <b>{sayiMetni(sayilar.duran)}</b></span>
            <span className="tc-ikiz-rz">Bugün biten <b>{sayilar.biten === null ? '—' : sayiMetni(sayilar.biten)}</b></span>
          </div>
          <Dugme simge="target" aria-pressed={isi} onClick={() => isiYaz((v) => !v)}>Isı haritası</Dugme>
        </div>
        {hedef && hedefAni && (
          <div ref={ipucu} className="tc-ikiz-ipucu" role="tooltip">
            <b>{hedef.kod} · {hedef.ad}</b>
            <span className="tc-ikiz-ipucu-durum" data-durum={hedefAni.durum}>{hedefAni.metin}</span>
            <span className="mono">{hedefAni.emirNo ? `Emir ${hedefAni.emirNo}${hedefAni.op ? ` · ${hedefAni.op}` : ''}` : 'İş yok'}</span>
            {hedefAni.neden && <span className="mono">{hedefAni.neden}</span>}
            <span className="mono">Hücre {hedef.bolumKod}·{hedef.hucre} · kuyruk {hedefAni.kuyruk === null ? '—' : sayiMetni(hedefAni.kuyruk)}</span>
            {isi && <span className="mono">Çalışma payı {(() => { const o = oranlar?.get(hedef.anahtar); return o === null || o === undefined ? '—' : `%${Math.round(o * 100)}`; })()}</span>}
          </div>
        )}
      </div>
      <div className="tc-ikiz-alt">
        <span className="tc-ikiz-saat mono">{saatDakika(t)}</span>
        <input
          type="range"
          className="tc-ikiz-zaman"
          min={0}
          max={sonDakika}
          step={1}
          value={Math.min(dakika, sonDakika)}
          aria-label="Zaman makinesi: günü geri sar"
          aria-valuetext={saatDakika(t)}
          onChange={(o) => { secilenYaz(bas + Number(o.target.value) * DAKIKA); canliMiYaz(false); }}
        />
        <Dugme simge="play" aria-pressed={canliMi} onClick={() => { if (!canliMi) { simdiYaz(Date.now()); canliMiYaz(true); } else { secilenYaz(simdi); canliMiYaz(false); } }}>Canlı</Dugme>
        <span className="tc-atolye-ipucu">Zaman makinesi: kaydırarak günü geri sarın. Makinelerin üstüne gelince iş görünür.</span>
      </div>
      <div className="tc-ikiz-notlar" role="status">
        {olaylar.isError && <p className="tc-atolye-ipucu">{hataIletisi(olaylar.error, 'Olay defteri okunamadı')}: geçmişte yalnız emrin başlama ve bitiş damgası görünür.</p>}
        {kapsamDisi && <p className="tc-atolye-ipucu">Bu saatin olay kaydı elde değil (son {IKIZ_OLAY_SAYISI} olay); çalışma durumu bilinmiyor.</p>}
        {yerindeGosterim && <p className="tc-atolye-ipucu">Son iki saatte istasyonlar arası geçiş kaydı yok: parçalar yalnız başlamış emrin bulunduğu makinede gösterilir.</p>}
      </div>
    </div>
  );
}
