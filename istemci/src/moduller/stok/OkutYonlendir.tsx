import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { SayfaBasi } from './ortak.tsx';
import { paneliAc, type PanelIstegi } from './panel-olayi.ts';

// Okut sayfası kalktı (soru 90 a) ve menü maddesi de kalktı (2022 b): eski adres Okut panelini açar, sayfa İş kutusuna döner.
// Eski kipler okutmayla başlar (mal kabul, sevk ve depo sepeti okutulan kodun sonucundan seçilir).
// 2022 b: Okutarak say sayfası da kalktı; eski adresi paneli Say modunda açar.
const KIPLER: Record<string, PanelIstegi> = { kabul: { sekme: 'okut' }, sevkiyat: { sekme: 'okut' }, sepet: { sekme: 'sepet', depoSepeti: true }, say: { sekme: 'okut', mod: 'say' } };

export function OkutYonlendir({ sabitKip }: { sabitKip?: string } = {}) {
  const [adres] = useSearchParams();
  const git = useNavigate();
  const oturum = useOturum();
  const panelVar = oturum.data?.islemler.includes('stok.istek') ?? false;
  const kip = sabitKip ?? adres.get('mod') ?? '';
  useEffect(() => {
    if (!panelVar) return;
    paneliAc(KIPLER[kip] ?? { sekme: 'okut' });
    void git('/stok', { replace: true });
  }, [panelVar, kip, git]);
  if (oturum.isPending || panelVar) return <DurumKutusu durum="yukleniyor" />;
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Okut" />
      <DurumKutusu durum="bos" mesaj="Okutma, üst çubuktaki Okut panelindedir; panel malzeme isteme yetkisiyle açılır." />
    </section>
  );
}
