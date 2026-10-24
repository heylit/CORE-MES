import { useEffect, useRef } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { eylemYapisi } from './eylem.ts';
import type { Sorun } from './kurallar.ts';

// Yapılacaklar (zo-kontrol.betik ypHtml): sağ altta sayılı düğme, basınca kararlar listesi; her kararın ilk eylemi. "Hazır olmayan emirler"
// eski sayfada deneme verisiydi (208 a), gelmez.
interface Ozellikler {
  c: PlanlamaCalismasi; l: Sorun[]; acik: boolean; ac: (v: boolean) => void;
  komut: CalismaKomutu | null; sipSec: (j: string) => void;
  // Klavye kısayolları listesi aynı köşede açılır; aynı anda tek pencere (zp-klavye).
  kisayol: boolean; kisayolAc: (v: boolean) => void;
}
const KISAYOLLAR: [string, [string, string][]][] = [
  ['Görünüm', [['G', 'Özet'], ['H', 'Harita'], ['C', 'Çizelge'], ['K', 'Keşfet'], ['F', 'Sığdır'], ['+ -', 'Yakınlaş, uzaklaş'], ['1 - 8', 'Kartlar (Plan, Siparişler...)'], ['O', 'Seçili bölümün çizelgesi']]],
  ['Bul ve seç', [['/', 'Sipariş, tezgâh ya da komut ara'], ['Ctrl K', 'Komut arama'], ['Esc', 'Menüyü, sonra seçimi kapat']]],
  ['Düzenle', [['E', 'Seçilene göre Düzenle menüsü'], ['1 - 9', 'Menüdeki komut'], ['← →', 'İşi 1 saat kaydır (Shift: çeyrek)'], ['↑ ↓', 'Yapabilen bir önceki ya da sonraki tezgâh'], ['[ ]', 'Kuyrukta bir öne, bir arkaya'], ['Backspace', 'Menüde geri']]],
  ['Değişiklikler', [['D', 'Değişiklik listesi'], ['Ctrl Z', 'Geri al'], ['Ctrl Shift Z', 'Yinele'], ['Ctrl Enter', 'Onayla, listeyi temizle']]],
  ['Diğer', [['Y', 'Yapılacaklar'], ['?', 'Bu liste']]],
];

export function Yapilacaklar(o: Ozellikler) {
  const kap = useRef<HTMLDivElement>(null);
  const { acik, ac, kisayol, kisayolAc } = o;
  useEffect(() => {
    if (!acik && !kisayol) return undefined;
    const kapat = () => { ac(false); kisayolAc(false); };
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); kapat(); } };
    const dokun = (e: PointerEvent) => { if (!kap.current?.contains(e.target as Node | null)) kapat(); };
    document.addEventListener('keydown', tus, true); document.addEventListener('pointerdown', dokun, true);
    return () => { document.removeEventListener('keydown', tus, true); document.removeEventListener('pointerdown', dokun, true); };
  }, [acik, ac, kisayol, kisayolAc]);
  const n = o.l.filter((x) => x.ton === 'hata').length;
  return (
    <div className="tc-pym-yp-sira" ref={kap}>
      {kisayol && !acik && (
        <section className="tc-pym-yp tc-pym-kb" role="dialog" aria-label="Klavye kısayolları">
          <header>
            <b><Simge ad="help" boyut="k" />Klavye kısayolları</b>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat (Esc)" aria-label="Kapat (Esc)" onClick={() => kisayolAc(false)}><Simge ad="x" boyut="k" /></button>
          </header>
          {KISAYOLLAR.map(([g, l]) => (
            <div key={g} className="tc-pym-kb-grup">
              <small>{g}</small>
              <dl>{l.map(([t, a]) => <div key={t}><dt>{t.split(' ').map((x) => <kbd key={x}>{x}</kbd>)}</dt><dd>{a}</dd></div>)}</dl>
            </div>
          ))}
        </section>
      )}
      {acik && (
        <section className="tc-pym-yp" role="dialog" aria-label="Yapılacaklar">
          <header>
            <b><Simge ad="check" boyut="k" />Yapılacaklar</b>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat (Esc)" aria-label="Kapat (Esc)" onClick={() => ac(false)}><Simge ad="x" boyut="k" /></button>
          </header>
          {o.l.length ? (
            <>
              <small>Kararlar</small>
              <ul>{o.l.slice(0, 6).map((x, i) => <Karar key={i} x={x} {...o} />)}</ul>
            </>
          ) : <p>Karar bekleyen konu yok.</p>}
        </section>
      )}
      <button type="button" className="tc-pym-yp-fab" aria-label={`Yapılacaklar: ${n}`} aria-expanded={acik} data-ton={n ? 'hata' : undefined} title="Yapılacaklar: kararlar ve hazır olmayan emirler" onClick={() => ac(!acik)}>
        <Simge ad="check" boyut="k" /><span>Yapılacaklar</span><b className="tc-pym-mono">{n}</b>
      </button>
    </div>
  );
}

function Karar({ x, c, komut, sipSec, ac }: Ozellikler & { x: Sorun }) {
  const e = x.eylem; const { yap, not } = eylemYapisi(e, { c, komut, sipSec });
  return (
    <li data-ton={x.ton}>
      <Simge ad={x.simge} boyut="k" />
      <div>
        <b>{x.baslik}</b>
        <button type="button" className="tc-pym-link" aria-disabled={yap ? undefined : 'true'} title={yap ? undefined : `${e.ad}: ${not}`}
          onClick={yap ? () => { ac(false); yap(); } : undefined}>{e.ad}</button>
      </div>
    </li>
  );
}
