import { Fragment, useEffect, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { isimDurumu, isimEtiketi, isimYeri, type IslerimSatiri, type IsimOrtami } from '../../../../../../arkon/web/src/data/islerim.ts';

// 3392 a madde 6: kişinin çalışan bütün işleri makine adıyla tek şeritte (sunucunun GET /arkon/islerim cevabı, 2125-1 b). Dokununca
// bu istasyondaki işe geçilir; geçiş çalışan işi durdurmaz. Başka istasyondaki iş yalnız görünür (V6): o istasyonun cihazından açılır.
// Tek iş ekrandaysa düğme çizilmez: bilgi zaten ekrandadır. Liste üst çubuktaki düğmeden açılan penceredir; şerit gibi dikey yer
// tutmaz (3353: terminal kısa ekranda da kaymaz).
export const ISLERIM_YENILEME_MS = 30_000;

export function useIslerim(oku: (() => Promise<IslerimSatiri[]>) | null, anahtar: string): IslerimSatiri[] {
  const [liste, listeYaz] = useState<IslerimSatiri[]>([]);
  useEffect(() => {
    if (!oku) { listeYaz([]); return undefined; }
    let canli = true;
    const sor = () => { oku().then((l) => { if (canli) listeYaz(l); }, () => { /* ağ yok: son liste kalır */ }); };
    sor();
    const t = window.setInterval(sor, ISLERIM_YENILEME_MS);
    return () => { canli = false; window.clearInterval(t); };
  }, [oku, anahtar]);
  return liste;
}

export const seritGerekir = (liste: readonly IslerimSatiri[], o: IsimOrtami): boolean =>
  liste.length > 1 || (liste.length === 1 && isimDurumu(liste[0]!, o) !== 'ekranda');

export function BenimIslerimDugmesi({ liste, ortam, ac }: { liste: readonly IslerimSatiri[]; ortam: IsimOrtami; ac: () => void }) {
  if (!seritGerekir(liste, ortam)) return null;
  const ad = `Benim işlerim · ${String(liste.length)} çalışıyor`;
  return (
    <button type="button" className="tc-ay1-islerim-dugme" onClick={ac} title={ad} aria-label={ad}>
      <Simge ad="layers" boyut="k" /><span className="tc-ay1-cagri-yazi">İşlerim</span><b>{liste.length}</b>
    </button>
  );
}

export function BenimIslerim({ liste, ortam, gec }: { liste: readonly IslerimSatiri[]; ortam: IsimOrtami; gec: (s: IslerimSatiri) => void }) {
  if (!liste.length) return <p className="tc-ay1-soluk">Çalışan işiniz yok.</p>;
  return (
    <nav className="tc-ay1-islerim" aria-label={`Benim işlerim · ${String(liste.length)} çalışıyor`}>
      {liste.map((s) => {
        const d = isimDurumu(s, ortam);
        const yer = isimYeri(s);
        // Kodlar tire yerinden bölünmesin: her parça tek parçadır, satır parça arasından alta iner.
        const etiket = [yer.kod, ...isimEtiketi(s).split(' · ')];
        const not = d === 'ekranda' ? 'ekranda' : d === 'burada' ? 'dokun, geç' : `${s.istasyon} cihazından`;
        return (
          <button key={`${String(s.emirId)}:${String(s.isEmriId)}:${s.mc ?? ''}`} type="button" className="tc-ay1-islerim-is" data-durum={d}
            aria-current={d === 'ekranda' ? 'true' : undefined} disabled={d !== 'burada'} onClick={() => gec(s)}>
            <Simge ad={s.mc ? 'cpu' : 'pin'} boyut="k" /><b>{etiket.map((x, i) => <Fragment key={i}>{i ? ' · ' : null}<span className="tc-ay1-islerim-parca">{x}</span></Fragment>)}</b><small>{not}</small>
          </button>
        );
      })}
    </nav>
  );
}
