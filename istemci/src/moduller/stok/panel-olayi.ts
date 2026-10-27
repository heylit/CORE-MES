// Okut sayfası kalktı (soru 90 a): eski adresler ve Stok Merkezi düğmeleri Malzeme · Teslim panelini istenen bölümde açar; `okut`
// kameralı açılış ekranıdır.
// İstek bir kez bekletilir: panel düğmesi sayfayla aynı anda kuruluyorsa olayı kaçırmaz, kurulunca alır.
export type PanelSekmesi = 'okut' | 'al' | 'sepet' | 'et' | 'iste';
export interface PanelIstegi { sekme: PanelSekmesi; depoSepeti?: boolean }
export const MALZEME_PANELI_AC = 'tmi:malzeme-paneli-ac';

let bekleyen: PanelIstegi | null = null;
export function paneliAc(istek: PanelIstegi): void {
  bekleyen = istek;
  window.dispatchEvent(new CustomEvent(MALZEME_PANELI_AC));
}
export function bekleyenPanelIstegi(): PanelIstegi | null {
  const b = bekleyen;
  bekleyen = null;
  return b;
}
