export interface TurDegerleri {
  boolean: boolean;
  // null "boş" demektir: değer girilmemiştir, sıfır uydurulmaz. Okuyan modül boşken ne yapacağını kendisi söyler.
  sayi: number | null;
  // Boş metin değer değildir: okuyan modül her zaman gösterecek bir metin bulur. Yalnız `bosOlabilir` tanımda boş metin
  // "girilmemiş" demektir; okuyan modül boşken ne yapacağını kendisi söyler.
  metin: string;
  // Belge numarası kalıbı (paylasilan/numara.ts); boş olamaz.
  numara: string;
  // Tanımdaki seçeneklerden birinin değeri; boş olamaz.
  secim: string;
}

export type AyarTuru = keyof TurDegerleri;

export const METIN_BICIMLERI = ['ag-araligi'] as const;
export type MetinBicimi = (typeof METIN_BICIMLERI)[number];

export interface AyarSecenegi {
  deger: string;
  etiket: string;
}

interface OrtakAlanlar {
  // Ayarı okuyan modül; anahtar onun adıyla başlar.
  modul: string;
  baslik: string;
  aciklama: string;
}

export type AyarTanimi =
  | (OrtakAlanlar & { tur: 'boolean'; varsayilan: boolean })
  | (OrtakAlanlar & {
    tur: 'sayi';
    varsayilan: number | null;
    // Sınırlar dahildir. Ondalık, izin verilen en çok kesir basamağıdır (0: tam sayı).
    enAz: number;
    enCok: number;
    ondalik: number;
  })
  | (OrtakAlanlar & {
    tur: 'metin';
    varsayilan: string;
    enUzun: number;
    bosOlabilir?: true;
    // Biçimli metin sunucuda ve ekranda aynı kuralla doğrulanır (ag-araligi: paylasilan/ag-araligi.ts).
    bicim?: MetinBicimi;
  })
  // Sabit listeden tek seçim; listede olmayan değer yazılamaz. Etiket ekranda görünür, değer saklanır.
  | (OrtakAlanlar & { tur: 'secim'; varsayilan: string; secenekler: readonly AyarSecenegi[] })
  | (OrtakAlanlar & {
    tur: 'numara';
    varsayilan: string;
    // Zaman alanları ve sayaç dışında kalıpta kullanılabilen, değerini numarayı isteyen modülün verdiği alanlar.
    alanlar: readonly string[];
  });
