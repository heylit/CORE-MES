import { useQuery } from '@tanstack/react-query';
import type { KurumCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { api } from './api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Ad seyrek değişir; her sayfa açılışında sorulmasın. Değişiklik en geç bu süre sonra ya da yenilemede görünür.
const TAZE_SURE = 5 * 60 * 1000;

// Boş firma adı "girilmemiş" demektir (kabuk.kurum-adi bosOlabilir): okuyan yerine null alır ve kendi yedeğini gösterir.
export function useKurumAdi(): string | null {
  const sorgu = useQuery({
    queryKey: anahtarlar.kurum,
    queryFn: () => api.get<KurumCevabi>('/kurum'),
    staleTime: TAZE_SURE,
  });
  const ad = sorgu.data?.ad.trim() ?? '';
  return ad === '' ? null : ad;
}
