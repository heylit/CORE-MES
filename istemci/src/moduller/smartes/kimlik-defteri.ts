import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi, type Deneme } from '../../ortak/veri/istek-kimligi.ts';

// Komut gövdesi başına istek kimliği: sonucu bilinmeyen hatadan (ağ, zaman aşımı, 5xx) sonraki basış aynı gövdeyle aynı kimlikle
// gider, sunucu komutu ikinci kez uygulamaz. Başarıda ve sunucunun reddinde kimlik bırakılır: sonraki basış yeni komuttur. Gövde
// değiştiyse kimlik de yenidir; aynı kimlik başka gövdeyle sunucuda reddedilir. Ortak parçaya taşınması çekirdek isteğidir (3700).
export class KimlikDefteri {
  private readonly kimlikler = new Map<string, string>();
  private son = '';
  // Defter yalnız son komutun kimliklerini tutar: başka bir komut başlayınca öncekinin (sonucu bilinmeyen) kimlikleri düşer. Yoksa aynı
  // gövdeli sonraki komut eski kimlikle gider ve sunucu saklanan cevabı döner, komut uygulanmaz.
  yeniKomut(anahtarlar: readonly string[]): void {
    const imza = JSON.stringify(anahtarlar);
    if (imza !== this.son) this.kimlikler.clear();
    this.son = imza;
  }
  kimlik(anahtar: string): string {
    let k = this.kimlikler.get(anahtar);
    if (k === undefined) { k = yeniIstekKimligi(); this.kimlikler.set(anahtar, k); }
    return k;
  }
  birak(anahtar: string): void { this.kimlikler.delete(anahtar); }
  temizle(): void { this.kimlikler.clear(); this.son = ''; }
}

export async function korumaliGonder<T>(defter: KimlikDefteri, anahtar: string, gonder: (deneme: Deneme) => Promise<T>): Promise<T> {
  defter.yeniKomut([anahtar]);
  try {
    const cevap = await tekrarKorumaliGonder(gonder, { istekKimligi: defter.kimlik(anahtar) });
    defter.birak(anahtar);
    return cevap;
  } catch (h) {
    if (!yenidenDenenebilirMi(h)) defter.birak(anahtar);
    throw h;
  }
}
