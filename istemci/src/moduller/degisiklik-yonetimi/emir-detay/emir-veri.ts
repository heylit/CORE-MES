// ECO detayının sunucu çağrıları. Komutlar sürümle korunur (tekrarKorumali değil, P1): yinelenen istek 409 eski sürüm alır.
// Her komuttan sonra emir yeniden okunur; ekran cevabın biçimine bağlanmaz.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EmirCevabi, FaiOnayGovdesi, GeriGonderGovdesi, KalemKaydetGovdesi, KapatGovdesi, KararGovdesi, OlayListeCevabi, TalepCevabi, YayinlaGovdesi,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { api } from '../../../ortak/veri/api.ts';

// Modülün anahtarlar.ts'i P2'nindir; birleşince oradaki anahtarlara geçilir (DEVIR isteği).
export const emirAnahtarlari = {
  emir: (id: number) => ['degisiklik-yonetimi', 'emir', id] as const,
  talep: (id: number) => ['degisiklik-yonetimi', 'talep', id] as const,
  olaylar: ['degisiklik-yonetimi', 'olaylar'] as const,
};

const KOK = '/degisiklik-yonetimi';

export const useEmir = (id: number) =>
  useQuery({ queryKey: emirAnahtarlari.emir(id), queryFn: () => api.get<EmirCevabi>(`${KOK}/emirler/${id}`) });

// Yayın öncesi tahmini etki talebin etki analizindedir.
export const useTalep = (id: number | null) =>
  useQuery({
    queryKey: emirAnahtarlari.talep(id ?? 0), enabled: id !== null,
    queryFn: () => api.get<TalepCevabi>(`${KOK}/talepler/${id}`),
  });

// Olay günlüğünde kayıt no süzgeci yok (sözleşme isteği); son sayfa okunur, bu emrin olayları ekranda ayrılır.
export const useOlaylar = (etkin: boolean) =>
  useQuery({ queryKey: emirAnahtarlari.olaylar, enabled: etkin, queryFn: () => api.get<OlayListeCevabi>(`${KOK}/olaylar?sayfaBoyu=200`) });

export interface EmirKomutlari {
  taslakAc: { surum: number };
  yayinaGonder: { surum: number };
  geriGonder: GeriGonderGovdesi;
  kalemKaydet: KalemKaydetGovdesi;
  yayinla: YayinlaGovdesi;
  karar: KararGovdesi;
  mrbKarar: KararGovdesi;
  topluKarar: { surum: number };
  faiOnayla: FaiOnayGovdesi;
  kapat: KapatGovdesi;
}
const YOLLAR: Readonly<Record<keyof EmirKomutlari, string>> = {
  taslakAc: 'taslak-ac', yayinaGonder: 'yayina-gonder', geriGonder: 'geri-gonder', kalemKaydet: 'kalem-kaydet', yayinla: 'yayinla',
  karar: 'karar', mrbKarar: 'mrb-karar', topluKarar: 'toplu-karar', faiOnayla: 'fai-onayla', kapat: 'kapat',
};

export function useEmirKomutu<K extends keyof EmirKomutlari>(id: number, komut: K) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: EmirKomutlari[K]) => api.post<unknown>(`${KOK}/emirler/${id}/${YOLLAR[komut]}`, govde),
    // Hata da yeniden okutur: eski sürümde ekran güncel kaydı gösterir.
    onSettled: () => Promise.all([
      istemci.invalidateQueries({ queryKey: emirAnahtarlari.emir(id) }),
      istemci.invalidateQueries({ queryKey: emirAnahtarlari.olaylar }),
    ]),
  });
}
