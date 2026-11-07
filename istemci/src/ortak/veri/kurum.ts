import { useQuery } from '@tanstack/react-query';
import type { GirisSesiCevabi, KurumCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
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
  const ad = sorgu.data?.ad?.trim() ?? '';
  return ad === '' ? null : ad;
}

// Giriş ekranı oturumsuz uçtan okur (karar 2002); okunamazsa ya da ad yoksa null ve ekran yalnız CORE yazar.
export function useGirisKurumAdi(): string | null {
  const sorgu = useQuery({
    queryKey: anahtarlar.girisKurumu,
    queryFn: () => api.get<KurumCevabi>('/giris-kurum-adi'),
    staleTime: TAZE_SURE,
    retry: false,
  });
  const ad = sorgu.data?.ad?.trim() ?? '';
  return ad === '' ? null : ad;
}

// Düzey okunamazsa null: çalan taraf sesin kendi varsayılanını kullanır (cihaz düğmesiyle açılan ses sessiz kalmasın).
export interface GirisSesi { readonly acik: boolean; readonly duzey: number | null }
const OKUNAMAZSA: GirisSesi = { acik: false, duzey: null };

// Giriş ekranının açılış sesi kurum ayarı (kartlar 2175, 2230b); okunamazsa kapalı sayılır.
export function useGirisSesi(): GirisSesi {
  const sorgu = useQuery({
    queryKey: anahtarlar.girisSesi,
    queryFn: () => api.get<GirisSesiCevabi>('/giris-sesi'),
    staleTime: TAZE_SURE,
    retry: false,
  });
  return sorgu.data === undefined ? OKUNAMAZSA : { acik: sorgu.data.acik === true, duzey: sorgu.data.duzey };
}
