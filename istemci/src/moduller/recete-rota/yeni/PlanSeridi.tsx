import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PlanSurumCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, Simge } from '../../../ortak/arayuz/index.ts';
import { api } from '../../../ortak/veri/api.ts';
import { seritDurumu, sonCanliyaAlmaMetni } from './plan-seridi.ts';
import { anahtarlar, RR_ANAHTARI, type RrDurumu } from './veri.ts';

// Eski ekranın her sekmenin üstündeki plan şeridi: canlı plan durumu ve son canlıya alma. Bu ekran planı yazmaz: bekleyen değişiklik
// varken eski "Onaya gönder" yerine planın yazıldığı Planlama'ya bağ verilir (2496 b; bu şerit için 357 b'nin pasif düğmesi kalktı).
// Canlı plan sürümü eski ekrandaki aralıkla sorulur; değişmişse "plan değişti", kim ve ne zaman, ve Yenile (yalnız okuma).
const SURUM_ARALIGI_MS = 20_000;
export const PLANLAMA_YOLU = '/plan';

export function PlanSeridi({ durum, yerlesimOkunamadi }: { durum: RrDurumu; yerlesimOkunamadi: boolean }) {
  const istemci = useQueryClient();
  const canli = durum.planCanli;
  const surum = useQuery({
    queryKey: [...RR_ANAHTARI, 'plan-surum'],
    queryFn: () => api.get<PlanSurumCevabi>('/plan/surum'),
    refetchInterval: SURUM_ARALIGI_MS,
    refetchIntervalInBackground: false,
    enabled: canli !== undefined,
  });
  if (canli === undefined) return null;

  const s = seritDurumu(canli, yerlesimOkunamadi ? null : durum.planYerlesim, surum.data ?? null, durum.planMotoru);
  const yenile = () => { void istemci.invalidateQueries({ queryKey: anahtarlar.veri }); void surum.refetch(); };

  return (
    <div className="tc-rry-plan" data-tur={s.tur} role="status" aria-label="Plan durumu">
      <span className="tc-rry-plan-rozet"><Simge ad="gantt" boyut="k" />{s.rozet}</span>
      {s.degisiklik > 0 && <b>{s.degisiklik} değişiklik bekliyor</b>}
      <span>{s.parca && s.tur === 'bekliyor' ? `${s.parca}. ${s.metin}` : s.metin}</span>
      {s.motorFarki > 0 && <span className="tc-rry-plan-motor">{`Motor önerisi canlıdan ${String(s.motorFarki)} iş farklı (${s.parca}).`}</span>}
      {s.uyarilar.map((u) => <span key={u} className="tc-rry-plan-uyari">{u}</span>)}
      {(canli.yersizBolmeler ?? []).length > 0 && (
        <span className="tc-rry-plan-uyari">
          {`${String(canli.yersizBolmeler?.length ?? 0)} bölünmüş iş canlı planda yerleştirilemedi (${(canli.yersizBolmeler ?? []).slice(0, 3).map((y) => y.anahtar.replace('|', ' OP ')).join(', ')}${(canli.yersizBolmeler?.length ?? 0) > 3 ? '…' : ''}): bölme duruyor; kaldırmak için iş kartında "Parçaları birleştir" ve canlıya al.`}
        </span>
      )}
      {s.tur === 'degisti' && <Dugme tur="birincil" simge="rotate" onClick={yenile}>Yenile</Dugme>}
      {s.tur === 'bekliyor' && s.degisiklik > 0 && (
        <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={PLANLAMA_YOLU}><Simge ad="gantt" />Planlama'da aç</Link>
      )}
      <span className="tc-rry-plan-bosluk" />
      <small>{sonCanliyaAlmaMetni(canli)}</small>
    </div>
  );
}
