import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { AdimStatusu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { STATU } from './adim-durumu.ts';
import './rota-akisi.css';

export interface RotaAkisiAdimi { anahtar: string; opNo: number; ad: string; statu: AdimStatusu; yuzde: number; bu: boolean }

// Dokunulmadan bu kadar beklenince şerit bu adıma geri döner: operatör başka adıma bakıp bırakınca kendi adımı ortada kalsın.
export const BU_ADIMA_DONUS_MS = 8000;
// Fareyle sürüklemede bu kadar pikselden az kayma dokunmadır (kartı açar); fazlası kaydırmadır.
const SURUKLEME_ESIGI = 6;

type Kaydirilabilir = HTMLOListElement & { scrollTo?: (o: ScrollToOptions) => void };
function ortala(ol: Kaydirilabilir, li: HTMLElement, yumusak: boolean): void {
  const sol = li.offsetLeft - ol.offsetLeft - (ol.clientWidth - li.offsetWidth) / 2;
  if (typeof ol.scrollTo === 'function') ol.scrollTo({ left: sol, behavior: yumusak ? 'smooth' : 'auto' });
  else ol.scrollLeft = sol;
}

// 3136 a: emrin bütün adımları yan yana kart (simge, OP, ad, yüzde), bu adım işaretli, solda emrin toplam gidişatı.
// Statünün adı, tonu ve simgesi Adım Durumu ile aynı sözlüktendir. canli: ekrandaki işin anlık durumu; bu adımın kartında
// ve başlıkta çizilir, hangisinin görüneceğine kullanan ekran karar verir (dar ekranda kartta yer yok).
// Kartlar sabit genişlikte ve elle kayar: adım çoğalınca kart daralıp yazı kesilmez; bu adım ortada açılır ve bırakılınca oraya döner.
export function RotaAkisi({ adimlar, ac, canli = null }: { adimlar: readonly RotaAkisiAdimi[]; ac: () => void; canli?: ReactNode }) {
  const olRef = useRef<Kaydirilabilir>(null);
  const [uc, ucYaz] = useState({ sol: true, sag: true });
  const donus = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surukleme = useRef<{ x: number; sol: number; kaydi: boolean } | null>(null);
  const kaydi = useRef(false);
  // Parmak ya da fare şeritte durdukça geri dönüş beklenir: operatör ileriki adımı okurken şerit kaymaz.
  const dokunuyor = useRef(false);
  const buAnahtari = adimlar.find((a) => a.bu)?.anahtar ?? null;

  const buyaDon = useCallback((yumusak: boolean) => {
    const ol = olRef.current;
    const li = ol?.querySelector<HTMLElement>('li[aria-current="step"]');
    if (ol && li) ortala(ol, li, yumusak);
  }, []);
  const uclariOku = useCallback(() => {
    const ol = olRef.current;
    if (!ol) return;
    const sol = ol.scrollLeft <= 1;
    const sag = ol.scrollLeft >= ol.scrollWidth - ol.clientWidth - 1;
    ucYaz((o) => (o.sol === sol && o.sag === sag ? o : { sol, sag }));
  }, []);

  useLayoutEffect(() => { buyaDon(false); uclariOku(); }, [buAnahtari, adimlar.length, buyaDon, uclariOku]);
  useEffect(() => () => { if (donus.current) clearTimeout(donus.current); }, []);

  if (adimlar.length === 0) return null;
  const biten = adimlar.filter((a) => a.statu === 'bitti').length;
  // Toplam gidişat: adımların ilerleme yüzdelerinin ortalaması (her adım eşit ağırlık).
  const toplam = Math.round(adimlar.reduce((t, a) => t + a.yuzde, 0) / adimlar.length);

  const kaydirildi = () => {
    uclariOku();
    if (donus.current) clearTimeout(donus.current);
    donus.current = setTimeout(function don() {
      if (surukleme.current || dokunuyor.current) { donus.current = setTimeout(don, BU_ADIMA_DONUS_MS); return; }
      buyaDon(true);
    }, BU_ADIMA_DONUS_MS);
  };
  const birKart = (yon: -1 | 1) => {
    const ol = olRef.current;
    const li = ol?.querySelector<HTMLElement>('li');
    if (!ol || !li) return;
    const sol = ol.scrollLeft + yon * (li.offsetWidth + parseFloat(getComputedStyle(ol).columnGap || '0'));
    if (typeof ol.scrollTo === 'function') ol.scrollTo({ left: sol, behavior: 'smooth' });
    else ol.scrollLeft = sol;
    kaydirildi();
  };

  return (
    <section className="tc-ra" aria-label={`Rota: ${String(biten)}/${String(adimlar.length)} adım bitti, toplam yüzde ${String(toplam)}`}>
      <button type="button" className="tc-ra-ust" onClick={ac}>
        <Simge ad="route" boyut="k" /><b>Rota</b><span className="tc-ra-biten">{biten}/{adimlar.length} adım bitti</span>
        <span className="tc-ra-toplam"><progress max={100} value={toplam} aria-hidden="true" /><b className="tc-ra-mono">%{toplam}</b></span>
        {canli ? <span className="tc-ra-canli">{canli}</span> : null}
      </button>
      <div className="tc-ra-govde">
        <button type="button" className="tc-ra-kaydir" aria-label="Önceki adımlar" disabled={uc.sol} onClick={() => birKart(-1)}><Simge ad="chev-left" boyut="k" /></button>
        {/* Kartlar da başlık gibi açar: operatör büyük karta dokunur. Klavye ve ekran okuyucu yolu başlık düğmesidir.
            Dokunmatikte kaydırma tarayıcınındır; fareyle sürükleme burada kaydırır ve sürüklemeden sonra açılmaz. */}
        <ol
          ref={olRef}
          onScroll={kaydirildi}
          onClick={() => { if (kaydi.current) { kaydi.current = false; return; } ac(); }}
          onTouchStart={() => { dokunuyor.current = true; }}
          onTouchEnd={() => { dokunuyor.current = false; }}
          onTouchCancel={() => { dokunuyor.current = false; }}
          onPointerDown={(e) => {
            dokunuyor.current = true;
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            surukleme.current = { x: e.clientX, sol: e.currentTarget.scrollLeft, kaydi: false };
            kaydi.current = false;
          }}
          onPointerMove={(e) => {
            const s = surukleme.current;
            if (!s) return;
            const fark = e.clientX - s.x;
            if (!s.kaydi && Math.abs(fark) < SURUKLEME_ESIGI) return;
            if (!s.kaydi) { s.kaydi = true; e.currentTarget.setPointerCapture?.(e.pointerId); e.currentTarget.dataset.surukleniyor = ''; }
            e.currentTarget.scrollLeft = s.sol - fark;
          }}
          onPointerUp={(e) => { dokunuyor.current = false; kaydi.current = surukleme.current?.kaydi ?? false; surukleme.current = null; delete e.currentTarget.dataset.surukleniyor; }}
          onPointerCancel={(e) => { dokunuyor.current = false; surukleme.current = null; delete e.currentTarget.dataset.surukleniyor; }}
        >
          {adimlar.map((a) => {
            const g = STATU[a.statu];
            return (
              <li key={a.anahtar} data-ton={g.ton} aria-current={a.bu ? 'step' : undefined} data-canli={a.bu && canli ? '' : undefined} title={`OP ${String(a.opNo)} · ${a.ad} · ${g.ad} · %${String(a.yuzde)}`}>
                <span className="tc-ra-dugum" aria-hidden="true"><Simge ad={g.simge} boyut="k" /></span>
                <span className="tc-ra-op">OP {a.opNo}{a.bu ? <em>Bu adım</em> : null}</span>
                <span className="tc-ra-ad">{a.ad}</span>
                <span className="tc-ra-yuzde"><progress max={100} value={a.yuzde} aria-hidden="true" /><small className="tc-ra-mono">%{a.yuzde}</small></span>
                {a.bu && canli ? <span className="tc-ra-canli">{canli}</span> : null}
              </li>
            );
          })}
        </ol>
        <button type="button" className="tc-ra-kaydir" aria-label="Sonraki adımlar" disabled={uc.sag} onClick={() => birKart(1)}><Simge ad="chev-right" boyut="k" /></button>
      </div>
    </section>
  );
}
