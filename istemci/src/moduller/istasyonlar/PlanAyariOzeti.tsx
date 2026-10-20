import { useQuery } from '@tanstack/react-query';
import type { PlanAyarlariCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { degisimMetni } from './etiketler.ts';

// Plan ayarı İş merkezleri ve istasyonlar satırında yazılır; pencerede yalnız okunur. Satırı olmayan istasyonu plan verim %100, operatör 1 sayar.
export function PlanAyariOzeti({ istasyonId }: { istasyonId: number }) {
  const ayarlar = useQuery({ queryKey: anahtarlar.planAyarlari, queryFn: () => api.get<PlanAyarlariCevabi>('/istasyon-plan-ayarlari') });
  if (ayarlar.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (ayarlar.isError) return <DurumKutusu durum="hata" yenile={() => { void ayarlar.refetch(); }} />;
  const ayar = ayarlar.data.ayarlar.find((a) => a.istasyonId === istasyonId);
  return (
    <section className="tc-ist-kisiler" aria-label="Plan ayarı">
      <h3 className="tc-ist-alt-baslik">Plan ayarı</h3>
      <dl className="tc-ist-bilgi">
        <dt>Verim</dt>
        <dd>{ayar ? `%${Number(ayar.verimYuzde).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : '%100 (varsayılan)'}</dd>
        <dt>Operatör ihtiyacı</dt>
        <dd>{ayar ? Number(ayar.operatorIhtiyaci).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '1 (varsayılan)'}</dd>
        {ayar && (<><dt>Son değişiklik</dt><dd>{degisimMetni(ayar.degistiren.ad, ayar.degisme)}</dd></>)}
      </dl>
      <p className="tc-ist-ipucu">İş merkezleri ve istasyonlar satırında değiştirilir.</p>
    </section>
  );
}
