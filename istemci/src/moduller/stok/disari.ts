// Başka modül ekranlarının ithal edebildiği tek dosya.
// Başlatırken girdi eksikse operatör ekranı Malzeme · Teslim panelini o malzemeyle açtırır (kart #1289); panel bu modüldedir.
export const MALZEME_TESLIM_AC = 'tmi:malzeme-teslim-ac';
// malzemeId null: işin bütün malzemesi ("Bu iş" bölümü, terminalin malzeme çipi; 618).
export interface MalzemeTeslimOdagi { istasyonId: number; uretimEmriId: number; malzemeId: number | null }
export function isMalzemesiniAc(odak: MalzemeTeslimOdagi): void {
  window.dispatchEvent(new CustomEvent(MALZEME_TESLIM_AC, { detail: odak }));
}
export { durumMetni, useIsMalzemeDurumu, type IsMalzemeDurumu } from './is-malzeme-durumu.ts';
export { IstasyonSepetleri, useIstasyonSepetiSayilari } from './IstasyonSepetleri.tsx';
