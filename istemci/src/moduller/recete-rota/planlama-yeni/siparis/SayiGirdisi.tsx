import { useState, type KeyboardEvent } from 'react';

// Sayı girdisi: değer alandan çıkınca ya da Enter'da yazılır (eski sayfanın change olayı).
export function SayiGirdisi({ deger, etiket, min, max, adim, yer, sinif = 'tc-pys-sayi', yaz }: {
  deger: number | null; etiket: string; min: number; max?: number; adim: number; yer?: string; sinif?: string; yaz: (metin: string) => void;
}) {
  const [metin, metinYaz] = useState(deger == null ? '' : String(deger));
  const [onceki, oncekiYaz] = useState(deger);
  if (onceki !== deger) { oncekiYaz(deger); metinYaz(deger == null ? '' : String(deger)); }
  const bitir = () => { if (metin !== (deger == null ? '' : String(deger))) yaz(metin); };
  return (
    <input
      className={`tc-alan-kutu ${sinif}`} type="number" min={min} max={max} step={adim} value={metin} placeholder={yer} aria-label={etiket}
      onChange={(e) => { metinYaz(e.target.value); }} onBlur={bitir}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') bitir(); }}
    />
  );
}
