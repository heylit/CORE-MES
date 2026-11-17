import { useQuery } from '@tanstack/react-query';
import type { LogoCariHazirlikCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Rozet } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';

// 3359 ek (kullanıcı 17.11 06:08Z): teklif aşamasında carinin Logo'ya hazır olmadığı görünsün, siparişte sürpriz çıkmasın. Firma kartında
// Logo cari kodu yoksa ya da (yalnız teklifte: Logo teklifi CRM satış müşterisi ister) cari CRM'de değilse uyarı; CRM varsa "CRM".
// Okunamazsa ve belge Logo'daysa hiçbir şey yazmaz. Satış siparişinde yalnız cari kodu denetlenir (Logo siparişi CRM istemez).
// `logoda` null: belgenin Logo durumu henüz gelmedi; Logo'daki belge için boşuna sorulmasın diye beklenir.
export const CARI_YOK_ACIKLAMASI = 'Firma kartında Logo cari kodu yok; belge Logo\'ya gitmez. Müşteriler ve Tedarikçiler\'de firmayı açıp "Logo\'ya bağla" deyin.';
export const CRM_YOK_ACIKLAMASI = 'Cari Logo\'da CRM satış müşterisi değil; teklif Logo\'ya gitmez. Logo\'da cariyi CRM satış müşterisine bağlayın.';

export function LogoCariHazirligi({ firmaId, logoda, crm }: { firmaId: number; logoda: boolean | null; crm: boolean }) {
  const sorgu = useQuery({
    queryKey: ['logo', 'cari-hazirligi', firmaId],
    queryFn: () => api.get<LogoCariHazirlikCevabi>(`/logo/cari-hazirligi?firma=${String(firmaId)}`),
    enabled: logoda === false && Number.isSafeInteger(firmaId) && firmaId > 0,
    staleTime: 0,
    gcTime: 0,
  });
  if (logoda !== false) return null;
  const durum = sorgu.data?.durum;
  if (durum === 'cari-yok') return <span title={CARI_YOK_ACIKLAMASI}><Rozet ton="uyari">Logo cari yok</Rozet></span>;
  if (!crm) return null;
  if (durum === 'yok') return <span title={CRM_YOK_ACIKLAMASI}><Rozet ton="uyari">CRM yok</Rozet></span>;
  if (durum === 'var') return <span title="Logo'da CRM satış müşterisi"><Rozet ton="bilgi">CRM</Rozet></span>;
  return null;
}
