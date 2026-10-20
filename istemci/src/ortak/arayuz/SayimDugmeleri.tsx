import { Simge } from './Simge.tsx';
import './sayim-dugmeleri.css';

interface Ozellikler {
  etiket?: string;
  arttir: () => void;
  azalt: () => void;
  // Hurda nedensiz yazılmaz: ekran bu olayda neden seçimini açar.
  hurda: () => void;
  // Üçü birden kapanır (ör. iş çalışmıyor).
  pasif?: boolean;
  // Yalnız eksiltme kapanır (ör. sayaç sıfır).
  azaltPasif?: boolean;
}

// Her dokunuş bir olaydır: düğmeler beklemez, birleştirmez, kısıtlamaz; art arda dokunuşu sayan ekrandır.
export function SayimDugmeleri({ etiket = 'Sayım', arttir, azalt, hurda, pasif = false, azaltPasif = false }: Ozellikler) {
  return (
    <div className="tc-sayim" role="group" aria-label={etiket}>
      <button type="button" className="tc-sayim-hap" disabled={pasif || azaltPasif} onClick={azalt} aria-label="Sağlam eksi bir">
        <Simge ad="minus" />1
      </button>
      <button type="button" className="tc-sayim-hap tc-sayim-hurda" disabled={pasif} onClick={hurda} aria-label="Hurda artı bir">
        <Simge ad="trash" />Hurda +1
      </button>
      <button type="button" className="tc-sayim-hap tc-sayim-saglam" disabled={pasif} onClick={arttir} aria-label="Sağlam artı bir">
        <Simge ad="plus" />Sağlam +1
      </button>
    </div>
  );
}
