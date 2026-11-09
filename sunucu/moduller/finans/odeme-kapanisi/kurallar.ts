// FNS-74 (2481): sipariş, bağlı belgesi varsa ve hepsi kapandıysa kapanmıştır; kapanış günü kapatan satırların en geç günüdür.
// Belgesiz, açık belgeli ya da günü bulunamayan sipariş null'dır; sıfır ya da bugün uydurulmaz.
export interface SiparisBelgeDurumu { belgeSayisi: number; acikSayisi: number; sonGun: string | null }
export function siparisKapanisi(d: SiparisBelgeDurumu | undefined): { kapanis: string } | null {
  if (d === undefined || d.belgeSayisi === 0 || d.acikSayisi > 0 || d.sonGun === null) return null;
  return { kapanis: d.sonGun };
}
