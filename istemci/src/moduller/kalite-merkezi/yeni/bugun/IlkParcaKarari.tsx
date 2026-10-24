import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KmIlkParcaBekleyenCevabi, KmIlkParcaCevabi, KmIlkParcaGovdesi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { Dugme, OnayPenceresi, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';

type Emir = KmIlkParcaBekleyenCevabi['emirler'][number];
type Karar = KmIlkParcaGovdesi['karar'];

export const ILK_PARCA_ANAHTARI = ['kalite-merkezi', 'ilk-parca', 'bekleyenler'] as const;
// Uygulamadaki gibi 15 sn'de bir yenilenir: Arkon'da yeni ilk parça çıkınca liste kendiliğinden gelir.
const YOKLAMA_MS = 15_000;

// 325 a: ilk parça kararı bekleyen açık emirler. Karar onay işlemi ister; liste yalnız onaylayabilen kişide istenir ve görünür.
export function IlkParcaKarari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [reddedilecek, reddedilecekYaz] = useState<Emir | null>(null);
  const liste = useQuery({
    queryKey: ILK_PARCA_ANAHTARI,
    queryFn: () => api.get<KmIlkParcaBekleyenCevabi>('/kalite-merkezi/ilk-parca/bekleyenler'),
    refetchInterval: YOKLAMA_MS,
  });
  const karar = useMutation({
    mutationFn: ({ emir, secim }: { emir: Emir; secim: Karar }) =>
      api.post<KmIlkParcaCevabi>(`/kalite-merkezi/ilk-parca/${String(emir.uretimEmriId)}/karar`, { karar: secim } satisfies KmIlkParcaGovdesi),
    onSuccess: (cevap, { emir, secim }) => {
      reddedilecekYaz(null);
      bildir('tamam', `${secim === 'onay' ? 'İlk parça onaylandı' : 'İlk parça reddedildi'}: ${String(cevap.adet)} adet`);
      istemci.setQueryData<KmIlkParcaBekleyenCevabi>(ILK_PARCA_ANAHTARI, (o) => o && { emirler: o.emirler.filter((e) => e.uretimEmriId !== emir.uretimEmriId) });
      void istemci.invalidateQueries({ queryKey: ILK_PARCA_ANAHTARI });
    },
    onError: (h) => { reddedilecekYaz(null); bildir('hata', hataIletisi(h, 'Karar verilemedi.')); },
  });

  const emirler = liste.data?.emirler ?? [];
  // Liste gelmeden ya da boşken bölüm çizilmez (uygulamadaki gibi); okuma hatası Bugün'ü örtmez.
  if (emirler.length === 0) return null;
  const bekleyen = karar.isPending ? karar.variables.emir.uretimEmriId : null;

  return (
    <section className="tc-km1-grup" aria-label="İlk parça kararı">
      <h3 className="tc-km1-grup-baslik">
        <Simge ad="check" /> İlk parça kararı <span className="tc-km1-soluk">{emirler.length}</span>
      </h3>
      <ul className="tc-km1-liste">
        {emirler.map((e) => (
          <li key={e.uretimEmriId} className="tc-km1-gorev" data-oncelik="1">
            <div className="tc-km1-gorev-metin">
              <b>{e.emirNo} | {e.parcaNo}</b>
              <small>{e.parcaAd} | emir {e.adet} adet | karar bekleyen {e.kararBekleyenAdet} adet</small>
            </div>
            <span className="tc-km1-gorev-eylem">
              <Dugme tur="birincil" disabled={bekleyen !== null} yukleniyor={bekleyen === e.uretimEmriId && karar.variables?.secim === 'onay'}
                onClick={() => { karar.mutate({ emir: e, secim: 'onay' }); }}>Onayla</Dugme>
              <Dugme disabled={bekleyen !== null} onClick={() => { reddedilecekYaz(e); }}>Reddet</Dugme>
            </span>
          </li>
        ))}
      </ul>
      <OnayPenceresi
        acik={reddedilecek !== null} baslik="İlk parça reddi" onayMetni="Reddet" tehlikeli yukleniyor={karar.isPending}
        onayla={() => { if (reddedilecek) karar.mutate({ emir: reddedilecek, secim: 'ret' }); }}
        vazgec={() => { reddedilecekYaz(null); }}
      >
        {reddedilecek && (
          <p>{reddedilecek.emirNo} emrinin karar bekleyen {reddedilecek.kararBekleyenAdet} adedi reddedilir ve red olarak ayrılır. Bu işlem geri alınamaz.</p>
        )}
      </OnayPenceresi>
    </section>
  );
}
