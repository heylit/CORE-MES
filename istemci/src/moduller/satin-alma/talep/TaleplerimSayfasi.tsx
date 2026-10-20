import { TalepAc } from './TalepAc.tsx';
import { Taleplerim } from './Taleplerim.tsx';
import './talep.css';

// Ana sayfadaki iki kartın sayfası: talep satın almanın talep listesine ve onay akışına düşer.
export function TaleplerimSayfasi() {
  return (
    <div className="sa-talep">
      <TalepAc />
      <Taleplerim />
    </div>
  );
}
