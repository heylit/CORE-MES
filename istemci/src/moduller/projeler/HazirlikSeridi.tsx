import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { cihazDurumuCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { z } from 'zod';
import type { GecikenHazirliklarimCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import './projeler.css';

const CIHAZ_ANAHTARI = ['projeler', 'bu-cihaz'] as const;

// 3396-3 a: geciken hazırlık görevi olan kişide kapanmayan kırmızı şerit; ortak cihazda (terminal, istasyon) çıkmaz, orada yalnız zil çalar.
// Şerit görev bitince ya da kontrole düşünce kendiliğinden kalkar; kapatma düğmesi bilerek yoktur.
export function HazirlikSeridi() {
  const cihaz = useQuery({ queryKey: CIHAZ_ANAHTARI, queryFn: () => api.get<z.output<typeof cihazDurumuCevabi>>('/oturum/cihaz'), staleTime: 600_000 });
  const kisisel = cihaz.data?.ortak === false;
  const d = useQuery({
    queryKey: anahtarlar.uyarim, queryFn: () => api.get<GecikenHazirliklarimCevabi>('/projeler/hazirlik-uyarim'),
    enabled: kisisel, refetchInterval: 300_000,
  });
  const gorevler = d.data?.gorevler ?? [];
  if (!kisisel || gorevler.length === 0) return null;
  const ilk = gorevler[0];
  const enCok = Math.max(...gorevler.map((g) => g.gecikmeGun));
  const ozet = gorevler.length === 1 && ilk
    ? `"${ilk.ad}" görevin ${String(ilk.gecikmeGun)} gün gecikti (son gün ${tarihMetni(ilk.planBitis)}).`
    : `${String(gorevler.length)} hazırlık görevin gecikti; en eskisi ${String(enCok)} gün.`;
  return (
    <div className="tc-prj-serit" role="alert" data-testid="hazirlik-seridi">
      <Simge ad="alert" boyut="k" />
      <p><b>{ozet}</b><span className="tc-prj-serit-ek"> Bitirmeden ya da kontrole göndermeden şerit kapanmaz.</span></p>
      <Link to="/proje-gorevlerim">Görevlere git</Link>
    </div>
  );
}
