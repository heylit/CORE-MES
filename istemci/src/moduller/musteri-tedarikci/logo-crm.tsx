import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LOGO_CRM_SINIRI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type { LogoCrmCevabi, LogoCrmDurumu } from '#paylasilan/sozlesme/logo.ts';
import type { Firma, FirmaCevabi, FirmaLogoCrmSecGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, OnayPenceresi, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { cevabiYaz, eskiyseYenile, yazmaIletisi } from './yazma.ts';
import { api } from '../../ortak/veri/api.ts';

// 3359 a: carinin Logo CRM satış müşterisi durumu (satış teklifi Logo'ya ancak böyle cariyle gider). Görünen firmalar tek istekle sorulur;
// önbellek tutulmaz, her açılışta okunur. Yalnız Logo cari kodu olan ve tedarikçi olmayan firma sorulur (sunucu da aynı süzgeci uygular).
// kodlar (3391 a): cariye bağlı CRM müşteri kodları, ilki tekliflerde kullanılır; eski yardımcıda null.
export interface CrmBilgisi { durum: LogoCrmDurumu; neden: string | null; kodlar: { kodlar: string[]; sayi: number; secilebilir: boolean } | null }
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

// 3391 a, 3391-2 a: firma kartında "Logo CRM satış müşterisi" satırı. Seçim (logoCrmKodu) varsa o yazar; yoksa Logo'daki bağ sırasının ilki
// (birden fazlaysa "(tekliflerde kullanılır)" ve uyarı). Kod listesi yoksa (eski yardımcı) rozet. Seçim yoksa ve Logo'da CRM yoksa satır yok (3359 a).
// Seçim düğmesi yalnız yazabilene ve yardımcı seçimi desteklerken; seçim Logo'ya yazılmaz.
export function CrmSatiri({ bilgi, firma, yazabilir }: { bilgi: CrmBilgisi | null; firma: Firma; yazabilir: boolean }) {
  const [secimAcik, secimAcikYaz] = useState(false);
  const secili = firma.logoCrmKodu ?? null;
  if (bilgi?.durum !== 'var' && secili === null) return null;
  const liste = bilgi?.durum === 'var' ? bilgi.kodlar : null;
  const ilk = liste?.kodlar[0];
  const fazla = liste === null ? 0 : liste.sayi - liste.kodlar.length;
  const seciliBagli = secili === null || liste === null ? null : liste.kodlar.some((k) => k.toUpperCase() === secili.toUpperCase());
  const bagKalkti = secili !== null && (bilgi?.durum === 'yok' || seciliBagli === false);
  const secebilir = yazabilir && liste !== null && liste.secilebilir && (liste.sayi > 1 || secili !== null);
  return (
    <div className="tc-mt-ozellik tc-mt-ozellik-tam">
      <dt>Logo CRM satış müşterisi</dt>
      <dd>
        <span className="tc-mt-crm-kod">
          {secili !== null ? (
            <>
              <span className="mono">{secili}</span>
              <span className="tc-mt-yok">(seçildi, tekliflerde kullanılır)</span>
            </>
          ) : liste === null || ilk === undefined ? <CrmRozeti bilgi={bilgi} /> : (
            <>
              <span className="mono">{ilk}</span>
              {liste.sayi > 1 && <span className="tc-mt-yok">(tekliflerde kullanılır)</span>}
            </>
          )}
          {secebilir && (
            <Dugme simge="edit" onClick={() => secimAcikYaz(true)}>{secili === null ? 'CRM müşterisini seç' : 'Değiştir'}</Dugme>
          )}
        </span>
        {bagKalkti && (
          <p className="tc-mt-crm-uyari" role="alert">
            <Simge ad="alert" />
            <span>{`Seçili ${secili ?? ''} Logo'da artık bu cariye bağlı değil; teklif gitmez. Yeniden seçin ya da seçimi kaldırın.`}</span>
          </p>
        )}
        {!bagKalkti && secili === null && liste !== null && liste.sayi > 1 && (
          <p className="tc-mt-crm-uyari" role="status">
            <Simge ad="alert" />
            <span>
              {`Bu cari Logo'da ${String(liste.sayi)} CRM müşterisine bağlı. `}
              {liste.secilebilir
                ? "Teklif Logo'nun seçtiği bağla gider (varsayılan işaretli, yoksa en eski); doğrusu başkaysa seçin. "
                : "Teklif ilkiyle gider; yanlışsa Logo'da fazla bağı kaldırın. "}
              {liste.kodlar.map((k, i) => <span key={k}>{i > 0 && ', '}<span className="mono">{k}</span></span>)}
              {fazla > 0 && `, +${String(fazla)} kod daha`}
            </span>
          </p>
        )}
      </dd>
      {secimAcik && liste !== null && <CrmSecimPenceresi firma={firma} kodlar={liste.kodlar} kapat={() => secimAcikYaz(false)} />}
    </div>
  );
}

// 3391-2 a: yalnız Logo'da bu cariye bağlı kodlar listelenir; "seçim yok" Logo'daki sıranın ilkine döner (varsayılan işaretli bağ, yoksa en eski).
function CrmSecimPenceresi({ firma, kodlar, kapat }: { firma: Firma; kodlar: readonly string[]; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secim, secimYaz] = useState<string | null>(firma.logoCrmKodu ?? null);
  const kaydet = useMutation({
    mutationFn: () => api.post<FirmaCevabi>(`/musteri-tedarikci/firmalar/${String(firma.id)}/logo-crm-sec`,
      { kod: secim, surum: firma.surum } satisfies FirmaLogoCrmSecGovdesi),
    onSuccess: (cevap) => {
      cevabiYaz(istemci, cevap);
      bildir('tamam', secim === null ? 'CRM seçimi kaldırıldı; teklif Logo\'nun seçtiği bağla gider.' : `Teklifler ${secim} ile gidecek.`);
      kapat();
    },
    onError: (hata) => {
      eskiyseYenile(istemci, firma.id, hata);
      bildir('hata', yazmaIletisi(hata, 'CRM seçimi kaydedilemedi.'));
    },
  });
  return (
    <OnayPenceresi acik baslik="Tekliflerde kullanılacak CRM müşterisi" onayMetni="Kaydet" yukleniyor={kaydet.isPending} vazgec={kapat}
      onayla={() => kaydet.mutate()}>
      <p className="tc-mt-yok">Liste Logo&apos;dan okunur; burada yeni bağ kurulmaz, Logo değişmez.</p>
      <div className="tc-mt-crm-secim" role="radiogroup" aria-label="CRM satış müşterisi">
        {kodlar.map((k, i) => (
          <label key={k} className="tc-mt-crm-secenek">
            <input type="radio" name="crm-secim" checked={secim === k} onChange={() => secimYaz(k)} />
            <span className="tc-mt-crm-kod">
              <span className="mono">{k}</span>
              {i === 0 && <span className="tc-mt-yok">Logo&apos;nun seçtiği</span>}
            </span>
          </label>
        ))}
        <label className="tc-mt-crm-secenek">
          <input type="radio" name="crm-secim" checked={secim === null} onChange={() => secimYaz(null)} />
          <span>Seçim yok (Logo&apos;nun seçtiği: varsayılan işaretli, yoksa en eski bağ)</span>
        </label>
      </div>
    </OnayPenceresi>
  );
}
