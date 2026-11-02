import type { GidisatOlcusu } from '#paylasilan/sozlesme/pano.ts';
import { birimli, kiyasYonu } from '../GidisatKarti.tsx';
import { Simge } from '../Simge.tsx';
import './grafik.css';

function Egilim({ seri }: { seri: readonly number[] }) {
  const enAz = Math.min(...seri);
  const aralik = Math.max(...seri) - enAz || 1;
  const nokta = (v: number, i: number) => [(i / (seri.length - 1)) * 100, 26 - ((v - enAz) / aralik) * 22] as const;
  const son = nokta(seri[seri.length - 1] ?? 0, seri.length - 1);
  return (
    <svg className="tc-gosterge-egilim" viewBox="-2 0 104 28" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polyline points={seri.map((v, i) => nokta(v, i).join(',')).join(' ')} />
      <circle cx={son[0]} cy={son[1]} r="2.4" />
    </svg>
  );
}

// "Bir bakışta" (kart 1773): gidişat ölçüleri kutu kutu; değer, kıyas ve eğilim. Dağılım ölçüsü grafik bölgesindedir.
export function GostergeSeridi({ olcular }: { olcular: readonly GidisatOlcusu[] }) {
  const tekil = olcular.filter((o) => o.dagilim.length === 0);
  if (tekil.length === 0) return null;
  return (
    <ul className="tc-gostergeler" aria-label="Bir bakışta">
      {tekil.map((o) => {
        const yon = kiyasYonu(o);
        const kiyas = o.kiyas === null ? null : `${o.kiyas.etiket}${o.kiyas.deger === null ? '' : ` ${birimli(o.kiyas.deger, o.birim)}`}`;
        return (
          <li key={o.anahtar} className="tc-kart tc-gosterge">
            <span className="tc-gosterge-ad">{o.ad}</span>
            <span className="tc-gosterge-deger mono" data-bos={o.deger === null || undefined}>{o.deger === null ? 'Veri yok' : birimli(o.deger, o.birim)}</span>
            {kiyas !== null && (
              <span className="tc-gosterge-kiyas" data-yon={yon}>
                {yon !== 'notr' && <Simge ad={(o.deger ?? 0) > (o.kiyas?.deger ?? 0) ? 'up' : 'down'} boyut="k" />}{kiyas}
              </span>
            )}
            {o.plan !== null && o.deger !== null && o.plan > 0 && <span className="tc-gosterge-kiyas">plan {birimli(o.plan, o.birim)}</span>}
            {o.seri.length >= 2 && <Egilim seri={o.seri} />}
          </li>
        );
      })}
    </ul>
  );
}
