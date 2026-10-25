import { useEffect, useState, type ReactNode } from 'react';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { calismaOku } from '../durum.ts';
import { FasonPlaniGorunumu } from '../maliyet/FasonPlani.tsx';
import { MalzemePlaniGorunumu } from '../malzeme/MalzemePlani.tsx';
import type { PlanlamaCalismasi } from '../tipler.ts';
import '../planlama-yeni.css';

// 542 a, 546 a: Satın Alma menüsündeki malzeme satın alma planı ve fason planı. Planlama sayfalarının görünümü aynen çizilir, veri daraltılmış
// çalışmadır (sunucu satin-alma-gorunumu.ts: müşteri, fiyat, maliyet, tezgâh ve personel gelmez). Hesap ekrandadır, tek kopyadır.
// Yazma yoktur; tutar görünmez, planlamaya geçiş seçeneği çıkmaz.
export const SATIN_ALMA_CALISMASI = '/recete-rota/planlama-calismasi/satin-alma';

interface Okuyucu { get: <T>(yol: string) => Promise<T> }
type Durum = { tur: 'yukleniyor' } | { tur: 'hata'; ileti: string } | { tur: 'hazir'; calisma: PlanlamaCalismasi | null; emirler: unknown };

export async function satinAlmaCalismasiOku(o: Okuyucu = api): Promise<{ calisma: PlanlamaCalismasi | null; emirler: unknown }> {
  const c = await o.get<PlanlamaCalismasiCevabi>(SATIN_ALMA_CALISMASI);
  return { calisma: c.calisma === null ? null : calismaOku(c.calisma), emirler: c.calisma?.['emirDurumu'] ?? null };
}

function useSatinAlmaCalismasi(): [Durum, () => void] {
  const [durum, durumYaz] = useState<Durum>({ tur: 'yukleniyor' });
  const [tur, turYaz] = useState(0);
  useEffect(() => {
    let bitti = false;
    durumYaz({ tur: 'yukleniyor' });
    satinAlmaCalismasiOku().then(
      (x) => { if (!bitti) durumYaz({ tur: 'hazir', ...x }); },
      (e: unknown) => { if (!bitti) durumYaz({ tur: 'hata', ileti: hataIletisi(e, 'Plan okunamadı.') }); },
    );
    return () => { bitti = true; };
  }, [tur]);
  return [durum, () => { turYaz((n) => n + 1); }];
}

function Kap({ ciz }: { ciz: (calisma: PlanlamaCalismasi | null, emirler: unknown) => ReactNode }) {
  const [durum, yenile] = useSatinAlmaCalismasi();
  if (durum.tur === 'yukleniyor') return <div className="tc-py-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (durum.tur === 'hata') return <div className="tc-py-durum"><DurumKutusu durum="hata" mesaj={durum.ileti} yenile={yenile} /></div>;
  return <div className="tc-py-gorunum">{ciz(durum.calisma, durum.emirler)}</div>;
}

export function SatinAlmaMalzemePlani() {
  return <Kap ciz={(c, emirler) => <MalzemePlaniGorunumu calisma={c} emirler={emirler} maliyetOku={false} calismaSurumu={null} />} />;
}

export function SatinAlmaFasonPlani() {
  return <Kap ciz={(c) => <FasonPlaniGorunumu c={c} komut={null} planYaz={false} maliyetOku={false} git={null} />} />;
}
