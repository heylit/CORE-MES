import { useRef } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useAkisKaydirma } from '../akis-kaydirma.ts';
import { byId } from '../secici.ts';
import { KartResmi } from '../sahne/KartResmi.tsx';
import { K, focusIdx, goRow, isSel, setOpt, toggle, type CarkAdimi } from './satirlar.ts';
import { isaretler } from './secim.ts';
import '../kart-akisi.css';

// Kurulum'un kartlı akışı (1843): çarkın yerine dikey kayan adımlar. Odaktaki adım ortada açılır ve seçenekleri yatay kartlardır;
// komşu adımlar uzaklığa göre küçülüp soluklaşır (yalnız CSS dönüşümü, sürekli çizim yok). Adım ve seçim çarkla aynı durumdadır
// (satirlar.ts): tekerlek, tuşlar ve düğmeler iki biçimde de aynı çalışır.

const SIMGE: Record<string, SimgeAdi> = {
  machine: 'gear', material: 'box', fixture: 'wrench', jaw: 'wrench', zero: 'target', wcs: 'target', coolant: 'drop', gauges: 'ruler', cons: 'box',
};
const simgesi = (d: CarkAdimi): SimgeAdi => (d.isTool ? 'tool' : SIMGE[d.key] ?? 'layers');
const UZAK_EN = 4;
const aktifAdim = (): number => K.active;

function seciliAdi(d: CarkAdimi): string {
  if (d.type === 'single') return byId(d.options, d.get())?.name ?? '—';
  const l = d.list();
  return l.length === 0 ? '—' : l.map((id) => byId(d.options, id)?.name ?? id).join(', ');
}

export function KartAkisi({ sonraki }: { sonraki: () => void }) {
  const kap = useRef<HTMLDivElement>(null);
  const a = isaretler(), aktif = K.active;

  useAkisKaydirma(kap, aktifAdim, goRow);

  const kartaTikla = (i: number, k: number): void => {
    if (i !== K.active) goRow(i);
    const d = K.defs[i];
    if (!d) return;
    if (d.type === 'multi') { setOpt(k); toggle(); return; }
    setOpt(k);
    sonraki();
  };

  return (
    <div className="tc-cy-ka" ref={kap} aria-label="Kurulum adımları">
      {K.defs.map((d, i) => {
        const uzak = Math.min(UZAK_EN, Math.abs(i - aktif)), on = i === aktif, odak = on ? focusIdx(i) : -1;
        return (
          <section
            key={d.key} data-satir={i} data-aktif={on ? '1' : undefined} data-uzak={uzak} data-yon={i < aktif ? 'ust' : i > aktif ? 'alt' : undefined}
            className="tc-cy-ka-satir" data-secildi={a[d.key] === true ? '1' : undefined}
            onClick={on ? undefined : () => { goRow(i); }}
          >
            <header className="tc-cy-ka-bas">
              <span className="tc-cy-ka-no">{String(i + 1).padStart(2, '0')}</span>
              <Simge ad={simgesi(d)} boyut="k" />
              <span className="tc-cy-ka-ad">{d.title}</span>
              <span className="tc-cy-ka-secili">{seciliAdi(d)}</span>
              {a[d.key] === true && <span className="tc-cy-ka-rozet"><Simge ad="check" boyut="k" /> seçildi</span>}
            </header>
            {on && (
              <div className="tc-cy-ka-kartlar" data-kartlar role="group" aria-label={`${d.title} seçenekleri`}>
                {d.options.map((o, k) => {
                  const sec = isSel(d, o);
                  return (
                    <button
                      key={o.id} type="button" className="tc-cy-ka-kart" data-odak={k === odak ? '1' : undefined} aria-pressed={sec}
                      onClick={(e) => { e.stopPropagation(); kartaTikla(i, k); }}
                    >
                      <KartResmi opt={o} simge={simgesi(d)} sinif="tc-cy-ka-resim" />
                      <span className="tc-cy-ka-tur">{d.cat}</span>
                      <span className="tc-cy-ka-kart-ad">{o.name}</span>
                      {o.code ? <span className="tc-cy-ka-kod">{o.code}</span> : null}
                      {sec && <span className="tc-cy-ka-tik"><Simge ad="check" boyut="k" /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
