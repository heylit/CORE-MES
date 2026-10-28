import './ortak.css';

interface Ozellikler {
  etiket: string;
  asamalar: readonly string[];
  // Sıradaki aşamanın yeri; aşama sayısına eşit ya da büyükse hepsi bitmiştir.
  sira: number;
  // Aşamanın altındaki satır (kim, ne zaman); boşsa sıradaki aşamada "Sırada" yazar.
  bilgi?: readonly (string | null)[];
  atlanan?: readonly number[];
}

// Prototipin stages şeridi: biten, sıradaki ve gerekmeyen aşamalar tek satırda.
export function AsamaSeridi({ etiket, asamalar, sira, bilgi = [], atlanan = [] }: Ozellikler) {
  return (
    <ol className="dy-asamalar" aria-label={etiket}>
      {asamalar.map((ad, i) => {
        const atlandi = atlanan.includes(i);
        const hal = i < sira ? 'bitti' : i === sira ? 'sirada' : 'bekliyor';
        const alt = bilgi[i] ?? (atlandi ? 'Gerekmedi' : i === sira ? 'Sırada' : null);
        return (
          <li key={ad} className={`dy-asama dy-asama-${hal}${atlandi ? ' dy-asama-atlandi' : ''}`}
            aria-current={i === sira ? 'step' : undefined}>
            <span className="dy-asama-ad">{ad}</span>
            <span className="dy-asama-bilgi">{alt ?? ' '}</span>
          </li>
        );
      })}
    </ol>
  );
}
