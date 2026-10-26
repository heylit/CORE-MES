import { useEffect, useRef } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { KART_TURLERI, type KartTuru } from '../../ic/kartlar/kurallar.ts';
import { HAZIRLANIYOR, YOK_NOTU } from '../ortak.tsx';

// "Başka" menüsü (zj-gorunum sgMenu, zk-kabuk, zo-kontrol, zp-klavye): kartlar, tahtada gösterilenler, düzen ve sayfalar. Kartlar haritanın
// üstüne açılır (577d, zc-tahta), 1-8 tuşları da açıp kapatır; menü dışı sayfaların yeni ekranda karşılığı yoktur (459/5 a).
interface Madde { ad: string; simge: SimgeAdi; not?: string; tus?: string; basili?: boolean; yap?: () => void; dugme?: boolean }
// Haritanın katmanları menüden açılır: önceki planla fark (son canlı plan, 577c), gecikme kaynağı, kılavuz ve klavye kısayolları (P1b).
export interface BaskaDurumu {
  mercek: 'durum' | 'etki'; mercekSec: () => void; fark: boolean; farkSec: () => void; kilavuz: boolean; kilavuzAc: () => void; kisayolAc: () => void; planYaz: boolean;
  // Plan ekranının sayfaları (zk-kabuk sgMenu Sayfalar); verilmezse pasif.
  sayfaAc?: ((s: 'bugun' | 'hesap') => void) | null;
  // Tahta kartları: açık olanlar, hazır olanlar (öbürleri pasif), aç-kapat ve bölgelere diz; verilmezse hepsi pasif.
  kartlar?: { acik: KartTuru[]; hazir: KartTuru[]; degistir: (t: KartTuru) => void; diz: () => void } | null;
}
function bolumler(b: BaskaDurumu): { ad: string; l: Madde[] }[] {
  return [
    { ad: 'Kartlar', l: KART_TURLERI.map(({ tur, ad, simge }, i): Madde => {
      const k = b.kartlar; const tus = String(i + 1);
      return k?.hazir.includes(tur) ? { ad, simge, tus, basili: k.acik.includes(tur), yap: () => k.degistir(tur) } : { ad, simge, tus, not: HAZIRLANIYOR };
    }) },
    { ad: 'Tahtada göster', l: [
      { ad: 'Önceki planla fark', simge: 'eye', basili: b.fark, yap: b.farkSec },
      { ad: 'Gecikme kaynağı', simge: 'chart', basili: b.mercek === 'etki', yap: b.mercekSec },
      { ad: 'Nasıl okunur', simge: 'help', basili: b.kilavuz, yap: b.kilavuzAc },
    ] },
    { ad: 'Düzen', l: [
      b.planYaz ? { ad: 'Klavye kısayolları', simge: 'help', tus: '?', yap: b.kisayolAc, dugme: true } : { ad: 'Klavye kısayolları', simge: 'help', tus: '?', not: 'Plan yazma yetkiniz yok.' },
      b.kartlar?.acik.length ? { ad: 'Kartları bölgelere diz', simge: 'grid', yap: b.kartlar.diz, dugme: true } : { ad: 'Kartları bölgelere diz', simge: 'grid', not: b.kartlar ? 'Açık kart yok.' : HAZIRLANIYOR },
    ] },
    { ad: 'Sayfalar', l: [
      b.sayfaAc ? { ad: 'Bugünün kararları', simge: 'check', yap: () => b.sayfaAc?.('bugun'), dugme: true } : { ad: 'Bugünün kararları', simge: 'check', not: YOK_NOTU },
      b.sayfaAc ? { ad: 'Nasıl hesaplandı', simge: 'chart', yap: () => b.sayfaAc?.('hesap'), dugme: true } : { ad: 'Nasıl hesaplandı', simge: 'chart', not: YOK_NOTU },
    ] },
  ];
}

export function BaskaMenusu({ acik, ac, ...b }: { acik: boolean; ac: (v: boolean) => void } & BaskaDurumu) {
  const menu = useRef<HTMLDivElement>(null); const dugme = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!acik) return;
    menu.current?.querySelector('button')?.focus();
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') { ac(false); dugme.current?.focus(); } };
    const dokun = (e: PointerEvent) => { const h = e.target as Node | null; if (!menu.current?.contains(h) && !dugme.current?.contains(h)) ac(false); };
    document.addEventListener('keydown', tus); document.addEventListener('pointerdown', dokun, true);
    return () => { document.removeEventListener('keydown', tus); document.removeEventListener('pointerdown', dokun, true); };
  }, [acik, ac]);
  return (
    <>
      <button ref={dugme} type="button" className="tc-pym-sg-baska" aria-label="Başka" aria-haspopup="menu" aria-expanded={acik} title="Kartlar ve başka görünümler" onClick={() => ac(!acik)}>
        <Simge ad="layers" boyut="k" /><span>Başka</span><Simge ad="down" boyut="k" />
      </button>
      {acik && (
        <div ref={menu} className="tc-pym-sg-menu" role="menu" aria-label="Başka görünüm ve kartlar">
          {bolumler(b).map((g) => (
            <div key={g.ad} role="group" aria-label={g.ad}>
              <small>{g.ad}</small>
              {g.l.map((x) => (x.yap ? (
                <button key={x.ad} type="button" role={x.dugme ? 'menuitem' : 'menuitemcheckbox'} aria-checked={x.dugme ? undefined : x.basili ?? false} onClick={() => { ac(false); x.yap?.(); }}>
                  <Simge ad={x.simge} boyut="k" /><span>{x.ad}</span>{x.tus && <kbd>{x.tus}</kbd>}
                </button>
              ) : (
                <button key={x.ad} type="button" role="menuitem" aria-disabled="true" title={`${x.ad}: ${x.not ?? ''}`}>
                  <Simge ad={x.simge} boyut="k" /><span>{x.ad}</span>{x.tus && <kbd>{x.tus}</kbd>}
                </button>
              )))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
