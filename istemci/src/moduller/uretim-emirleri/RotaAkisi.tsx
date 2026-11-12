import type { ReactNode } from 'react';
import type { AdimStatusu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { STATU } from './adim-durumu.ts';
import './rota-akisi.css';

export interface RotaAkisiAdimi { anahtar: string; opNo: number; ad: string; statu: AdimStatusu; yuzde: number; bu: boolean }

// 3136 a: emrin bütün adımları yan yana kart (simge, OP, ad, yüzde), bu adım işaretli, solda emrin toplam gidişatı.
// Statünün adı, tonu ve simgesi Adım Durumu ile aynı sözlüktendir. canli: ekrandaki işin anlık durumu; bu adımın kartında
// ve başlıkta çizilir, hangisinin görüneceğine kullanan ekran karar verir (dar ekranda kartta yer yok).
export function RotaAkisi({ adimlar, ac, canli = null }: { adimlar: readonly RotaAkisiAdimi[]; ac: () => void; canli?: ReactNode }) {
  if (adimlar.length === 0) return null;
  const biten = adimlar.filter((a) => a.statu === 'bitti').length;
  // Toplam gidişat: adımların ilerleme yüzdelerinin ortalaması (her adım eşit ağırlık).
  const toplam = Math.round(adimlar.reduce((t, a) => t + a.yuzde, 0) / adimlar.length);
  return (
    <section className="tc-ra" aria-label={`Rota: ${String(biten)}/${String(adimlar.length)} adım bitti, toplam yüzde ${String(toplam)}`}>
      <button type="button" className="tc-ra-ust" onClick={ac}>
        <Simge ad="route" boyut="k" /><b>Rota</b><span className="tc-ra-biten">{biten}/{adimlar.length} adım bitti</span>
        <span className="tc-ra-toplam"><progress max={100} value={toplam} aria-hidden="true" /><b className="tc-ra-mono">%{toplam}</b></span>
        {canli ? <span className="tc-ra-canli">{canli}</span> : null}
      </button>
      {/* Kartlar da başlık gibi açar: operatör büyük karta dokunur. Klavye ve ekran okuyucu yolu başlık düğmesidir. */}
      <ol onClick={ac}>
        {adimlar.map((a) => {
          const g = STATU[a.statu];
          return (
            <li key={a.anahtar} data-ton={g.ton} aria-current={a.bu ? 'step' : undefined} data-canli={a.bu && canli ? '' : undefined} title={`OP ${String(a.opNo)} · ${a.ad} · ${g.ad} · %${String(a.yuzde)}`}>
              <span className="tc-ra-dugum" aria-hidden="true"><Simge ad={g.simge} boyut="k" /></span>
              <span className="tc-ra-op">OP {a.opNo}{a.bu ? <em>Bu adım</em> : null}</span>
              <span className="tc-ra-ad">{a.ad}</span>
              <span className="tc-ra-yuzde"><progress max={100} value={a.yuzde} aria-hidden="true" /><small className="tc-ra-mono">%{a.yuzde}</small></span>
              {a.bu && canli ? <span className="tc-ra-canli">{canli}</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
