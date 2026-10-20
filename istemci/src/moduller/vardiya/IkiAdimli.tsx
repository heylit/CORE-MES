import { type ComponentProps, useState } from 'react';
import { Dugme } from '../../ortak/arayuz/index.ts';

// Prototipteki gibi iki adımlı: ilk dokunuş düğmeyi "Emin misin?" yapar, ikincisi komutu gönderir.
// `simge` verilirse ilk adım yalnız ikondur (dar sütunda yer kaplamaz); ad `etiket` olarak okunur.
export function IkiAdimli({ etiket, onayEtiketi, gonder, tehlike = false, disabled, simge }: {
  etiket: string; onayEtiketi: string; gonder: () => void; tehlike?: boolean; disabled?: boolean; simge?: ComponentProps<typeof Dugme>['simge'];
}) {
  const [hazir, hazirYaz] = useState(false);
  const ikon = simge !== undefined && !hazir;
  return (
    <Dugme tur={tehlike ? 'tehlike' : 'ikincil'} disabled={disabled} onBlur={() => hazirYaz(false)}
      simge={ikon ? simge : undefined} aria-label={ikon ? etiket : undefined} title={ikon ? etiket : undefined} className={ikon ? 'tc-vr-ikon' : undefined}
      onClick={() => { if (!hazir) { hazirYaz(true); return; } hazirYaz(false); gonder(); }}>
      {ikon ? null : hazir ? onayEtiketi : etiket}
    </Dugme>
  );
}
