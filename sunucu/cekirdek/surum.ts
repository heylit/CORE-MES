import { bulunamadi, eskiSurum } from './hata.ts';

export interface SurumluGuncelleme<T> {
  // Modülün koşullu yazması: `UPDATE ... SET ..., surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING ...`.
  guncelle: () => Promise<T | null>;
  // Yalnız yazma satır döndürmediğinde çağrılır: kayıt yok mu, yoksa sürümü mü ilerlemiş.
  varMi: () => Promise<boolean>;
  bulunamadiIletisi?: string;
}

// Koşullu yazma satır döndürmediğinde iki neden ayırt edilemez; ayrımı ikinci sorgu yapar. Yazma, eşzamanlı
// komutun satır kilidini bekleyip koşulu yeniden değerlendirdiği için kaybeden burada 409 alır, üstüne yazmaz.
// Bu, yazma transaction'ının READ COMMITTED olmasına yaslanır: daha sıkı düzeyde kaybeden sürücü hatası (40001) alır.
export async function surumluGuncelle<T>({ guncelle, varMi, bulunamadiIletisi }: SurumluGuncelleme<T>): Promise<T> {
  const satir = await guncelle();
  if (satir !== null) return satir;
  throw (await varMi()) ? eskiSurum() : bulunamadi(bulunamadiIletisi);
}
