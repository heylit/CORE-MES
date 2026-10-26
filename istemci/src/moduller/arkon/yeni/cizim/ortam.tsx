import { useMemo, type ReactNode } from 'react';
import type { OlcumAleti } from '../../../../ortak/cizim/cekirdek/olcum-aleti.ts';
import { CizimOrtami, type CizimOrtamiDegeri } from '../../../../ortak/cizim/ortam.tsx';
import { bip } from '../cekirdek/ses.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { useArkon } from '../veri/baglam.ts';

// Ortak çizim parçasına Arkon'un önbelleği, ölçü aletleri, 'arkon:' önekli cihaz kaydı ve terminal sesi verilir (eski ekranla aynı kayıtlar).
export function ArkonCizimOrtami({ children }: { children: ReactNode }) {
  const { depo, ayarlar } = useArkon();
  const deger = useMemo((): CizimOrtamiDegeri => ({
    onbellek: depo.Cache,
    aletler: ayarlar.olcuAletleri as unknown as OlcumAleti[],
    ayarlar: yerel,
    ses: bip,
  }), [depo, ayarlar]);
  return <CizimOrtami deger={deger}>{children}</CizimOrtami>;
}
