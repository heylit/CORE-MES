// Karar 110 b: TMI emrinde girdi istasyonda yoksa iş durmaz, uyarıyla başlar; eksik istek olarak açılır, stok depo isteği karşılayınca düzelir.

export const baslatmaUyarisi = (c: { hazir: boolean; metin?: string } | null | undefined): string | null =>
  c && c.hazir === false ? c.metin || 'Girdi istasyonda yok' : null;

export const uyariliBaslatmaIletisi = (ileti: string, uyari: string): string => ileti + ' · ' + uyari;
