// Stok modülünün sorgu anahtarları. Yazma komutundan sonra `hepsi` geçersiz kılınır: bakiye birçok ekranda görünür.
export const anahtarlar = {
  hepsi: ['stok'] as const,
  isKutusu: ['stok', 'is-kutusu'] as const,
  depolar: ['stok', 'depolar'] as const,
  liste: (ad: string, sorgu: object) => ['stok', 'liste', ad, sorgu] as const,
  ayrinti: (ad: string, id: number) => ['stok', 'ayrinti', ad, id] as const,
  malzemeOzeti: (id: number) => ['stok', 'malzeme-ozeti', id] as const,
  cikisOnerisi: (id: number, miktar: string) => ['stok', 'cikis-onerisi', id, miktar] as const,
};
