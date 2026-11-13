// Etiket Merkezi'nin zod taşımayan sabitleri: istemci değer olarak ithal eder (sözleşme dosyası yalnız tip olarak).
// 2929 a: refakat kartı varsayılan iki kopya basılır (biri lotla gider, biri kaynakta kalır); bekleyen sayacı, doğrudan basım ve
// Etiket bas aynı sayıyı kullanır.
export const REFAKAT_KOPYA_SAYISI = 2;

// Etiket Merkezi adresi en çok bu kadar kimlik kabul eder (sözleşmedeki EN_COK_KAYIT); fazlası parça parça açılır.
export const ETIKET_MERKEZI_SINIRI = 200;
export type EtiketKaynagi = 'konum' | 'lot' | 'mal-kabul' | 'malzeme';
// Stok, atölye ve ortak arayüz Etiket Merkezi'ni aynı adresle açar: kayıtlar adresle gider, ekran kendi seçimini kurar.
export const etiketMerkeziAdresi = (tur: EtiketKaynagi, idler: readonly number[]): string =>
  `/etiket-merkezi?tur=${tur}&id=${[...new Set(idler)].slice(0, ETIKET_MERKEZI_SINIRI).join(',')}`;

// 3011 a: standart dışı rulonun ölçü sınırı (mm). Ekran girişte, sözleşme sunucuda aynı sınırla denetler.
export const OZEL_OLCU_SINIRI = { enAz: 10, enCokEn: 110, enCokBoy: 300 } as const;

// PPLB komutunda kod sayfası seçen ilk satırdan (satır başında I8) sonrası tek baytla gider: yazıcı baytları tek tek okur. Komut
// dizesi ekranda okunur kalsın diye Türkçe harf dizide kendisi durur ve burada Windows-1254 baytına çevrilir; 0xFF'e kadar olan
// karakter olduğu gibi bayttır (yazıcı denemesinin başka kod sayfasıyla yazdığı satırlar). I8 taşımayan komut (ZPL) UTF-8 gider.
// Yazıcıya giden üç yol (ağ, USB, indirme) aynı baytları kullanır.
const CP1254: Readonly<Record<string, number>> = {
  Ğ: 0xd0, İ: 0xdd, Ş: 0xde, ğ: 0xf0, ı: 0xfd, ş: 0xfe, '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
};
export function komutBaytlari(komut: string): Uint8Array<ArrayBuffer> {
  const i = komut.search(/^I8,/m);
  const bas = new TextEncoder().encode(i < 0 ? komut : komut.slice(0, i));
  if (i < 0) return bas;
  const son = Uint8Array.from(komut.slice(i), (h) => { const k = h.charCodeAt(0); return k <= 0xff ? k : CP1254[h] ?? 0x3f; });
  const hepsi = new Uint8Array(bas.length + son.length);
  hepsi.set(bas);
  hepsi.set(son, bas.length);
  return hepsi;
}
