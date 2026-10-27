import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { TEPKILER } from '../kurallar.ts';
import type { IletiIslemi } from './yardimci.ts';

const MADDELER: Record<IletiIslemi, { baslik: string; simge: SimgeAdi; tehlike?: boolean }> = {
  yanitla: { baslik: 'Yanıtla', simge: 'chev-left' },
  goreve: { baslik: 'Göreve çevir', simge: 'list' },
  onaya: { baslik: 'Onaya sun', simge: 'clipboard-check' },
  kopyala: { baslik: 'Metni kopyala', simge: 'file' },
  bilgi: { baslik: 'Mesaj bilgisi (kimler okudu)', simge: 'eye' },
  duzenle: { baslik: 'Düzenle', simge: 'edit' },
  sil: { baslik: 'Sil', simge: 'trash', tehlike: true },
};

const CAPA = 'tc-ms-menu-capa';
const dar = () => typeof window.matchMedia !== 'function' || window.matchMedia('(max-width: 767px)').matches;

// Geniş ekranda prototipteki gibi açan öğeye çapalı açılır kutu (pop); dar ekranda alttan pencere (sheetMenu).
function AcilirKutu({ capa, kapat, children }: { capa: Element; kapat: () => void; children: ReactNode }) {
  const kutu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    capa.classList.add(CAPA);
    kutu.current?.querySelector<HTMLElement>('button')?.focus();
    const disari = (o: Event) => { if (!kutu.current?.contains(o.target as Node)) kapat(); };
    const tus = (o: KeyboardEvent) => { if (o.key === 'Escape') { o.stopPropagation(); kapat(); } };
    document.addEventListener('pointerdown', disari);
    document.addEventListener('keydown', tus);
    return () => {
      capa.classList.remove(CAPA);
      document.removeEventListener('pointerdown', disari);
      document.removeEventListener('keydown', tus);
      if (capa instanceof HTMLElement && document.activeElement === document.body) capa.focus();
    };
  }, [capa]);
  return createPortal(
    <div ref={kutu} className="tc-ms-acilir" role="dialog" aria-label="Mesaj işlemleri" tabIndex={-1}>{children}</div>,
    document.body,
  );
}

// İleti menüsü (msgMenu): üstte tepki şeridi (yazma yetkisiyle), altta işlemler. "Diğer" düğmesi, uzun basma ve sağ tık açar.
export function IletiIslemleri({ capa, islemler, tepkiVar, tepkiSec, sec, kapat }: {
  capa: Element | null;
  islemler: readonly IletiIslemi[];
  tepkiVar: boolean;
  tepkiSec: (anahtar: string) => void;
  sec: (islem: IletiIslemi) => void;
  kapat: () => void;
}) {
  const icerik = (
    <>
      {tepkiVar && (
        <div className="tc-ms-tepki-seridi" role="group" aria-label="Tepki ver">
          {TEPKILER.map((t) => (
            <button key={t.k} type="button" className="tc-ms-tepki-sec" data-tepki={t.k} title={t.l || t.g} aria-label={t.l || t.g} onClick={() => { kapat(); tepkiSec(t.k); }}>
              <span aria-hidden="true">{t.g}</span>
              {t.l && t.k.startsWith('c_') && <small>{t.l}</small>}
            </button>
          ))}
        </div>
      )}
      <ul className="tc-ms-islem-listesi">
        {islemler.map((i) => (
          <li key={i}>
            <button type="button" className={`tc-ms-islem${MADDELER[i].tehlike ? ' tc-ms-islem-tehlike' : ''}`} onClick={() => { kapat(); sec(i); }}>
              <Simge ad={MADDELER[i].simge} /><span>{MADDELER[i].baslik}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
  if (capa && !dar()) return <AcilirKutu capa={capa} kapat={kapat}>{icerik}</AcilirKutu>;
  return <Pencere acik kapat={kapat} baslik="Mesaj işlemleri">{icerik}</Pencere>;
}
