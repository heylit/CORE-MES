import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { fmtN } from '../bicim.ts';
import type { Aciklama, AciklamaSimgesi } from './aciklama.ts';
import { izlenenSatirSirasi } from './oynatma.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';

// Program satirlari ve Turkce anlami (prototipin #gDock'u): yalniz gorunen satirlar cizilir, oynatirken gecerli satir izlenir.
export type ListeKipi = 'all' | 'tc';

const SIMGE: Record<AciklamaSimgesi, SimgeAdi> = { yorum: 'edit', bolum: 'flag', takim: 'rotate', dongu: 'gear', calistir: 'play' };

interface Ozellikler {
  satirlar: readonly string[];
  aciklama: readonly Aciklama[];
  degisimler: readonly number[];
  gecerli: number | null;
  kip: ListeKipi;
  kipSec: (k: ListeKipi) => void;
  bilgi: string;
  ayristirma: string;
  satiraGit: (ln: number) => void;
  kapat: () => void;
  // Takim degisimi satirinin takim rengi sinifi (renk tasarim degiskeninden, T1).
  takimSinifi: (e: Aciklama) => string | null;
}

// Satir yuksekligi tasarim degiskeninden okunur; hesaplama ve CSS ayni degeri kullanir. Konumlar CSS degiskeniyle verilir (inline stil yok).
function satirBoyu(el: HTMLElement | null): number {
  if (!el) return 24;
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--tc-ch-satir'));
  return v > 0 ? v : 24;
}

export function KodListesi({ satirlar, aciklama, degisimler, gecerli, kip, kipSec, bilgi, ayristirma, satiraGit, kapat, takimSinifi }: Ozellikler) {
  const liste = useRef<HTMLDivElement>(null);
  const [kaydirma, setKaydirma] = useState(0);
  const [boy, setBoy] = useState({ satir: 24, pencere: 400 });
  const sira = kip === 'tc' ? degisimler : null;
  const n = sira ? sira.length : satirlar.length;

  useLayoutEffect(() => {
    const el = liste.current;
    setBoy({ satir: satirBoyu(el), pencere: el?.clientHeight || 400 });
  }, [kip]);

  useEffect(() => {
    const el = liste.current;
    if (!el) return;
    el.scrollTop = 0;
    setKaydirma(0);
  }, [kip, satirlar]);

  // Gecerli satir gorunurden cikinca ortaya kaydirilir (gCodeFollow).
  useEffect(() => {
    const el = liste.current;
    if (!el || gecerli == null || !el.clientHeight) return;
    const idx = izlenenSatirSirasi(sira ? [...sira] : null, gecerli);
    if (idx < 0) return;
    const ust = idx * boy.satir;
    if (ust < el.scrollTop || ust > el.scrollTop + el.clientHeight - boy.satir * 2) {
      el.scrollTop = ust - el.clientHeight / 2;
      setKaydirma(el.scrollTop);
    }
  }, [gecerli, sira, boy.satir]);

  const bas = Math.max(0, Math.floor(kaydirma / boy.satir) - 4), son = Math.min(n, bas + Math.ceil(boy.pencere / boy.satir) + 10);
  const gorunen: number[] = [];
  for (let r = bas; r < son; r++) gorunen.push(sira ? sira[r]! : r);

  return (
    <div className="tc-ch-dock">
      <div className="tc-ch-dock-ust">
        <b>Program</b><span className="tc-ch-soluk">{bilgi}</span><em className="tc-ch-soluk">{ayristirma}</em>
        <div className="tc-ch-segment tc-ch-segment-kucuk" role="radiogroup" aria-label="Satırlar">
          <button type="button" role="radio" aria-checked={kip === 'all'} className={kip === 'all' ? 'tc-ch-seg tc-ch-seg-secili' : 'tc-ch-seg'} onClick={() => { kipSec('all'); }}>Tüm satırlar</button>
          <button type="button" role="radio" aria-checked={kip === 'tc'} className={kip === 'tc' ? 'tc-ch-seg tc-ch-seg-secili' : 'tc-ch-seg'} onClick={() => { kipSec('tc'); }}>Takım değişimleri</button>
        </div>
        <Dugme simge="x" aria-label="Kapat" title="Kapat" onClick={kapat} />
      </div>
      <div className="tc-ch-dock-sutun" aria-hidden="true"><span>No</span><span>Kod</span><span>Anlamı</span></div>
      <div ref={liste} className="tc-ch-dock-liste" onScroll={(e) => { setKaydirma(e.currentTarget.scrollTop); }}>
        <div className="tc-ch-dock-ic" ref={(el) => { el?.style.setProperty('--tc-ch-boy', `${n * boy.satir}px`); }}>
          {gorunen.map((i, k) => {
            const e = aciklama[i] || { t: '', k: '' }, renk = e.k === 'tc' ? takimSinifi(e) : null;
            const sinif = ['tc-ch-kod', 'tc-ch-kod-' + (e.k || 'x'), i === gecerli ? 'tc-ch-kod-gecerli' : '', renk || ''].filter(Boolean).join(' ');
            return (
              <button
                key={i} type="button" className={sinif} title={e.t}
                ref={(el) => { el?.style.setProperty('--tc-ch-ust', `${(bas + k) * boy.satir}px`); }}
                onClick={() => { satiraGit(i); }}
              >
                <span className="tc-ch-kod-no">{i + 1}</span>
                <span className="tc-ch-kod-cd">{(satirlar[i] || '').replace(/^\s*\d+\s+/, '')}</span>
                <span className="tc-ch-kod-ex">{e.simge && <Simge ad={SIMGE[e.simge]} boyut="k" />}{e.t}</span>
              </button>
            );
          })}
        </div>
      </div>
      <span className="tc-ch-gizli">{fmtN(satirlar.length)} satır</span>
    </div>
  );
}
