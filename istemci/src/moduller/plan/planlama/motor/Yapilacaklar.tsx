import { useEffect, useRef, useState } from 'react';
import { Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaSecimi } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Degisiklikler, DuzenleMenusu, kbBaglam, kbHedefler, kbKomutlari, type KbHedef, type KbPanel } from './Duzenle.tsx';
import { eylemYapisi } from './eylem.ts';
import type { Derleme, OkunanPlan, Sorun } from './kurallar.ts';
import { MOTOR_NOTU } from './ortak.tsx';
import { TezgahSirasiPaneli } from '../ic/sira/index.tsx';

// Yapılacaklar (zo-kontrol.betik ypHtml): sağ altta sayılı düğme, basınca kararlar listesi; her kararın ilk eylemi. "Hazır olmayan emirler"
// eski sayfada deneme verisiydi (208 a), gelmez. Yanında Düzenle düğmesi; Düzenle, Değişiklikler ve klavye kısayolları aynı köşede açılır,
// aynı anda tek pencere (zp-klavye). Değişiklikler düğmesi sepette satır varken çıkar; satırlar motorla gelir. Tezgâh sırası aracı da (w-v20) bu köşededir.
interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; l: Sorun[]; acik: boolean; ac: (v: boolean) => void;
  komut: CalismaKomutu | null; sipSec: (j: string) => void; secim: PlanlamaSecimi;
  pan: KbPanel | null; panAc: (v: KbPanel | null) => void; studyo: () => void; veriAc?: ((bolum: string) => void) | null;
}
const KISAYOLLAR: [string, [string, string][]][] = [
  ['Görünüm', [['G', 'Özet'], ['H', 'Harita'], ['C', 'Çizelge'], ['K', 'Keşfet'], ['F', 'Sığdır'], ['+ -', 'Yakınlaş, uzaklaş'], ['1 - 8', 'Kartlar (Plan, Siparişler...)'], ['O', 'Seçili bölümün çizelgesi'],
    ['V', 'Ölçek: gün, hafta, ay, yıl (çizelge, matris, odak, özet, sevkiyat, malzeme planı)']]],
  ['Bul ve seç', [['/', 'Sipariş, tezgâh ya da komut ara'], ['Ctrl K', 'Komut arama'], ['Esc', 'Menüyü, sonra seçimi kapat']]],
  ['Düzenle', [['E', 'Seçilene göre Düzenle menüsü'], ['1 - 9', 'Menüdeki komut'], ['← →', 'İşi 1 saat kaydır (Shift: çeyrek)'], ['↑ ↓', 'Yapabilen bir önceki ya da sonraki tezgâh'], ['[ ]', 'Kuyrukta bir öne, bir arkaya'], ['Backspace', 'Menüde geri']]],
  ['Değişiklikler', [['D', 'Değişiklik listesi'], ['Ctrl Z', 'Geri al'], ['Ctrl Shift Z', 'Yinele'], ['Ctrl Enter', 'Onayla, listeyi temizle']]],
  ['Diğer', [['Y', 'Yapılacaklar'], ['?', 'Bu liste']]],
];

export function Yapilacaklar(o: Ozellikler) {
  const kap = useRef<HTMLDivElement>(null);
  const { bildir } = useBildirim();
  const { acik, ac, pan, panAc } = o;
  // Menü açılınca alt liste ve hedef baştan başlar (kbPanAc).
  const [alt, setAlt] = useState(false);
  const [hedef, setHedef] = useState<KbHedef['k'] | null>(null);
  const [sonPan, setSonPan] = useState(pan);
  const [siraM, setSiraM] = useState<string | null>(null);
  if (pan !== sonPan) { setSonPan(pan); setAlt(false); setHedef(null); }
  const hl = kbHedefler(o.p, o.cx, o.secim); const b = kbBaglam(hl, hedef);
  const kl = kbKomutlari({ c: o.c, cx: o.cx, komut: o.komut, altAc: () => setAlt(true), siraAc: (m) => { setSiraM(m); panAc('sr'); } }, b, alt);
  // Komut çalışınca menü kapanır; alt listeye geçen komut menüyü açık tutar (kbKos).
  const kos = (i: number) => { const k = kl[i]; if (!k?.yap) return; k.yap(); if (!k.alt && !k.pencere) panAc(null); };
  const tusDurumu = useRef({ pan, alt, hl, b, kos });
  tusDurumu.current = { pan, alt, hl, b, kos };
  useEffect(() => {
    if (!acik && !pan) return undefined;
    const kapat = () => { ac(false); panAc(null); };
    const tus = (e: KeyboardEvent) => {
      const x = tusDurumu.current; const k = e.key;
      const dur = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (k === 'Escape') { dur(); if (x.alt) setAlt(false); else kapat(); return; }
      if (x.pan !== 'dz' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null; if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (/^[1-9]$/.test(k)) { dur(); x.kos(Number(k) - 1); return; }
      if (k === 'Tab' && x.hl.length > 1 && x.b) {
        dur(); const i = x.hl.findIndex((h) => h.k === x.b?.k); setHedef(x.hl[(i + (e.shiftKey ? x.hl.length - 1 : 1)) % x.hl.length]?.k ?? null); setAlt(false); return;
      }
      if (k === 'Backspace' && x.alt) { dur(); setAlt(false); return; }
      if (x.b && x.b.k !== 'tez' && k.startsWith('Arrow')) { dur(); bildir('bilgi', `İşi kaydırmak: ${MOTOR_NOTU}`); }
    };
    const dokun = (e: PointerEvent) => { if (!kap.current?.contains(e.target as Node | null)) kapat(); };
    document.addEventListener('keydown', tus, true); document.addEventListener('pointerdown', dokun, true);
    return () => { document.removeEventListener('keydown', tus, true); document.removeEventListener('pointerdown', dokun, true); };
  }, [acik, ac, pan, panAc, bildir]);
  const n = o.l.filter((x) => x.ton === 'hata').length;
  return (
    <div className="tc-pym-yp-sira" ref={kap}>
      {pan === 'dz' && !acik && (
        <DuzenleMenusu c={o.c} hl={hl} b={b} l={kl} alt={alt} yaz kos={kos} geri={() => setAlt(false)} hedefSec={(k) => { setHedef(k); setAlt(false); }} kapat={() => panAc(null)} />
      )}
      {pan === 'sp' && !acik && <Degisiklikler p={o.p} studyo={o.studyo} kapat={() => panAc(null)} />}
      {pan === 'sr' && !acik && <TezgahSirasiPaneli c={o.c} p={o.p} cx={o.cx} m={siraM} yaz={o.komut !== null} kapat={() => panAc(null)} />}
      {pan === 'kl' && !acik && (
        <section className="tc-pym-yp tc-pym-kb" role="dialog" aria-label="Klavye kısayolları">
          <header>
            <b><Simge ad="help" boyut="k" />Klavye kısayolları</b>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat (Esc)" aria-label="Kapat (Esc)" onClick={() => panAc(null)}><Simge ad="x" boyut="k" /></button>
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
      {b && (
        <button type="button" className="tc-pym-yp-fab" aria-expanded={pan === 'dz'} title="Seçileni düzenle (E)" onClick={() => panAc(pan === 'dz' ? null : 'dz')}>
          <Simge ad="wrench" boyut="k" /><span>Düzenle</span><kbd>E</kbd>
        </button>
      )}
      <button type="button" className="tc-pym-yp-fab" aria-label={`Yapılacaklar: ${n}`} aria-expanded={acik} data-ton={n ? 'hata' : undefined} title="Yapılacaklar: kararlar ve hazır olmayan emirler" onClick={() => ac(!acik)}>
        <Simge ad="check" boyut="k" /><span>Yapılacaklar</span><b className="tc-pym-mono">{n}</b>
      </button>
    </div>
  );
}

function Karar({ x, c, komut, sipSec, ac, veriAc }: Ozellikler & { x: Sorun }) {
  const e = x.eylem; const { yap, not } = eylemYapisi(e, { c, komut, sipSec, veriAc });
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
