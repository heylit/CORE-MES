import { useLayoutEffect, useRef } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { OperasyonKutuculari } from './AdimPaneli.tsx';
import { adimDali, serbestDal, sirali, statuNo, type Operasyon } from './kurallar.ts';
import type { RotaEkrani } from './ortak.tsx';

export interface EkleYeri { urunId: string; sonraId: string | null; dal?: string; katilir?: string }

// 3295 a: yatay hatta operasyon listesi yerinde açılır: tıklanan "+"nın altında, telefonda alttan. Ayrı başlayan ve buradan ayrılan dal
// da bu listeden açılır; dal seçilince liste açık kalır, dalın ilk operasyonu seçilir.
export function EkleListesi({ r, yer, yerMetni, ekle, kapat }: {
  r: RotaEkrani; yer: EkleYeri; yerMetni: string | null; ekle: (op: Operasyon) => void; kapat: () => void;
}) {
  const kutu = useRef<HTMLDivElement>(null);
  const liste = sirali(r.duzen.adimlar(yer.urunId));
  const onceki = yer.sonraId === null ? undefined : liste.find((x) => x.id === yer.sonraId);
  const yeniDal = serbestDal(liste);
  // Dal seçenekleri yalnız ana hattaki adımın "+"sındadır ve dal henüz seçilmemişken görünür.
  const dalSecilir = onceki !== undefined && adimDali(onceki) === null && !yer.dal;
  const sonraki = onceki ? liste[liste.indexOf(onceki) + 1] : undefined;

  // Konum: tıklanan "+"nın altı (yer yoksa üstü); çapa yoksa (rotanın başı, düzenleme alanındaki düğme) hattın üstü. Sayfa kayınca birlikte gider.
  useLayoutEffect(() => {
    const el = kutu.current;
    if (!el) return undefined;
    const yerlestir = () => {
      const arti = yer.sonraId === null ? undefined : [...document.querySelectorAll<HTMLElement>('[data-ekle-capa]')].find((x) => x.dataset.ekleCapa === yer.sonraId);
      const capa = arti ?? document.querySelector<HTMLElement>('.tc-rr1-hat') ?? document.querySelector<HTMLElement>('.tc-rr1-hatli');
      if (!capa) return;
      const c = capa.getBoundingClientRect();
      const en = el.offsetWidth;
      el.style.setProperty('--tc-rr1-ekle-x', `${String(Math.max(0, Math.min(c.left, window.innerWidth - en)))}px`);
      // "+"nın altına sığarsa altına, üstüne sığarsa üstüne açılır. İkisine de sığmazsa ekran boyunun %70'ine kadar uzar ve "+"ya en
      // yakın, ekranın içinde kalan yere oturur (dar alanda iki operasyonla kalmasın).
      const pay = 8;
      const boy = el.scrollHeight;
      const alt = arti ? c.bottom : c.top;
      const asagida = window.innerHeight - alt - pay;
      const yukarida = c.top - pay;
      const tavan = Math.min(boy, window.innerHeight * 0.7);
      let y = alt;
      let alan = asagida;
      if (boy > asagida && boy <= yukarida) { y = c.top - boy; alan = yukarida; }
      else if (boy > asagida) { y = Math.max(pay, Math.min(alt, window.innerHeight - pay - tavan)); alan = window.innerHeight - y - pay; }
      el.style.setProperty('--tc-rr1-ekle-boy', `${String(Math.max(0, alan))}px`);
      el.style.setProperty('--tc-rr1-ekle-y', `${String(y)}px`);
    };
    yerlestir();
    // Operasyon listesi sonradan gelince kutu uzar: konum yeniden hesaplanır.
    const gozcu = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(yerlestir);
    gozcu?.observe(el);
    window.addEventListener('resize', yerlestir);
    window.addEventListener('scroll', yerlestir, true);
    return () => { gozcu?.disconnect(); window.removeEventListener('resize', yerlestir); window.removeEventListener('scroll', yerlestir, true); };
  }, [yer.sonraId]);

  // Dışarı tıklanınca ve Esc ile kapanır; "+" düğmesine tıklama listeyi yeniden açar, kapatmaz.
  useLayoutEffect(() => {
    const disari = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || kutu.current?.contains(t) || t.closest('[data-ekle-capa], [role="dialog"], [role="menu"]')) return;
      kapat();
    };
    document.addEventListener('pointerdown', disari);
    return () => { document.removeEventListener('pointerdown', disari); };
  }, [kapat]);

  return (
    <div ref={kutu} id="tc-rr1-palet" className="tc-rr1-ekle-liste" role="dialog" aria-label="Adım ekle"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); kapat(); } }}>
      <div className="tc-rr1-cekmece-bas">
        <b>{yerMetni ?? 'Adım ekle'}</b>
        <button type="button" className="tc-rr1-ib" onClick={kapat} aria-label="Listeyi kapat" title="Listeyi kapat (Esc)"><Simge ad="x" boyut="k" /></button>
      </div>
      <OperasyonKutuculari r={r} sec={(op) => { ekle(op); kapat(); }} />
      {dalSecilir && (
        <section className="tc-rr1-isec" aria-label="Dal">
          <h4>Dal</h4>
          <button type="button" className="tc-rr1-pick" disabled={yeniDal === null || sonraki === undefined}
            title={yeniDal === null ? 'Sekiz dalın hepsi kullanılıyor' : sonraki === undefined ? 'Son adımdan dal ayrılmaz' : undefined}
            onClick={() => { if (yeniDal) r.sec({ tur: 'adimEkle', urunId: yer.urunId, sonraId: onceki.id, dal: yeniDal }); }}>
            <Simge ad="route" boyut="k" /> Bu adımdan dal ayır (OP {String(statuNo(onceki))})
          </button>
          <button type="button" className="tc-rr1-pick" disabled={yeniDal === null}
            title={yeniDal === null ? 'Sekiz dalın hepsi kullanılıyor' : undefined}
            onClick={() => {
              if (yeniDal) r.sec({ tur: 'adimEkle', urunId: yer.urunId, sonraId: liste[liste.indexOf(onceki) - 1]?.id ?? null, dal: yeniDal, katilir: onceki.id });
            }}>
            <Simge ad="up" boyut="k" /> Bu adıma katılan dal (OP {String(statuNo(onceki))}; rotanın başından başlar)
          </button>
        </section>
      )}
    </div>
  );
}
