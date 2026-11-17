import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { useBekleyenKabulSayisi } from '../../../stok/disari.ts';
import { MalKabulTerminali } from './MalKabulTerminali.tsx';

// 3388 a: depo istasyonunun terminalinde "Toplama listesi" yanında stok işleri sekmesi. Sekme işlemi olana görünür (mal kabul
// stok.giris); kayıt Stok'undur ve kart okutan kişinin adınadır, terminal iş kaydına (sr) yazmaz. Seçilen iş bütün alanı alır.
export type DepoSekmesi = 'toplama' | 'mal-kabul';
interface Sekme { s: DepoSekmesi; ad: string; simge: SimgeAdi }

export function DepoSekmeleri({ secili, sec }: { secili: DepoSekmesi; sec: (s: DepoSekmesi) => void }) {
  const islemler = useOturum().data?.islemler ?? [];
  const kabul = useBekleyenKabulSayisi();
  const sekmeler: Sekme[] = [
    { s: 'toplama', ad: 'Toplama listesi', simge: 'truck' },
    ...(islemler.includes('stok.giris') ? [{ s: 'mal-kabul' as const, ad: kabul === null ? 'Mal kabul' : `Mal kabul · ${String(kabul)}`, simge: 'box' as const }] : []),
  ];
  if (sekmeler.length < 2) return null;
  const acik = sekmeler.some((x) => x.s === secili) ? secili : 'toplama';
  return (
    <div className="tc-ay1-depo-sekmeler" role="tablist" aria-label="Depo işleri">
      {sekmeler.map((x) => (
        <button key={x.s} type="button" role="tab" aria-selected={acik === x.s} onClick={() => sec(x.s)}><Simge ad={x.simge} boyut="k" />{x.ad}</button>
      ))}
    </div>
  );
}

export function DepoIsi({ sekme, dar }: { sekme: Exclude<DepoSekmesi, 'toplama'>; dar: boolean }) {
  const islemler = useOturum().data?.islemler ?? [];
  if (sekme === 'mal-kabul' && islemler.includes('stok.giris')) return <MalKabulTerminali dar={dar} />;
  return null;
}
