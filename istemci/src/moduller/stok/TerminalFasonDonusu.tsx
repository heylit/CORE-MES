import type { AcikSiparisSatiri, FasonIsleriCevabi, MalKabulGovdesi } from '#paylasilan/sozlesme/stok.ts';

// 3388 a: depo terminalinde fason dönüşünün kuralları. Kural sunucudadır (stok servis/giris.ts fasonIsi, dis-akis.ts fasonIsindenDonus):
// dönen kart rotadaki seçimdir, parça karantinaya karar bekliyor girer ve GKK'ya düşer. Dönen adet firmada kalandan çok olamaz.

export type FasonIsi = FasonIsleriCevabi['isler'][number];
export type FasonSecimi = 'dondu' | 'donmedi' | null;

export const firmadaKalan = (x: Pick<FasonIsi, 'gonderilen' | 'donen' | 'hurda'>): number => Math.max(0, x.gonderilen - x.donen - x.hurda);

// Dönen adet tam sayıdır (parça), 0'dan büyük ve en çok firmada kalan.
export function donenEksigi(adet: string, kalan: number): string | null {
  if (adet === '') return 'Dönen adedi girin.';
  const n = Number(adet);
  if (!Number.isInteger(n) || n <= 0) return 'Dönen adet 0\'dan büyük tam sayı olmalı.';
  if (n > kalan) return `Firmada ${String(kalan)} adet var; en çok ${String(kalan)} girilir.`;
  return null;
}

export function fasonDonusGovdesi(satir: Pick<AcikSiparisSatiri, 'id' | 'malzemeId' | 'kalanMiktar'>, secim: 'dondu' | 'donmedi', is: FasonIsi | null, adet: string): MalKabulGovdesi {
  // Sunucudan gelen kalan miktar noktalı ondalıktır; elle girilen miktar gibi çözülmez.
  if (secim === 'donmedi') {
    return { tur: 'satin_alma', satirlar: [{ malzemeId: satir.malzemeId!, miktar: satir.kalanMiktar, siparisSatirId: satir.id }] };
  }
  return { tur: 'satin_alma', satirlar: [{ malzemeId: is!.donenKart.malzemeId, miktar: adet, parti: null, siparisSatirId: satir.id, fasonIsi: { isEmriId: is!.isEmriId }, ambalaj: null }] };
}
