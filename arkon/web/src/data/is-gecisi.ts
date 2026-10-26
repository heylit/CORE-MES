/* İş değiştirme. TMI bir istasyonda tek başlamış emre izin verir: operatör başka işe geçerken çalışan iş duraklatılır ve olayı
   gönderilir; Arkon ve TMI aynı durumu gösterir. Etkin olmayan çalışan iş de sayılır: sayfa yenilenince etkin iş listenin ilk
   işidir (AR2). Çalışmayan (kuyrukta, ayarda, duraklamış, durmuş, bitmiş) iş olduğu gibi kalır; hedef iş duraklatılmaz. */
export interface GecisIsi { state?: string; empty?: boolean }

export function gecisteDuraklatilacaklar(isler: readonly (GecisIsi | null | undefined)[], yeniSira: number): number[] {
  return isler.flatMap((is, sira) => (sira !== yeniSira && is !== null && is !== undefined && !is.empty && is.state === 'running' ? [sira] : []));
}

/* Kart #199 (3b): Planlama çalışan işin önüne iş alabilir; liste plan sırasıyla dizildiği için öne alınan iş çalışanın üstünde,
   kuyrukta bekler. Öne alınmış sayılan, önceki listede çalışanın üstünde olmayan iştir: operatörün alttaki işi elle seçmesi listeyi
   değiştirmez, uyarı doğurmaz. Geçiş otomatik değildir: operatör öndeki işe geçince çalışan iş yukarıdaki kuralla duraklatılır. */
export interface SiraIsi extends GecisIsi { no: string; pkg?: { id?: string } | null }

/* Aynı emrin iki adımı (639) aynı emir nosunu taşır; iş, paketiyle (adımıyla) ayırt edilir. */
export const siraAnahtari = (is: SiraIsi): string => (is.pkg && is.pkg.id) || is.no;

const calisanSirasi = (isler: readonly SiraIsi[]): number => isler.findIndex((is) => !is.empty && is.state === 'running');

export function yeniOneAlinan(oncekiSira: readonly string[], isler: readonly SiraIsi[]): string | null {
  const calisan = calisanSirasi(isler);
  if (calisan < 0 || oncekiSira.length === 0) return null;
  const eskiYer = oncekiSira.indexOf(siraAnahtari(isler[calisan]!));
  if (eskiYer < 0) return null;
  const is = isler.slice(0, calisan).find((x) => !x.empty && x.state === 'queued' && !oncekiSira.slice(0, eskiYer).includes(siraAnahtari(x)));
  return is === undefined ? null : siraAnahtari(is);
}

export function oneAlinanSuruyor(anahtar: string, isler: readonly SiraIsi[]): boolean {
  const calisan = calisanSirasi(isler);
  return calisan >= 0 && isler.slice(0, calisan).some((x) => siraAnahtari(x) === anahtar && !x.empty && x.state === 'queued');
}
