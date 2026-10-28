import { tesisGunu } from '#paylasilan/zaman.ts';

// 933 a: projenin plan özeti, saf hesap. Zamanlar ISO metnidir.

export interface ProjePlanIsi {
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  taban: { bitis: string } | null;
  canli: { bitis: string } | null;
  gercekBitis: string | null;
  tahminiBitis: string | null;
}

export interface ProjePlanOzeti {
  isSayisi: number;
  bitenSayisi: number;
  plansizSayisi: number;
  tabanBitis: string | null;
  canliBitis: string | null;
  beklenenBitis: string | null;
  beklenenKaymaGun: number | null;
}

const enGec = (x: readonly (string | null | undefined)[]): string | null =>
  x.reduce<string | null>((a, b) => (b == null ? a : a === null || Date.parse(b) > Date.parse(a) ? b : a), null);

// İşin bitişi: biten işte gerçek, çalışanda kural tahmini, bekleyende canlı plan. Çalışan işte tahmin yoksa canlı plana düşülmez:
// canlı bitiş geçmişte kalmış olabilir, bitiş bilinmiyor sayılır.
export function isinBeklenenBitisi(i: ProjePlanIsi): string | null {
  if (i.durum === 'tamam') return i.gercekBitis;
  if (i.durum === 'calisiyor') return i.tahminiBitis;
  return i.canli?.bitis ?? null;
}

// PG-933: proje bitişi işlerin en geç bitişidir. Bir işin beklenen bitişi bilinmiyorsa projeninki de bilinmez (en geç olanı o olabilir);
// iş yoksa her şey boştur. Kayma tesis günüyle: aynı gün biten 0.
export function projePlanOzeti(isler: readonly ProjePlanIsi[]): ProjePlanOzeti {
  const beklenenler = isler.map(isinBeklenenBitisi);
  const beklenenBitis = beklenenler.length === 0 || beklenenler.some((b) => b === null) ? null : enGec(beklenenler);
  const tabanBitis = enGec(isler.map((i) => i.taban?.bitis));
  const gun = (iso: string) => Date.parse(`${tesisGunu(Date.parse(iso))}T00:00:00Z`) / 86_400_000;
  return {
    isSayisi: isler.length,
    bitenSayisi: isler.filter((i) => i.durum === 'tamam').length,
    plansizSayisi: isler.filter((i) => i.durum !== 'tamam' && i.taban === null && i.canli === null).length,
    tabanBitis,
    canliBitis: enGec(isler.map((i) => i.canli?.bitis)),
    beklenenBitis,
    beklenenKaymaGun: beklenenBitis === null || tabanBitis === null ? null : gun(beklenenBitis) - gun(tabanBitis),
  };
}
