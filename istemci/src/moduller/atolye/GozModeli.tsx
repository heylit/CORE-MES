import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DurumKutusu, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { varsayilanAyar } from './model-dosyasi.ts';
import { malzemeModelDosyasi, useMalzemeModelleri } from './veri.ts';

const ModelOnizleme = lazy(() => import('./ModelOnizleme.tsx').then((m) => ({ default: m.ModelOnizleme })));

// 3202 B (K7): gözdeki malzemelerden yayında 3B modeli olan ilkinin döndürülebilir önizlemesi ve malzeme kartına bağlantı.
// Model listesini harita verir (3205 a: haritayı açabilen herkes); modeli olmayan gözde yalnız bağlantı kalır.
export function GozModeli({ malzemeler }: { malzemeler: readonly { malzemeId: number }[] }) {
  const { bildir } = useBildirim();
  const modeller = useMalzemeModelleri();
  const secilenNo = malzemeler.find((m) => modeller.has(m.malzemeId))?.malzemeId ?? null;
  const model = secilenNo === null ? null : modeller.get(secilenNo) ?? null;
  const [glb, glbYaz] = useState<Uint8Array | null>(null);
  useEffect(() => {
    glbYaz(null);
    if (secilenNo === null || !model) return undefined;
    let iptal = false;
    malzemeModelDosyasi(secilenNo, model).then((d) => { if (!iptal) glbYaz(d); }, () => { if (!iptal) bildir('hata', `${model.ad} modeli indirilemedi.`); });
    return () => { iptal = true; };
  }, [secilenNo, model, bildir]);
  const ilk = secilenNo ?? malzemeler[0]?.malzemeId ?? null;
  return (
    <div className="tc-atolye-goz-model">
      {model && (
        <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
          <ModelOnizleme glb={glb} ayar={{ ...varsayilanAyar(model.dosyaTuru), donus: 0, sigdir: false }} />
        </Suspense>
      )}
      {ilk !== null && <Link to={`/stok/malzemeler/${ilk}`}><Simge ad="cube" /> Malzeme kartını aç</Link>}
    </div>
  );
}
