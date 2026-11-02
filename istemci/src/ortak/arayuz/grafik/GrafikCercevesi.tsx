import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SimgeAdi } from '../../tasarim/simgeler.ts';
import { Simge } from '../Simge.tsx';
import './grafik.css';

// Grafiğin sayısal karşılığı: her değer tablo görünümünde de okunur (renk ve fare tek yol değildir).
export interface GrafikTablosu { basliklar: readonly string[]; satirlar: readonly (readonly string[])[] }

// undefined: yükleniyor; null: alınamadı; false: veri yok (sıfır uydurulmaz); true: çizilir.
export type GrafikDurumu = boolean | null | undefined;

export interface SeriAnahtari { ad: string; seri: 1 | 2 | 3; cizgi?: boolean }

// Yönetim panosu ve ana sayfa grafik kartı (kart 1773): başlık, durum, lejant, okuma satırı, çizim ya da tablo.
export function GrafikCercevesi({ baslik, simge, alt, durum, tablo, lejant = [], okuma, yol, genis = false, children }: {
  baslik: string;
  simge: SimgeAdi;
  alt?: string;
  durum: GrafikDurumu;
  tablo: GrafikTablosu;
  lejant?: readonly SeriAnahtari[];
  // Fare ya da klavyeyle seçilen noktanın değerleri; seçim yoksa son nokta.
  okuma?: ReactNode;
  // Ayrıntıyı açan uygulama içi yol (modül sayfası).
  yol?: string;
  genis?: boolean;
  children?: ReactNode;
}) {
  const baslikKimlik = useId();
  const [tabloAcik, tabloAcikYaz] = useState(false);
  const ciz = durum === true;
  const durumMetni = durum === undefined ? 'Yükleniyor…' : durum === null ? 'Alınamadı' : durum === false ? 'Veri yok' : null;
  return (
    <section className="tc-kart tc-gp" data-genis={genis || undefined} aria-labelledby={baslikKimlik} aria-busy={durum === undefined || undefined}>
      <header className="tc-gp-bas">
        <span className="tc-gp-bas-simge" aria-hidden="true"><Simge ad={simge} /></span>
        <div className="tc-gp-bas-metin">
          <h3 id={baslikKimlik}>{baslik}</h3>
          {alt !== undefined && <p>{alt}</p>}
        </div>
        <div className="tc-gp-bas-eylem">
          {ciz && (
            <button type="button" className="tc-gp-dugme" aria-pressed={tabloAcik} onClick={() => tabloAcikYaz((a) => !a)}>
              <Simge ad="list" boyut="k" />Tablo
            </button>
          )}
          {yol !== undefined && (
            <Link className="tc-gp-dugme" to={yol} aria-label={`${baslik}: ayrıntı`}><Simge ad="chev-right" boyut="k" /></Link>
          )}
        </div>
      </header>
      {durumMetni !== null && <p className="tc-gp-durum" role={durum === null ? 'alert' : 'status'}>{durumMetni}</p>}
      {ciz && lejant.length > 1 && (
        <ul className="tc-gp-lejant" aria-label="Seriler">
          {lejant.map((l) => <li key={l.ad}><i className={`tc-seri-anahtar tc-seri-${l.seri}`} data-cizgi={l.cizgi || undefined} aria-hidden="true" />{l.ad}</li>)}
        </ul>
      )}
      {ciz && !tabloAcik && okuma !== undefined && <p className="tc-gp-okuma" aria-live="polite">{okuma}</p>}
      {ciz && (tabloAcik ? (
        <div className="tc-gp-tablo-kutu">
          <table className="tc-gp-tablosu">
            <caption>{baslik}</caption>
            <thead><tr>{tablo.basliklar.map((b) => <th key={b} scope="col">{b}</th>)}</tr></thead>
            <tbody>{tablo.satirlar.map((s, i) => <tr key={`${s[0]}-${i}`}>{s.map((h, j) => (j === 0 ? <th key={j} scope="row">{h}</th> : <td key={j}>{h}</td>))}</tr>)}</tbody>
          </table>
        </div>
      ) : <div className="tc-gp-cizim">{children}</div>)}
    </section>
  );
}
