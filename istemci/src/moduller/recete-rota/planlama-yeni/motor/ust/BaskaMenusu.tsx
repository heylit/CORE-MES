import { useEffect, useRef } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { HAZIRLANIYOR, YOK_NOTU } from '../ortak.tsx';

// "Başka" menüsü (zj-gorunum sgMenu, zk-kabuk, zo-kontrol, zp-klavye): kartlar, tahtada gösterilenler, düzen ve sayfalar. Kartlar ve
// tahtadaki katmanlar haritayla ve keşifle gelir; menü dışı sayfaların yeni ekranda karşılığı yoktur (459/5 a).
const KARTLAR: [string, SimgeAdi][] = [
  ['Plan', 'target'], ['Siparişler', 'list'], ['Kuyruklar', 'sort'], ['Senaryolar', 'layers'], ['Kısıt ve veri', 'gear'], ['Hesaplar', 'chart'],
  ['Ne neyi etkiliyor', 'scan'], ['Reçete ve Rota', 'tool'],
];
const BOLUMLER: { ad: string; l: { ad: string; simge: SimgeAdi; not: string; tus?: string }[] }[] = [
  { ad: 'Kartlar', l: KARTLAR.map(([ad, simge], i) => ({ ad, simge, not: HAZIRLANIYOR, tus: String(i + 1) })) },
  { ad: 'Tahtada göster', l: [{ ad: 'Önceki planla fark', simge: 'eye', not: HAZIRLANIYOR }, { ad: 'Gecikme kaynağı', simge: 'chart', not: HAZIRLANIYOR }, { ad: 'Nasıl okunur', simge: 'help', not: HAZIRLANIYOR }] },
  { ad: 'Düzen', l: [{ ad: 'Klavye kısayolları', simge: 'help', not: HAZIRLANIYOR }, { ad: 'Kartları bölgelere diz', simge: 'grid', not: HAZIRLANIYOR }] },
  { ad: 'Sayfalar', l: [{ ad: 'Bugünün kararları', simge: 'check', not: YOK_NOTU }, { ad: 'Nasıl hesaplandı', simge: 'chart', not: YOK_NOTU }] },
];

export function BaskaMenusu({ acik, ac }: { acik: boolean; ac: (v: boolean) => void }) {
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
          {BOLUMLER.map((b) => (
            <div key={b.ad} role="group" aria-label={b.ad}>
              <small>{b.ad}</small>
              {b.l.map((x) => (
                <button key={x.ad} type="button" role="menuitem" aria-disabled="true" title={`${x.ad}: ${x.not}`}>
                  <Simge ad={x.simge} boyut="k" /><span>{x.ad}</span>{x.tus && <kbd>{x.tus}</kbd>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
