import { useEffect, useState } from 'react';
import type { SampleRequest } from '../../../../../../arkon/shared/model.ts';
import type { ArkonEkranOzellikleri } from '../sayfalar.ts';
import { useArkon } from '../veri/baglam.ts';
import { BakimSayfasi } from './BakimSayfasi.tsx';
import { KaliteSayfasi } from './KaliteSayfasi.tsx';
import { RaporlarSayfasi } from './RaporlarSayfasi.tsx';
import { bekleyenNumuneSayisi } from './kurallar.ts';
import './kalite.css';

// A4: Kalite (numune, onay, SPC, ölçü aletleri), Bakım ve Raporlar.
export function Kalite(_o: ArkonEkranOzellikleri) { return <KaliteSayfasi />; }
export function Bakim(_o: ArkonEkranOzellikleri) { return <BakimSayfasi />; }
export function Raporlar(_o: ArkonEkranOzellikleri) { return <RaporlarSayfasi />; }

// Öteki parçaların kullandığı bileşenler (PARCA-SOZLESMESI.md): A1 ve A5 ölçü aleti, numune penceresi ve SPC'yi kullanır.
export { AletSecimi, NumunePenceresi, OlcuAletleri, olcumAletiBul, useOlcumAletleri, type NumuneIstegi } from './OlcuAletleri.tsx';
export { SpcGorunumu, SpcGrafigi } from './SpcGorunumu.tsx';
export { acikNumuneMi, bekleyenNumuneSayisi } from './kurallar.ts';

// Sekme rozeti (eski NavRail nWait): kalitede bekleyen ya da ölçülen numune sayısı; numune ve sonuç iletisinde ve 20 saniyede bir
// yeniden okunur. A0 sekmesi bunu çağırır.
export function useBekleyenNumune(): number {
  const { depo } = useArkon();
  const [n, nYaz] = useState(0);
  useEffect(() => {
    const oku = () => { depo.DB.all('requests').then((l) => nYaz(bekleyenNumuneSayisi(l as SampleRequest[])), () => { /* eski ekranla aynı: sayı korunur */ }); };
    oku();
    const kapat = depo.Bus.on((m) => { if (/sample|result/.test(m.type)) setTimeout(oku, 300); });
    const t = setInterval(oku, 20000);
    return () => { kapat(); clearInterval(t); };
  }, [depo]);
  return n;
}
