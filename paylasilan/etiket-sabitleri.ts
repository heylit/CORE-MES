// Etiket Merkezi'nin zod taşımayan sabitleri: istemci değer olarak ithal eder (sözleşme dosyası yalnız tip olarak).
// 2929 a: refakat kartı varsayılan iki kopya basılır (biri lotla gider, biri kaynakta kalır); bekleyen sayacı, doğrudan basım ve
// Etiket bas aynı sayıyı kullanır.
export const REFAKAT_KOPYA_SAYISI = 2;

// 3011 a: standart dışı rulonun ölçü sınırı (mm). Ekran girişte, sözleşme sunucuda aynı sınırla denetler.
export const OZEL_OLCU_SINIRI = { enAz: 10, enCokEn: 110, enCokBoy: 300 } as const;

// 3074 a: PPLB komutunda kod sayfası seçen ilk satırdan (satır başında I8) sonrası o kod sayfasının baytlarıyla yazılmıştır: her
// karakter bir bayttır. Ondan öncesi (deneme baskısında ana etiket) ve I8 taşımayan komut bugünkü gibi UTF-8 gider; ana etiket
// bugünkü baskıyı göstermelidir. Yazıcıya giden üç yol (ağ, USB, indirme) aynı baytları kullanır.
export function komutBaytlari(komut: string): Uint8Array<ArrayBuffer> {
  const i = komut.search(/^I8,/m);
  const bas = new TextEncoder().encode(i < 0 ? komut : komut.slice(0, i));
  if (i < 0) return bas;
  const son = Uint8Array.from(komut.slice(i), (h) => { const k = h.charCodeAt(0); return k <= 0xff ? k : 0x3f; });
  const hepsi = new Uint8Array(bas.length + son.length);
  hepsi.set(bas);
  hepsi.set(son, bas.length);
  return hepsi;
}
