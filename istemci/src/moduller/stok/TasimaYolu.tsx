import { useLayoutEffect, useRef } from 'react';
import type { TeslimKutusuCevabi, TeslimYeri } from '#paylasilan/sozlesme/stok.ts';
import { usePerformans } from '../../ortak/veri/gorunum.ts';

type Zemin = NonNullable<TeslimKutusuCevabi['zemin']>;
type Nokta = { x: number; y: number };
export type Yol = { bolum: Zemin['bolumler'][number]; kaynakHucre: string; hedefHucre: string; a: Nokta; b: Nokta; d: string; uzunluk: number; nokta: (oran: number) => Nokta };

// Bir kare çizimde 10 birimdir; harf ve numara şeridi bir kare yer tutar.
const KARE = 10;
const UCUS_MS = 900;
const HALKA_MS = 500;

function yerKaresi(z: Zemin, y: TeslimYeri): { salonId: number; hucre: string } | null {
  return ('istasyonId' in y ? z.istasyonlar.find((i) => i.istasyonId === y.istasyonId) : z.konumlar.find((k) => k.konumId === y.konumId)) ?? null;
}

function merkez(b: Zemin['bolumler'][number], hucre: string): Nokta | null {
  const p = /^([A-Z]+)([0-9]+)$/.exec(hucre);
  const i = p ? b.sutunlar.indexOf(p[1]!) : -1, j = p ? b.satirlar.indexOf(p[2]!) : -1;
  return i < 0 || j < 0 ? null : { x: KARE * (i + 1.5), y: KARE * (j + 1.5) };
}

// Kaynaktan hedefe L biçimli yol: önce satır arası koridora iner, yan geçer, hedefe çıkar. İki yer aynı bölümde, karesi
// bilinen yerlerse vardır; ayrı bölümde ya da haritada yoksa yol çizilmez.
export function tasimaYolu(z: Zemin | null, kaynak: TeslimYeri | null, hedef: TeslimYeri | null): Yol | null {
  if (!z || !kaynak || !hedef) return null;
  const k = yerKaresi(z, kaynak), h = yerKaresi(z, hedef);
  if (!k || !h || k.salonId !== h.salonId || k.hucre === h.hucre) return null;
  const bolum = z.bolumler.find((b) => b.salonId === k.salonId);
  const a = bolum ? merkez(bolum, k.hucre) : null, b = bolum ? merkez(bolum, h.hucre) : null;
  if (!bolum || !a || !b) return null;
  const orta = (a.y + b.y) / 2;
  const kose = [a, { x: a.x, y: orta }, { x: b.x, y: orta }, b];
  const parca = kose.slice(1).map((n, i) => Math.abs(n.x - kose[i]!.x) + Math.abs(n.y - kose[i]!.y));
  const uzunluk = parca.reduce((t, x) => t + x, 0);
  const nokta = (oran: number): Nokta => {
    let kalan = Math.min(1, Math.max(0, oran)) * uzunluk;
    for (let i = 0; i < parca.length; i += 1) {
      const p = kose[i]!, q = kose[i + 1]!, l = parca[i]!;
      if (kalan <= l || i === parca.length - 1) { const t = l === 0 ? 1 : kalan / l; return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }
      kalan -= l;
    }
    return b;
  };
  return { bolum, kaynakHucre: k.hucre, hedefHucre: h.hucre, a, b, d: `M ${a.x} ${a.y} L ${a.x} ${orta} L ${b.x} ${orta} L ${b.x} ${b.y}`, uzunluk, nokta };
}

const yumusak = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function hareketsiz(performans: boolean): boolean {
  if (performans) return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function carpan(): number {
  const c = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hareket-carpan'));
  return Number.isFinite(c) && c > 0 ? c : 1;
}

// Taşıma yolu (kart #1304): malzeme kaynak karesinden kalkar, yol çizilerek hedefe uçar ve iner; varışta halka yayılır.
// Bağlanınca bir kez oynar; çağıran yeniden oynatmak için anahtarı değiştirir. Performans modunda ve işletim sisteminde
// hareket azaltılmışsa yalnız son hâl çizilir. Süre Sistem Ayarları'ndaki geçiş hızıyla ölçeklenir.
export function TasimaYolu({ yol, kaynakAd, hedefAd, etiket }: { yol: Yol; kaynakAd: string; hedefAd: string; etiket: string }) {
  const [performans] = usePerformans();
  const cizgi = useRef<SVGPathElement>(null), paket = useRef<SVGGElement>(null), halka = useRef<SVGCircleElement>(null), hedef = useRef<SVGGElement>(null);
  const { bolum, a, b, uzunluk } = yol;
  // Çizimden önce ilk kare yazılır: yol bir an tam görünüp sonra silinmez.
  useLayoutEffect(() => {
    const yaz = (oran: number, kalk: number) => {
      const n = yol.nokta(oran);
      cizgi.current?.setAttribute('stroke-dasharray', `${oran * uzunluk} ${uzunluk}`);
      paket.current?.setAttribute('transform', `translate(${n.x} ${n.y}) scale(${1 + 0.45 * kalk}) rotate(${12 * kalk})`);
    };
    const vardi = () => hedef.current?.classList.add('tc-stok-yol-vardi');
    if (hareketsiz(performans)) { yaz(1, 0); vardi(); return undefined; }
    const ucus = UCUS_MS * carpan(), dalga = HALKA_MS * carpan();
    let bas: number | null = null, kare = 0;
    yaz(0, 0);
    const adim = (an: number) => {
      bas ??= an;
      const f = Math.min(1, (an - bas) / ucus);
      yaz(yumusak(f), Math.sin(f * Math.PI));
      if (f >= 1) {
        vardi();
        const g = Math.min(1, (an - bas - ucus) / dalga);
        halka.current?.setAttribute('r', String(4 * KARE * g));
        halka.current?.setAttribute('opacity', String(1 - g));
        if (g >= 1) return;
      }
      kare = requestAnimationFrame(adim);
    };
    kare = requestAnimationFrame(adim);
    return () => cancelAnimationFrame(kare);
  }, [yol, uzunluk, performans]);
  const gen = KARE * (bolum.sutunlar.length + 1), yuk = KARE * (bolum.satirlar.length + 1);
  return (
    <figure className="tc-stok-yol">
      <svg viewBox={`0 0 ${gen + KARE} ${yuk + KARE}`} role="img" aria-label={`${bolum.kod} ${yol.kaynakHucre} karesinden ${yol.hedefHucre} karesine taşıma yolu`}>
        <g className="tc-stok-yol-izgara">
          {bolum.sutunlar.map((s, i) => <text key={s} x={KARE * (i + 1.5)} y={KARE * 0.7}>{s}</text>)}
          {bolum.satirlar.map((s, j) => <text key={s} x={KARE * 0.5} y={KARE * (j + 1.7)}>{s}</text>)}
          {Array.from({ length: bolum.sutunlar.length + 1 }, (_, i) => <line key={`d${i}`} x1={KARE * (i + 1)} y1={KARE} x2={KARE * (i + 1)} y2={yuk} />)}
          {Array.from({ length: bolum.satirlar.length + 1 }, (_, j) => <line key={`y${j}`} x1={KARE} y1={KARE * (j + 1)} x2={gen} y2={KARE * (j + 1)} />)}
        </g>
        <g className="tc-stok-yol-yer"><rect x={a.x - KARE * 0.4} y={a.y - KARE * 0.4} width={KARE * 0.8} height={KARE * 0.8} /><text x={a.x} y={a.y + KARE * 0.15}>{yol.kaynakHucre}</text></g>
        <g ref={hedef} className="tc-stok-yol-yer tc-stok-yol-hedef"><rect x={b.x - KARE * 0.4} y={b.y - KARE * 0.4} width={KARE * 0.8} height={KARE * 0.8} /><text x={b.x} y={b.y + KARE * 0.15}>{yol.hedefHucre}</text></g>
        <path ref={cizgi} className="tc-stok-yol-cizgi" d={yol.d} />
        <circle ref={halka} className="tc-stok-yol-halka" cx={b.x} cy={b.y} r={0} opacity={0} />
        <g ref={paket} className="tc-stok-yol-paket"><rect x={-KARE * 0.25} y={-KARE * 0.25} width={KARE * 0.5} height={KARE * 0.5} /></g>
      </svg>
      <figcaption className="tc-stok-not">{kaynakAd} ({yol.kaynakHucre}) → {hedefAd} ({yol.hedefHucre}) · {etiket}</figcaption>
    </figure>
  );
}
