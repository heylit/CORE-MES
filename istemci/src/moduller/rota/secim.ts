// Şemada ya da tabloda seçili öğe; sağ panel buna göre açılır. nid, öğenin hangi rota düğümünde olduğunu söyler.
export type Secim =
  | { tur: 'urun'; nid: string; urunId: number; opNo?: undefined }
  | { tur: 'adim'; nid: string; urunId: number; opNo: number }
  | { tur: 'bilesen'; nid: string; urunId: number; opNo: number; malzemeId: number }
  | { tur: 'yan'; nid: string; urunId: number; opNo: number; malzemeId: number };
