import '../islenen-malzeme.css';
import { revYaz } from '../rev-yaz.ts';

// 3712: Taleplerim kalem satırında işlenen malzeme; karar ve sipariş ekranındaki blokla aynı görünüm (islenen-malzeme.css).
export function IslenenMalzeme({ uygulanan, kod, ad, revizyon, adet, fasonAdim }: { uygulanan: string | null; kod?: string | null; ad?: string | null; revizyon?: string | null; adet: string | null; fasonAdim: string | null }) {
  if (!uygulanan) return null;
  const bil = [revYaz(revizyon), adet, fasonAdim].filter(Boolean);
  return (
    <div className="sa-islenen">
      <span className="sa-islenen-etk">İşlenen malzeme</span>
      <b>{ad || uygulanan}</b>{kod && ad ? <span className="sub">{kod}</span> : null}
      {bil.length > 0 && <span className="sa-islenen-bil">{bil.map((x) => <span key={x}>{x}</span>)}</span>}
    </div>
  );
}
