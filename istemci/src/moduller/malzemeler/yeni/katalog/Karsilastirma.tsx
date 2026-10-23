import { useState } from 'react';
import { Dugme, IsaretKutusu, Pencere } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi } from '../tipler.ts';
import { kimlikOf } from './liste.ts';

export interface KarsilastirmaSatiri { bolum: string; alan: string; degerler: string[]; fark: boolean }

// Prototipin openCompare'i: kartların düz satırları (flatItem) bölüm|alan anahtarıyla hizalanır; eksik değer "—".
export function karsilastirmaSatirlari(kayitlar: readonly KartKaydi[], b: KuralBaglami): KarsilastirmaSatiri[] {
  const anahtarlar: string[] = [];
  const haritalar = kayitlar.map((x) => {
    const m: Record<string, string> = {};
    K.flatItem(x, false, b).forEach(([s, k, v]) => {
      const a = `${s}|${k}`;
      if (!anahtarlar.includes(a)) anahtarlar.push(a);
      m[a] = v;
    });
    return m;
  });
  return anahtarlar.map((a) => {
    const [bolum, alan] = a.split('|') as [string, string];
    const degerler = haritalar.map((m) => m[a] ?? '—');
    return { bolum, alan, degerler, fark: new Set(degerler).size > 1 };
  });
}

export function Karsilastirma({ kayitlar, b, kapat, etiket }: {
  kayitlar: readonly KartKaydi[]; b: KuralBaglami; kapat: () => void; etiket: (kimlikler: string[]) => void;
}) {
  const [yalnizFark, yalnizFarkYaz] = useState(false);
  const satirlar = karsilastirmaSatirlari(kayitlar, b);
  const nd = satirlar.filter((s) => s.fark).length;
  const gorunen = yalnizFark ? satirlar.filter((s) => s.fark) : satirlar;
  let bolum = '';
  return (
    <Pencere
      acik kapat={kapat} baslik="Karşılaştırma" tur="tam"
      alt={(
        <div className="tc-mk-pencere-alt">
          <Dugme simge="tag" onClick={() => etiket(kayitlar.map(kimlikOf))}>Etiketlerini yazdır</Dugme>
          <Dugme className="tc-mk-sona" onClick={kapat}>Kapat</Dugme>
        </div>
      )}
    >
      <div className="tc-mk-arac-satiri">
        <span className="tc-mk-ipucu">{nd} satırda fark var</span>
        <IsaretKutusu etiket="Yalnız farkları göster" checked={yalnizFark} onChange={(o) => yalnizFarkYaz(o.target.checked)} />
      </div>
      <div className="tc-mk-tablo-kap">
        <table className="tc-mk-tablo tc-mk-karsilastirma">
          <thead>
            <tr>
              <th scope="col"><span className="tc-gizli-etiket">Alan</span></th>
              {kayitlar.map((x) => <th key={kimlikOf(x)} scope="col"><span className="tc-mk-kod">{x.com.kod}</span>{x.com.ad}</th>)}
            </tr>
          </thead>
          <tbody>
            {gorunen.flatMap((s) => {
              const ust = s.bolum !== bolum
                ? [<tr key={`b-${s.bolum}`} className="tc-mk-bolum"><th colSpan={kayitlar.length + 1} scope="colgroup">{s.bolum}</th></tr>]
                : [];
              bolum = s.bolum;
              return [...ust, (
                <tr key={`${s.bolum}|${s.alan}`} data-fark={s.fark ? '' : undefined}>
                  <th scope="row">{s.alan}</th>
                  {s.degerler.map((v, i) => <td key={i}>{v}</td>)}
                </tr>
              )];
            })}
          </tbody>
        </table>
      </div>
    </Pencere>
  );
}
