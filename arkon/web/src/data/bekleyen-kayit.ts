// Ortak tablette bir kişinin gönderilmemiş kaydı, o kişi yeniden girene kadar kuyrukta bekler (kuyruk.ts); kayıt sessizce takılı kalmasın
// diye yönetici ve amir, tablette başkasına ait bekleyen kayıt olduğunu görür (karar 103 a).

/** Arkon rol kodları (@shared/model Role): Yönetici, Vardiya amiri. */
export const BEKLEYEN_BILGI_ROLLERI: readonly string[] = ['admin', 'lead'];

/** Sahipsiz öğe (önceki sürümde kuyruğa girmiş) herkesin oturumuyla gittiğinden takılı kalmaz; sayılmaz. */
export function baskasininKayitSayisi(sahipler: readonly (string | undefined)[], kisiId: string | null | undefined): number {
  return sahipler.filter((s) => s !== undefined && s !== kisiId).length;
}

export function bekleyenKayitIletisi(rol: string | undefined, sayi: number): string | null {
  if (rol === undefined || !BEKLEYEN_BILGI_ROLLERI.includes(rol) || sayi <= 0) return null;
  return `Bu tablette ${sayi} gönderilmemiş kayıt var`;
}
