import { useQuery } from '@tanstack/react-query';
import type { KisiSecenekleriCevabi, RolSecenekleriCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { Secim, type Secenek } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3269: yapan, kontrol eden ve yedeği kişi ya da roldür. Seçici tek alanda ikisini verir: "k:<id>" kişi, "r:<id>" rol.
export interface Atama { kisiId: number | null; rolId: number | null }
export const atamaDegeri = (a: Atama): string => (a.kisiId !== null ? `k:${a.kisiId}` : a.rolId !== null ? `r:${a.rolId}` : '');
export function atamaCoz(deger: string): Atama {
  const [tur, id] = deger.split(':');
  if (id === undefined || id === '') return { kisiId: null, rolId: null };
  return tur === 'k' ? { kisiId: Number(id), rolId: null } : { kisiId: null, rolId: Number(id) };
}

export function useAtamaSecenekleri(): { secenekler: Secenek[]; hata: string | undefined } {
  const kisiler = useQuery({ queryKey: anahtarlar.sorumlular, queryFn: () => api.get<KisiSecenekleriCevabi>('/projeler/sorumlu-secenekleri') });
  const roller = useQuery({ queryKey: anahtarlar.roller, queryFn: () => api.get<RolSecenekleriCevabi>('/projeler/rol-secenekleri') });
  const secenekler = [
    ...(roller.data?.roller ?? []).map((r) => ({ deger: `r:${r.id}`, baslik: `Rol: ${r.ad}` })),
    ...(kisiler.data?.kisiler ?? []).map((k) => ({ deger: `k:${k.id}`, baslik: k.ad })),
  ];
  const hata = kisiler.isError || roller.isError ? hataIletisi(kisiler.error ?? roller.error, 'Kişi ve roller alınamadı') : undefined;
  return { secenekler, hata };
}

// Seçili atama listede yoksa (pasif kişi gibi) adıyla eklenir; seçim kaybolmaz.
export function AtamaSecimi({ etiket, deger, ad, secenekler, hata, bos, ipucu, kilitli = false, degistir }: {
  etiket: string; deger: string; ad: string | null; secenekler: readonly Secenek[]; hata: string | undefined; bos: string; ipucu?: string;
  kilitli?: boolean; degistir: (deger: string) => void;
}) {
  const liste = deger !== '' && !secenekler.some((s) => s.deger === deger) ? [{ deger, baslik: ad ?? deger }, ...secenekler] : secenekler;
  return (
    <Secim
      etiket={etiket} value={deger} bosSecenek={bos} secenekler={liste} hata={hata} disabled={kilitli} {...(ipucu === undefined ? {} : { ipucu })}
      onChange={(e) => { degistir(e.target.value); }}
    />
  );
}
