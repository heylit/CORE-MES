import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

// Düzenleme panelinin sol kenarı: sürükleyince genişlik değişir (B-2482-R5). Sınır tasarım değişkenlerinden okunur: en az bildirim
// çekmecesi kadar, en çok gövdenin yüzde 60'ı (CSS'teki clamp ile aynı). Bırakınca tercih yazılır; klavyede ok tuşu adım adım,
// Home varsayılan genişliğe döner.
const ADIM = 32;
const EN_COK_ORAN = 0.6;

function sinirlar(govde: HTMLElement): { enAz: number; enCok: number } {
  const enAz = Number.parseFloat(getComputedStyle(govde).getPropertyValue('--bildirim-genis')) || 0;
  return { enAz, enCok: Math.max(enAz, govde.clientWidth * EN_COK_ORAN) };
}

export function PanelTutamagi({ govde, genislik, yaz }: {
  govde: () => HTMLElement | null;
  genislik: number | null;
  // bitti: sürükleme bitti, tercih yazılabilir. null: varsayılan genişlik.
  yaz: (px: number | null, bitti: boolean) => void;
}) {
  const bas = useRef<{ x: number; w: number } | null>(null);
  const kenar = useRef<HTMLDivElement>(null);
  const sinirla = (px: number): number => {
    const g = govde();
    if (!g) return px;
    const { enAz, enCok } = sinirlar(g);
    return Math.round(Math.min(enCok, Math.max(enAz, px)));
  };
  const simdiki = (): number => genislik ?? kenar.current?.parentElement?.getBoundingClientRect().width ?? 0;
  const indir = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Tutamak dar; imleç dışarı kaysa da sürükleme sürsün. Desteklemeyen ortamda (jsdom) atlanır.
    if ('setPointerCapture' in e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);
    bas.current = { x: e.clientX, w: simdiki() };
  };
  const tasi = (e: PointerEvent<HTMLDivElement>) => {
    const b = bas.current;
    if (!b) return;
    yaz(sinirla(b.w + (b.x - e.clientX)), false);
  };
  const birak = (e: PointerEvent<HTMLDivElement>) => {
    const b = bas.current;
    if (!b) return;
    bas.current = null;
    yaz(sinirla(b.w + (b.x - e.clientX)), true);
  };
  const tus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      yaz(sinirla(simdiki() + (e.key === 'ArrowLeft' ? ADIM : -ADIM)), true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      yaz(null, true);
    }
  };
  return (
    <div
      ref={kenar} className="tc-rr1-tutamak" role="separator" aria-orientation="vertical" aria-label="Düzenleme paneli genişliği" tabIndex={0}
      aria-valuenow={genislik ?? undefined} title="Sürükleyerek paneli genişlet ya da daralt; Home varsayılana döner"
      onPointerDown={indir} onPointerMove={tasi} onPointerUp={birak} onPointerCancel={birak} onKeyDown={tus} onDoubleClick={() => { yaz(null, true); }}
    />
  );
}
