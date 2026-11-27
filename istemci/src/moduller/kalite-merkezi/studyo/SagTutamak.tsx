import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

// Sağ sütunun (Balon grupları, Numune planı) sol kenarı (3796 b): sürükleyince genişlik değişir. Sınır CSS'teki clamp ile aynıdır:
// en az bugünkü sütun (--kuyruk-genis); en çok, resme en az --bildirim-genis kalacak kadar (sol sütun ve iki aralık düşülür).
// Sol şeritteyken sağ çok genişler, sol açıkken az; resim balonlanamayacak kadar daralmaz.
// Bırakınca tercih yazılır; klavyede ok tuşu adım adım, Home ve çift tık varsayılan genişliğe döner.
const ADIM = 32;

function sinirlar(govde: HTMLElement, sol: HTMLElement | null): { enAz: number; enCok: number } {
  const s = getComputedStyle(govde);
  const enAz = Number.parseFloat(s.getPropertyValue('--kuyruk-genis')) || 0;
  const resimEnAz = Number.parseFloat(s.getPropertyValue('--bildirim-genis')) || 0;
  const aralik = Number.parseFloat(s.columnGap) || 0;
  const solGenis = sol?.getBoundingClientRect().width ?? 0;
  return { enAz, enCok: Math.max(enAz, govde.clientWidth - solGenis - aralik * 2 - resimEnAz) };
}

export function SagTutamak({ govde, sol, sutun, genislik, yaz }: {
  govde: () => HTMLElement | null;
  sol: () => HTMLElement | null;
  // Sürükleme başında ölçülen sağ sütun; tercih yokken başlangıç genişliği bundan okunur.
  sutun: () => HTMLElement | null;
  genislik: number | null;
  // bitti: sürükleme bitti, tercih yazılabilir. null: varsayılan genişlik.
  yaz: (px: number | null, bitti: boolean) => void;
}) {
  const bas = useRef<{ x: number; w: number } | null>(null);
  const sinirla = (px: number): number => {
    const g = govde();
    if (!g) return px;
    const { enAz, enCok } = sinirlar(g, sol());
    return Math.round(Math.min(enCok, Math.max(enAz, px)));
  };
  const simdiki = (): number => genislik ?? sutun()?.getBoundingClientRect().width ?? 0;
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
      className="km-st-tutamak" role="separator" aria-orientation="vertical" aria-label="Sağ panel genişliği" tabIndex={0}
      aria-valuenow={genislik ?? undefined} title="Sürükleyerek sağ paneli genişlet ya da daralt; çift tık ya da Home varsayılana döner"
      onPointerDown={indir} onPointerMove={tasi} onPointerUp={birak} onPointerCancel={birak} onKeyDown={tus} onDoubleClick={() => { yaz(null, true); }}
    />
  );
}
