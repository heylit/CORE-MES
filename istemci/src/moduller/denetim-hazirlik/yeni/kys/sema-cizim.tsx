import { forwardRef, useId } from 'react';
import type { Sema, SemaOgesi } from './semalar.ts';

function ciz(o: SemaOgesi, i: number, ok: string) {
  switch (o.tur) {
    case 'dikdortgen':
      return <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} rx={o.rx} strokeWidth={o.kalinlik} strokeDasharray={o.kesik}
        className={`tc-dhk-d-${o.dolgu}${o.kenar ? ` tc-dhk-k-${o.kenar}` : ''}`} />;
    case 'cokgen':
      return <polygon key={i} points={o.noktalar.map((p) => p.join(',')).join(' ')} strokeWidth={o.kalinlik}
        className={`tc-dhk-d-${o.dolgu} tc-dhk-k-${o.kenar}`} />;
    case 'elips':
      return <ellipse key={i} cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} strokeWidth={o.kalinlik} className={`tc-dhk-d-${o.dolgu} tc-dhk-k-${o.kenar}`} />;
    case 'daire':
      return <circle key={i} cx={o.cx} cy={o.cy} r={o.r} className={`tc-dhk-d-${o.dolgu}`} />;
    case 'yol':
      return <path key={i} d={o.d} strokeWidth={o.kalinlik} strokeDasharray={o.kesik} strokeLinejoin="round"
        markerEnd={o.ok ? `url(#${ok})` : undefined} className={`${o.dolgu ? `tc-dhk-d-${o.dolgu}` : 'tc-dhk-d-yok'} tc-dhk-k-${o.kenar}`} />;
    case 'metin':
      return (
        <text key={i} x={o.x} y={o.y} fontSize={o.boyut} fontWeight={o.kalin} textAnchor={o.hiza} fontStyle={o.egik ? 'italic' : undefined}
          dominantBaseline={o.dikey === 'orta' ? 'middle' : undefined} className={`tc-dhk-y tc-dhk-d-${o.renk}`}>
          {o.parcalar
            ? o.parcalar.map((p, j) => <tspan key={j} className={`tc-dhk-d-${p.renk}`}>{p.metin}</tspan>)
            : o.satirlar.map((s, j) => <tspan key={j} x={o.x} dy={j ? o.aralik : 0}>{s}</tspan>)}
        </text>
      );
  }
}

export const SemaCizimi = forwardRef<SVGSVGElement, { sema: Sema }>(function SemaCizimi({ sema }, ref) {
  const ok = 'tc-dhk-ok' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${sema.w} ${sema.h}`} width={sema.w} height={sema.h}
      className="tc-dhk-sema" role="img" aria-label={sema.baslik}>
      <defs>
        <marker id={ok} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="tc-dhk-d-yazi2" />
        </marker>
      </defs>
      <rect width={sema.w} height={sema.h} className="tc-dhk-d-beyaz" />
      {sema.ogeler.map((o, i) => ciz(o, i, ok))}
    </svg>
  );
});

// Indirilen dosya sayfanin stil dosyasini tasimaz: hesaplanan renk ve yazi tipi ogeye yazilir, sinif kaldirilir.
export function svgMetni(svg: SVGSVGElement): string {
  const kopya = svg.cloneNode(true) as SVGSVGElement;
  const asil = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const yeni = [kopya, ...Array.from(kopya.querySelectorAll('*'))];
  asil.forEach((o, i) => {
    const k = yeni[i];
    if (!k || !o.getAttribute('class')) return;
    const st = getComputedStyle(o);
    k.setAttribute('fill', st.fill);
    k.setAttribute('stroke', st.stroke);
    if (o.tagName === 'text') k.setAttribute('font-family', st.fontFamily);
    k.removeAttribute('class');
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(kopya);
}

export function pngYap(svg: SVGSVGElement, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgMetni(svg)], { type: 'image/svg+xml' }));
  return new Promise((coz, red) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = w * 2;
      cv.height = h * 2;
      const c = cv.getContext('2d');
      URL.revokeObjectURL(url);
      if (!c) { red(new Error('tuval yok')); return; }
      c.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => (b ? coz(b) : red(new Error('png yok'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); red(new Error('svg okunamadi')); };
    img.src = url;
  });
}
