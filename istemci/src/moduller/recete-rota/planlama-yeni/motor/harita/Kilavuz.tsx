import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { KILAVUZ } from './kurallar.ts';

// Kılavuz kartı (y-atolye atKart, z-komuta kmAside): Harita'da tuvalin sağında, Özet'te sayfanın sağ üstünde aynı kart.
export function KilavuzKarti({ ornek, kapat }: { ornek: string | null; kapat: () => void }) {
  return (
    <aside className="tc-pym-at-kart" aria-label="Kılavuz">
      <header>
        <Simge ad="help" boyut="k" /><b>Nasıl okunur</b><span className="tc-pym-ara" />
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label="Kılavuzu kapat" title="Kılavuzu kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      <p className="tc-pym-kucuk-yazi">Her kutu bir tezgâh. Örnek: <b className="tc-pym-mono">{ornek ?? ''}</b>. Numaralar kutunun üstünde.</p>
      <ol className="tc-pym-at-yol tc-pym-at-kilavuz">
        {KILAVUZ.map(([b, m], i) => <li key={b}><b className="tc-pym-mono">{i + 1}</b><span><b>{b}</b> {m}</span></li>)}
      </ol>
      <div className="tc-pym-dugmeler">
        <button type="button" className="tc-dugme tc-dugme-birincil tc-pym-kucuk" onClick={kapat}><Simge ad="check" boyut="k" />Anladım</button>
      </div>
    </aside>
  );
}
