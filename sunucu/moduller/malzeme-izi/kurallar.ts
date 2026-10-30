import type { Hal, HalGirdisi, StokGrubu } from '#paylasilan/sozlesme/malzeme-izi.ts';

// Malzeme 360 (kart 1296). Saf: veritabanı yok. Kurallar MIZ-<n> numarasıyla KURAL-TEST.md'dedir.

// MIZ-1 (1278 a): bakiye satırının tek hâli, öncelik sırasıyla. Kalite kararı konumdan önce gelir: karantinadaki karar bekleyen satır
// "kalite bekliyor", kabul gözündeki red satır "red"dir. Statü almış ya da istasyondaki parça üretimdedir; serbest ve emre
// ayrılmış miktar rezervedir.
export function hal(g: HalGirdisi): Hal {
  if (g.konumTuru === 'hurda') return 'hurda';
  if (g.kaliteDurumu === 'karar_bekliyor') return 'kalite_bekliyor';
  if (g.kaliteDurumu === 'red' || g.konumTuru === 'karantina') return 'red';
  if (g.kaliteDurumu === 'sartli') return 'sartli';
  if (g.konumTuru === 'kabul') return 'kabul';
  if (g.konumTuru === 'fason' || g.konumTuru === 'yolda' || g.konumTuru === 'sevkiyat') return 'fason';
  if (g.statuId !== null || g.konumTuru === 'istasyon' || g.konumTuru === 'uretim_cikisi') return 'uretimde';
  if (g.rezerveMi) return 'rezerve';
  return 'serbest';
}

// MIZ-2: stok grupları sabit sırayla ve yalnız sıfırdan farklı olanlar; grup başına toplam numeric metin olarak toplanır.
const GRUP_SIRASI: readonly StokGrubu[] = ['kullanilabilir', 'kalite', 'fason', 'yolda', 'hurda', 'diger'];
export function grupDagilimi(satirlar: readonly { grup: StokGrubu; toplam: string }[]): { grup: StokGrubu; miktar: string }[] {
  const toplam = new Map<StokGrubu, number>();
  for (const s of satirlar) toplam.set(s.grup, (toplam.get(s.grup) ?? 0) + Number(s.toplam));
  return GRUP_SIRASI.flatMap((g) => {
    const m = toplam.get(g);
    return m === undefined || m === 0 ? [] : [{ grup: g, miktar: miktarMetni(m) }];
  });
}

// Binde üç basamak (stok miktar ölçeği); kayan nokta artığı yazılmaz.
export const miktarMetni = (m: number): string => String(Math.round(m * 1000) / 1000);
