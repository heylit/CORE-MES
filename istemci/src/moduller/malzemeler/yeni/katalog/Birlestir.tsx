import { useState } from 'react';
import { Dugme, Girdi, Pencere } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi } from '../tipler.ts';
import { kimlikOf } from './liste.ts';
import { OnayRozeti } from './paneller.tsx';

const acilis = (x: KartKaydi): number => (x.rev?.[0]?.t ?? x.updatedAt ?? 0);

// Asıl kart önerisi prototipteki gibi: önce aktif kart, sonra en eski açılan.
export function asilOnerisi(kartlar: readonly KartKaydi[], b: KuralBaglami): KartKaydi {
  return [...kartlar].sort((p, q) => (K.onayDurum(p, b) === 'aktif' ? 0 : 1) - (K.onayDurum(q, b) === 'aktif' ? 0 : 1) || acilis(p) - acilis(q))[0]!;
}

export function Birlestir({ kartlar, b, mesgul, kapat, birlestir }: {
  kartlar: readonly KartKaydi[]; b: KuralBaglami; mesgul: boolean; kapat: () => void; birlestir: (asil: KartKaydi, diger: KartKaydi[], not: string) => void;
}) {
  const [asil, asilYaz] = useState(() => kimlikOf(asilOnerisi(kartlar, b)));
  const [not, notYaz] = useState('');
  const secilen = kartlar.find((x) => kimlikOf(x) === asil)!;
  return (
    <Pencere
      acik kapat={kapat} baslik="Kartları birleştir" tur="orta"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={mesgul}>Vazgeç</Dugme>
          <Dugme tur="birincil" yukleniyor={mesgul} onClick={() => birlestir(secilen, kartlar.filter((x) => kimlikOf(x) !== asil), not)}>Birleştir</Dugme>
        </>
      )}
    >
      <p className="tc-mk-ipucu">
        Asıl kart kalır. Diğerleri pasife alınır ve "yerine" bilgisi taşır; belgeleri, sertifikaları ve eski ERP kodu asıl karta eklenir.
        ERP'deki stok hareketlerini taşımak için birleştirme listesini indirebilirsin.
      </p>
      <fieldset className="tc-mk-birlestir">
        <legend className="tc-gizli-etiket">Asıl kart</legend>
        {kartlar.map((x) => (
          <label key={kimlikOf(x)} className="tc-mk-birlestir-secenek">
            <input type="radio" name="tc-mk-asil" value={kimlikOf(x)} checked={kimlikOf(x) === asil} onChange={() => asilYaz(kimlikOf(x))} />
            <span>
              <b className="tc-mk-kod">{x.com.kod}</b> <OnayRozeti x={x} b={b} />
              <br />{x.com.ad}
              <small>
                {x.rev?.[0] ? `Açılış ${new Date(x.rev[0].t).toLocaleDateString('tr-TR')}` : ''}
                {x.com.eskiKod ? ` · ERP ${x.com.eskiKod}` : ''}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <Girdi etiket="Not (isteğe bağlı)" value={not} placeholder="ör. Aynı malzeme iki kez açılmış" onChange={(o) => notYaz(o.target.value)} />
    </Pencere>
  );
}
