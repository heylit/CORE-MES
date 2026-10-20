import { useEffect, useState } from 'react';
import { metneCevir, sayiyaCevir } from './gorunum.ts';

// Satır içi alanlar: yazarken değil, alandan çıkınca ya da Enter'da kaydeder (her tuşta taslak yazılmasın).
export function SayiAlani({ deger, kaydet, etiket, bosOlabilir = true, disabled, sinif }: {
  deger: number | null; kaydet: (d: number | null) => void; etiket: string; bosOlabilir?: boolean; disabled?: boolean; sinif?: string;
}) {
  const [metin, metinYaz] = useState(metneCevir(deger));
  useEffect(() => { metinYaz(metneCevir(deger)); }, [deger]);
  const bitir = () => {
    const yeni = sayiyaCevir(metin);
    if (yeni === null && !bosOlabilir) { metinYaz(metneCevir(deger)); return; }
    if (yeni !== deger) kaydet(yeni);
  };
  return (
    <input className={`tc-inp${sinif ? ` ${sinif}` : ''}`} inputMode="decimal" aria-label={etiket} value={metin} disabled={disabled}
      onChange={(o) => metinYaz(o.target.value)} onBlur={bitir} onKeyDown={(o) => { if (o.key === 'Enter') (o.target as HTMLInputElement).blur(); }} />
  );
}

export function MetinAlani({ deger, kaydet, etiket, disabled, sinif }: {
  deger: string; kaydet: (d: string) => void; etiket: string; disabled?: boolean; sinif?: string;
}) {
  const [metin, metinYaz] = useState(deger);
  useEffect(() => { metinYaz(deger); }, [deger]);
  const bitir = () => { const t = metin.trim(); if (t === '') metinYaz(deger); else if (t !== deger) kaydet(t); };
  return (
    <input className={`tc-inp${sinif ? ` ${sinif}` : ''}`} aria-label={etiket} value={metin} disabled={disabled} maxLength={80}
      onChange={(o) => metinYaz(o.target.value)} onBlur={bitir} onKeyDown={(o) => { if (o.key === 'Enter') (o.target as HTMLInputElement).blur(); }} />
  );
}
