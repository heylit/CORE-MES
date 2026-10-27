/* Paralel adımda eksi bakiye (639h, 647 a): adım önceki adımın teslim etmediği parçayı saydıysa sunucu iş emri paketine fazla sayılan
   adedi `tmi.eksi` olarak yazar. Alan yoksa ya da geçersizse ekranda gösterge çıkmaz. */
export interface EksiBakiyePaketi { tmi?: object | null }

export function eksiBakiye(p: EksiBakiyePaketi | null | undefined): number | null {
  const eksi = p?.tmi && typeof p.tmi === 'object' ? (p.tmi as { eksi?: unknown }).eksi : undefined;
  return typeof eksi === 'number' && Number.isSafeInteger(eksi) && eksi > 0 ? eksi : null;
}

export const eksiBakiyeMetni = (adet: number): string => `Eksi bakiye · ${adet} fazla sayıldı`;
