import { useQuery } from '@tanstack/react-query';
import type { LogoRozetCevabi, LogoRozetDurumu, LogoRozetTuru } from '#paylasilan/sozlesme/logo.ts';
import { api } from '../veri/api.ts';
import { Rozet, type RozetTonu } from './Rozet.tsx';
import { Simge } from './Simge.tsx';
import './logo-rozeti.css';

// 3344: belgenin Logo'ya gidiş rozeti; liste, ayrıntı ve Bağlantı izleme aynı ad ve ton tablosunu kullanır.
export const LOGO_DURUM_ADI: Record<LogoRozetDurumu, string> = {
  logoda: 'Logo\'da', sirada: 'Sırada', 'yeniden-denenecek': 'Yeniden denenecek', 'kart-bekliyor': 'Kart bekliyor', 'proje-bekliyor': 'Proje bekliyor',
  durdu: 'Durdu',
};
export const LOGO_DURUM_TONU: Record<LogoRozetDurumu, RozetTonu> = {
  logoda: 'tamam', sirada: 'pasif', 'yeniden-denenecek': 'uyari', 'kart-bekliyor': 'bilgi', 'proje-bekliyor': 'bilgi', durdu: 'hata',
};
export type LogoRozetBilgisi = LogoRozetCevabi['durumlar'][number];
const GONDERILMEZ = 'Logo\'ya gönderilmez';

// Görünen satırların rozeti tek istekle gelir (en çok 200 kimlik; liste sayfası bunun altındadır). Okunamazsa `hata` döner,
// ekran "Okunamadı" yazar: rozetin olmaması "Logo'ya gönderilmez" demektir, okuma hatasıyla karışmasın.
export function useLogoRozetleri(tur: LogoRozetTuru, idler: readonly number[], etkin = true): { durum: (id: number) => LogoRozetBilgisi | null; hata: boolean; hazir: boolean } {
  const tekil = [...new Set(idler)].sort((a, b) => a - b).slice(0, 200);
  const sorgu = useQuery({
    queryKey: ['logo', 'rozet', tur, tekil.join(',')],
    queryFn: () => api.get<LogoRozetCevabi>(`/logo/belge-durumlari?tur=${tur}&id=${tekil.join(',')}`),
    enabled: etkin && tekil.length > 0,
    staleTime: 30_000,
  });
  const harita = new Map((sorgu.data?.durumlar ?? []).map((d) => [d.id, d]));
  return { durum: (id) => harita.get(id) ?? null, hata: sorgu.isError, hazir: sorgu.data !== undefined };
}

// Listede rozet; ayrıntı başlığında `baslik` ile "Logo: Durdu" biçimi (yalnız "Durdu" belgenin kendi durumu gibi okunur).
export function LogoRozeti({ bilgi, hata = false, baslik = false }: { bilgi: LogoRozetBilgisi | null; hata?: boolean; baslik?: boolean }) {
  if (hata) return <span className="tc-logo-rozet-yok">Okunamadı</span>;
  if (bilgi === null) return baslik ? null : <span className="tc-logo-rozet-yok" title={GONDERILMEZ} aria-label={GONDERILMEZ}>—</span>;
  const ad = LOGO_DURUM_ADI[bilgi.durum];
  const ipucu = bilgi.durum === 'logoda' ? (bilgi.kayitNo !== null ? `Logo kayıt ${bilgi.kayitNo}` : undefined) : (bilgi.neden ?? undefined);
  return (
    <span className="tc-logo-rozet" {...(ipucu ? { title: ipucu } : {})}>
      <Rozet ton={LOGO_DURUM_TONU[bilgi.durum]}>
        {bilgi.durum === 'logoda' && <Simge ad="check" boyut="k" />}
        {bilgi.durum === 'durdu' && <Simge ad="alert" boyut="k" />}
        {baslik && bilgi.durum !== 'logoda' ? `Logo: ${ad}` : ad}
      </Rozet>
    </span>
  );
}

// Listede rozetin altında kısa neden (dokunmatikte ipucu okunmaz); "Logo'da" ve "Sırada"da yazılmaz.
export function LogoRozetHucresi({ bilgi, hata }: { bilgi: LogoRozetBilgisi | null; hata: boolean }) {
  return (
    <span className="tc-logo-rozet-hucre">
      <LogoRozeti bilgi={bilgi} hata={hata} />
      {!hata && bilgi?.neden && <small className="tc-logo-rozet-neden">{bilgi.neden}</small>}
    </span>
  );
}
