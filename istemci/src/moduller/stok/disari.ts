// Başka modül ekranlarının ithal edebildiği tek dosya.
// Başlatırken girdi eksikse operatör ekranı Malzeme · Teslim panelini o malzemeyle açtırır (kart #1289); panel bu modüldedir.
export const MALZEME_TESLIM_AC = 'tmi:malzeme-teslim-ac';
export interface MalzemeTeslimOdagi { istasyonId: number; uretimEmriId: number; malzemeId: number }
