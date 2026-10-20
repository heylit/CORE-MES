import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { bolumKoseleri, bolumeCevir, fabrikaKutusu, fabrikayaCevir } from './fabrika.ts';
import { gecisAraligi, kenarNoktasi } from './gecis.ts';
import { sayi } from './kurallar.ts';
import type { BolumYerlesimi, KameraYeri } from './sahne/motor.ts';

export interface KucukHaritaOzellikleri {
  bolumler: readonly BolumYerlesimi[];
  yer: KameraYeri | null;
  // Fabrika metresinde nokta: yürüyüşte oraya yürünür, gezinmede kamera oraya kayar.
  git: (x: number, z: number) => void;
}

// Sahnenin köşesinde fabrika planı: bölümler, geçişler ve bakılan yer (yönüyle). Dokunulan yere gidilir.
export function KucukHarita({ bolumler, yer, git }: KucukHaritaOzellikleri) {
  const [acik, acikYaz] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
  const plan = useMemo(() => {
    const liste = bolumler.map((b) => ({
      id: b.yerlesim.salon.id, kod: b.yerlesim.salon.kod, konum: b.konum,
      g: sayi(b.yerlesim.salon.genislik), d: sayi(b.yerlesim.salon.derinlik), gecisler: b.yerlesim.gecisler,
    }));
    const k = fabrikaKutusu(liste);
    if (!k) return null;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const pay = Math.max(2, Math.max(k.x1 - k.x0, k.z1 - k.z0) * 0.06);
    const kutu = { x: r2(k.x0 - pay), z: r2(k.z0 - pay), g: r2(k.x1 - k.x0 + pay * 2), d: r2(k.z1 - k.z0 + pay * 2) };
    const olcek = Math.max(kutu.g, kutu.d);
    return {
      kutu, olcek,
      bolumler: liste.map((b) => ({
        id: b.id, kod: b.kod, konum: b.konum, g: b.g, d: b.d,
        koseler: bolumKoseleri(b.konum, b.g, b.d).map((p) => `${p.x},${p.z}`).join(' '),
        orta: fabrikayaCevir(b.konum, { x: b.g / 2, z: b.d / 2 }),
        gecisler: b.gecisler.map((gc) => {
          const [s0, s1] = gecisAraligi({ kenar: gc.kenar, ofset: sayi(gc.ofset), genislik: sayi(gc.genislik) }, b.g, b.d);
          return { id: gc.id, a: fabrikayaCevir(b.konum, kenarNoktasi(gc.kenar, s0, b.g, b.d)), s: fabrikayaCevir(b.konum, kenarNoktasi(gc.kenar, s1, b.g, b.d)) };
        }),
      })),
    };
  }, [bolumler]);
  if (!plan) return null;
  const { kutu, olcek } = plan;
  const icinde = yer ? plan.bolumler.find((b) => { const q = bolumeCevir(b.konum, yer); return q.x >= 0 && q.z >= 0 && q.x <= b.g && q.z <= b.d; }) : undefined;

  const bas = (o: ReactPointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    const m = el?.getScreenCTM?.();
    if (!el || !m) return;
    const p = new DOMPoint(o.clientX, o.clientY).matrixTransform(m.inverse());
    git(p.x, p.y);
  };

  if (!acik) {
    return (
      <div className="tc-atolye-kucuk-harita" data-acik="false">
        <Dugme simge="target" aria-label="Küçük haritayı aç" title="Küçük haritayı aç" onClick={() => acikYaz(true)} />
      </div>
    );
  }
  const ok = olcek * 0.035;
  return (
    <div className="tc-atolye-kucuk-harita" data-acik="true">
      <svg
        ref={svg}
        viewBox={`${kutu.x} ${kutu.z} ${kutu.g} ${kutu.d}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={icinde ? `Küçük harita: ${icinde.kod} bölümündesiniz` : 'Küçük harita'}
        onPointerDown={bas}
      >
        {plan.bolumler.map((b) => (
          <g key={b.id} className="tc-kh-bolum" data-icinde={b.id === icinde?.id}>
            <polygon points={b.koseler} />
            <text x={b.orta.x} y={b.orta.z} fontSize={olcek * 0.05} textAnchor="middle" dominantBaseline="middle">{b.kod}</text>
            {b.gecisler.map((gc) => (
              <line key={gc.id} className="tc-kh-gecis" x1={gc.a.x} y1={gc.a.z} x2={gc.s.x} y2={gc.s.z} strokeWidth={olcek * 0.018} />
            ))}
          </g>
        ))}
        {yer && (
          <g className="tc-kh-yer" transform={`translate(${yer.x} ${yer.z}) rotate(${(yer.yon * 180) / Math.PI})`}>
            <path d={`M${ok * 1.6} 0 L${-ok} ${ok} L${-ok * 0.4} 0 L${-ok} ${-ok} Z`} />
          </g>
        )}
      </svg>
      <Dugme simge="x" aria-label="Küçük haritayı kapat" title="Küçük haritayı kapat" onClick={() => acikYaz(false)} />
    </div>
  );
}
