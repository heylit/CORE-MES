import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GeometriModelListeCevabi, GeometriModelSatiri } from '#paylasilan/sozlesme/geometri.ts';
import type { TalimatSahneleriCevabi, TalimatSahnesiKaydetGovdesi, UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { api, ApiHatasi, OTURUM_BITTI } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';

// Talimat sahnesinin okuma ve yazması (3209 a): rota uçları; model listesi ve dosyası geometri uçlarıdır (geometri.oku ister).

const KOK = ['recete-rota', 'yeni', 'talimat-sahnesi'] as const;
export const anahtarlar = {
  sahneler: (urunId: number, opNo: number) => [...KOK, 'sahneler', urunId, opNo] as const,
  modeller: (urunId: number) => [...KOK, 'modeller', urunId] as const,
  dosya: (revizyonId: number) => [...KOK, 'dosya', revizyonId] as const,
};

export const useSahneler = (urunId: number, opNo: number) => useQuery({
  queryKey: anahtarlar.sahneler(urunId, opNo),
  queryFn: () => api.get<TalimatSahneleriCevabi>(`/rota/urunler/${String(urunId)}/talimatlar/${String(opNo)}/sahneler`),
});

export function useSahneKaydet(urunId: number) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (g: TalimatSahnesiKaydetGovdesi) =>
      api.post<TalimatSahneleriCevabi>(`/rota/urunler/${String(urunId)}/talimat-sahnesi-kaydet`, g, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: (c, g) => { istemci.setQueryData(anahtarlar.sahneler(urunId, g.opNo), c); },
  });
}

// Ürünün yayındaki 3B modelleri: geometri listesi ürünün koduyla aranır, yalnız bu ürünün satırları alınır.
export const useUrunModelleri = (urunId: number) => useQuery({
  queryKey: anahtarlar.modeller(urunId),
  queryFn: async (): Promise<GeometriModelSatiri[]> => {
    const urun = await api.get<UrunRevizyonlariCevabi>(`/rota/urunler/${String(urunId)}`);
    const kod = urun.urun.stokKodu;
    if (kod === null) return [];
    const q = new URLSearchParams({ ara: kod, sayfaBoyu: '100' });
    const c = await api.get<GeometriModelListeCevabi>(`/geometri/modeller?${q.toString()}`);
    return c.satirlar.filter((s) => s.malzemeNo === urunId && s.yayinda);
  },
});

async function ikiliOku(yol: string, sinyal: AbortSignal): Promise<Uint8Array> {
  const c = await fetch(`/api${yol}`, { credentials: 'include', signal: sinyal });
  if (!c.ok) {
    if (c.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    throw new ApiHatasi(c.status, null);
  }
  return new Uint8Array(await c.arrayBuffer());
}

export const useModelDosyasi = (revizyonId: number | null) => useQuery({
  queryKey: anahtarlar.dosya(revizyonId ?? 0),
  enabled: revizyonId !== null,
  queryFn: ({ signal }) => ikiliOku(`/geometri/modeller/${String(revizyonId)}/dosya`, signal),
  staleTime: Infinity,
  retry: false,
});
