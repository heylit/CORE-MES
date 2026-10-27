import { useEffect, useState } from 'react';
import { Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { state } from '../depo.ts';
import { invKey, stockOf } from '../secici.ts';
import { thumb } from '../sahne/gl.ts';
import { useCncYetkisi } from '../veri.ts';
import { BirakincaYaz, rafSinifi } from './KalemAyrintisi.tsx';
import { bagliKart } from './StokKarti.tsx';
import { kalemTezgahlari, setLoc, setMin, setQty, type Kalem, type Raf, type StokKaydi } from './raf.ts';

// Küçük resimler tek WebGL çizicisinden üretilir; karede dört tane (prototipin pumpThumbs'ı), kalem başına bir kez.
const resimler = new Map<string, string>();
const bekleyen: { it: Kalem; bitince: (src: string) => void }[] = [];
let kare = 0;
function pompa(): void {
  kare = 0;
  for (let n = 0; n < 4 && bekleyen.length; n++) {
    const { it, bitince } = bekleyen.shift()!;
    const hazir = resimler.get(it.id);
    if (hazir !== undefined) { bitince(hazir); continue; }
    const c = thumb(it);
    const src: string = c ? c.toDataURL('image/png') : 'data:,';
    resimler.set(it.id, src);
    bitince(src);
  }
  if (bekleyen.length) kare = requestAnimationFrame(pompa);
}
export function resimUnut(id: string): void { resimler.delete(id); }

function KucukResim({ it }: { it: Kalem }) {
  const [src, srcYaz] = useState(resimler.get(it.id));
  useEffect(() => {
    if (resimler.has(it.id)) { srcYaz(resimler.get(it.id)); return; }
    const is = { it, bitince: srcYaz };
    bekleyen.push(is);
    if (!kare) kare = requestAnimationFrame(pompa);
    return () => { const i = bekleyen.indexOf(is); if (i >= 0) bekleyen.splice(i, 1); };
  }, [it]);
  return src && src !== 'data:,' ? <img src={src} alt="" className="tc-cl-resim" /> : <span className="tc-cl-resim" />;
}

interface Ozellikler {
  raflar: Raf[];
  seciliId: string | null;
  sec: (ri: number, k: number) => void;
}

// Prototipin liste görünümü: raf başına bir tablo; adet, kritik ve konum yerinde düzenlenir.
export function Liste({ raflar, seciliId, sec }: Ozellikler) {
  const yetki = useCncYetkisi();
  const inv = state.inv as Record<string, StokKaydi | undefined>;

  const sutunlar = (ri: number, raf: Raf): Sutun<Kalem>[] => [
    { anahtar: 'resim', baslik: '', hucre: (it) => <KucukResim it={it} />, csv: false },
    {
      anahtar: 'ad', baslik: 'Malzeme', csv: false,
      hucre: (it) => (
        <button type="button" className="tc-cl-liste-ad" aria-current={it.id === seciliId || undefined} onClick={() => { sec(ri, raf.items.indexOf(it)); }}>
          <b>{it.name}</b><small className="mono">{it.code ?? ''}</small>
        </button>
      ),
    },
    {
      anahtar: 'adet', baslik: 'Adet', hizala: 'sag', csv: false,
      hucre: (it) => {
        const key = invKey(it), iv = inv[key];
        return <BirakincaYaz aria-label={`${it.name}: adet`} type="number" min="0" placeholder="—" deger={iv?.qty != null ? String(iv.qty) : ''} readOnly={!yetki.yazabilir || bagliKart(key) !== null} yaz={(v) => { setQty(key, v); }} />;
      },
    },
    {
      anahtar: 'kritik', baslik: 'Kritik', hizala: 'sag', csv: false,
      hucre: (it) => {
        const key = invKey(it), iv = inv[key];
        return <BirakincaYaz aria-label={`${it.name}: kritik`} type="number" min="0" placeholder="0" deger={iv?.min ? String(iv.min) : ''} readOnly={!yetki.yazabilir} yaz={(v) => { setMin(key, v); }} />;
      },
    },
    { anahtar: 'aktif', baslik: 'Aktif', hizala: 'sag', csv: false, hucre: (it) => stockOf(invKey(it)).used || '' },
    {
      anahtar: 'depoda', baslik: 'Depoda', hizala: 'sag', csv: false,
      hucre: (it) => { const s = stockOf(invKey(it)); return <span className={`tc-cl-st-${s.st}`}>{s.avail == null ? '—' : s.avail}</span>; },
    },
    {
      anahtar: 'konum', baslik: 'Konum', csv: false,
      hucre: (it) => { const key = invKey(it); return <BirakincaYaz aria-label={`${it.name}: konum`} placeholder="—" deger={inv[key]?.loc ?? ''} readOnly={!yetki.yazabilir} yaz={(v) => { setLoc(key, v); }} />; },
    },
    {
      anahtar: 'tezgahlar', baslik: 'Tezgâhlar', csv: false,
      hucre: (it) => {
        const ms = kalemTezgahlari(invKey(it));
        return ms.length
          ? ms.map((m, i) => <span key={m.ad}>{i ? ' · ' : ''}{m.ad} <b>{m.adet}</b></span>)
          : <span className="tc-cl-soluk">—</span>;
      },
    },
  ];

  return (
    <div className="tc-cl-liste">
      {raflar.map((raf, ri) => (
        <section key={raf.key} className="tc-cl-liste-raf">
          <h3 className={`tc-cl-liste-baslik ${rafSinifi(raf.key)}`}><i aria-hidden="true" />{raf.title} <em>{raf.items.length}</em></h3>
          <Tablo etiket={raf.title} sutunlar={sutunlar(ri, raf)} satirlar={raf.items} satirAnahtari={(it) => it.id} />
        </section>
      ))}
    </div>
  );
}
