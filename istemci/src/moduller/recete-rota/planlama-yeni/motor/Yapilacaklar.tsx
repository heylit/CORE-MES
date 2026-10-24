import { useEffect, useRef } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { olayAdi, saatYaz, type Sorun } from './kurallar.ts';
import { HAZIRLANIYOR, MOTOR_NOTU, YOK_NOTU } from './ortak.tsx';

// Yapılacaklar (zo-kontrol.betik ypHtml): sağ altta sayılı düğme, basınca kararlar listesi; her kararın ilk eylemi. "Hazır olmayan emirler"
// eski sayfada deneme verisiydi (208 a), gelmez.
interface Ozellikler {
  c: PlanlamaCalismasi; l: Sorun[]; acik: boolean; ac: (v: boolean) => void;
  komut: CalismaKomutu | null; sipSec: (j: string) => void;
}

export function Yapilacaklar(o: Ozellikler) {
  const kap = useRef<HTMLDivElement>(null);
  const { acik, ac } = o;
  useEffect(() => {
    if (!acik) return undefined;
    const tus = (e: KeyboardEvent) => { if (e.key === 'Escape') ac(false); };
    const dokun = (e: PointerEvent) => { if (!kap.current?.contains(e.target as Node | null)) ac(false); };
    document.addEventListener('keydown', tus); document.addEventListener('pointerdown', dokun, true);
    return () => { document.removeEventListener('keydown', tus); document.removeEventListener('pointerdown', dokun, true); };
  }, [acik, ac]);
  const n = o.l.filter((x) => x.ton === 'hata').length;
  return (
    <div className="tc-pym-yp-sira" ref={kap}>
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

// Eylemin yapılışı: çalışmaya yazan üçü `degistir`le (plan.yaz), sipariş seçimi sayfada; motor isteyenler ve yeni ekranda karşılığı olmayan
// sayfa pasif, nedeni ipucunda.
function Karar({ x, c, komut, sipSec, ac }: Ozellikler & { x: Sorun }) {
  const e = x.eylem; const i = Number(e.v);
  const yaz = (ne: string, fn: (t: PlanlamaCalismasi) => void, ayrinti = '') => (komut ? () => { komut.degistir(ne, fn, { ayrinti }); } : null);
  let yap: (() => void) | null = null; let not = '';
  switch (e.tur) {
    case 'kisit-hepsi': yap = yaz('Bütün kısıtlar açıldı', (t) => { t.kapali = []; }); not = 'Plan yazma yetkiniz yok.'; break;
    case 'durus-kaldir': {
      const d = c.down[i];
      yap = d ? yaz('Duruş kaldırıldı', (t) => { t.down.splice(i, 1); }, `${String(d.m)} ${saatYaz(c.D, typeof d.from === 'number' ? d.from : null)}`) : null; not = 'Plan yazma yetkiniz yok.';
      break;
    }
    case 'olay-kaldir': {
      const ev = c.olaylar[i];
      yap = ev ? yaz('Olay kaldırıldı', (t) => { t.olaylar.splice(i, 1); }, olayAdi(c, ev)) : null; not = 'Plan yazma yetkiniz yok.';
      break;
    }
    case 'sec-is': yap = () => sipSec(e.v); break;
    case 'git': not = YOK_NOTU; break;
    case 'suz-gec': not = HAZIRLANIYOR; break;
    default: not = MOTOR_NOTU;
  }
  return (
    <li data-ton={x.ton}>
      <Simge ad={x.simge} boyut="k" />
      <div>
        <b>{x.baslik}</b>
        <button type="button" className="tc-pym-link" aria-disabled={yap ? undefined : 'true'} title={yap ? undefined : `${e.ad}: ${not}`}
          onClick={yap ? () => { ac(false); yap?.(); } : undefined}>{e.ad}</button>
      </div>
    </li>
  );
}
