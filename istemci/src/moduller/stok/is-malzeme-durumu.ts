import { useQuery } from '@tanstack/react-query';
import type { IsMalzemeleriCevabi, Teslim, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// Terminaldeki işin malzeme çipi ile panelin "Bu iş" bölümü (618, karar 615-1 b) aynı sayımı kullanır; ikisi farklı şey söylemesin.
// Anahtarlar panelinkilerle aynıdır: panelde alınan ya da istenen malzeme çipi de yeniler.
export const TESLIM_KUTUSU = ['stok', 'teslim-kutusu'] as const;
export const isMalzemeleriAnahtari = (istasyonId: number) => [...TESLIM_KUTUSU, 'is-malzemeleri', istasyonId] as const;

export interface IsMalzemeDurumu {
  // İşin bu istasyondaki stoklanan girdi sayısı; 0 ise rotada girdi yok, çip gösterilmez.
  girdi: number;
  // Kalan iş için istasyonda yetmeyen ve açık isteği olmayan girdiler.
  eksik: number;
  // İstenmiş, henüz teslim edilmemiş girdiler.
  istendi: number;
  // Bu emir için bu istasyona yolda olan, teslim alınmayı bekleyen teslimler.
  gelen: number;
}

const acikIstek = (d: string): boolean => d !== 'teslim' && d !== 'iptal';

export function isMalzemeDurumu(c: IsMalzemeleriCevabi, gelenler: readonly Teslim[], istasyonId: number, uretimEmriId: number): IsMalzemeDurumu {
  const malzemeler = c.isler.filter((x) => x.uretimEmriId === uretimEmriId).flatMap((x) => x.malzemeler);
  let eksik = 0;
  let istendi = 0;
  for (const m of malzemeler) {
    if (Number(m.gereken) <= Number(m.istasyonda)) continue;
    if (m.istek !== null && acikIstek(m.istek.durum)) istendi++;
    else eksik++;
  }
  const gelen = gelenler.filter((t) => t.durum === 'yolda' && t.uretimEmriId === uretimEmriId && t.hedef.istasyonId === istasyonId).length;
  return { girdi: malzemeler.length, eksik, istendi, gelen };
}

// Çipin tek satırı: önce operatörün yapacağı iş (al, iste), sonra beklenen.
export function durumMetni(d: IsMalzemeDurumu): { metin: string; ton: 'hata' | 'uyari' | 'bilgi' | 'tamam' } {
  if (d.gelen > 0) return { metin: `Gelen ${d.gelen}`, ton: 'bilgi' };
  if (d.eksik > 0) return { metin: `${d.eksik} eksik`, ton: 'hata' };
  if (d.istendi > 0) return { metin: `İstendi ${d.istendi}`, ton: 'uyari' };
  return { metin: 'Girdi tamam', ton: 'tamam' };
}

// İstasyon kodla gelir (terminal istasyonu koduyla bilir); kişinin kapsamındaki istasyonlardan kimliğe çevrilir. Kapsamda değilse null.
export function useIsMalzemeDurumu(istasyonKodu: string | null, uretimEmriId: number | null): { durum: IsMalzemeDurumu | null; istasyonId: number | null } {
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
  if (istasyonId === null || uretimEmriId === null || !kutu.data || !liste.data) return { durum: null, istasyonId };
  return { durum: isMalzemeDurumu(liste.data, kutu.data.gelenler, istasyonId, uretimEmriId), istasyonId };
}
