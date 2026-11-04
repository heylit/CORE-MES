import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from './Simge.tsx';
import { useKatman } from './katman.ts';
import { etkiAcik, hareketliEtki } from '../veri/etki.ts';
import './pencere.css';

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  baslik: string;
  // orta: kısa form ve onay; yan: uzun form ve ayrıntı. Telefonda ikisi de tam genişliktir. tam: bütün görüntüyü kaplayan
  // çalışma alanı (düzenleyici); Esc kapat'ı çağırır, kaydedilmemiş iş varsa önce onay sormak kapat'ın işidir.
  tur?: 'orta' | 'yan' | 'tam';
  // Başlık satırının yerine çizilen araç çubuğu; verilince başlık görünmez, pencerenin adı olarak kalır ve kapatma düğmesi
  // çubuğun işidir.
  ust?: ReactNode;
  alt?: ReactNode;
  children: ReactNode;
}

// Telefonda pencere tutamaktan ya da başlıktan aşağı çekilince kapanır; eşiği geçmeyen çekiş yerine döner.
const TELEFON = '(max-width: 767px)';
const CEKME_ESIGI_PX = 96;
const CEKME_HIZI_PX_MS = 0.6;
const ETKILESIMLI = 'button, a, input, select, textarea, [role="button"], [contenteditable="true"]';
// Çıkış animasyonu bitmezse (sekme arka planda, animasyon kesildi) pencere yine kalkar.
const CIKIS_EN_COK_MS = 600;

interface Cekis { y0: number; t0: number; dy: number; kimlik: number }

export function Pencere({ acik, kapat, baslik, tur = 'orta', ust, alt, children }: Ozellikler) {
  const kutu = useKatman<HTMLDivElement>(acik, kapat);
  const baslikKimlik = useId();
  // Kapanırken içerik son açık hâliyle kalır; çağıran veriyi hemen boşaltsa da çıkış yarım pencere göstermez.
  const son = useRef({ children, ust, alt });
  if (acik) son.current = { children, ust, alt };
  const [oncekiAcik, oncekiAcikYaz] = useState(acik);
  const [cikis, cikisYaz] = useState(false);
  if (acik !== oncekiAcik) {
    oncekiAcikYaz(acik);
    cikisYaz(!acik && tur !== 'tam' && hareketliEtki('pencere-kayma'));
  }
  const cekis = useRef<Cekis | null>(null);

  useEffect(() => {
    if (acik) kutu.current?.style.removeProperty('--pencere-cek');
  }, [acik, kutu]);

  useEffect(() => {
    if (!cikis) return undefined;
    const el = kutu.current;
    const bitir = () => { cikisYaz(false); };
    const bitti = (o: AnimationEvent) => { if (o.target === el) bitir(); };
    el?.addEventListener('animationend', bitti);
    const sure = setTimeout(bitir, CIKIS_EN_COK_MS);
    return () => { el?.removeEventListener('animationend', bitti); clearTimeout(sure); };
  }, [cikis, kutu]);

  if (!acik && !cikis) return null;
  const gorunen = acik ? { children, ust, alt } : son.current;

  const cekBasla = (o: ReactPointerEvent<HTMLDivElement>) => {
    if (tur === 'tam' || !acik || o.button !== 0 || !etkiAcik('pencere-cekme')) return;
    if (typeof window.matchMedia !== 'function' || !window.matchMedia(TELEFON).matches) return;
    const hedef = o.target instanceof Element ? o.target : null;
    if (!hedef?.closest('.tc-pencere-tutamak, .tc-pencere-ust') || hedef.closest(ETKILESIMLI)) return;
    cekis.current = { y0: o.clientY, t0: o.timeStamp, dy: 0, kimlik: o.pointerId };
    o.currentTarget.setPointerCapture?.(o.pointerId);
  };
  const cekSur = (o: ReactPointerEvent<HTMLDivElement>) => {
    const c = cekis.current;
    if (c?.kimlik !== o.pointerId) return;
    c.dy = Math.max(0, o.clientY - c.y0);
    o.currentTarget.setAttribute('data-cekiliyor', '');
    o.currentTarget.style.setProperty('--pencere-cek', `${String(c.dy)}px`);
  };
  const cekBirak = (o: ReactPointerEvent<HTMLDivElement>, iptal: boolean) => {
    const c = cekis.current;
    if (c?.kimlik !== o.pointerId) return;
    cekis.current = null;
    const el = o.currentTarget;
    el.removeAttribute('data-cekiliyor');
    const hiz = c.dy / Math.max(1, o.timeStamp - c.t0);
    // Kapanışta kayma çekilen yerde kalır; çıkış animasyonu oradan aşağı devam eder.
    if (!iptal && (c.dy > CEKME_ESIGI_PX || (c.dy > 24 && hiz > CEKME_HIZI_PX_MS))) kapat();
    else el.style.setProperty('--pencere-cek', '0px');
  };

  return createPortal(
    <div
      className="tc-perde"
      data-kapaniyor={cikis ? '' : undefined}
      onMouseDown={(o) => { if (acik && o.target === o.currentTarget) kapat(); }}
    >
      <div
        ref={kutu}
        className={`tc-pencere tc-pencere-${tur}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={gorunen.ust === undefined ? baslikKimlik : undefined}
        aria-label={gorunen.ust === undefined ? undefined : baslik}
        tabIndex={-1}
        onPointerDown={cekBasla}
        onPointerMove={cekSur}
        onPointerUp={(o) => { cekBirak(o, false); }}
        onPointerCancel={(o) => { cekBirak(o, true); }}
      >
        {tur !== 'tam' && <span className="tc-pencere-tutamak" aria-hidden="true" />}
        {gorunen.ust === undefined
          ? (
            <header className="tc-pencere-ust">
              <h2 id={baslikKimlik} className="tc-pencere-baslik">{baslik}</h2>
              <button type="button" className="tc-pencere-kapat" onClick={kapat} aria-label="Kapat">
                <Simge ad="x" />
              </button>
            </header>
          )
          : gorunen.ust}
        <div className="tc-pencere-govde">{gorunen.children}</div>
        {gorunen.alt && <footer className="tc-pencere-alt">{gorunen.alt}</footer>}
      </div>
    </div>,
    document.body,
  );
}
