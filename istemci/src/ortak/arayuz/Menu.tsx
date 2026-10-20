import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Dugme } from './Dugme.tsx';
import { Simge } from './Simge.tsx';
import { useKatman } from './katman.ts';
import './menu.css';

export interface MenuOgesi {
  anahtar: string;
  baslik: string;
  simge?: SimgeAdi;
  sec: () => void;
  // Geri alınamayan ya da kayıt kapatan işlem.
  ton?: 'tehlike';
  // Pasif öğe listede kalır ve odaklanır (nedeni okunabilsin diye), seçilemez.
  pasif?: boolean;
  pasifNedeni?: string;
}

interface Ozellikler {
  // Düğmenin ve menünün erişilebilir adı ("Ayşe için işlemler").
  etiket: string;
  ogeler: readonly MenuOgesi[];
  // Verilirse düğmede simgenin yanında yazılır; verilmezse düğme yalnız simgedir.
  metin?: ReactNode;
  // null: düğmede simge yoktur (metin kendi görselini taşır, ör. baş harfli yuvarlak).
  simge?: SimgeAdi | null;
  // Fareyle üstüne gelince görünen açıklama; verilmezse etiket kullanılmaz (çoğu menünün metni zaten görünür).
  ipucu?: string;
  pasif?: boolean;
}

// İkincil işlemleri tek düğme altında toplar. Menü gövdeye çizilir: tablonun kaydırma kabı ve kartın kenarı kesmez.
// Pencere içindeyse pencerenin içine çizilir: kipli pencerenin dışındaki içerik ekran okuyucuya kapalıdır.
// Yeri tarayıcı belirler (düğmeye çapalı; sığmazsa yukarı ya da öbür yana döner), bileşen ölçüm yapmaz.
export function Menu({ etiket, ogeler, metin, simge = 'more', ipucu, pasif = false }: Ozellikler) {
  const [acik, acikYaz] = useState(false);
  // Yukarı okla açılan menüde odak son öğeye düşer.
  const [ilkOdak, ilkOdakYaz] = useState<'bas' | 'son'>('bas');
  const [hedef, hedefYaz] = useState<Element | null>(null);
  const kapat = () => { acikYaz(false); };
  const kutu = useKatman<HTMLDivElement>(acik, kapat);
  const kimlik = useId();
  const dugmeKimlik = `${kimlik}-dugme`;
  const menuKimlik = `${kimlik}-menu`;

  useEffect(() => {
    if (!acik) return undefined;
    // Basış ya da odak menünün ve düğmesinin dışına çıkınca kapanır. Odak da izlenir: basış olayı gelmeden
    // (klavye, yardımcı teknoloji) başka bir menü açılırsa iki menü aynı çapayı paylaşmasın.
    const disari = (o: Event) => {
      const yer = o.target as Node | null;
      if (kutu.current?.contains(yer) || document.getElementById(dugmeKimlik)?.contains(yer)) return;
      acikYaz(false);
    };
    document.addEventListener('pointerdown', disari);
    document.addEventListener('focusin', disari);
    return () => {
      document.removeEventListener('pointerdown', disari);
      document.removeEventListener('focusin', disari);
    };
  }, [acik, kutu, dugmeKimlik]);

  if (ogeler.length === 0) return null;

  const ac = (odak: 'bas' | 'son') => {
    // Kapanınca odak, açılırken odakta olan öğeye döner; tıklama düğmeye her ortamda odak vermez.
    const dugme = document.getElementById(dugmeKimlik);
    dugme?.focus();
    hedefYaz(dugme?.closest('[role="dialog"]') ?? document.body);
    ilkOdakYaz(odak);
    acikYaz(true);
  };
  const dugmeTusu = (o: KeyboardEvent) => {
    if (o.key !== 'ArrowDown' && o.key !== 'ArrowUp') return;
    o.preventDefault();
    ac(o.key === 'ArrowDown' ? 'bas' : 'son');
  };
  const menuTusu = (o: KeyboardEvent) => {
    // Düğmede basılı tutulan Enter menüyü açar; tuş tekrarı odağın düştüğü ilk öğeyi seçmesin.
    if (o.repeat && (o.key === 'Enter' || o.key === ' ')) {
      o.preventDefault();
      return;
    }
    if (o.key === 'Tab') {
      o.preventDefault();
      kapat();
      return;
    }
    const dugmeler = [...(kutu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const simdi = dugmeler.indexOf(document.activeElement as HTMLElement);
    const son = dugmeler.length - 1;
    const hedef = o.key === 'ArrowDown' ? (simdi >= son ? 0 : simdi + 1)
      : o.key === 'ArrowUp' ? (simdi <= 0 ? son : simdi - 1)
        : o.key === 'Home' ? 0
          : o.key === 'End' ? son
            : null;
    if (hedef === null) return;
    o.preventDefault();
    dugmeler[hedef]?.focus();
  };
  const sec = (oge: MenuOgesi) => {
    if (oge.pasif) return;
    kapat();
    oge.sec();
  };
  const odakSirasi = ilkOdak === 'son' ? ogeler.length - 1 : 0;

  return (
    <>
      <Dugme
        id={dugmeKimlik}
        className={`tc-menu-dugme${metin ? '' : ' tc-menu-dugme-simge'}`}
        simge={simge ?? undefined}
        aria-label={etiket}
        title={ipucu}
        aria-haspopup="menu"
        aria-expanded={acik}
        aria-controls={acik ? menuKimlik : undefined}
        disabled={pasif}
        // Menü çoğu zaman tıklanabilir satırın içindedir: düğme ve öğeler satırın kendi seçimini tetiklemez.
        onClick={(o) => { o.stopPropagation(); if (acik) kapat(); else ac('bas'); }}
        onKeyDown={dugmeTusu}
      >
        {metin}
      </Dugme>
      {acik && hedef && createPortal(
        <div
          ref={kutu}
          id={menuKimlik}
          className="tc-menu"
          role="menu"
          aria-label={etiket}
          tabIndex={-1}
          onKeyDown={menuTusu}
          onClick={(o) => { o.stopPropagation(); }}
        >
          {ogeler.map((oge, sira) => {
            const nedenKimlik = oge.pasif && oge.pasifNedeni ? `${menuKimlik}-${sira}` : undefined;
            return (
              <button
                key={oge.anahtar}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`tc-menu-oge${oge.ton === 'tehlike' ? ' tc-menu-oge-tehlike' : ''}`}
                aria-label={nedenKimlik ? oge.baslik : undefined}
                aria-disabled={oge.pasif || undefined}
                aria-describedby={nedenKimlik}
                data-ilk-odak={sira === odakSirasi || undefined}
                onClick={() => { sec(oge); }}
              >
                {oge.simge && <Simge ad={oge.simge} />}
                <span className="tc-menu-metin">
                  {oge.baslik}
                  {nedenKimlik && <small id={nedenKimlik} className="tc-menu-neden">{oge.pasifNedeni}</small>}
                </span>
              </button>
            );
          })}
        </div>,
        hedef,
      )}
    </>
  );
}
