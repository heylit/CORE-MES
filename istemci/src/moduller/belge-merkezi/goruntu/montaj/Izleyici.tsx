import { lazy, Suspense, useState } from 'react';
import type { SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { modelBicimiBul } from './oynatma.ts';
import './montaj.css';

// Terminalde 3B montaj izleyici (3209 a; KURGU 5: adım açılınca hareket döngüde oynar, parmakla döner, "Sonraki" ile geçilir). Yalnız izlenir;
// düzenleme stüdyodadır. Adım başlıkları terminalin talimat adımlarıdır (aynı sabitlenen sürüm); dokunma hedefleri terminal ölçüsündedir.

const Sahne3B = lazy(() => import('./Sahne3B.tsx'));

export interface IzlenecekAdim { sira: number; baslik: string }

export default function SahneIzleyici({ sahne, veri, adimlar, ilkSira }: {
  sahne: readonly SahneAdimi[]; veri: Uint8Array; adimlar: readonly IzlenecekAdim[]; ilkSira: number;
}) {
  const [aktif, aktifYaz] = useState(() => (adimlar.some((a) => a.sira === ilkSira) ? ilkSira : adimlar[0]?.sira ?? 1));
  const [oynuyor, oynuyorYaz] = useState(true);
  const [yeniden, yenidenYaz] = useState(0);
  const i = Math.max(0, adimlar.findIndex((a) => a.sira === aktif));
  const git = (j: number) => { const a = adimlar[j]; if (a) { aktifYaz(a.sira); oynuyorYaz(true); } };
  const hareket = sahne.find((a) => a.sira === aktif)?.hareket ?? null;
  return (
    <div className="tc-mt-izleyici">
      <div className="tc-mt-kutu">
        <Suspense fallback={<div className="tc-mt-sahne"><DurumKutusu durum="yukleniyor" mesaj="3B sahne açılıyor" /></div>}>
          <Sahne3B veri={veri} bicim={modelBicimiBul(veri)} adimlar={sahne} aktifSira={aktif} oynuyor={oynuyor} hayalet={false} baslangic={yeniden}
            etiket={`Adım ${String(i + 1)} montaj hareketi`} />
        </Suspense>
        <div className="tc-mt-ust-yazi"><b>{`Adım ${String(i + 1)} / ${String(adimlar.length)}`}</b>{adimlar[i] ? ` · ${adimlar[i].baslik}` : ''}</div>
      </div>
      <p className="tc-mt-not">{hareket && hareket.parcalar.length > 0 ? `${String(hareket.parcalar.length)} parça · ${hareket.yon} yönünden girer` : 'Bu adımda parça hareketi yok.'}</p>
      <div className="tc-mt-alt">
        <Dugme simge="chev-left" disabled={i <= 0} onClick={() => { git(i - 1); }}>Önceki</Dugme>
        <Dugme simge={oynuyor ? 'pause' : 'play'} onClick={() => { oynuyorYaz(!oynuyor); }}>{oynuyor ? 'Durdur' : 'Oynat'}</Dugme>
        <Dugme simge="rotate" onClick={() => { yenidenYaz((n) => n + 1); oynuyorYaz(true); }}>Yeniden</Dugme>
        <Dugme simge="chev-right" disabled={i >= adimlar.length - 1} onClick={() => { git(i + 1); }}>Sonraki</Dugme>
      </div>
      <p className="tc-mt-not tc-mt-ipucu"><Simge ad="cube" boyut="k" />Parmakla sürükle: döndür · iki parmak: yakınlaş</p>
    </div>
  );
}
