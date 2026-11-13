import { Suspense, useEffect, useState } from 'react';
import type { IsEmriSahnesiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu, Pencere } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi, OTURUM_BITTI } from '../../../../ortak/veri/api.ts';
import { MontajIzleyici as SahneIzleyici } from '../../../belge-merkezi/disari.ts';
import './montaj-sahnesi.css';

// 3209 a, 3213: işin talimatında 3B montaj sahnesi varsa talimat adımlarının üstünde "3B montaj" düğmesi çıkar. Sahne ve model yalnız bu işin
// rota adımına bağlı talimattan (emre sabitlenen sürüm) gelir; sunucu işin terminalde görünürlüğünü denetler, model listesi yoktur.
// Sahne okunamazsa düğme çıkmaz: adımlar ve kontrol noktaları bugünkü gibi çalışır. Pencerenin başlıktaki kapatma düğmesi ortak (44 px);
// eldivenli el için altta terminal ölçüsünde "Kapat" da vardır.

type Sahne = NonNullable<IsEmriSahnesiCevabi['sahne']>;

async function modelOku(isEmriId: number, sinyal: AbortSignal): Promise<Uint8Array> {
  const c = await fetch(`/api/arkon/is-emirleri/${String(isEmriId)}/sahne-modeli`, { credentials: 'include', signal: sinyal });
  if (!c.ok) {
    if (c.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    throw new ApiHatasi(c.status, null);
  }
  return new Uint8Array(await c.arrayBuffer());
}

export function MontajSahnesi({ isEmriId, adimlar }: { isEmriId: number; adimlar: readonly { sira: number; ad: string; tamam: boolean }[] }) {
  const [sahne, sahneYaz] = useState<Sahne | null>(null);
  const [acik, acikYaz] = useState(false);
  const [model, modelYaz] = useState<Uint8Array | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => {
    let canli = true;
    sahneYaz(null);
    modelYaz(null);
    api.get<IsEmriSahnesiCevabi>(`/arkon/is-emirleri/${String(isEmriId)}/sahne`).then((c) => { if (canli) sahneYaz(c.sahne); }, () => { /* düğme çıkmaz */ });
    return () => { canli = false; };
  }, [isEmriId]);

  useEffect(() => {
    if (!acik || model !== null) return;
    const iptal = new AbortController();
    hataYaz(null);
    modelOku(isEmriId, iptal.signal).then(modelYaz, (h: unknown) => { if (!iptal.signal.aborted) hataYaz(hataIletisi(h, '3B model alınamadı.')); });
    return () => { iptal.abort(); };
  }, [acik, model, isEmriId]);

  if (sahne === null || sahne.adimlar.length === 0) return null;
  const ilk = adimlar.find((a) => !a.tamam)?.sira ?? adimlar[0]?.sira ?? 1;
  return (
    <>
      <div className="tc-ay1-montaj">
        <Dugme simge="cube" onClick={() => { acikYaz(true); }}>3B montaj</Dugme>
      </div>
      <Pencere acik={acik} tur="tam" kapat={() => { acikYaz(false); }} baslik={`3B montaj · talimat sürüm ${String(sahne.talimatSurum)}`}
        alt={<div className="tc-ay1-montaj"><Dugme simge="x" onClick={() => { acikYaz(false); }}>Kapat</Dugme></div>}>
        {hata !== null ? <DurumKutusu durum="hata" mesaj={hata} />
          : model === null ? <DurumKutusu durum="yukleniyor" mesaj="3B model indiriliyor" />
            : (
              <Suspense fallback={<DurumKutusu durum="yukleniyor" mesaj="3B sahne açılıyor" />}>
                <SahneIzleyici sahne={sahne.adimlar} veri={model} ilkSira={ilk} adimlar={adimlar.map((a) => ({ sira: a.sira, baslik: a.ad }))} />
              </Suspense>
            )}
      </Pencere>
    </>
  );
}
