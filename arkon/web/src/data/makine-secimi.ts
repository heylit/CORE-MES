/* Makine seçimi (kart #1148). Makineli istasyonda TMI kilidi makinededir: işi hangi makinelerde çalıştıracağını operatör seçer, seçmezse işe atanmış
   makine kullanılır (sunucu karar verir; ekran seçilmemişliği `mcs` göndermeyerek söyler). Tek makineli istasyonda seçim yoktur. Seçim yalnız
   çalışmaya geçiş kaydına girer: çalışan işte makine değişmez (başka makineye geçmek önce durdurmak ister). */
export interface SecilebilirMakine { id: string; name?: string }

export const AZAMI_MAKINE_SECIMI = 20;

export const makineSecimiGorunur = (makineler: readonly SecilebilirMakine[], durum: string | undefined): boolean =>
  makineler.length >= 2 && durum !== 'running';

export function secimiDegistir(secili: readonly string[], id: string): string[] {
  if (secili.includes(id)) return secili.filter((x) => x !== id);
  return secili.length >= AZAMI_MAKINE_SECIMI ? [...secili] : [...secili, id];
}

// İstasyon ya da iş değişince istasyonda olmayan makine seçimde kalmaz.
export const seciliMakineler = (secili: readonly string[], makineler: readonly SecilebilirMakine[]): string[] =>
  secili.filter((id) => makineler.some((m) => m.id === id));

// Çalışmaya geçiş kaydındaki `mcs`: seçim yoksa alan hiç gönderilmez (undefined).
export const kayittakiMakineler = (secili: readonly string[], makineler: readonly SecilebilirMakine[], durum: string | undefined): string[] | undefined => {
  const gecerli = seciliMakineler(secili, makineler);
  return durum === 'running' && gecerli.length > 0 ? gecerli : undefined;
};

export function secimOzeti(secili: readonly string[], atanan: string | null | undefined): string {
  if (secili.length > 0) return `${secili.length} makine seçili`;
  return atanan ? `Seçilmezse ${atanan} makinesinde başlar` : 'Seçilmezse işe atanmış makinede başlar';
}
