import { useEffect, useRef, useState } from 'react';
import { AdimListesi, DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { adimCevabiUygula, adimYaz } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { useArkon, useArkonDurumu } from '../veri/baglam.ts';
import type { TmiAdim } from '../veri/depo.ts';
import type { Pkg } from './tipler.ts';

// Operasyon adımları (operator-parcalar.ts Steps). TMI emrinde adımlar emrin talimatıdır ve işaret TMI'ye yazılır; yerel pakette
// paketin adımları ekranda işaretlenir, kayda gitmez. Önizlemede TMI'ye yazılmaz, paketin adımları gösterilir.

export function Adimlar({ adimlar, emirId, onizleme }: { adimlar: Pkg['steps'] | undefined; emirId: number | null; onizleme: boolean }) {
  const durum = useArkonDurumu();
  return emirId !== null && !onizleme && durum.mode === 'server' ? <TmiAdimlari emirId={emirId} /> : <YerelAdimlar adimlar={adimlar} />;
}

function TmiAdimlari({ emirId }: { emirId: number }) {
  const { depo } = useArkon();
  const [liste, listeYaz] = useState<TmiAdim[] | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const suruyor = useRef(new Set<number>());
  useEffect(() => {
    let canli = true;
    depo.Server.tmiAdimlari(emirId).then((l) => { if (canli) listeYaz(l); }, () => { if (canli) { listeYaz([]); hataYaz('Adımlar alınamadı'); } });
    return () => { canli = false; };
  }, [depo, emirId]);
  const isaretle = (id: number, tamam: boolean) => {
    if (suruyor.current.has(id)) return;
    suruyor.current.add(id);
    hataYaz(null);
    listeYaz((l) => l && adimYaz(l, id, (x) => ({ ...x, tamam })));
    depo.Server.tmiAdimIsaretle(emirId, id, tamam)
      .then((c) => listeYaz((l) => l && adimCevabiUygula(l, id, c)))
      .catch((e: unknown) => {
        listeYaz((l) => l && adimYaz(l, id, (x) => ({ ...x, tamam: !tamam })));
        hataYaz(`Adım kaydedilmedi · ${(e instanceof Error && e.message) || 'TMI kabul etmedi'}`);
      })
      .finally(() => { suruyor.current.delete(id); });
  };
  if (liste === null) return <DurumKutusu durum="yukleniyor" mesaj="Adımlar yükleniyor" />;
  return (
    <div className="tc-ay1-adimlar">
      {hata ? <p className="tc-ay1-hata" role="alert">{hata}</p> : null}
      <AdimListesi baslik="Operasyon adımları · TMI'ye yazılır" adimlar={liste} degistir={isaretle} bosMesaj="Bu emrin talimat adımı yok" />
    </div>
  );
}

function YerelAdimlar({ adimlar }: { adimlar: Pkg['steps'] | undefined }) {
  const L = adimlar || [];
  const [on, onYaz] = useState<Record<string, boolean>>(() => Object.fromEntries(L.filter((s) => s.on).map((s) => [s.id, true])));
  const zorunlu = L.filter((s) => s.r).length;
  return (
    <div className="tc-ay1-adimlar">
      <AdimListesi
        baslik={`Operasyon adımları${L.length ? ` · ${zorunlu} zorunlu` : ''}`}
        adimlar={L.map((s, i) => ({ id: i, ad: s.t, aciklama: s.d || null, tamam: !!on[s.id], not: s.r ? 'Zorunlu' : null }))}
        degistir={(i, tamam) => { const s = L[i]; if (s) onYaz((x) => ({ ...x, [s.id]: tamam })); }}
        bosMesaj="Bu işin paketinde adım yok"
      />
    </div>
  );
}
