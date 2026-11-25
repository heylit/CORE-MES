import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { useYukleSayisi } from '../../../sevkiyat/disari.ts';
import { useBekleyenKabulSayisi } from '../../../stok/disari.ts';
import { MalKabulTerminali } from './MalKabulTerminali.tsx';
import { YuklemeTerminali } from './YuklemeTerminali.tsx';

// 3388 a, 3389 a: depo istasyonunun terminalinde "Toplama listesi" yanında stok işleri sekmeleri. Sekme işlemi olana görünür (mal kabul
// stok.giris, yükleme stok.cikis); kayıt Stok'un ve Sevkiyat'ındır ve kart okutan kişinin adınadır, terminal iş kaydına (sr) yazmaz. Seçilen sekme
// üretim terminalinin standart düzeninde açılır (DepoTerminali).
export type DepoSekmesi = 'toplama' | 'mal-kabul' | 'yukle';
// kisa: telefonda sekme satırı tek satıra sığsın diye.
interface Sekme { s: DepoSekmesi; ad: string; kisa: string; simge: SimgeAdi }

const sayi = (n: number | null): string => (n === null ? '' : ` · ${String(n)}`);

export function DepoSekmeleri({ secili, sec, kabulModu = false }: { secili: DepoSekmesi; sec: (s: DepoSekmesi) => void; kabulModu?: boolean }) {
  const islemler = useOturum().data?.islemler ?? [];
  const kabul = useBekleyenKabulSayisi();
  const yuk = useYukleSayisi();
  const sekmeler: Sekme[] = [
    { s: 'toplama', ad: kabulModu ? 'Kabul özeti' : 'Toplama listesi', kisa: kabulModu ? 'Özet' : 'Toplama', simge: 'list' },
    ...(islemler.includes('stok.giris') ? [{ s: 'mal-kabul' as const, ad: `Mal kabul${sayi(kabul)}`, kisa: `Kabul${sayi(kabul)}`, simge: 'box' as const }] : []),
    ...(islemler.includes('stok.cikis') ? [{ s: 'yukle' as const, ad: `Yükle${sayi(yuk)}`, kisa: `Yükle${sayi(yuk)}`, simge: 'truck' as const }] : []),
  ];
  if (sekmeler.length < 2) return null;
  const acik = sekmeler.some((x) => x.s === secili) ? secili : 'toplama';
  return (
    <div className="tc-ay1-depo-sekmeler" role="tablist" aria-label="Depo işleri">
      {sekmeler.map((x) => (
        <button key={x.s} type="button" role="tab" aria-selected={acik === x.s} onClick={() => sec(x.s)}><Simge ad={x.simge} boyut="k" /><span className="tc-ay1-depo-ad">{x.ad}</span><span className="tc-ay1-depo-kisa">{x.kisa}</span></button>
      ))}
    </div>
  );
}

export function DepoIsi({ sekme, dar }: { sekme: Exclude<DepoSekmesi, 'toplama'>; dar: boolean }) {
  const islemler = useOturum().data?.islemler ?? [];
  if (sekme === 'mal-kabul' && islemler.includes('stok.giris')) return <MalKabulTerminali dar={dar} />;
  if (sekme === 'yukle' && islemler.includes('stok.cikis')) return <YuklemeTerminali dar={dar} />;
  return null;
}
