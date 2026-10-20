import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MakineDurumlariCevabi, MakineDurumu, MakineDurumuGovdesi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Dugme, DurumKutusu, Girdi, Rozet, Secim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { MAKINE_DURUM_ADLARI, MAKINE_DURUM_SECENEKLERI, MAKINE_DURUM_TONLARI, degisimMetni } from './etiketler.ts';

type Kod = MakineDurumu['durum'];

export function MakineDurumRozeti({ durum }: { durum: MakineDurumu | undefined }) {
  if (!durum) return <Rozet ton="pasif">Girilmemiş</Rozet>;
  return <Rozet ton={MAKINE_DURUM_TONLARI[durum.durum]}>{MAKINE_DURUM_ADLARI[durum.durum]}</Rozet>;
}

// Durum, kaydı değiştiren kişi ve zamanla ayrı yazılır (IS-05); makine formunun Kaydet düğmesine bağlı değildir.
export function MakineDurumuPaneli({ makineId }: { makineId: number }) {
  const istemci = useQueryClient();
  const durumlar = useQuery({ queryKey: anahtarlar.makineDurumlari, queryFn: () => api.get<MakineDurumlariCevabi>('/makine-durumlari') });
  const [secim, secimYaz] = useState<{ durum: Kod | ''; aciklama: string } | null>(null);
  const yaz = useMutation({
    mutationFn: (govde: MakineDurumuGovdesi) => api.post<MakineDurumlariCevabi>(`/makineler/${makineId}/durum`, govde),
    onSuccess: (cevap) => {
      secimYaz(null);
      istemci.setQueryData(anahtarlar.makineDurumlari, cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.panoOzeti });
    },
  });
  if (durumlar.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (durumlar.isError) return <DurumKutusu durum="hata" yenile={() => { void durumlar.refetch(); }} />;
  const kayitli = durumlar.data.durumlar.find((d) => d.makineId === makineId);
  const durum = secim?.durum ?? kayitli?.durum ?? '';
  const aciklama = secim?.aciklama ?? kayitli?.aciklama ?? '';
  const degistir = (ek: Partial<{ durum: Kod | ''; aciklama: string }>) => secimYaz({ durum, aciklama, ...ek });

  return (
    <section className="tc-ist-kisiler" aria-label="Çalışma durumu">
      <h3 className="tc-ist-alt-baslik">Çalışma durumu</h3>
      <dl className="tc-ist-bilgi">
        <dt>Şu an</dt>
        <dd><MakineDurumRozeti durum={kayitli} /></dd>
        {kayitli && (<><dt>Son değişiklik</dt><dd>{degisimMetni(kayitli.degistiren.ad, kayitli.degisme)}</dd></>)}
      </dl>
      <div className="tc-ist-ata">
        <Secim
          etiket="Durum"
          bosSecenek="Seçiniz"
          secenekler={MAKINE_DURUM_SECENEKLERI}
          value={durum}
          onChange={(o) => degistir({ durum: o.target.value as Kod | '' })}
        />
        <Girdi etiket="Açıklama" value={aciklama} maxLength={200} onChange={(o) => degistir({ aciklama: o.target.value })} />
        <Dugme
          tur="birincil"
          simge="check"
          disabled={secim === null || durum === ''}
          yukleniyor={yaz.isPending}
          onClick={() => { if (durum !== '') yaz.mutate({ durum, aciklama: aciklama.trim() === '' ? null : aciklama.trim(), surum: kayitli?.surum ?? 0 }); }}
        >
          Durumu kaydet
        </Dugme>
      </div>
      {yaz.isError && <p className="tc-ist-hata" role="alert">{hataIletisi(yaz.error, 'Durum kaydedilemedi.')}</p>}
    </section>
  );
}
