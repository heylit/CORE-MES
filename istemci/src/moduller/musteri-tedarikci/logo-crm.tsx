import { useQuery } from '@tanstack/react-query';
import { LOGO_CRM_SINIRI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type { LogoCrmCevabi, LogoCrmDurumu } from '#paylasilan/sozlesme/logo.ts';
import { Rozet } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';

// 3359 a: carinin Logo CRM satış müşterisi durumu (satış teklifi Logo'ya ancak böyle cariyle gider). Görünen firmalar tek istekle sorulur;
// önbellek tutulmaz, her açılışta okunur. Yalnız Logo cari kodu olan ve tedarikçi olmayan firma sorulur (sunucu da aynı süzgeci uygular).
export interface CrmBilgisi { durum: LogoCrmDurumu; neden: string | null }
export const crmSorulur = (f: { tur: string; logoCariKodu: string | null }): boolean => f.tur !== 'tedarikci' && (f.logoCariKodu ?? '').trim() !== '';

export function useLogoCrm(idler: readonly number[], etkin = true): { durum: (id: number) => CrmBilgisi | null } {
  const tekil = [...new Set(idler)].sort((a, b) => a - b).slice(0, LOGO_CRM_SINIRI);
  const sorgu = useQuery({
    queryKey: ['logo', 'cari-crm', tekil.join(',')],
    queryFn: () => api.get<LogoCrmCevabi>(`/logo/cari-crm?id=${tekil.join(',')}`),
    enabled: etkin && tekil.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
  const harita = new Map((sorgu.data?.durumlar ?? []).map((d) => [d.firmaId, d]));
  return { durum: (id) => harita.get(id) ?? null };
}

// 3359 a ek notu: CRM satış müşterisi varsa "CRM" yazar; yoksa, okunamadıysa ya da okunurken hiçbir şey yazmaz.
export function CrmRozeti({ bilgi }: { bilgi: CrmBilgisi | null }) {
  if (bilgi?.durum !== 'var') return null;
  return <span title="Logo'da CRM satış müşterisi"><Rozet ton="bilgi">CRM</Rozet></span>;
}
