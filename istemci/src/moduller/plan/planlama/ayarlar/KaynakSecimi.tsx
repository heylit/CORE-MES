import { useRef, type KeyboardEvent } from 'react';
import { KAYNAK_ETKISI, KAYNAK_SECIMLERI, kaynakAdi, type KaynakKisiti, type KaynakSecimi } from './alanlar.ts';
import './kaynak-secimi.css';

// Aparat ve ölçü aleti kısıtının iki seçimi (3650): Planlama ayarları, Kokpit paneli ve Veri > Kısıtlar aynı bileşeni kullanır.
// Seçim yalnız değeri bildirir; yazma ve etki akışı çağıranındır. Sert kısıt çalışmada kısıt "açık", Kısıt yok "kapalı" demektir.
export function KaynakSecimiGrubu({ kisit, deger, sec, kilitli = false, etki = true, kimlik }: {
  kisit: KaynakKisiti; deger: KaynakSecimi; sec: (s: KaynakSecimi) => void; kilitli?: boolean; etki?: boolean; kimlik: string;
}) {
  const kap = useRef<HTMLDivElement>(null);
  const tus = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const adim = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (adim === 0 || kilitli) return;
    e.preventDefault();
    const yeni = KAYNAK_SECIMLERI[(i + adim + KAYNAK_SECIMLERI.length) % KAYNAK_SECIMLERI.length]!;
    sec(yeni.deger);
    kap.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[(i + adim + KAYNAK_SECIMLERI.length) % KAYNAK_SECIMLERI.length]?.focus();
  };
  return (
    <div className="tc-pya-kaynak">
      <div className="tc-pya-kaynak-secim" role="radiogroup" aria-label={kaynakAdi(kisit)} aria-describedby={etki ? `${kimlik}-etki` : undefined} ref={kap}>
        {KAYNAK_SECIMLERI.map((s, i) => (
          <button
            key={s.deger} type="button" role="radio" aria-checked={s.deger === deger} tabIndex={s.deger === deger ? 0 : -1} disabled={kilitli}
            onClick={() => { if (s.deger !== deger) sec(s.deger); }} onKeyDown={(e) => { tus(e, i); }}
          >{s.ad}</button>
        ))}
      </div>
      {etki && <small id={`${kimlik}-etki`}>{KAYNAK_ETKISI[kisit][deger]}</small>}
    </div>
  );
}
