// Silinmiş malzeme kartının başka modüllerdeki izi (2114c Arşiv). Her modül kendi tablolarını kendi SQL'iyle sayar ve
// bu biçimde döner; malzemeler arşivi bunları kablolamadan toplar. Kesin bağ: kartı sütunla gösteren satır (yabancı
// anahtarlı ya da anahtarsız). Olası iz: jsonb içinde kartın stok kodu, kimliği ya da malzeme alanında numarası; yanlış
// pozitif olabilir, yine de kalıcı silmeyi engeller (2114-4 a).

export interface MalzemeKartiAnahtari {
  no: number;
  kimlik: string;
  stokKodu: string;
}

export type MalzemeKartiIzTuru = 'kesin' | 'olasi';

export interface MalzemeKartiIzi {
  no: number;
  kayit: string;
  tur: MalzemeKartiIzTuru;
  adet: number;
  ornek: string | null;
}

// jsonb_path_exists(sutun, MALZEME_KARTI_IZ_YOLU, jsonb_build_object('no', no, 'kod', stok_kodu, 'kimlik', kimlik)).
// `$.**` her düzeydeki değeri gezer; dizi elemanı da gezilir (lax). Sayı yalnız malzeme alanı adlarında aranır: çıplak
// sayı her yerde eşleşirdi.
export const MALZEME_KARTI_IZ_YOLU =
  'lax $.** ? (@ == $kod || @ == $kimlik || @.malzemeId == $no || @.malzemeNo == $no || @.malzemeIdleri == $no'
  + ' || @.malzemeNolar == $no || @.aparatKartiId == $no || @.ciktiMalzemeId == $no)';

export const malzemeKartiIzParametreleri = (kartlar: readonly MalzemeKartiAnahtari[]): [number[], string[], string[]] => [
  kartlar.map((k) => k.no),
  kartlar.map((k) => k.stokKodu),
  kartlar.map((k) => k.kimlik),
];
