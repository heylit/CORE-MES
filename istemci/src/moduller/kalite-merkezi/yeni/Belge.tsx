import type { ReactNode } from 'react';
import { trd } from './bicim.ts';
import { BAGLI_FORMLAR } from './sabitler.ts';
import type { KmVerisi } from './veri.ts';

// Yazdırılan belgeler (NCR KF-01, 8D, muayene, lot, FAI paketi, formlar) bugünkü sayfa düzeninde kalır (203 a): müşteri ve denetçi belgesidir.

// Belge başlığındaki revizyon ve yürürlük: modül formlarında ayardan, özelleştirilmiş ya da özel formda şablondan, öteki standart formda 00.
export function sablonBilgisi(veri: Pick<KmVerisi, 'ayarlar' | 'tpl'>, kod: string): { rev: string; yurur: string } {
  const g = veri.ayarlar;
  if (BAGLI_FORMLAR.includes(kod)) return { rev: g.rev || '00', yurur: g.yururluk || '' };
  const t = veri.tpl.find((x) => x.kod === kod);
  if (t) return { rev: t.rev || '00', yurur: t.yurur || '' };
  return { rev: '00', yurur: g.yururluk || '' };
}

export function BelgeBasi({ veri, kod, ad }: { veri: Pick<KmVerisi, 'ayarlar' | 'tpl'>; kod: string; ad: string }) {
  const { rev, yurur } = sablonBilgisi(veri, kod);
  const g = veri.ayarlar;
  return (
    <table className="dh">
      <tbody>
        <tr>
          <td className="dh-f" rowSpan={2}><b>{g.firma || 'FİRMA ADI'}</b>{g.adres && <><br /><small>{g.adres}</small></>}</td>
          <td className="dh-t" rowSpan={2}>{ad}</td>
          <td className="dh-m">Doküman no: <b>{kod}</b></td>
        </tr>
        <tr><td className="dh-m">Rev: <b>{rev}</b> | Yürürlük: {yurur ? trd(yurur) : '—'}</td></tr>
      </tbody>
    </table>
  );
}

export function Imza({ hazirlayan, onaylayan, onayTarihi, hazirlamaTarihi }: { hazirlayan?: string; onaylayan?: string; onayTarihi?: string; hazirlamaTarihi?: string }) {
  return (
    <table className="sig">
      <tbody>
        <tr><th>Hazırlayan / muayeneci</th><th>Onaylayan (kalite)</th></tr>
        <tr>
          <td>{hazirlayan ?? ''}<br /><small>{hazirlamaTarihi ? trd(hazirlamaTarihi) : ''}</small><div className="sigline">İmza</div></td>
          <td>{onaylayan ?? ''}<br /><small>{onayTarihi ? trd(onayTarihi) : ''}</small><div className="sigline">İmza</div></td>
        </tr>
      </tbody>
    </table>
  );
}

// Belge gövdesi: sınıf adları uygulamanın yazdırma biçimidir (pv, dh, sig); indirilen HTML aynı biçimi taşır (Onizleme.tsx).
export function Belge({ children }: { children: ReactNode }) {
  return <div className="pv">{children}</div>;
}

// Boş form satırı için işaret kutusu.
export const kutu = (isaretli = false): string => (isaretli ? '☒' : '☐');
