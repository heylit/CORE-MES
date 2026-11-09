import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../ortak/veri/api.ts';
import { RR_ANAHTARI, RrHatasi } from '../veri.ts';
import { sirali, type Adim } from './kurallar.ts';

// Sözleşme `paylasilan/sozlesme/rota.ts` OpNumaralariCevabi ile aynı biçim; sunucu yaması gelince oradan ithal edilir.
export interface OpNumaralari {
  kullanilmis: Array<{ opNo: number; ilkRevizyonId: number; ilkRevizyonHarfi: string }>;
  siradaki: number;
}

const ARALIK = 10;

// Numara kayıtta değişir (yeni adım numara alır); anahtar kayıtlı numaraları taşıdığı için kayıttan sonra yeniden okunur.
export function useOpNumaralari(urunId: string, adimlar: readonly Adim[], etkin = true) {
  const kayitli = adimlar.flatMap((a) => (a.opNo === null ? [] : [a.opNo])).sort((x, y) => x - y).join(',');
  return useQuery({
    queryKey: [...RR_ANAHTARI, 'op-numaralari', urunId, kayitli],
    enabled: etkin,
    staleTime: 60_000,
    queryFn: async () => {
      try { return await api.get<OpNumaralari>(`/rota/urunler/${encodeURIComponent(urunId)}/op-numaralari`); } catch (h) { throw new RrHatasi(h); }
    },
  });
}

// RT-31: sunucu numarasız adımlara sırayla, kullanılmış en büyük numaranın (ve rotadaki numaraların) üstünden 10'ar artırarak verir.
// Ekrandaki tahmin aynı kuralla hesaplanır; kayıt anında başka biri numara aldıysa sunucunun verdiği geçerlidir.
export function yeniAdimNumaralari(adimlar: readonly Adim[], siradaki: number): Map<string, number> {
  const s = sirali(adimlar);
  let son = s.reduce((m, a) => (a.opNo === null ? m : Math.max(m, a.opNo)), siradaki - ARALIK);
  const sonuc = new Map<string, number>();
  for (const a of s) {
    if (a.opNo !== null) continue;
    son += ARALIK;
    sonuc.set(a.id, son);
  }
  return sonuc;
}

// Paletten eklenecek adımın alacağı numara: rotadaki bekleyen yeni adımlardan sonraki.
export function eklenecekNumara(adimlar: readonly Adim[], siradaki: number): number {
  const bekleyen = [...yeniAdimNumaralari(adimlar, siradaki).values()];
  const taban = adimlar.reduce((m, a) => (a.opNo === null ? m : Math.max(m, a.opNo)), siradaki - ARALIK);
  return Math.max(taban, ...bekleyen) + ARALIK;
}

// Bu üründe bir kez verilmiş ama gösterilen rotada olmayan numaralar (silinmiş ya da başka revizyonda kalmış); yeniden verilmez.
export function rotadaOlmayanNumaralar(c: OpNumaralari, adimlar: readonly Adim[]): OpNumaralari['kullanilmis'] {
  const rotada = new Set(adimlar.flatMap((a) => (a.opNo === null ? [] : [a.opNo])));
  return c.kullanilmis.filter((k) => !rotada.has(k.opNo));
}
