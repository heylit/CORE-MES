import { useMemo } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { Aralik } from '../harita/kurallar.ts';
import type { Derleme, OkunanPlan } from '../kurallar.ts';
import { degisken, yuzde } from '../ortak.tsx';
import { gunAdi, olcekCizelgesi } from './kurallar.ts';

// Hafta, ay ve yıl çizelgesi (zq-olcek olYuzey): tezgâh satırlarında işler gün ızgarasında, ayda ve yılda doluluk ısısı; yıl işleri tek tek
// göstermez. İşe basmak onu seçer, gün başlığına basmak o günü saatlik açar.
const OLCEK_AD: Record<Exclude<DonemOlcegi, 'gun'>, string> = { hafta: 'hafta', ay: 'ay', yil: 'yıl' };

interface Ozellikler {
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: Exclude<DonemOlcegi, 'gun'>; kayma: number; r: Aralik; now: number;
  secili: string | null; isSec: (id: string) => void; tezSec: (m: string) => void; gunAc: (t: number) => void; kaydir: (n: number) => void;
}

export function OlcekCizelgesi(o: Ozellikler) {
  const { c, p, cx, olcek, r, now } = o;
  const v = useMemo(() => olcekCizelgesi(c, p, cx, olcek, r, now), [c, p, cx, olcek, r, now]);
  const ad = OLCEK_AD[olcek]; const yil = olcek === 'yil';
  return (
    <section className="tc-pym-ol" data-olcek={olcek} aria-label={`Çizelge, ${ad}`}>
      <header className="tc-pym-ol-ust">
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-simge-d" title={`Önceki ${ad}`} aria-label={`Önceki ${ad}`} onClick={() => o.kaydir(-1)}><Simge ad="chev-left" boyut="k" /></button>
        <b className="tc-pym-mono">{gunAdi(c.D, r.a)} – {gunAdi(c.D, r.b - 24)}</b>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-simge-d" title={`Sonraki ${ad}`} aria-label={`Sonraki ${ad}`} onClick={() => o.kaydir(1)}><Simge ad="chev-right" boyut="k" /></button>
        {o.kayma !== 0 && <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" onClick={() => o.kaydir(0)}>Bugün</button>}
        <small>{yil ? 'Hafta başına doluluk: açık yeşil az, sarı %75 üstü, kırmızı %97 üstü.' : olcek === 'ay' ? 'Günlük doluluk ve işler. İşe bas, E ile düzenle.' : 'İşe bas, E ile düzenle. Gün başlığı o günü saatlik açar.'}</small>
      </header>
      <div className="tc-pym-ol-govde">
        <div className="tc-pym-ol-satir tc-pym-ol-cetvel">
          <span />
          <div className="tc-pym-ol-cizgi">
            {v.basliklar.map((b) => (
              <button key={b.t} type="button" className="tc-pym-ol-bas" data-bugun={b.bugun ? '' : undefined} title={b.baslik}
                ref={degisken({ '--x': yuzde(b.x), '--w': yuzde(b.w) })} onClick={() => o.gunAc(b.t)}>{b.ad}</button>
            ))}
          </div>
        </div>
        <div className="tc-pym-ol-satirlar">
          {v.satirlar.map((s) => (
            <div key={s.m} className="tc-pym-ol-satir">
              <button type="button" className="tc-pym-ol-ad tc-pym-mono" onClick={() => o.tezSec(s.m)}>{s.etiket}</button>
              <div className="tc-pym-ol-cizgi">
                {s.isi.map((h) => <i key={h.x} className="tc-pym-ol-isi" data-d={h.d} title={h.baslik} ref={degisken({ '--x': yuzde(h.x), '--w': yuzde(h.w), '--o': h.o.toFixed(2) })} />)}
                {s.isler.map((i) => (
                  <button key={i.id} type="button" className="tc-pym-ol-is" data-secili={o.secili === i.id ? '' : undefined} data-sabit={i.sabit ? '' : undefined}
                    title={i.baslik} ref={degisken({ '--x': yuzde(i.x), '--w': yuzde(i.w), '--c': i.renk })} onClick={() => o.isSec(i.id)}>
                    {i.etiket ? <span className="tc-pym-mono">{i.etiket}</span> : <span className="tc-gizli-etiket">{i.id}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="tc-pym-ol-isaret" aria-hidden="true">
            {v.simdi != null && <i className="tc-pym-ol-simdi" ref={degisken({ '--x': yuzde(v.simdi) })} />}
            {v.ufuk != null && <i className="tc-pym-ol-ufuk" ref={degisken({ '--x': yuzde(v.ufuk) })}><span>plan sonu</span></i>}
          </div>
        </div>
      </div>
    </section>
  );
}
