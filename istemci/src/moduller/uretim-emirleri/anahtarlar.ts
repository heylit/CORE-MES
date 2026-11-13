import type { EmirDurumu, KapanisAsamasi } from '#paylasilan/sozlesme/uretim-emirleri.ts';

export const anahtarlar = {
  hepsi: ['uretim-emirleri'] as const,
  liste: (durum: EmirDurumu | '') => ['uretim-emirleri', 'liste', durum] as const,
  // Adım Durumu'nun listesi başka uçtan, başka biçimde gelir; Üretim Emirleri listesiyle aynı anahtarı paylaşırsa önbellekteki
  // öbür cevap okunur ve ekran çöker.
  adimliListe: ['uretim-emirleri', 'adimli-liste'] as const,
  bitenler: (durum: EmirDurumu | '', ara: string, sayfa: number) => ['uretim-emirleri', 'bitenler', durum, ara, sayfa] as const,
  ayrinti: (id: number) => ['uretim-emirleri', 'ayrinti', id] as const,
  ozet: ['uretim-emirleri', 'ozet'] as const,
  akis: (id: number) => ['uretim-emirleri', 'akis', id] as const,
  refakatKartlari: (id: number) => ['uretim-emirleri', 'refakat-kartlari', id] as const,
  adimli: (id: number) => ['uretim-emirleri', 'adimli', id] as const,
  fisler: (id: number) => ['uretim-emirleri', 'fisler', id] as const,
  mrp: (id: number) => ['uretim-emirleri', 'mrp', id] as const,
  hazirlik: (id: number) => ['uretim-emirleri', 'hazirlik', id] as const,
  adimDurumu: (id: number) => ['uretim-emirleri', 'adim-durumu', id] as const,
  fasonFirmalari: ['uretim-emirleri', 'fason-firmalari'] as const,
  siradakiFason: (id: number) => ['uretim-emirleri', 'siradaki-fason', id] as const,
  kapanislar: (asama: KapanisAsamasi | '', ara: string, sayfa: number) => ['uretim-emirleri', 'kapanislar', asama, ara, sayfa] as const,
  kapanis: (id: number) => ['uretim-emirleri', 'kapanis', id] as const,
};
