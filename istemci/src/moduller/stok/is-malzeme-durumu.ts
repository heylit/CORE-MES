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
  // İstasyondaki malzemenin kaç adete yettiği: en kısıtlı girdi (bir adetlik miktarı bilinen). Terminalin malzeme göstergesi
  // bunu kalan adetle oranlar. Hesaplanacak girdi yoksa null; sıfır uydurulmaz.
  yetme: MalzemeYetmesi | null;
}
export interface MalzemeYetmesi { adetlik: number; kalanAdet: number; miktar: string; birim: string | null; kod: string | null; ad: string | null }

const acikIstek = (d: string): boolean => d !== 'teslim' && d !== 'iptal';

export function isMalzemeDurumu(c: IsMalzemeleriCevabi, gelenler: readonly Teslim[], istasyonId: number, uretimEmriId: number): IsMalzemeDurumu {
  const isler = c.isler.filter((x) => x.uretimEmriId === uretimEmriId);
  const malzemeler = isler.flatMap((x) => x.malzemeler);
  let eksik = 0;
  let istendi = 0;
  for (const m of malzemeler) {
    if (Number(m.gereken) <= Number(m.istasyonda)) continue;
    if (m.istek !== null && acikIstek(m.istek.durum)) istendi++;
    else eksik++;
  }
  const gelen = gelenler.filter((t) => t.durum === 'yolda' && t.uretimEmriId === uretimEmriId && t.hedef.istasyonId === istasyonId).length;
  return { girdi: malzemeler.length, eksik, istendi, gelen, yetme: malzemeYetmesi(isler) };
}

// Çalışan adım önce; yoksa ilk adım. Girdinin bir adetlik miktarı sıfır ya da okunamıyorsa o girdi hesaba girmez.
export function malzemeYetmesi(isler: IsMalzemeleriCevabi['isler']): MalzemeYetmesi | null {
  const is = isler.find((x) => x.calisiyor) ?? isler[0];
  if (!is) return null;
  let en: MalzemeYetmesi | null = null;
  for (const m of is.malzemeler) {
    const bir = Number(m.birAdet);
    const var_ = Number(m.istasyonda);
    if (!Number.isFinite(bir) || bir <= 0 || !Number.isFinite(var_)) continue;
    const adetlik = Math.max(0, Math.floor(var_ / bir + 1e-9));
    if (en === null || adetlik < en.adetlik) en = { adetlik, kalanAdet: is.kalanAdet, miktar: m.istasyonda, birim: m.birim, kod: m.kod, ad: m.ad };
  }
  return en;
}

// Çipin tek satırı: önce operatörün yapacağı iş (al, iste), sonra beklenen.
export function durumMetni(d: Omit<IsMalzemeDurumu, 'yetme'>): { metin: string; ton: 'hata' | 'uyari' | 'bilgi' | 'tamam' } {
  if (d.gelen > 0) return { metin: `Gelen ${d.gelen}`, ton: 'bilgi' };
  if (d.eksik > 0) return { metin: `${d.eksik} eksik`, ton: 'hata' };
  if (d.istendi > 0) return { metin: `İstendi ${d.istendi}`, ton: 'uyari' };
  return { metin: 'Girdi tamam', ton: 'tamam' };
}

// İstasyonun işlerinin girdileri; çip, tüpler ve panel aynı önbelleği okur.
export const useIsMalzemeleri = (istasyonId: number | null, uretimEmriId: number | null) => useQuery({
  queryKey: isMalzemeleriAnahtari(istasyonId ?? 0),
  queryFn: () => api.get<IsMalzemeleriCevabi>(`/stok/teslim-kutusu/is-malzemeleri?istasyonId=${istasyonId}`),
  enabled: istasyonId !== null && uretimEmriId !== null,
  refetchInterval: 60_000,
  retry: false,
});

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
  const liste = useIsMalzemeleri(istasyonId, uretimEmriId);
  if (istasyonId === null || uretimEmriId === null || !kutu.data || !liste.data) return { durum: null, istasyonId };
  return { durum: isMalzemeDurumu(liste.data, kutu.data.gelenler, istasyonId, uretimEmriId), istasyonId };
}
