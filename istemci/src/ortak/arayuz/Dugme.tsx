import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent } from 'react';
import { etkiAcik } from '../veri/etki.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './dugme.css';

interface Ozellikler extends ButtonHTMLAttributes<HTMLButtonElement> {
  tur?: 'birincil' | 'ikincil' | 'tehlike';
  boyut?: 'normal' | 'ana';
  simge?: SimgeAdi;
  yukleniyor?: boolean;
  // Basılı tutulunca onClick hızlanarak yinelenir (artır, azalt; kart 2090, karar 2081-17). Bırakınca gelen tıklama ayrıca
  // sayılmaz. Her dokunuşun ayrı bir olay olduğu düğmede (terminaldeki sayım) verilmez.
  basiliTekrar?: boolean;
  // Kayıt bitti: düğme kısa süre tikli "Kaydedildi" olur (kart 2092, karar 2081-27). Süreyi çağıran yönetir (useForm).
  tamam?: boolean;
  tamamMetni?: string;
}

// İlk yineleme bekler ki tek dokunuş tek adım kalsın; sonra her adımda kısalır.
const TEKRAR_ILK_MS = 400;
const TEKRAR_EN_KISA_MS = 50;
const TEKRAR_HIZLANMA = 0.8;

export function Dugme({
  tur = 'ikincil', boyut = 'normal', simge, yukleniyor = false,
  children, disabled, className, type = 'button', onPointerDown, basiliTekrar = false, tamam = false, tamamMetni = 'Kaydedildi', onClick, ...geri
}: Ozellikler) {
  const sinif = ['tc-dugme', `tc-dugme-${tur}`, `tc-dugme-${boyut}`, className].filter(Boolean).join(' ');
  const [dalga, dalgaYaz] = useState<{ no: number; x: number; y: number } | null>(null);
  // Dalga (karar 2081-9): dokunulan yerden yayılır; klavyeyle basışta yoktur (konum yok). Kurum kapattıysa ya da hareket
  // kapalıysa çizilmez; CSS azaltılmış harekette de oynatmaz.
  const tekrar = useRef<{ zaman: ReturnType<typeof setTimeout> | null; oldu: boolean }>({ zaman: null, oldu: false });
  const tekrarDur = () => {
    if (tekrar.current.zaman !== null) clearTimeout(tekrar.current.zaman);
    tekrar.current.zaman = null;
  };
  useEffect(() => tekrarDur, []);
  const tekrarBasla = (e: PointerEvent<HTMLButtonElement>) => {
    tekrar.current.oldu = false;
    if (!basiliTekrar || !onClick || e.button > 0 || !etkiAcik('hizli-artis')) return;
    const dugme = e.currentTarget;
    let bekle = TEKRAR_ILK_MS;
    const adim = () => {
      if (dugme.disabled || !dugme.isConnected) { tekrarDur(); return; }
      tekrar.current.oldu = true;
      onClick(e);
      bekle = Math.max(TEKRAR_EN_KISA_MS, bekle * TEKRAR_HIZLANMA);
      tekrar.current.zaman = setTimeout(adim, bekle);
    };
    tekrarDur();
    tekrar.current.zaman = setTimeout(adim, bekle);
  };
  const tekrarOlaylari = basiliTekrar
    ? { onPointerUp: tekrarDur, onPointerLeave: tekrarDur, onPointerCancel: tekrarDur, onContextMenu: (o: { preventDefault: () => void }) => { o.preventDefault(); } }
    : {};
  const bas = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    tekrarBasla(e);
    if (e.button > 0 || !etkiAcik('dalga') || document.documentElement.getAttribute('data-hareket') === 'kapali') return;
    const r = e.currentTarget.getBoundingClientRect();
    dalgaYaz((d) => ({ no: (d?.no ?? 0) + 1, x: e.clientX - r.left, y: e.clientY - r.top }));
  };
  return (
    <button {...geri} type={type} className={sinif} data-tamam={tamam && !yukleniyor ? '' : undefined} disabled={disabled || yukleniyor} aria-busy={yukleniyor || undefined} onPointerDown={bas}
      {...tekrarOlaylari}
      onClick={onClick && ((o) => {
        // Basılı tutma yinelediyse bırakınca gelen tıklama son adımı ikiler; yutulur.
        // Klavyeyle gelen tıklama (detail 0) her zaman sayılır.
        const yutulur = tekrar.current.oldu && o.detail > 0;
        tekrar.current.oldu = false;
        if (yutulur) return;
        onClick(o);
      })}>
      {yukleniyor ? <span className="tc-dugme-doner" aria-hidden="true" /> : tamam ? <Simge ad="check" /> : simge ? <Simge ad={simge} /> : null}
      {tamam && !yukleniyor ? tamamMetni : children}
      {dalga && (
        <span className="tc-dugme-dalga-kap" aria-hidden="true">
          <span key={dalga.no} className="tc-dugme-dalga" onAnimationEnd={() => { dalgaYaz(null); }}
            ref={(el) => { el?.style.setProperty('--dalga-x', `${dalga.x}px`); el?.style.setProperty('--dalga-y', `${dalga.y}px`); }} />
        </span>
      )}
    </button>
  );
}
