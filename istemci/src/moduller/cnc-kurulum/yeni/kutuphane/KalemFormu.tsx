import { useEffect, useId, useRef, useState } from 'react';
import { Dugme, Girdi } from '../../../../ortak/arayuz/index.ts';
import { allShelves, type Duzenleme, type DuzenlemeAlanlari } from './raf.ts';

interface Ozellikler {
  duzenleme: Duzenleme;
  sablonDegistir: (raf: string, kalemId: string) => void;
  kaydet: (alanlar: DuzenlemeAlanlari) => void;
  vazgec: () => void;
}

// Prototipin editFormHTML'i: yeni kalem şablondan kopyalanır (3B model şablondan gelir), mevcut özel kalem düzenlenir.
export function KalemFormu({ duzenleme, sablonDegistir, kaydet, vazgec }: Ozellikler) {
  const b = duzenleme.base;
  const nw = duzenleme.mode === 'new';
  const sablonKimligi = useId();
  const form = useRef<HTMLFormElement>(null);
  const ilk = (): DuzenlemeAlanlari => ({
    name: nw ? b.name + ' (kopya)' : b.name, code: b.code ?? '', desc: b.desc ?? '', d: b.d ? String(b.d) : '', z: b.z ? String(b.z) : '', qty: '',
  });
  const [f, fYaz] = useState<DuzenlemeAlanlari>(ilk);
  const anahtar = `${duzenleme.mode}|${duzenleme.shelf ?? ''}|${b.id}`;
  // Şablon değişince alanlar yeni şablondan gelir ve ad seçili olur (prototip: focus + select).
  useEffect(() => {
    fYaz(ilk());
    const ad = form.current?.querySelector<HTMLInputElement>('input[name="ad"]');
    ad?.focus(); ad?.select();
  }, [anahtar]);
  const alan = (k: keyof DuzenlemeAlanlari) => ({ value: f[k], onChange: (o: { target: { value: string } }) => { fYaz({ ...f, [k]: o.target.value }); } });

  return (
    <form
      ref={form}
      className="tc-cl-form"
      onSubmit={(o) => { o.preventDefault(); kaydet(f); }}
      aria-label={nw ? 'Yeni kütüphane kalemi' : 'Düzenle'}
    >
      <div className="tc-cl-form-baslik">{nw ? 'Yeni kütüphane kalemi' : 'Düzenle'}</div>
      {nw && (
        <div className="tc-alan">
          <label className="tc-alan-etiket" htmlFor={sablonKimligi}>Raf ve şablon (3D model buradan gelir)</label>
          <select
            id={sablonKimligi} className="tc-alan-kutu" value={`${duzenleme.shelf ?? ''}|${b.id}`}
            onChange={(o) => { const [raf = '', id = ''] = o.target.value.split('|'); sablonDegistir(raf, id); }}
          >
            {allShelves().map((sh) => (
              <optgroup key={sh.key} label={sh.title}>
                {sh.items.map((x) => <option key={x.id} value={`${sh.key}|${x.id}`}>{x.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      <Girdi name="ad" etiket="Ad" {...alan('name')} />
      <Girdi etiket="Kod / tanım" {...alan('code')} />
      {b.d || b.z ? (
        <div className="tc-cl-iki">
          {b.d ? <Girdi etiket="Çap Ø (mm)" type="number" step="0.1" min="0" {...alan('d')} /> : null}
          {b.z ? <Girdi etiket="Ağız sayısı Z" type="number" min="1" {...alan('z')} /> : null}
        </div>
      ) : null}
      <Girdi etiket="Açıklama" {...alan('desc')} />
      {nw && <Girdi etiket="Başlangıç stok adedi" type="number" min="0" placeholder="—" {...alan('qty')} />}
      <p className="tc-cl-not">
        3D model şablondan gelir. {b.isTool ? 'Takımlar Kurulum sayfasındaki cep seçeneklerine de eklenir.' : 'Kurulum sayfasındaki ilgili listeye de eklenir.'}
      </p>
      <div className="tc-cl-dugmeler">
        <Dugme tur="birincil" type="submit" simge="check">Kaydet</Dugme>
        <Dugme onClick={vazgec}>Vazgeç</Dugme>
      </div>
    </form>
  );
}
