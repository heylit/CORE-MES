/* "Numune zamanı gelince otomatik kaliteye gönder" yalnız zamanı gelen numunede çalışır. Reddedilen ölçü ("Tekrar ölçüm") kendiliğinden
   gitmez: ret kartı nedeniyle ekranda kalır, operatör düzeltip numuneyi kendisi gönderir (kullanıcı kararı 17.10). Ret kararı ekrandayken
   zamanı gelen başka ölçü de kendiliğinden gitmez: gitseydi kart yeni istekle silinir ve operatör düzeltmeden yeni numune oluşurdu. */
export const TEKRAR_OLCUM = 'Tekrar ölçüm';

export const otomatikNumuneOlculeri = <T extends { id: number | string }>(
  olculer: readonly T[],
  neden: Record<string, string | undefined>,
  sonKarar?: { status?: string } | null,
): T[] => (sonKarar?.status === 'rejected' ? [] : olculer.filter((b) => neden[b.id] !== TEKRAR_OLCUM));
