import type { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { teslimBaglaGovdesi, AdimliEmirCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

const tarihMetni = (t: string | null): string => (t === null ? '—' : t.split('-').reverse().join('.'));

// UE-TB (3244 b): sipariş kaleminden açılan emrin teslimi kalem terminine bağlıdır; elle değişen teslim bağı koparır,
// "Termine bağla" başlamamış emirde geri bağlar. Kalemsiz emirde görünmez.
export function TeslimBagi({ emirId }: { emirId: number }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazar = (useOturum().data?.islemler ?? []).includes('uretim-emirleri.duzenle');
  const d = useQuery({
    queryKey: anahtarlar.adimli(emirId),
    queryFn: () => api.get<AdimliEmirCevabi>(`/adimli-emirler/${String(emirId)}`),
  });
  const bagla = useMutation({
    mutationFn: (surum: number) => api.post<unknown>(`/adimli-emirler/${String(emirId)}/teslim-bagla`, { surum } satisfies z.input<typeof teslimBaglaGovdesi>, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: async () => {
      bildir('tamam', 'Teslim sipariş terminine bağlandı.');
      await istemci.invalidateQueries({ queryKey: ['uretim-emirleri'] });
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Teslim bağlanamadı')); },
  });
  const e = d.data?.emir;
  if (e === undefined || e.siparisSatiriId == null) return null;
  const baslamamis = !e.arsiv && (e.durum === 'taslak' || e.durum === 'planli');
  return (
    <p className="tc-emir-teslim-bagi">
      <span>{`Teslim ${tarihMetni(e.teslim)}`}</span>
      {e.teslimBagli === true
        ? <Rozet ton="pasif" gorunum="cizgi">Sipariş terminine bağlı</Rozet>
        : <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet>}
      {e.teslimBagli !== true && yazar && baslamamis && (
        <Dugme simge="route" yukleniyor={bagla.isPending} onClick={() => { bagla.mutate(e.surum); }}>Termine bağla</Dugme>
      )}
    </p>
  );
}
