import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi, type Deneme } from '../../../../ortak/veri/istek-kimligi.ts';

// Komut gövdesi başına istek kimliği: sonucu bilinmeyen hatadan (ağ, zaman aşımı, 5xx) sonraki basış aynı gövdeyle aynı kimlikle
// gider, sunucu komutu ikinci kez uygulamaz. Başarıda ve sunucunun reddinde kimlik bırakılır: sonraki basış yeni komuttur. Gövde
// değiştiyse kimlik de yenidir; aynı kimlik başka gövdeyle sunucuda reddedilir. Ortak parçaya taşınması çekirdek isteğidir (3700).
export class KimlikDefteri {
  private readonly kimlikler = new Map<string, string>();
  kimlik(anahtar: string): string {
    let k = this.kimlikler.get(anahtar);
    if (k === undefined) { k = yeniIstekKimligi(); this.kimlikler.set(anahtar, k); }
    return k;
  }
  birak(anahtar: string): void { this.kimlikler.delete(anahtar); }
  temizle(): void { this.kimlikler.clear(); }
}

export async function korumaliGonder<T>(defter: KimlikDefteri, anahtar: string, gonder: (deneme: Deneme) => Promise<T>): Promise<T> {
  try {
    const cevap = await tekrarKorumaliGonder(gonder, { istekKimligi: defter.kimlik(anahtar) });
    defter.birak(anahtar);
    return cevap;
  } catch (h) {
    if (!yenidenDenenebilirMi(h)) defter.birak(anahtar);
    throw h;
  }
}
