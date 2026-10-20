/* Değişiklik günlüğünü (audit) sunucu kendisi yazar ve tabletten geleni reddeder (sunucu/moduller/arkon/kurallar.ts kayitReddi). Tablet bu türü
   yalnız kendi yerel günlüğüne yazar, sunucuya ve çevrimdışı kuyruğa göndermez; liste sunucunun kuralıyla testle aynı tutulur (kurallar.test.ts). */
const YALNIZ_YEREL: ReadonlySet<string> = new Set(['audit']);

export const sunucuyaGonderilir = (tur: string): boolean => !YALNIZ_YEREL.has(tur);
