import { useId } from 'react';
import type { GidisatOlcusu } from '#paylasilan/sozlesme/pano.ts';
import { Simge } from './Simge.tsx';
import './pano-grafikleri.css';
import './rol-panosu.css';

const sayi = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
export const birimli = (n: number, birim: string): string => (birim === '%' ? `%${sayi(n)}` : birim ? `${sayi(n)} ${birim}` : sayi(n));

// Kıyasın yönü: iyi, kötü ya da yön yok. Veri ya da kıyas değeri yoksa yön de yoktur.
export function kiyasYonu(o: GidisatOlcusu): 'iyi' | 'kotu' | 'notr' {
  if (o.deger === null || o.kiyas === null || o.kiyas.deger === null || o.kiyas.iyiYon === null || o.deger === o.kiyas.deger) return 'notr';
  const artti = o.deger > o.kiyas.deger;
  return artti === (o.kiyas.iyiYon === 'artis') ? 'iyi' : 'kotu';
}

function Egilim({ seri }: { seri: readonly number[] }) {
  const enAz = Math.min(...seri);
  const aralik = Math.max(...seri) - enAz || 1;
  const noktalar = seri.map((v, i) => `${(i / (seri.length - 1)) * 100},${36 - ((v - enAz) / aralik) * 32}`).join(' ');
  return (
    <svg className="tc-olcu-egilim" viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polyline points={noktalar} />
    </svg>
  );
}

function Dagilim({ satirlar, birim }: { satirlar: GidisatOlcusu['dagilim']; birim: string }) {
  const tavan = Math.max(0, ...satirlar.map((s) => s.deger));
  return (
    <ul className="tc-cubuk-listesi">
      {satirlar.map((s) => {
        const oran = tavan <= 0 ? 0 : Math.min(100, (Math.max(0, s.deger) / tavan) * 100);
        return (
          <li key={s.etiket} className="tc-cubuk-satir">
            <span className="tc-cubuk-etiket">{s.etiket}</span>
            <svg className="tc-cubuk-iz" aria-hidden="true" focusable="false">
              {oran > 0 && <rect className="tc-cubuk-dolgu" x="0" y="0" height="100%" width={`${oran}%`} rx="4" />}
            </svg>
            <span className="tc-cubuk-deger mono">{birimli(s.deger, birim)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Olcu({ o }: { o: GidisatOlcusu }) {
  const planOrani = o.plan !== null && o.plan > 0 && o.deger !== null ? Math.min(100, (Math.max(0, o.deger) / o.plan) * 100) : null;
  const kiyasMetni = o.kiyas === null ? null : `${o.kiyas.etiket}${o.kiyas.deger === null ? '' : ` ${birimli(o.kiyas.deger, o.birim)}`}`;
  return (
    <li className="tc-olcu">
      <span className="tc-olcu-ad">{o.ad}</span>
      {o.dagilim.length > 0 ? <Dagilim satirlar={o.dagilim} birim={o.birim} /> : (
        <>
          <span className="tc-olcu-deger mono" data-bos={o.deger === null || undefined}>{o.deger === null ? 'Veri yok' : birimli(o.deger, o.birim)}</span>
          {kiyasMetni !== null && <span className="tc-olcu-kiyas" data-yon={kiyasYonu(o)}>{kiyasMetni}</span>}
          {planOrani !== null && (
            <svg className="tc-olcu-plan" role="img" aria-label={`Plan ${birimli(o.plan ?? 0, o.birim)}, gerçekleşen yüzde ${sayi(planOrani)}`} focusable="false">
              <rect className="tc-olcu-plan-iz" x="0" y="0" width="100%" height="100%" rx="4" />
              {planOrani > 0 && <rect className="tc-olcu-plan-dolgu" x="0" y="0" width={`${planOrani}%`} height="100%" rx="4" />}
            </svg>
          )}
          {o.seri.length >= 2 && <Egilim seri={o.seri} />}
        </>
      )}
    </li>
  );
}

// Gidişat (kart 1585, 1592 a): rolün birkaç ölçüsü; hedef yok, yalnız gerçek kıyas.
export function GidisatKarti({ olcular, alinamayan }: { olcular: readonly GidisatOlcusu[]; alinamayan: readonly string[] }) {
  const baslikKimlik = useId();
  return (
    <section className="tc-kart tc-gidisat" aria-labelledby={baslikKimlik}>
      <h2 id={baslikKimlik} className="tc-pano-baslik"><Simge ad="gauge" boyut="k" />Gidişat</h2>
      {olcular.length > 0 ? <ul className="tc-olcu-listesi">{olcular.map((o) => <Olcu key={o.anahtar} o={o} />)}</ul>
        : alinamayan.length === 0 && <p className="tc-pano-bos" role="status">…</p>}
      {alinamayan.length > 0 && <p className="tc-islerim-hata" role="alert"><Simge ad="alert" boyut="k" />Alınamadı: {alinamayan.join(', ')}</p>}
    </section>
  );
}
