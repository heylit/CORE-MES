import { useQuery } from '@tanstack/react-query';
import type { Hareket } from '#paylasilan/sozlesme/stok.ts';
import type { Statu, StatulerCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { api } from '../../ortak/veri/api.ts';

// Statü dörtlüyle okunur: o haldeki malzeme (HM, YM ya da MM), parantezde hangi mamül için, hangi rota revizyonunda ve hangi OP.
// Aynı HM farklı mamüllerde ve aynı mamülün farklı revizyonlarında ayrı statüdür.
export const statuEtiketi = (s: Pick<Statu, 'ad' | 'malzemeNo' | 'urunKodu' | 'revizyon'>): string => {
  const parcalar = [s.urunKodu, s.revizyon === null ? null : `Rev ${s.revizyon}`, s.ad].filter((x): x is string => x !== null);
  return `${s.malzemeNo} (${parcalar.join(' · ')})`;
};

// Statü tanımı Reçete ve Rota'nındır (#1108); stok yalnız kimliği tutar ve adları kendi ucundan verir (depocunun reçete-rota yetkisi yok). İstek düşerse kimlikle gösterilir.
export function useStatuAdi(): (id: number | null) => string {
  const q = useQuery({ queryKey: ['stok', 'statuler'], queryFn: () => api.get<StatulerCevabi>('/stok/statuler'), staleTime: 60_000, retry: false });
  const adlar = new Map((q.data?.statuler ?? []).map((s) => [s.id, statuEtiketi(s)]));
  return (id) => (id === null ? 'Serbest' : adlar.get(id) ?? `Statü #${id}`);
}

// Hareketin statü değişimi: ikisi de serbestse boş; aynıysa tek ad; değiştiyse "kaynak → hedef".
export function hareketStatusu(h: Pick<Hareket, 'kaynakStatuId' | 'hedefStatuId'>, ad: (id: number | null) => string): string | null {
  if (h.kaynakStatuId === null && h.hedefStatuId === null) return null;
  if (h.kaynakStatuId === h.hedefStatuId) return ad(h.kaynakStatuId);
  return `${ad(h.kaynakStatuId)} → ${ad(h.hedefStatuId)}`;
}
