// Başka modül ekranlarının ithal edebildiği tek dosya.
import { useQuery } from '@tanstack/react-query';
import type { IsMalzemeleriCevabi, OkutCozCevabi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { TESLIM_KUTUSU, isMalzemeleriAnahtari } from './is-malzeme-durumu.ts';
// Başlatırken girdi eksikse operatör ekranı Malzeme · Teslim panelini o malzemeyle açtırır (kart #1289); panel bu modüldedir.
export const MALZEME_TESLIM_AC = 'tmi:malzeme-teslim-ac';
// malzemeId null: işin bütün malzemesi ("Bu iş" bölümü, terminalin malzeme çipi; 618).
export interface MalzemeTeslimOdagi { istasyonId: number; uretimEmriId: number; malzemeId: number | null }
export function isMalzemesiniAc(odak: MalzemeTeslimOdagi): void {
  window.dispatchEvent(new CustomEvent(MALZEME_TESLIM_AC, { detail: odak }));
}
export { durumMetni, useIsMalzemeDurumu, type IsMalzemeDurumu } from './is-malzeme-durumu.ts';
export { CikanSepet, IstasyonSepetleri, useIstasyonSepetiSayilari } from './IstasyonSepetleri.tsx';

// 1908 a: terminal okutulan lot ya da malzeme etiketini çalışan işin rota girdisiyle karşılaştırır. Girdiler malzeme çipinin okuduğu
// veridir (aynı anahtarlar, tek istek); kodun çözümü panelin okutmasıyla aynıdır. Yetki ve kapsam da çipinkidir: stok.istek yoksa null.
export interface IsGirdisi { malzemeId: number; kod: string | null; ad: string | null }
export function useIsGirdileri(istasyonKodu: string | null, uretimEmriId: number | null): { girdiler: IsGirdisi[] | null; istasyonId: number | null } {
  const yetkili = (useOturum().data?.islemler ?? []).includes('stok.istek');
  const kutu = useQuery({
    queryKey: TESLIM_KUTUSU,
    queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu'),
    enabled: yetkili && istasyonKodu !== null && uretimEmriId !== null,
    refetchInterval: 60_000,
    retry: false,
  });
  const istasyonId = kutu.data?.istasyonlar.find((i) => i.kod === istasyonKodu)?.id ?? null;
  const liste = useQuery({
    queryKey: isMalzemeleriAnahtari(istasyonId ?? 0),
    queryFn: () => api.get<IsMalzemeleriCevabi>(`/stok/teslim-kutusu/is-malzemeleri?istasyonId=${istasyonId}`),
    enabled: istasyonId !== null && uretimEmriId !== null,
    refetchInterval: 60_000,
    retry: false,
  });
  if (istasyonId === null || uretimEmriId === null || !liste.data) return { girdiler: null, istasyonId };
  const girdiler = liste.data.isler.filter((x) => x.uretimEmriId === uretimEmriId).flatMap((x) => x.malzemeler.map((m) => ({ malzemeId: m.malzemeId, kod: m.kod, ad: m.ad })));
  return { girdiler, istasyonId };
}
export const okutulanKoduCoz = (kod: string): Promise<OkutCozCevabi> => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`);
