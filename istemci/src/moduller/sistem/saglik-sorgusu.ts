import { useQuery } from '@tanstack/react-query';
import type { Ayrinti, MetriklerCevabi, SaglikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Hesap menüsündeki pencere ile Sistem ve Güvenlik sayfası aynı sorguları paylaşır; önbellek tek kalır.
// Ayrıntı ve ölçü uçları yalnız kendi işlemini (saglik.ayrinti-oku) taşıyana açılır; başka yetki ayrıntıyı açmaz.
export function useSistemSagligi(tazeleme?: number) {
  const oturum = useOturum();
  const ayrintiGorur = oturum.data?.islemler.includes('saglik.ayrinti-oku') === true;
  const saglik = useQuery({ queryKey: anahtarlar.saglik, queryFn: () => api.get<SaglikCevabi>('/saglik'), refetchInterval: tazeleme });
  const ayrinti = useQuery({
    queryKey: anahtarlar.sistemAyrinti,
    queryFn: () => api.get<Ayrinti>('/saglik/ayrinti'),
    enabled: ayrintiGorur,
    refetchInterval: tazeleme,
  });
  const dakikalar = useQuery({
    queryKey: anahtarlar.metrikler,
    queryFn: () => api.get<MetriklerCevabi>('/saglik/metrikler'),
    enabled: ayrintiGorur,
    refetchInterval: tazeleme,
  });
  // Yenilemede hata gelirse react-query eski veriyi tutar; sağlıklı saymak için son istek de başarılı olmalı.
  const saglikli: boolean | null = saglik.isPending ? null : saglik.isSuccess && saglik.data.durum === 'ok';
  const yenile = () => {
    void saglik.refetch();
    if (ayrintiGorur) {
      void ayrinti.refetch();
      void dakikalar.refetch();
    }
  };
  // Ölçü okunamadıysa undefined, ölçü yoksa null (kutu ikisini ayrı yazar).
  const sonDakika = dakikalar.isError ? undefined : (dakikalar.data?.dakikalar.at(-1) ?? null);
  return {
    ayrintiGorur, saglik, saglikli, yenile, sonDakika,
    ayrinti: ayrintiGorur ? ayrinti : null,
  };
}

// Yalnız ayrıntı (Sistem Ayarları > Yedekler, 2282b): Sistem durumuyla aynı önbellek anahtarı; işlemi olmayana null.
export function useSaglikAyrintisi() {
  const ayrintiGorur = useOturum().data?.islemler.includes('saglik.ayrinti-oku') === true;
  const ayrinti = useQuery({ queryKey: anahtarlar.sistemAyrinti, queryFn: () => api.get<Ayrinti>('/saglik/ayrinti'), enabled: ayrintiGorur });
  return ayrintiGorur ? ayrinti : null;
}
