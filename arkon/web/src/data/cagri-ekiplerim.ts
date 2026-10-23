/* Çağrı bandının alıcısı (298, CEKIRDEK-ISTEKLERI 8): kişinin hangi ekip çağrılarını aldığı TMI bildirim modülünün yönlendirmesindedir
   (GET /bildirimler/cagri-yonlendirme/benim). Bant bu listeyle süzer; böylece bildirim ile bant aynı kişiye gider. Yönetici ve vardiya amirinin
   bütün çağrıları görmesi Arkon kuralıdır, yönlendirme yalnız ekip eşlemesini verir. */

// Yönlendirme okunamazsa (sunucu yok, köprü cevapsız) çağrı kaçmasın diye bant hepsini gösterir; yanlış kişiye görünmek, çağrıyı kaçırmaktan ucuzdur.
export type CagriEkiplerim = readonly string[] | null;

export const HEPSINI_GOREN_ROLLER: readonly string[] = ['admin', 'lead'];
// Eşleme seyrek değişir; bant beş dakikada bir yeniden okur.
export const CAGRI_EKIPLERIM_YENILEME_MS = 5 * 60_000;

export function cagriBanaMi(ekip: string, rol: string | null | undefined, ekiplerim: CagriEkiplerim): boolean {
  if (rol && HEPSINI_GOREN_ROLLER.includes(rol)) return true;
  if (ekiplerim === null) return true;
  return ekiplerim.includes(ekip);
}

// Sunucu cevabı `{ ekipler: string[] }`; başka biçim okunamamış sayılır.
export function cagriEkipleriniAl(cevap: unknown): CagriEkiplerim {
  const l = cevap && typeof cevap === 'object' ? (cevap as { ekipler?: unknown }).ekipler : undefined;
  return Array.isArray(l) && l.every((x) => typeof x === 'string') ? l : null;
}
