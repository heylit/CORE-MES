import { useQuery } from '@tanstack/react-query';
import { LOGO_CRM_SINIRI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type { LogoCrmCevabi, LogoCrmDurumu } from '#paylasilan/sozlesme/logo.ts';
import { Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';

// 3359 a: carinin Logo CRM satış müşterisi durumu (satış teklifi Logo'ya ancak böyle cariyle gider). Görünen firmalar tek istekle sorulur;
// önbellek tutulmaz, her açılışta okunur. Yalnız Logo cari kodu olan ve tedarikçi olmayan firma sorulur (sunucu da aynı süzgeci uygular).
// kodlar (3391 a): cariye bağlı CRM müşteri kodları, ilki tekliflerde kullanılır; eski yardımcıda null.
export interface CrmBilgisi { durum: LogoCrmDurumu; neden: string | null; kodlar: { kodlar: string[]; sayi: number } | null }
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
// 3391 a: cari birden fazla CRM müşterisine bağlıysa uyarı tonunda "CRM ×N" (kod yalnız firma kartında).
export function CrmRozeti({ bilgi }: { bilgi: CrmBilgisi | null }) {
  if (bilgi?.durum !== 'var') return null;
  const sayi = bilgi.kodlar?.sayi ?? 1;
  if (sayi > 1) return <span title={`Logo'da ${String(sayi)} CRM satış müşterisine bağlı`}><Rozet ton="uyari">{`CRM ×${String(sayi)}`}</Rozet></span>;
  return <span title="Logo'da CRM satış müşterisi"><Rozet ton="bilgi">CRM</Rozet></span>;
}

// 3391 a: firma kartında "Logo CRM satış müşterisi" satırı. Yalnız "var" iken çizilir (3359 a). Kod listesi yoksa (eski yardımcı) rozet;
// tek kodda kod; birden fazlada ilki "(tekliflerde kullanılır)" ve hepsini sayan uyarı.
export function CrmSatiri({ bilgi }: { bilgi: CrmBilgisi | null }) {
  if (bilgi?.durum !== 'var') return null;
  const liste = bilgi.kodlar;
  const ilk = liste?.kodlar[0];
  const fazla = liste === null ? 0 : liste.sayi - liste.kodlar.length;
  return (
    <div className="tc-mt-ozellik tc-mt-ozellik-tam">
      <dt>Logo CRM satış müşterisi</dt>
      <dd>
        {liste === null || ilk === undefined ? <CrmRozeti bilgi={bilgi} /> : (
          <span className="tc-mt-crm-kod">
            <span className="mono">{ilk}</span>
            {liste.sayi > 1 && <span className="tc-mt-yok">(tekliflerde kullanılır)</span>}
          </span>
        )}
        {liste !== null && liste.sayi > 1 && (
          <p className="tc-mt-crm-uyari" role="status">
            <Simge ad="alert" />
            <span>
              {`Bu cari Logo'da ${String(liste.sayi)} CRM müşterisine bağlı: `}
              {liste.kodlar.map((k, i) => <span key={k}>{i > 0 && ', '}<span className="mono">{k}</span></span>)}
              {fazla > 0 && `, +${String(fazla)} kod daha`}
              . Teklif ilkiyle gider; yanlışsa Logo&apos;da fazla bağı kaldırın.
            </span>
          </p>
        )}
      </dd>
    </div>
  );
}
