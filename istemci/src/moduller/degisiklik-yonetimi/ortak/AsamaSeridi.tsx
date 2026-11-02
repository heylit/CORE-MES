import './ortak.css';

interface Ozellikler {
  etiket: string;
  asamalar: readonly string[];
  // Sıradaki aşamanın yeri; aşama sayısına eşit ya da büyükse hepsi bitmiştir.
  sira: number;
  // Aşamanın altındaki satır (kim, ne zaman); boşsa sıradaki aşamada "Sırada" yazar.
  bilgi?: readonly (string | null)[];
  atlanan?: readonly number[];
  // Sürecin durduğu aşama (ör. CCB reddi): başarı gibi değil durdu olarak çizilir, sonrakiler yapılmaz.
  durdu?: number | null;
}

// Prototipin stages şeridi: biten, sıradaki ve gerekmeyen aşamalar tek satırda.
export function AsamaSeridi({ etiket, asamalar, sira, bilgi = [], atlanan = [], durdu = null }: Ozellikler) {
  return (
    <ol className="dy-asamalar" aria-label={etiket}>
      {asamalar.map((ad, i) => {
        const sonra = durdu !== null && i > durdu;
        const atlandi = atlanan.includes(i) || sonra;
        const hal = i === durdu ? 'durdu' : i < sira ? 'bitti' : i === sira && durdu === null ? 'sirada' : 'bekliyor';
        const alt = bilgi[i] ?? (sonra ? 'Yapılmadı' : atlandi ? 'Gerekmedi' : hal === 'sirada' ? 'Sırada' : null);
        return (
          <li key={ad} className={`dy-asama dy-asama-${hal}${atlandi ? ' dy-asama-atlandi' : ''}`}
            aria-current={hal === 'sirada' || hal === 'durdu' ? 'step' : undefined}>
            <span className="dy-asama-ad">{ad}</span>
            <span className="dy-asama-bilgi">{alt ?? ' '}</span>
          </li>
        );
      })}
    </ol>
  );
}
