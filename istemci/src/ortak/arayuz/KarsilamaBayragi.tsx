import { useEffect, useRef } from 'react';

// Kart 2232 (kullanıcı kararı): milli bayramlarda güneşin, gecede ayın yerinde gönderi olmadan dalgalanan Türk bayrağı.
// Ölçüler Türk Bayrağı Kanunu oranlarıdır: en G, boy 1,5G; beyaz şerit boyun 1/30'u; dış ay çapı 0,5G, merkezi şeritten 0,5G;
// iç ay çapı 0,4G, merkezi 0,0625G içeride; yıldız çemberi 0,25G, dış ay merkezine 1/3G. Renkler tasarım değişkenindedir.
// Bez tuvalde çizilir: her piksel sütunu uca doğru biraz büyüyen bir dalgayla kayar, ışık ve gölge dalganın eğiminden gelir.

// Görselin 240 x 110 birimlik çiziminde bayrağın kutusu (dişlilerin arası) ve bezin en'i.
const KUTU = { x: 84, y: 8, en: 76, boy: 66 };
const EN = 46;
const UST = 10;
const GENLIK = 4.4;
const DONEM_SN = 1.9;

const degisken = (el: Element, ad: string): string => getComputedStyle(el).getPropertyValue(ad).trim();

function bezCiz(olcek: number, renk: { kirmizi: string; beyaz: string }): HTMLCanvasElement {
  const G = EN * olcek, L = 1.5 * G, M = L / 30, ax = M + G / 2, ay = G / 2, R = 0.125 * G, yx = ax + G / 3 + R;
  const bez = document.createElement('canvas');
  bez.width = Math.ceil(L); bez.height = Math.ceil(G);
  const k = bez.getContext('2d');
  if (k === null) return bez;
  k.fillStyle = renk.kirmizi; k.fillRect(0, 0, L, G);
  k.fillStyle = renk.beyaz; k.fillRect(0, 0, M, G);
  k.beginPath(); k.arc(ax, ay, G / 4, 0, 2 * Math.PI); k.fill();
  k.fillStyle = renk.kirmizi; k.beginPath(); k.arc(ax + 0.0625 * G, ay, 0.2 * G, 0, 2 * Math.PI); k.fill();
  k.fillStyle = renk.beyaz; k.beginPath();
  // Bir ucu aya bakan beş köşeli yıldız; iç yarıçap dış yarıçapın 0,382'si.
  for (let i = 0; i < 10; i += 1) {
    const aci = Math.PI + (i * Math.PI) / 5, r = i % 2 === 1 ? R * 0.382 : R;
    k.lineTo(yx + r * Math.cos(aci), ay + r * Math.sin(aci));
  }
  k.fill();
  return bez;
}

export function KarsilamaBayragi({ hareketsiz }: { hareketsiz: boolean }) {
  const tuvalRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const tuval = tuvalRef.current;
    const svg = tuval?.closest('svg');
    const x = tuval?.getContext('2d') ?? null;
    if (!tuval || !svg || x === null) return undefined;
    const olcek = (svg.getBoundingClientRect().width / 240) * (window.devicePixelRatio || 1);
    if (!(olcek > 0)) return undefined;
    tuval.width = Math.round(KUTU.en * olcek); tuval.height = Math.round(KUTU.boy * olcek);
    const renk = { kirmizi: degisken(tuval, '--bayrak-kirmizi'), beyaz: degisken(tuval, '--bayrak-beyaz') };
    const golge = degisken(tuval, '--bayrak-golge');
    const bez = bezCiz(olcek, renk);
    const L = bez.width, G = bez.height, ust = UST * olcek, A = GENLIK * olcek;
    const ciz = (sn: number) => {
      x.clearRect(0, 0, tuval.width, tuval.height);
      for (let c = 0; c < L; c += 1) {
        const u = c / L, zarf = 0.45 + 0.55 * u, faz = 2 * Math.PI * (u * 1.15 - sn / DONEM_SN);
        const dy = A * zarf * Math.sin(faz), egim = Math.cos(faz) * zarf;
        // Uçta kumaş biraz kısalır: dalga boyunca yatay sıkışma.
        const dx = -0.8 * olcek * u * (1 - Math.cos(faz));
        x.globalAlpha = 1;
        x.drawImage(bez, c, 0, 1, G, c + dx, ust + dy, 1.6, G);
        x.globalAlpha = egim > 0 ? 0.16 * egim : -0.26 * egim;
        x.fillStyle = egim > 0 ? renk.beyaz : golge;
        x.fillRect(c + dx, ust + dy, 1.02, G);
      }
      x.globalAlpha = 1;
    };
    if (hareketsiz || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { ciz(0.35); return undefined; }
    const bas = performance.now();
    let kare = 0;
    const adim = (an: number) => { ciz((an - bas) / 1000); kare = requestAnimationFrame(adim); };
    kare = requestAnimationFrame(adim);
    return () => { cancelAnimationFrame(kare); };
  }, [hareketsiz]);
  return (
    <foreignObject className="tc-karsilama-bayrak" x={KUTU.x} y={KUTU.y} width={KUTU.en} height={KUTU.boy}>
      <canvas ref={tuvalRef} className="tc-karsilama-bayrak-bez" />
    </foreignObject>
  );
}
