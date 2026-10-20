import {
  useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode,
} from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import type { MakineDurumu } from './durum.ts';
import { Simge } from './Simge.tsx';
import './orb.css';

interface Ozellikler {
  simge: SimgeAdi;
  etiket: string;
  ton?: MakineDurumu;
  // Sıranın asıl eylemi: daha büyük ve dolgulu çizilir.
  ana?: boolean;
  disabled?: boolean;
  // Verilirse düğme dokunuşla değil, bu süre boyunca basılı tutulunca tetiklenir (geri alması zor eylemler için).
  basiliTutMs?: number;
  tetikle: () => void;
  // Süre dolmadan bırakılınca çağrılır; ekran neden olmadığını söyleyebilsin diye.
  erkenBirakinca?: () => void;
}

const YARICAP = 50;
const CEVRE = 2 * Math.PI * YARICAP;
// Basılı tutamayan yardımcı teknoloji için ikinci etkinleştirmenin beklendiği süre.
export const ORB_ONAY_SURESI_MS = 5000;
// Tuş bırakılınca tarayıcının ürettiği tıklama, yardımcı teknoloji tıklaması sayılmasın diye.
const TUS_SONRASI_MS = 100;

export function Orb({
  simge, etiket, ton = 'sirada', ana = false, disabled = false, basiliTutMs, tetikle, erkenBirakinca,
}: Ozellikler) {
  const tut = basiliTutMs !== undefined && basiliTutMs > 0;
  const sure = basiliTutMs ?? 0;
  const [oran, oranYaz] = useState(0);
  const [sarsil, sarsilYaz] = useState(false);
  const [onayBekliyor, onayBekliyorYaz] = useState(false);
  const kare = useRef(0);
  const onaySayaci = useRef<ReturnType<typeof setTimeout>>();
  const baslangic = useRef<number | null>(null);
  const sonTus = useRef(-Infinity);
  const tetikleRef = useRef(tetikle);
  tetikleRef.current = tetikle;
  // Pasifleşme ile sürenin dolması aynı kareye düşebilir; iptal eden etki o kareden sonra koşar.
  const pasifRef = useRef(disabled);
  pasifRef.current = disabled;

  const vazgec = () => {
    cancelAnimationFrame(kare.current);
    clearTimeout(onaySayaci.current);
    baslangic.current = null;
  };
  useEffect(() => vazgec, []);
  // Basılıyken pasifleşen düğme (ör. istek gitti, durum değişti) süre dolunca tetiklememeli.
  useEffect(() => {
    if (!disabled) return;
    vazgec();
    oranYaz(0);
    onayBekliyorYaz(false);
  }, [disabled]);

  const adim = () => {
    if (baslangic.current === null) return;
    if (pasifRef.current) { baslangic.current = null; return; }
    const gecen = Math.min(1, (performance.now() - baslangic.current) / sure);
    oranYaz(gecen);
    if (gecen >= 1) {
      // Başlangıç silinir: bırakma artık "erken" sayılmaz ve aynı basış ikinci kez tetiklemez.
      baslangic.current = null;
      tetikleRef.current();
      return;
    }
    kare.current = requestAnimationFrame(adim);
  };
  const basla = () => {
    if (!tut || disabled || baslangic.current !== null) return;
    sarsilYaz(false);
    baslangic.current = performance.now();
    kare.current = requestAnimationFrame(adim);
  };
  const birak = () => {
    if (!tut) return;
    cancelAnimationFrame(kare.current);
    const erken = baslangic.current !== null;
    baslangic.current = null;
    oranYaz(0);
    if (erken) { sarsilYaz(true); erkenBirakinca?.(); }
  };

  const isaretBas = (o: PointerEvent<HTMLButtonElement>) => {
    if (!tut || disabled) return;
    // Parmak düğmenin dışına kaysa da bırakma olayı bu düğmeye gelsin.
    try { o.currentTarget.setPointerCapture(o.pointerId); } catch { /* yakalama desteklenmiyorsa ayrılma olayı yeter */ }
    basla();
  };
  // İşaretçi yakalanmışken tarayıcı ayrılma olayı göndermez; dışarı kaymayı konumdan anlarız.
  const isaretOynat = (o: PointerEvent<HTMLButtonElement>) => {
    if (baslangic.current === null) return;
    const k = o.currentTarget.getBoundingClientRect();
    if (o.clientX < k.left || o.clientX > k.right || o.clientY < k.top || o.clientY > k.bottom) birak();
  };
  const tusBas = (o: KeyboardEvent) => {
    if (!tut || (o.key !== ' ' && o.key !== 'Enter')) return;
    o.preventDefault();
    sonTus.current = performance.now();
    if (!o.repeat) basla();
  };
  const tusBirak = (o: KeyboardEvent) => {
    if (!tut || (o.key !== ' ' && o.key !== 'Enter')) return;
    o.preventDefault();
    sonTus.current = performance.now();
    birak();
  };
  // Basılı tutamayan yardımcı teknoloji yalnız tıklama üretir (detail 0). Dokunuş ve fare tıklaması (detail >= 1)
  // burada hiçbir şey yapmaz; yardımcı teknolojide de tek etkinleştirme yetmez, ikincisi ister.
  const tikla = (o: MouseEvent) => {
    if (!tut) { tetikle(); return; }
    if (o.detail !== 0 || performance.now() - sonTus.current < TUS_SONRASI_MS) return;
    clearTimeout(onaySayaci.current);
    if (onayBekliyor) { onayBekliyorYaz(false); tetikle(); return; }
    onayBekliyorYaz(true);
    onaySayaci.current = setTimeout(() => { onayBekliyorYaz(false); }, ORB_ONAY_SURESI_MS);
  };

  const sinif = ['tc-orb', ana && 'tc-orb-ana', tut && 'tc-orb-tut', sarsil && 'tc-orb-sarsil'].filter(Boolean).join(' ');
  const kalan = ((1 - oran) * sure / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ad = !tut ? etiket
    : onayBekliyor ? `${etiket}, onaylamak için yeniden etkinleştirin`
    : `${etiket}, basılı tutun`;
  return (
    <button
      type="button"
      className={sinif}
      data-durum={ton}
      disabled={disabled}
      aria-label={ad}
      onClick={tikla}
      onPointerDown={isaretBas}
      onPointerMove={tut ? isaretOynat : undefined}
      onPointerUp={birak}
      onPointerLeave={birak}
      onPointerCancel={birak}
      onBlur={birak}
      onContextMenu={tut ? (o) => { o.preventDefault(); } : undefined}
      onKeyDown={tusBas}
      onKeyUp={tusBirak}
      onAnimationEnd={() => { sarsilYaz(false); }}
    >
      <span className="tc-orb-yuz">
        <Simge ad={simge} boyut="b" />
        {tut && (
          <svg className={oran > 0 ? 'tc-orb-halka tc-orb-halka-acik' : 'tc-orb-halka'} viewBox="0 0 108 108" aria-hidden="true">
            <circle cx="54" cy="54" r={YARICAP} strokeDasharray={CEVRE} strokeDashoffset={CEVRE * (1 - oran)} />
          </svg>
        )}
      </span>
      <span className="tc-orb-etiket">{etiket}</span>
      <span className="tc-orb-ipucu" aria-hidden="true">
        {!tut ? ' ' : onayBekliyor ? 'Yeniden bas' : oran > 0 ? `${kalan} sn` : 'Basılı tut'}
      </span>
    </button>
  );
}

export function OrbGrubu({ etiket, children }: { etiket: string; children: ReactNode }) {
  return <div className="tc-orblar" role="group" aria-label={etiket}>{children}</div>;
}
