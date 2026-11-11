// Başka modül ekranlarının ithal edebildiği tek dosya.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IsMalzemeleriCevabi, OkutCozCevabi, Teslim, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { TESLIM_KUTUSU, isMalzemeleriAnahtari } from './is-malzeme-durumu.ts';
import { hataMetni } from './ortak.tsx';
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

// 2928 a: terminalde okutulan refakat kartı, karta bağlı ve bu istasyona yoldaki teslimleri alır (Okut panelinin "Teslim al"ı gibi,
// gönderilen miktarla, sırayla ve ayrı kayıt; biri düşerse ötekiler alınmış kalır, `hatalar` söyler). Yalnız bu istasyona gelen alınır;
// istasyon bilinmiyorsa hiçbiri alınmaz. 2933 a: `buradakiMalzemeler` kartla bu istasyona gelen ya da burada duran malzemelerdir;
// `isGirdileri` istasyondaki bitmemiş bütün adımların rota girdileridir (Teslim al'ın okuduğu veri). Yetki stok.istek; yoksa yetkili false.
export interface KartTeslimi {
  kart: { id: number; etiket: string; uretimEmriId: number };
  alinan: number; alinmayan: number; hatalar: string[]; buradakiMalzemeler: number[];
}
export interface TerminalKartOkutmasi {
  yetkili: boolean;
  isGirdileri: { uretimEmriId: number; opNo: number; malzemeIdler: number[] }[] | null;
  // null: kod bir refakat kartı değil (eski kart, lot, bilinmeyen).
  kartiAl: (kod: string) => Promise<KartTeslimi | null>;
}
export function useTerminalKartOkutmasi(istasyonKodu: string | null): TerminalKartOkutmasi {
  const yetkili = (useOturum().data?.islemler ?? []).includes('stok.istek');
  const istemci = useQueryClient();
  const kutu = useQuery({
    queryKey: TESLIM_KUTUSU,
    queryFn: () => api.get<TeslimKutusuCevabi>('/stok/teslim-kutusu'),
    enabled: yetkili && istasyonKodu !== null,
    refetchInterval: 60_000,
    retry: false,
  });
  const istasyonId = kutu.data?.istasyonlar.find((i) => i.kod === istasyonKodu)?.id ?? null;
  const liste = useQuery({
    queryKey: isMalzemeleriAnahtari(istasyonId ?? 0),
    queryFn: () => api.get<IsMalzemeleriCevabi>(`/stok/teslim-kutusu/is-malzemeleri?istasyonId=${istasyonId}`),
    enabled: istasyonId !== null,
    refetchInterval: 60_000,
    retry: false,
  });
  const isGirdileri = liste.data ? liste.data.isler.map((x) => ({ uretimEmriId: x.uretimEmriId, opNo: x.opNo, malzemeIdler: x.malzemeler.map((m) => m.malzemeId) })) : null;
  const kartiAl = async (kod: string): Promise<KartTeslimi | null> => {
    const c = await okutulanKoduCoz(kod);
    if (c.tur !== 'malzeme' || !c.refakat) return null;
    const gelenler = c.gelenler ?? [];
    const buraya = istasyonId === null ? [] : gelenler.filter((t) => t.hedef.istasyonId === istasyonId);
    const alinanlar: Teslim[] = [];
    const hatalar: string[] = [];
    for (const t of buraya) {
      try { await api.post(`/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan: t.miktar }); alinanlar.push(t); } catch (h) { hatalar.push(`${t.no}: ${hataMetni(h)}`); }
    }
    if (alinanlar.length > 0) void istemci.invalidateQueries({ queryKey: TESLIM_KUTUSU });
    const burada = istasyonId === null ? [] : (c.kartSatirlari ?? []).filter((x) => x.istasyonId === istasyonId).map((x) => x.malzemeId);
    return {
      kart: { id: c.refakat.id, etiket: c.refakat.etiket, uretimEmriId: c.refakat.uretimEmriId },
      alinan: alinanlar.length, alinmayan: gelenler.length - alinanlar.length, hatalar,
      buradakiMalzemeler: [...new Set([...alinanlar.map((t) => t.malzemeId), ...burada])],
    };
  };
  return { yetkili, isGirdileri, kartiAl };
}
export { BEKLEYEN_SAYFA_BOYU, TerminalMalKabul } from './TerminalMalKabul.tsx';
