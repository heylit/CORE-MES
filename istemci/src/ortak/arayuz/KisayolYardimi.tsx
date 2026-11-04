import { useEffect, useState } from 'react';
import { etkiAcik } from '../veri/etki.ts';
import { Pencere } from './Pencere.tsx';
import './kisayol-yardimi.css';

interface Kisayol { tuslar: readonly string[]; is: string }

// Kabuğun bildiği kısayollar; modülün kendi ekranındaki tuşlar bu listede değildir.
export const KISAYOLLAR: readonly Kisayol[] = [
  { tuslar: ['Ctrl', 'K'], is: 'Ara ve git' },
  { tuslar: ['F1'], is: 'Yardım ve rehber' },
  { tuslar: ['Ctrl', 'B'], is: 'Ana menüyü daralt (masaüstü)' },
  { tuslar: ['Esc'], is: 'Pencereyi ya da menüyü kapat, tam ekrandan çık' },
  { tuslar: ['←', '→'], is: 'Sekmeler ve ikinci menüde gez' },
  { tuslar: ['↑', '↓'], is: 'Menüde ve listede gez' },
  { tuslar: ['Enter'], is: 'Seçili satırı ya da maddeyi aç' },
  { tuslar: ['?'], is: 'Bu liste' },
];

const yaziAlani = (hedef: EventTarget | null) => hedef instanceof HTMLElement
  && (hedef.isContentEditable || hedef.closest('input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="range"]), textarea, select, [contenteditable="true"]') !== null);

// ? tuşu klavye kısayollarının listesini açar (kart 2092, karar 2081-26). Yazı alanındayken ? yazıdır, liste açılmaz.
export function KisayolYardimi() {
  const [acik, acikYaz] = useState(false);
  useEffect(() => {
    const tus = (o: KeyboardEvent) => {
      if (o.key !== '?' || o.ctrlKey || o.metaKey || o.altKey || o.defaultPrevented || yaziAlani(o.target)) return;
      if (!etkiAcik('kisayol-yardimi')) return;
      o.preventDefault();
      acikYaz(true);
    };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, []);

  return (
    <Pencere acik={acik} kapat={() => { acikYaz(false); }} baslik="Klavye kısayolları">
      <dl className="tc-kisayollar">
        {KISAYOLLAR.map((k) => (
          <div key={k.is} className="tc-kisayol">
            <dt>{k.tuslar.map((t) => <kbd key={t}>{t}</kbd>)}</dt>
            <dd>{k.is}</dd>
          </div>
        ))}
      </dl>
    </Pencere>
  );
}
