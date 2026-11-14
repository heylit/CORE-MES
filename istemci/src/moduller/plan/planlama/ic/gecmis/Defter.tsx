import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DefterSatiri, DegisiklikDefteriCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Rozet } from '../../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../../ortak/veri/api.ts';
import { VeriKarti, VeriTablosu, type Sutun } from '../veri/ortak.tsx';
import { DEFTER_OLAY_ADI, izZamani } from './kurallar.ts';

// Değişiklik defteri (2129-2 b): planı etkileyen her değişiklik, uygulanması ya da reddi (gerekçesiyle), kişi ve zamanıyla. Satırı sunucu
// çalışma yazmasında yazar; ekran yalnız okur, en yeni önde, sayfa sayfa.
// Defter işi emrin kimliğiyle saklar; ekranda onay sayfasındaki gibi emrin adı yazılır. Çalışmada artık olmayan emirde kimlik kalır.
const sutunlar = (ad: (id: string) => string): readonly Sutun<DefterSatiri>[] => [
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (x) => <span className="mono">{izZamani(Date.parse(x.zaman))}</span>, kirilmaz: true },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: (x) => x.kisi ?? '—' },
  { anahtar: 'olay', baslik: 'Olay', hucre: (x) => <Rozet ton={DEFTER_OLAY_ADI[x.olay][1]}>{DEFTER_OLAY_ADI[x.olay][0]}</Rozet>, kirilmaz: true },
  { anahtar: 'ne', baslik: 'Değişiklik', hucre: (x) => <span><b>{x.ne}</b>{x.ayrinti ? <span className="tc-pyi-k"> {x.ayrinti}</span> : null}</span> },
  { anahtar: 'isler', baslik: 'Etkilenen', hucre: (x) => (x.isler.includes('*') ? 'Bütün işler' : x.isler.map(ad).join(', ') || '—') },
  { anahtar: 'gerekce', baslik: 'Gerekçe', hucre: (x) => x.gerekce ?? '—' },
];

export function DegisiklikDefteri({ siparisler }: { siparisler?: readonly { id: string; ad?: string }[] }) {
  const SUTUNLAR = useMemo(() => {
    const adlar = new Map((siparisler ?? []).map((x) => [x.id, x.ad]));
    return sutunlar((id) => adlar.get(id) || id);
  }, [siparisler]);
  const [l, lYaz] = useState<DefterSatiri[] | null>(null);
  const [dahaVar, dahaVarYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const [yukleniyor, yukleniyorYaz] = useState(false);
  const oku = useCallback(async (once: number | null) => {
    yukleniyorYaz(true);
    try {
      const c = await api.get<DegisiklikDefteriCevabi>(`/plan/degisiklik-defteri${once === null ? '' : `?once=${String(once)}`}`);
      lYaz((x) => (once === null ? c.satirlar : [...(x ?? []), ...c.satirlar]));
      dahaVarYaz(c.dahaVar);
      hataYaz(null);
    } catch (e) {
      hataYaz(hataIletisi(e, 'Değişiklik defteri okunamadı.'));
    } finally {
      yukleniyorYaz(false);
    }
  }, []);
  useEffect(() => { void oku(null); }, [oku]);
  const son = l?.at(-1);
  return (
    <VeriKarti baslik="Değişiklik defteri" simge="clipboard-check" ek={l ? `${String(l.length)} kayıt` : undefined}
      sag={<Dugme simge="rotate" onClick={() => { void oku(null); }} disabled={yukleniyor}>Yenile</Dugme>}>
      {hata && <p className="tc-pyi-alt" role="alert">{hata}</p>}
      {l === null && !hata ? <p className="tc-pyi-alt">Yükleniyor…</p> : (
        <VeriTablosu etiket="Değişiklik defteri" sutunlar={SUTUNLAR} satirlar={l ?? []} anahtar={(x) => String(x.id)}
          bos="Henüz kayıt yok. Plan varken girilen her değişiklik ve kararı burada görünür." />
      )}
      {dahaVar && son && (
        <Dugme simge="clock" onClick={() => { void oku(son.id); }} disabled={yukleniyor}>Daha eski kayıtlar</Dugme>
      )}
    </VeriKarti>
  );
}
