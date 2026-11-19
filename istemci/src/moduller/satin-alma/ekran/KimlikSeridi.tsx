import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Rozet, Simge } from '../../../ortak/arayuz/index.ts';
import { durumEtiketi } from '../merkez/calc.ts';
import { kalemOzeti } from '../merkez/kimlik.ts';
import type { PurchaseRequest } from '../merkez/tipler.ts';
import { dayDiff, fmtDate, todayStr } from '../merkez/util.ts';
import { gecikmisMi } from '../merkez/views.ts';

export function durumTonu(r: PurchaseRequest, bugun: string) {
  return r.status === 'cancelled' ? 'pasif' : gecikmisMi(r, bugun) ? 'hata' : r.status === 'received' ? 'tamam' : 'uyari';
}
export function ihtiyacMetni(r: PurchaseRequest, bugun: string): string {
  const d = dayDiff(bugun, r.needDate);
  const acik = ['draft', 'rfq', 'eval', 'approval'].includes(r.status);
  return `İhtiyaç ${fmtDate(r.needDate)}${acik ? (d < 0 ? `, ${String(-d)} gün geçti` : ` (${String(d)} gün)`) : ''}`;
}

// 3442-3: talebin başlığı kaydırmayla görünmez olunca kimliği (no, ad, durum, ihtiyaç, kalemler, adım) ince bir şeritte üstte kalır;
// satın almanın her adımında ve onaylayanın ekranında aynı. Şerit merkezin iskeletindeki #sa-serit'tedir (yüksekliksiz yapışkan kap):
// başlık merkezin gövdesinde her çizimde yeniden kurulabildiği için gözlemci değil kaydırma olayı başlığı her seferinde yeniden bulur.
export function KimlikSeridi({ r, adim, baslik }: { r: PurchaseRequest; adim: string; baslik: string }) {
  const [yer, yerYaz] = useState<HTMLElement | null>(null);
  const [gorunur, gorunurYaz] = useState(false);
  useEffect(() => {
    // Sayfada tek merkez bağlıdır (bagla.ts); onaylayanın ekranında bu bileşen #sa-ekran'a bir şey çizmez (boş kalmalı).
    const serit = document.getElementById('sa-serit');
    const kap = serit?.closest<HTMLElement>('.mainwrap') ?? null;
    const kutu = kap?.closest<HTMLElement>('.sa-kok') ?? null;
    yerYaz(serit);
    if (!kap || !serit || !kutu) return undefined;
    // Üst çubuk geniş ekranda yapışkandır (şerit onun altına iner), telefonda akar (şerit en üste).
    const cubuk = kap.querySelector<HTMLElement>('.topbar');
    const ust = () => (cubuk && getComputedStyle(cubuk).position === 'sticky' ? cubuk.offsetHeight : 0);
    const bak = () => {
      const u = ust();
      serit.style.setProperty('--sa-ust', `${String(u)}px`);
      const b = kap.querySelector(baslik);
      gorunurYaz(b !== null && b.getBoundingClientRect().bottom < kutu.getBoundingClientRect().top + u);
    };
    bak();
    kutu.addEventListener('scroll', bak, { passive: true });
    window.addEventListener('resize', bak);
    return () => { kutu.removeEventListener('scroll', bak); window.removeEventListener('resize', bak); gorunurYaz(false); };
  }, [r.id, baslik]);
  const bugun = todayStr();
  return yer && createPortal(
        <div className="sa-serit" data-gorunur={gorunur ? '' : undefined} aria-hidden={!gorunur} role="region" aria-label="Talebin kimliği">
          <span className="sa-serit-no">{r.no}</span>
          <b className="sa-serit-ad">{r.title}</b>
          <Rozet ton={durumTonu(r, bugun)}>{durumEtiketi(r)}</Rozet>
          {r.needDate && <span className="sa-serit-bilgi sa-serit-ihtiyac"><Simge ad="calendar" boyut="k" />{ihtiyacMetni(r, bugun)}</span>}
          {r.needDate && <span className="sa-serit-bilgi sa-serit-kisa" title={ihtiyacMetni(r, bugun)}><Simge ad="calendar" boyut="k" />{fmtDate(r.needDate)}</span>}
          <span className="sa-serit-bilgi sa-serit-kalem"><Simge ad="list" boyut="k" />{kalemOzeti(r, 1)}</span>
          {adim && <span className="sa-serit-bilgi sa-serit-adim">{adim}</span>}
        </div>,
        yer,
      );
}
