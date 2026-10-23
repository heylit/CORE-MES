import { useQuery } from '@tanstack/react-query';
import type { EmirlerCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

type Emir = EmirlerCevabi['emirler'][number];
// Sözleşmedeki ACIK_EMIR_DURUMLARI ile aynı; istemci sözleşmeyi yalnız tip olarak ithal eder.
const ACIK: readonly Emir['durum'][] = ['planli', 'basladi'];

// Sarf ve üretim girişi açık bir emre bağlanır; kimlik elle yazılmaz, emir no ve parçayla seçilir (#680).
export function EmirSecici({ deger, degistir, ipucu, zorunlu = false, suzgec }: {
  deger: string; degistir: (v: string) => void; ipucu?: string; zorunlu?: boolean; suzgec?: (e: Emir) => boolean;
}) {
  const e = useQuery({ queryKey: [...anahtarlar.hepsi, 'acik-emirler'], queryFn: () => api.get<EmirlerCevabi>('/uretim-emirleri') });
  const acik = (e.data?.emirler ?? []).filter((x) => ACIK.includes(x.durum) && (suzgec?.(x) ?? true));
  const not = e.isError ? 'Emirler alınamadı.' : e.isPending ? 'Emirler yükleniyor…' : acik.length === 0 ? 'Açık üretim emri yok.' : ipucu;
  return (
    <Secim etiket="Üretim emri" value={deger} onChange={(x) => degistir(x.target.value)} bosSecenek={zorunlu ? 'Seçin' : 'Emre bağlama'} required={zorunlu}
      secenekler={acik.map((x) => ({ deger: String(x.id), baslik: `${x.emirNo} · ${x.parcaNo} ${x.parcaAd} · ${x.adet} adet` }))} {...(not ? { ipucu: not } : {})} />
  );
}
