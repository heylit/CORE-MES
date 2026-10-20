import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import { etkinMadde, menuMaddeleri, type IkinciMenu as Tanim } from '../rota/ikinci-menu.ts';
import { Simge } from './Simge.tsx';
import './ikinci-menu.css';

interface Ozellikler {
  // Kullanıcının işlemlerine göre süzülmüş menü; boş grup taşımaz.
  menu: Tanim;
  adres: string;
  sayaclar: IkinciMenuSayaclari | null;
}

const ILERI = ['ArrowDown', 'ArrowRight'];
const GERI = ['ArrowUp', 'ArrowLeft'];
// Fare kenarda beklerken şeridin hızı (piksel / milisaniye) ve okun bir tıkta atlattığı görünür genişlik oranı.
const KAYMA_HIZI = 0.6;
const SAYFA_ORANI = 0.75;
// Satır ve sayfa kipindeki tekerlek adımı piksele çevrilir (Firefox satır kipinde yollar).
const SATIR_PIKSELI = 40;

type Yon = 1 | -1;

function kaydirmaSiniri(el: HTMLElement) {
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

function kaydir(el: HTMLElement, hedef: number) {
  el.scrollLeft = Math.min(kaydirmaSiniri(el), Math.max(0, hedef));
}

// Modülün kendi sayfaları. Kabuk çizer; modül yalnız tanımı verir. Her genişlikte başlığın altında yatay sekme şerididir:
// açılıp kapanmaz, sığmayan madde yana kayar (kullanıcı kararı, kart #172). Fare kaydırma çubuğu olmadan da kaydırır:
// kenardaki okta beklemek sürekli kaydırır, oka tıklamak bir sayfa atlatır, tekerlek yana çevrilir.
export function IkinciMenu({ menu, adres, sayaclar }: Ozellikler) {
  const kutu = useRef<HTMLElement>(null);
  const etkin = etkinMadde(menuMaddeleri(menu), adres);
  const etkinAnahtar = etkin?.anahtar ?? null;
  // Şeritte gizli madde olan kenar: işaret orada görünür (dokunulmaz, yalnız gösterir).
  const [kenar, kenarYaz] = useState({ sol: false, sag: false });
  const kayma = useRef<number | null>(null);
  // Kullanıcı şeridi kendisi kaydırdıysa sonradan gelen sayı ya da yazı tipi şeridi etkin maddeye geri çekmez.
  const elle = useRef(false);
  const elleKaydirdi = () => { elle.current = true; };

  const dur = () => {
    if (kayma.current !== null) cancelAnimationFrame(kayma.current);
    kayma.current = null;
  };

  const kenardaKay = (yon: Yon) => {
    elleKaydirdi();
    dur();
    let onceki: number | null = null;
    const adim = (zaman: number) => {
      const el = kutu.current;
      const gecen = onceki === null ? 0 : zaman - onceki;
      onceki = zaman;
      if (!el) { kayma.current = null; return; }
      kaydir(el, el.scrollLeft + yon * KAYMA_HIZI * gecen);
      // Uçta durur: ok o anda gizlenir ve fare çıkışı gelmeyebilir.
      const uc = yon > 0 ? el.scrollLeft >= kaydirmaSiniri(el) - 1 : el.scrollLeft <= 1;
      kayma.current = uc ? null : requestAnimationFrame(adim);
    };
    kayma.current = requestAnimationFrame(adim);
  };

  const okaGir = (yon: Yon) => (o: PointerEvent<HTMLElement>) => {
    // Dokunmada giriş olayı tıklamayla birlikte gelir; orada sayfa atlatmak yeter.
    if (o.pointerType === 'mouse') kenardaKay(yon);
  };

  const sayfaAtla = (yon: Yon) => () => {
    const el = kutu.current;
    if (!el) return;
    dur();
    const adim = el.clientWidth * SAYFA_ORANI;
    const kalan = yon > 0 ? kaydirmaSiniri(el) - el.scrollLeft : el.scrollLeft;
    // Gizli kalan kısım bir ekrandan kısaysa uca gidilir: yoksa uçta okun altında birkaç piksel kalır, ikinci tık gerekir.
    kaydir(el, el.scrollLeft + yon * (kalan < el.clientWidth ? kalan : adim));
  };

  useEffect(() => dur, []);

  // Tekerlek dikey döner; şerit kayabiliyorsa yana çevrilir, uca gelince sayfa kayar. React tekerlek olayı
  // pasif olduğundan dinleyici elle eklenir.
  useEffect(() => {
    const el = kutu.current;
    if (!el) return undefined;
    const teker = (o: WheelEvent) => {
      if (o.ctrlKey || Math.abs(o.deltaX) >= Math.abs(o.deltaY)) return;
      const carpan = o.deltaMode === 1 ? SATIR_PIKSELI : o.deltaMode === 2 ? el.clientWidth : 1;
      const once = el.scrollLeft;
      kaydir(el, once + o.deltaY * carpan);
      if (el.scrollLeft !== once) o.preventDefault();
    };
    el.addEventListener('wheel', teker, { passive: false });
    return () => { el.removeEventListener('wheel', teker); };
  }, []);

  useEffect(() => {
    const el = kutu.current;
    if (!el) return undefined;
    const olc = () => {
      const sol = el.scrollLeft > 1;
      const sag = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      kenarYaz((o) => (o.sol === sol && o.sag === sag ? o : { sol, sag }));
    };
    olc();
    void document.fonts?.ready.then(olc);
    el.addEventListener('scroll', olc, { passive: true });
    window.addEventListener('resize', olc);
    const gozcu = typeof ResizeObserver === 'function' ? new ResizeObserver(olc) : null;
    gozcu?.observe(el);
    return () => {
      el.removeEventListener('scroll', olc);
      window.removeEventListener('resize', olc);
      gozcu?.disconnect();
    };
  }, [menu, sayaclar]);

  // Etkin madde ekranın dışında kalabilir. Sayılar ve yazı tipi sonradan gelir, maddeler genişler:
  // yer o zaman yeniden bulunur; kullanıcı şeride dokunduysa bulunmaz, etkin madde değişince yeniden bulunur.
  const oncekiEtkin = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (oncekiEtkin.current !== etkinAnahtar) {
      oncekiEtkin.current = etkinAnahtar;
      elle.current = false;
    }
    let bitti = false;
    const goster = () => {
      if (elle.current) return;
      const oge = kutu.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!bitti && oge && typeof oge.scrollIntoView === 'function') oge.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    goster();
    void document.fonts?.ready.then(goster);
    return () => { bitti = true; };
  }, [etkinAnahtar, sayaclar]);

  const tus = (o: KeyboardEvent<HTMLElement>) => {
    const baglar = [...(kutu.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    const simdi = baglar.findIndex((b) => b === document.activeElement);
    if (simdi === -1) return;
    let hedef: number;
    if (ILERI.includes(o.key)) hedef = (simdi + 1) % baglar.length;
    else if (GERI.includes(o.key)) hedef = (simdi - 1 + baglar.length) % baglar.length;
    else if (o.key === 'Home') hedef = 0;
    else if (o.key === 'End') hedef = baglar.length - 1;
    else return;
    o.preventDefault();
    baglar[hedef]?.focus();
  };

  return (
    <div
      className="tc-ikinci-kap"
      data-sol={kenar.sol ? '' : undefined}
      data-sag={kenar.sag ? '' : undefined}
      onPointerDown={elleKaydirdi}
      onTouchStart={elleKaydirdi}
      onWheel={elleKaydirdi}
      onKeyDown={elleKaydirdi}
    >
      <nav ref={kutu} className="tc-ikinci" aria-label={`${menu.baslik} menüsü`} onKeyDown={tus}>
        {menu.gruplar.map((g) => (
          <div
            className="tc-ikinci-grup"
            key={g.baslik ?? ''}
            role={g.baslik === undefined ? undefined : 'group'}
            aria-label={g.baslik}
          >
            {g.maddeler.map((m) => {
              const sayi = sayaclar?.[m.anahtar];
              return (
                <Link
                  key={m.anahtar}
                  to={m.yol}
                  className={`tc-ikinci-madde${m.anahtar === etkinAnahtar ? ' tc-ikinci-madde-etkin' : ''}`}
                  aria-current={m.anahtar === etkinAnahtar ? 'page' : undefined}
                >
                  <Simge ad={m.simge} boyut="k" />
                  <span className="tc-ikinci-madde-ad">{m.baslik}</span>
                  {typeof sayi === 'number' && sayi > 0 && <span className="tc-ikinci-sayi mono">{sayi}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {/* Klavye maddeler arasında okla gezer; bu işaretler yalnız fare ve dokunma içindir. */}
      <span
        className="tc-ikinci-ok tc-ikinci-ok-sol"
        aria-hidden="true"
        onPointerEnter={okaGir(-1)}
        onPointerLeave={dur}
        onClick={sayfaAtla(-1)}
      >
        <Simge ad="chev-left" boyut="k" />
      </span>
      <span
        className="tc-ikinci-ok tc-ikinci-ok-sag"
        aria-hidden="true"
        onPointerEnter={okaGir(1)}
        onPointerLeave={dur}
        onClick={sayfaAtla(1)}
      >
        <Simge ad="chev-right" boyut="k" />
      </span>
    </div>
  );
}
