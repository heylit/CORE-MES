import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TERIMLER } from './terimler/sozluk.ts';

// Uygulamanın glossify'ı: başlık, etiket ve ipucu metinlerinde sözlükteki terimin öğe başına ilk geçişi noktalı çizgiyle işaretlenir;
// üzerine gelince, odaklanınca ya da dokununca açıklama çıkar. Ekranlara dokunulmadan kabuk tarafından yapılır.
const HARF = '0-9A-Za-zÇĞİÖŞÜçğıöşü';
const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&');
const KALIP = new RegExp(`(^|[^${HARF}])(${Object.keys(TERIMLER).sort((a, b) => b.length - a.length).map(kacis).join('|')})(?=$|[^${HARF}])`);
// Uygulamadaki seçicilerin karşılığı: tablo başlığı, alan etiketi, sayfa alt başlığı, adım ipucu ve sorusu, başlıklar, gösterge adı.
const SECICI = 'th, .tc-alan-etiket, legend, .tc-sbaslik-alt, .tc-km-ipucu, h2, h3, .tc-km4-kpi-baslik';
const KOK = '.tc-km, [role="dialog"]';
const ATLA = '.tc-km-terim, button, a, .pv';
export const TERIM_SINIFI = 'tc-km-terim';

// Bölünen metin: React'in metin düğümü (asil) başta kalır; işaret ve kalan metin bizimdir. React metni değiştirirse ya da düğümü
// kaldırırsa bizimkiler silinir ve yeniden işaretlenir; böylece React'in tuttuğu düğümler hiç taşınmaz.
interface Bolunme { asil: Text; isaret: HTMLElement; kalan: Text }
// Kalan metin yeniden taranmaz: uygulamada bir metin düğümünde en çok bir terim işaretlenir.
const KALANLAR = new WeakSet<Text>();

export function isaretle(kok: ParentNode, kayitlar: Bolunme[]): void {
  kok.querySelectorAll<HTMLElement>(SECICI).forEach((el) => {
    if (el.closest(ATLA)) return;
    const goruldu = new Set([...el.querySelectorAll<HTMLElement>(`.${TERIM_SINIFI}`)].map((s) => s.dataset.terim));
    const yuruyen = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const metinler: Text[] = [];
    for (let n = yuruyen.nextNode(); n; n = yuruyen.nextNode()) if (!n.parentElement?.closest(ATLA) && !KALANLAR.has(n as Text)) metinler.push(n as Text);
    metinler.forEach((t) => {
      const m = KALIP.exec(t.nodeValue ?? '');
      if (!m || goruldu.has(m[2])) return;
      const terim = m[2]!;
      goruldu.add(terim);
      const kalan = t.splitText(m.index + m[1]!.length);
      kalan.nodeValue = (kalan.nodeValue ?? '').slice(terim.length);
      KALANLAR.add(kalan);
      const isaret = document.createElement('span');
      isaret.className = TERIM_SINIFI;
      isaret.tabIndex = 0;
      isaret.dataset.terim = terim;
      isaret.textContent = terim;
      t.parentNode?.insertBefore(isaret, kalan);
      kayitlar.push({ asil: t, isaret, kalan });
    });
  });
}

// Bölünmeyi geri alır: asil düğüm React'in bildiği tam metne döner.
function birlestir(b: Bolunme): void {
  if (b.asil.isConnected && b.isaret.isConnected && b.kalan.isConnected) b.asil.nodeValue = `${b.asil.nodeValue ?? ''}${b.isaret.textContent ?? ''}${b.kalan.nodeValue ?? ''}`;
  b.isaret.remove();
  b.kalan.remove();
}

function kokler(): Element[] {
  return [...document.querySelectorAll(KOK)].filter((k, _, l) => !l.some((u) => u !== k && u.contains(k)));
}

export function TerimIsaretleri({ kapali }: { kapali: boolean }) {
  const [ipucu, ipucuYaz] = useState<HTMLElement | null>(null);
  const kutu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (kapali) return undefined;
    const kayitlar: Bolunme[] = [];
    let bekleyen = 0;
    const gozcu = new MutationObserver((olaylar) => {
      gozcu.disconnect();
      const degisen = new Set(olaylar.filter((o) => o.type === 'characterData').map((o) => o.target));
      for (let i = kayitlar.length - 1; i >= 0; i--) {
        const b = kayitlar[i]!;
        if (degisen.has(b.asil) || !b.asil.isConnected || !b.isaret.isConnected || !b.kalan.isConnected) {
          b.isaret.remove();
          b.kalan.remove();
          kayitlar.splice(i, 1);
        }
      }
      gozle();
      cancelAnimationFrame(bekleyen);
      bekleyen = requestAnimationFrame(calistir);
    });
    const gozle = () => gozcu.observe(document.body, { childList: true, subtree: true, characterData: true });
    const calistir = () => {
      gozcu.disconnect();
      kokler().forEach((k) => isaretle(k, kayitlar));
      gozcu.takeRecords();
      gozle();
    };
    calistir();
    return () => {
      cancelAnimationFrame(bekleyen);
      gozcu.disconnect();
      kayitlar.forEach(birlestir);
    };
  }, [kapali]);

  useEffect(() => {
    if (kapali) return undefined;
    const terimi = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>(`.${TERIM_SINIFI}`) : null);
    const ustunde = (e: Event) => { const t = terimi(e); if (t) ipucuYaz(t); };
    const ayrildi = (e: Event) => { if (terimi(e)) ipucuYaz(null); };
    const tik = (e: Event) => {
      const t = terimi(e);
      if (t) { e.preventDefault(); e.stopPropagation(); ipucuYaz(t); } else ipucuYaz(null);
    };
    const gizle = () => ipucuYaz(null);
    document.addEventListener('mouseover', ustunde);
    document.addEventListener('mouseout', ayrildi);
    document.addEventListener('focusin', ustunde);
    document.addEventListener('focusout', gizle);
    document.addEventListener('click', tik, true);
    document.addEventListener('scroll', gizle, true);
    return () => {
      document.removeEventListener('mouseover', ustunde);
      document.removeEventListener('mouseout', ayrildi);
      document.removeEventListener('focusin', ustunde);
      document.removeEventListener('focusout', gizle);
      document.removeEventListener('click', tik, true);
      document.removeEventListener('scroll', gizle, true);
    };
  }, [kapali]);

  // Konum terimin altına, sığmazsa üstüne; ekran kenarında kalır (uygulamadaki gtip).
  useLayoutEffect(() => {
    const k = kutu.current;
    if (!ipucu || !k) return;
    const r = ipucu.getBoundingClientRect();
    const pay = 8;
    const x = Math.min(window.innerWidth - k.offsetWidth - pay, Math.max(pay, r.left));
    let y = r.bottom + 6;
    if (y + k.offsetHeight > window.innerHeight - pay) y = r.top - k.offsetHeight - 6;
    k.style.left = `${String(x)}px`;
    k.style.top = `${String(y)}px`;
  }, [ipucu]);

  if (kapali || !ipucu?.isConnected) return null;
  const terim = ipucu.dataset.terim ?? '';
  return createPortal(
    <div ref={kutu} className="tc-km-terim-ipucu" role="tooltip"><b>{terim}</b>{TERIMLER[terim] ?? ''}</div>,
    document.body,
  );
}
