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
// Fare okta beklerken şeridin hızı (piksel / milisaniye).
const KAYMA_HIZI = 0.6;
// Yerleşim ölçülemezse (sayfa henüz çizilmediyse) okun bir tıkta atlattığı görünür genişlik oranı.
const SAYFA_ORANI = 0.75;
// Satır ve sayfa kipindeki tekerlek adımı piksele çevrilir (Firefox satır kipinde yollar).
const SATIR_PIKSELI = 40;

type Yon = 1 | -1;

function kaydirmaSiniri(el: HTMLElement) {
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

function sinirla(el: HTMLElement, hedef: number) {
  return Math.min(kaydirmaSiniri(el), Math.max(0, hedef));
}

function kaydir(el: HTMLElement, hedef: number) {
  el.scrollLeft = sinirla(el, hedef);
}

// Bir sayfa ilerisi ya da gerisi, sekme sınırına hizalı: ileride okun altında yarım kalan ilk sekme sola, geride solda
// yarım kalan son sekme sağa yaslanır; yarım sekmeyle başlayan ya da biten sayfa olmaz. Yerleşim yoksa orana düşer.
function sayfaHedefi(el: HTMLElement, yon: Yon, pay: number) {
  const kutu = el.getBoundingClientRect();
  const maddeler = [...el.querySelectorAll<HTMLElement>('a[data-anahtar]')].map((a) => a.getBoundingClientRect());
  const sol = kutu.left + pay;
  const sag = kutu.right - pay;
  if (kutu.width > 0 && sag > sol) {
    if (yon > 0) {
      const ilk = maddeler.find((k) => k.right > sag + 1);
      if (ilk) return el.scrollLeft + Math.min(ilk.left - sol, sag - sol);
    } else {
      const son = maddeler.filter((k) => k.left < sol - 1).at(-1);
      if (son) return el.scrollLeft - Math.min(sag - son.right, sag - sol);
    }
  }
  const kalan = yon > 0 ? kaydirmaSiniri(el) - el.scrollLeft : el.scrollLeft;
  // Gizli kalan kısım bir ekrandan kısaysa uca gidilir: yoksa uçta okun altında birkaç piksel kalır, ikinci tık gerekir.
  return el.scrollLeft + yon * (kalan < el.clientWidth ? kalan : el.clientWidth * SAYFA_ORANI);
}

// Modülün kendi sayfaları. Kabuk çizer; modül yalnız tanımı verir. Her genişlikte başlığın altında yatay sekme şerididir;
// sığmayan madde yana kayar (kart #172). Gizli madde olan kenarda ok çıkar; oka tıklamak şeridi sekme sınırına hizalı bir
// sayfa kaydırır, fareyle okta beklemek şeridi sürekli kaydırır (karar 2225-1 b). Tekerlek yana çevrilir, dokunmada şerit
// parmakla kayar.
export function IkinciMenu({ menu, adres, sayaclar }: Ozellikler) {
  const kutu = useRef<HTMLElement>(null);
  const etkin = etkinMadde(menuMaddeleri(menu), adres);
  const etkinAnahtar = etkin?.anahtar ?? null;
  // Şeritte gizli madde olan kenar: ok orada görünür.
  const [kenar, kenarYaz] = useState({ sol: false, sag: false });
  const solOk = useRef<HTMLSpanElement>(null);
  const sagOk = useRef<HTMLSpanElement>(null);
  // Kullanıcı şeridi kendisi kaydırdıysa sonradan gelen sayı ya da yazı tipi şeridi etkin maddeye geri çekmez.
  const elle = useRef(false);
  const elleKaydirdi = () => { elle.current = true; };
  const kayma = useRef<number | null>(null);

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

  useEffect(() => dur, []);

  const sayfaAtla = (yon: Yon) => () => {
    const el = kutu.current;
    if (!el) return;
    elleKaydirdi();
    dur();
    const pay = (yon > 0 ? sagOk.current : solOk.current)?.offsetWidth ?? 0;
    const hedef = sinirla(el, sayfaHedefi(el, yon, pay));
    const yumusak = typeof el.scrollTo === 'function'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: no-preference)').matches
      && !document.documentElement.dataset['etkiKapali']?.split(' ').includes('menu-gecis');
    if (yumusak) el.scrollTo({ left: hedef, behavior: 'smooth' });
    else kaydir(el, hedef);
  };

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
                  data-anahtar={m.anahtar}
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
      {/* Klavye maddeler arasında okla gezer; oklar yalnız fare ve dokunma içindir. */}
      <span
        ref={solOk}
        className="tc-ikinci-ok tc-ikinci-ok-sol"
        aria-hidden="true"
        onPointerEnter={okaGir(-1)}
        onPointerLeave={dur}
        onClick={sayfaAtla(-1)}
      >
        <Simge ad="chev-left" boyut="k" />
      </span>
      <span
        ref={sagOk}
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
