import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BagModulu, KucukResim, KucukResimlerCevabi } from '#paylasilan/sozlesme/cizimler.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import './cizimler.css';

// Liste ve kartlardaki küçük resim (kart #688). Kare ortak uçtan okunur: oturum açmış herkes, yalnız bağlı ve yayına girmiş
// revizyonun karesini görür. Resim yoksa ya da okunamazsa yer tutucu ikon çizilir; revizyon karta uymuyorsa uyarı işareti çıkar.

export type KucukResimBoyu = 'kucuk' | 'orta' | 'buyuk';

export const kucukResimAdresi = (r: Pick<KucukResim, 'revizyonId'>, kare = 0): string => `/api/cizimler/kucuk-resim/${r.revizyonId}/${kare}`;

// Sunucunun tek istekte aldığı en çok kayıt (`paylasilan/sozlesme/cizimler.ts` KUCUK_RESIM_AZAMI_KAYIT).
const AZAMI_KAYIT = 200;

// Listenin kayıtları için tek istek; kayıt başına istek atılmaz. Resmi olmayan kayıt haritada yoktur.
export function useKucukResimler(hedefModul: BagModulu, idler: readonly number[]): Map<number, KucukResim> {
  const sirali = [...new Set(idler.filter((i) => Number.isSafeInteger(i) && i > 0))].sort((a, b) => a - b).slice(0, AZAMI_KAYIT);
  const sorgu = useQuery({
    queryKey: anahtarlar.kucukResimler(hedefModul, sirali),
    queryFn: () => api.get<KucukResimlerCevabi>(`/cizimler/kucuk-resimler?hedefModul=${hedefModul}&idler=${sirali.join(',')}`),
    enabled: sirali.length > 0,
    staleTime: 60_000,
  });
  return new Map((sorgu.data?.resimler ?? []).map((r) => [r.hedefId, r]));
}

export function KucukResimKutusu({ resim, ad, boy = 'kucuk' }: { resim: KucukResim | null | undefined; ad: string; boy?: KucukResimBoyu }) {
  const [bozuk, bozukYaz] = useState<number | null>(null);
  const goster = resim != null && bozuk !== resim.revizyonId;
  const uyumsuz = resim?.revUyumu === false;
  return (
    <span className={`tc-cz-kr tc-cz-kr-${boy}`} title={uyumsuz ? `${ad}: resim revizyonu (${resim.harf}) kartın revizyonuna uymuyor` : ad}>
      {goster
        ? <img src={kucukResimAdresi(resim)} alt={ad} loading="lazy" decoding="async" onError={() => { bozukYaz(resim.revizyonId); }} />
        : <Simge ad="camera" />}
      {uyumsuz && <span className="tc-cz-kr-uyari" role="img" aria-label="Revizyon uyuşmuyor"><Simge ad="alert" /></span>}
    </span>
  );
}
