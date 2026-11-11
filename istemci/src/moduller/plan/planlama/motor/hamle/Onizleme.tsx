import { Dugme, Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanVerisi } from '../../tipler.ts';
import { saatYaz, saatYazi } from '../kurallar.ts';
import type { DegisenSiparis, Hamleci } from './hamle.ts';
import './hamle.css';

// 2129-1 b: önizlenen hamlenin şeridi (eski c-masa hamle önizlemesi): ne değişti, ağırlıklı gecikme önce ve sonra, bitişi değişen siparişler;
// Uygula çalışmaya yazar (Geri al ile döner), Vazgeç atar. Önizleme yokken çizilmez.
const DEGISEN_GORUNEN = 6;
const DURUM: Record<DegisenSiparis['durum'], { ad: string; ton: 'tamam' | 'hata' | 'bilgi' }> = {
  'zamanina-girdi': { ad: 'zamanına girdi', ton: 'tamam' }, 'gecikmeye-dustu': { ad: 'gecikmeye düştü', ton: 'hata' }, ayni: { ad: '', ton: 'bilgi' },
};

export function HamleOnizlemesi({ h, D, ad }: { h: Hamleci | null; D: PlanVerisi; ad: (siparisId: string) => string }) {
  const o = h?.onizleme ?? null;
  if (!h || !o) return null;
  const once = o.gecikmeOnce, sonra = o.gecikmeSonra;
  const fark = sonra === null ? null : sonra - once;
  const gorunen = o.degisen.slice(0, DEGISEN_GORUNEN);
  return (
    <section className="tc-pym-hm" role="region" aria-label="Hamle önizlemesi" aria-live="polite">
      <div className="tc-pym-hm-ust">
        <Simge ad="eye" boyut="k" />
        <b>{o.ad}</b>
        <span className="tc-pym-hm-ozet">
          <span title="Öncelik ağırlıklı gecikme: geciken saat, öncelik 1 için 4, öncelik 2 için 2 katıyla sayılır.">Ağırlıklı gecikme</span> <b className="tc-pym-mono">{saatYazi(once)}</b> → <b className="tc-pym-mono">{saatYazi(sonra)}</b>
          {fark !== null && <Rozet ton={fark < -0.05 ? 'tamam' : fark > 0.05 ? 'uyari' : 'bilgi'}>{fark < 0 ? `${saatYazi(-fark)} az` : fark > 0 ? `${saatYazi(fark)} fazla` : 'aynı'}</Rozet>}
        </span>
        {o.siparisId !== null && (
          <span className="tc-pym-hm-ozet">{`${ad(o.siparisId)} bitişi `}<b className="tc-pym-mono">{saatYaz(D, o.bitisOnce)}</b> → <b className="tc-pym-mono">{saatYaz(D, o.bitisSonra)}</b></span>
        )}
        <span className="tc-pym-hm-dugmeler">
          <Dugme tur="birincil" simge="check" onClick={h.uygula}>Uygula</Dugme>
          <Dugme simge="x" onClick={h.vazgec}>Vazgeç</Dugme>
        </span>
      </div>
      {gorunen.length > 0 && (
        <ul className="tc-pym-hm-liste" aria-label="Bitişi değişen siparişler">
          {gorunen.map((x) => (
            <li key={x.siparisId}>
              <span>{ad(x.siparisId)}</span>
              <span className="tc-pym-mono">{saatYaz(D, x.once)} → {saatYaz(D, x.sonra)}</span>
              {x.durum !== 'ayni' && <Rozet ton={DURUM[x.durum].ton}>{DURUM[x.durum].ad}</Rozet>}
            </li>
          ))}
          {o.degisen.length > gorunen.length && <li className="tc-pym-hm-kalan">{`ve ${String(o.degisen.length - gorunen.length)} sipariş daha`}</li>}
        </ul>
      )}
    </section>
  );
}
