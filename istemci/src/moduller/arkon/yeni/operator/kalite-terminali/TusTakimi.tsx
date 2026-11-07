import { tusaBas } from './kurallar.ts';

// Ekranda kalan ondalık tuş takımı (eldivenle; cihaz klavyesi açılmaz). Ortaktaki TusTakimi tam sayı penceresidir; ölçü virgül ister.
const TUSLAR = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', 'sil'] as const;

export function OndalikTuslar({ deger, degistir, etiket }: { deger: string; degistir: (yeni: string) => void; etiket: string }) {
  return (
    <div className="tc-kt-tuslar" role="group" aria-label={`${etiket} tuşları`}>
      {TUSLAR.map((t) => (
        <button key={t} type="button" className="tc-kt-tus" data-tur={t === 'sil' ? 'sil' : undefined} aria-label={t === 'sil' ? 'Sil' : t === ',' ? 'Virgül' : t}
          onClick={() => degistir(tusaBas(deger, t))}>
          {t === 'sil' ? 'Sil' : t}
        </button>
      ))}
    </div>
  );
}

export function DegerKutusu({ etiket, deger, birim, secili, sec }: { etiket: string; deger: string; birim?: string; secili?: boolean; sec?: () => void }) {
  return (
    <button type="button" className="tc-kt-deger" aria-pressed={secili ?? false} onClick={sec} aria-label={`${etiket}: ${deger || 'boş'}`}>
      <small>{etiket}</small>
      <b className="tc-ay1-mono">{deger || '—'}</b>
      {birim ? <small>{birim}</small> : null}
    </button>
  );
}
