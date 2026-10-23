import { useMemo, useState, type ReactNode } from 'react';
import { Tablo, type Sutun, type TabloSuzgeci } from '../../../ortak/arayuz/Tablo.tsx';
import { Rozet } from '../../../ortak/arayuz/Rozet.tsx';
import { useArsivGorunumu } from './ArsivGorunumu.tsx';
import { rozetTonu } from './bicim.ts';
import type { KmTon } from './kurallar.ts';
import type { KmKayit } from './tipler.ts';

interface Ozellikler<T extends KmKayit> {
  etiket: string;
  satirlar: readonly T[];
  sutunlar: readonly Sutun<T>[];
  // Aranan metin: verilmezse arama kutusu çizilmez.
  ara?: (satir: T) => string;
  aramaYeri?: string;
  suzgec?: { etiket: string; secenekler: readonly TabloSuzgeci[]; ilk: string; uyar: (satir: T, deger: string) => boolean };
  // Arşivlenebilen listede arşivli kayıtlar gizlidir; Arşiv ekranındaki genel anahtarla görünür (uygulamadaki arsivF).
  arsivli?: boolean;
  csv?: string;
  ac?: (satir: T) => void;
  bos: string;
  sag?: ReactNode;
}

// Uygulamanın liste kalıbı: arama ve süzgeç (UI.f), arşiv süzgeci, CSV indir, satıra tıklayınca kayıt açılır.
export function KayitListesi<T extends KmKayit>({ etiket, satirlar, sutunlar, ara, aramaYeri, suzgec, arsivli = false, csv, ac, bos, sag }: Ozellikler<T>) {
  const [aranan, arananYaz] = useState('');
  const [secili, seciliYaz] = useState(suzgec?.ilk ?? '');
  const { goster: arsivGoster } = useArsivGorunumu();
  const gorunen = useMemo(() => {
    let L = arsivli && !arsivGoster ? satirlar.filter((r) => !r.arsiv) : [...satirlar];
    if (suzgec && secili) L = L.filter((r) => suzgec.uyar(r, secili));
    const q = aranan.trim().toLocaleLowerCase('tr');
    if (ara && q) L = L.filter((r) => ara(r).toLocaleLowerCase('tr').includes(q));
    return L;
  }, [satirlar, arsivli, arsivGoster, suzgec, secili, ara, aranan]);

  return (
    <Tablo<T>
      etiket={etiket}
      sutunlar={sutunlar}
      satirlar={gorunen}
      satirAnahtari={(r) => r._id}
      satirSec={ac}
      bosMesaj={satirlar.length ? 'Aramaya uyan kayıt yok.' : bos}
      arac={{
        ...(ara ? { arama: { deger: aranan, degistir: arananYaz, yerTutucu: aramaYeri ?? 'Ara' } } : {}),
        ...(suzgec ? { suzgec: { etiket: suzgec.etiket, secenekler: suzgec.secenekler, secili, sec: seciliYaz } } : {}),
        ...(csv ? { csv: { ad: csv } } : {}),
        sag: (
          <>
            <span className="tc-km-soluk">{gorunen.length} kayıt</span>
            {sag}
          </>
        ),
      }}
    />
  );
}

// Durum damgası: renk tek başına anlam taşımaz, metin her zaman yazılır.
export function Damga({ ton, children }: { ton: KmTon; children: ReactNode }) {
  return <Rozet ton={rozetTonu(ton)}>{children}</Rozet>;
}
