import type { ReactNode } from 'react';
import { para } from '../bicim.ts';
import { AY_ADLARI, yilToplami } from './kurallar.ts';
import type { AySonucu } from './motor-yuzu.ts';

// P3 ekranlarının küçük ortak parçaları: adım adım hesap tablosu, açıklama kutusu, 12 aylık tablo.

const sayiBicimi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const sayiMetni = (v: number): string => (Number.isFinite(v) ? sayiBicimi.format(v) : '—');
export const yuzde = (v: number): string => `%${sayiMetni(v)}`;
export const eksi = (v: number): string => `−${para(v)}`;

// Motorun döndürdüğü yerel gün (Date) ya da "GGGG-AA-GG": uzun ("15 Mart 2026") ve kısa ("15.03.2026") yazım.
const gunParcalari = (v: Date | string | null | undefined): [number, number, number] | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : [v.getFullYear(), v.getMonth() + 1, v.getDate()];
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
export function uzunTarih(v: Date | string | null | undefined): string {
  const g = gunParcalari(v);
  return g ? `${g[2]} ${AY_ADLARI[g[1] - 1] ?? ''} ${g[0]}` : '—';
}
export function kisaTarihMetni(v: Date | string | null | undefined): string {
  const g = gunParcalari(v);
  return g ? `${String(g[2]).padStart(2, '0')}.${String(g[1]).padStart(2, '0')}.${g[0]}` : '—';
}

export type Adim = { baslik: string } | { etiket: string; deger: string; not?: ReactNode; toplam?: boolean };

export function Adimlar({ adimlar, etiket }: { adimlar: readonly Adim[]; etiket: string }) {
  return (
    <table className="tc-ikb-adimlar" aria-label={etiket}>
      <tbody>
        {adimlar.map((a, i) => ('baslik' in a ? (
          <tr key={i} className="tc-ikb-adim-baslik"><th colSpan={2} scope="colgroup">{a.baslik}</th></tr>
        ) : (
          <tr key={i} className={a.toplam ? 'tc-ikb-adim-toplam' : undefined}>
            <th scope="row"><b>{a.etiket}</b>{a.not !== undefined && <small>{a.not}</small>}</th>
            <td>{a.deger}</td>
          </tr>
        )))}
      </tbody>
    </table>
  );
}

// "Nasıl hesaplanır?" kutusu; dayanak satırı ayrı biçimdedir.
export function Aciklama({ baslik, dayanak, children }: { baslik: string; dayanak?: string; children: ReactNode }) {
  return (
    <aside className="tc-ikb-aciklama">
      <h3>{baslik}</h3>
      {children}
      {dayanak && <p className="tc-ikb-dayanak">{dayanak}</p>}
    </aside>
  );
}

export function Bolum({ baslik, children, arac }: { baslik: string; children: ReactNode; arac?: ReactNode }) {
  return (
    <section className="tc-ikb-bolum">
      <header><h3>{baslik}</h3>{arac}</header>
      {children}
    </section>
  );
}

// 12 aylık brüt-net tablosu; vurgulanan ay ayrıntısı gösterilen aydır.
export function AyTablosu({ aylar, vurgu }: { aylar: readonly AySonucu[]; vurgu?: number }) {
  const t = yilToplami(aylar);
  return (
    <div className="tc-ikb-kaydir">
      <table className="tc-ikb-tablo">
        <thead>
          <tr><th scope="col">Ay</th><th scope="col">Brüt</th><th scope="col">SGK + işsizlik</th><th scope="col">Kümülatif matrah</th><th scope="col">Gelir vergisi</th><th scope="col">Damga</th><th scope="col">Net</th><th scope="col">İşveren maliyeti</th></tr>
        </thead>
        <tbody>
          {aylar.map((r, i) => (
            <tr key={i} aria-current={i + 1 === vurgu ? 'true' : undefined}>
              <th scope="row">{AY_ADLARI[i]}</th><td>{para(r.brut)}</td><td>{para(r.sgk + r.iss)}</td><td>{para(r.cumOnce + r.matrah)}</td>
              <td>{para(r.gv)}</td><td>{para(r.dv)}</td><td><b>{para(r.net)}</b></td><td>{para(r.maliyet)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th scope="row">Yıllık</th><td>{para(t.brut)}</td><td>{para(t.kesinti)}</td><td /><td>{para(t.gv)}</td><td>{para(t.dv)}</td><td>{para(t.net)}</td><td>{para(t.maliyet)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

export function Not({ children }: { children: ReactNode }) {
  return <p className="tc-ikb-not">{children}</p>;
}
