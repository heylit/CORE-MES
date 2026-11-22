import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { IsOnizKarti } from './Cark.tsx';
import type { IsYeriBilgisi } from './Parcalar.tsx';
import type { Is } from './tipler.ts';

// 3338-6 a: terminalin en üstünde istasyonun işleri boydan boya, elle kayar. Ekrandaki iş ortaya gelir ve sarı çerçevelidir.
// Karta dokunmak yalnız bakar (önizleme); geçiş "Bu işe geç" ile ve bugünkü geçiş sorusuyla olur. Biten işler soluk durur.
export function SiradakiIsler({ isler, ekranda, bakilan, siradakiMi, yer, sec, eylem }: {
  isler: readonly Is[]; ekranda: number; bakilan: number; siradakiMi: (i: number) => boolean; yer: (i: number) => IsYeriBilgisi | null;
  sec: (i: number) => void; eylem: ReactNode;
}) {
  const ol = useRef<HTMLOListElement>(null);
  const odak = bakilan >= 0 ? bakilan : ekranda;
  useLayoutEffect(() => {
    const kap = ol.current;
    const li = kap?.children[odak] as HTMLElement | undefined;
    if (!kap || !li) return;
    const sol = kap.scrollLeft + li.getBoundingClientRect().left - kap.getBoundingClientRect().left - (kap.clientWidth - li.offsetWidth) / 2;
    if (typeof kap.scrollTo === 'function') kap.scrollTo({ left: sol }); else kap.scrollLeft = sol;
  }, [odak, isler.length]);
  // 3583: iş yokken de şerit yerinde durur (aynı bölge, aynı yükseklik); yalnız içeriği "iş yok" yazar.
  if (isler.every((x) => x.empty)) {
    return (
      <section className="tc-ay1-sira" aria-label="Sıradaki işler" data-bos="">
        <span className="tc-ay1-sira-ust"><Simge ad="list" boyut="k" /><b>Sıradaki işler</b><small className="tc-ay1-mono">0 iş</small></span>
        <div className="tc-ay1-sira-govde"><p className="tc-ay1-soluk tc-ay1-sira-bos">Sırada iş yok</p></div>
      </section>
    );
  }
  const kaydir = (yon: -1 | 1) => {
    const kap = ol.current;
    const li = kap?.firstElementChild as HTMLElement | null | undefined;
    if (!kap || !li) return;
    const sol = kap.scrollLeft + yon * li.offsetWidth;
    if (typeof kap.scrollTo === 'function') kap.scrollTo({ left: sol, behavior: 'smooth' }); else kap.scrollLeft = sol;
  };
  const acik = isler.filter((x) => !x.empty && x.state !== 'done').length;
  return (
    <section className="tc-ay1-sira" aria-label="Sıradaki işler">
      <span className="tc-ay1-sira-ust">
        <Simge ad="list" boyut="k" /><b>Sıradaki işler</b>
        <small className="tc-ay1-mono">{acik} iş · {ekranda + 1}/{isler.length}</small>
      </span>
      <div className="tc-ay1-sira-govde">
        <button type="button" className="tc-ra-kaydir" aria-label="Önceki işler" onClick={() => kaydir(-1)}><Simge ad="chev-left" boyut="k" /></button>
        <ol ref={ol}>
          {isler.map((x, i) => (
            <li key={`${x.no}:${String(i)}`} data-bitti={x.state === 'done' ? '' : undefined}>
              <button type="button" aria-pressed={i === odak} aria-label={`${x.no}${i === ekranda ? ' · ekranda' : ''}`} onClick={() => sec(i)}>
                <IsOnizKarti is={x} siradaki={i !== ekranda && siradakiMi(i)} ekranda={i === ekranda} yer={yer(i)} />
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="tc-ra-kaydir" aria-label="Sonraki işler" onClick={() => kaydir(1)}><Simge ad="chev-right" boyut="k" /></button>
      </div>
      {eylem ? <div className="tc-ay1-sira-eylem">{eylem}</div> : null}
    </section>
  );
}
