import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { SayfaBasi } from './ortak.tsx';
import { paneliAc, type PanelIstegi } from './panel-olayi.ts';

// Okut sayfası kalktı (soru 90 a): eski adres ve menü maddesi Malzeme · Teslim panelini açar, sayfa İş kutusuna döner.
// Eski kipler: kabul Teslim al'a (mal kabul), sevkiyat Teslim et'e (sevk), sepet depo sepetine.
const KIPLER: Record<string, PanelIstegi> = { kabul: { sekme: 'al' }, sevkiyat: { sekme: 'et' }, sepet: { sekme: 'sepet', depoSepeti: true } };

export function OkutYonlendir() {
  const [adres] = useSearchParams();
  const git = useNavigate();
  const oturum = useOturum();
  const panelVar = oturum.data?.islemler.includes('stok.istek') ?? false;
  const kip = adres.get('mod') ?? '';
  useEffect(() => {
    if (!panelVar) return;
    paneliAc(KIPLER[kip] ?? { sekme: 'al' });
    void git('/stok', { replace: true });
  }, [panelVar, kip, git]);
  if (oturum.isPending || panelVar) return <DurumKutusu durum="yukleniyor" />;
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Okut" />
      <DurumKutusu durum="bos" mesaj="Okutma, üst çubuktaki Malzeme · Teslim panelindedir; panel malzeme isteme yetkisiyle açılır." />
    </section>
  );
}
