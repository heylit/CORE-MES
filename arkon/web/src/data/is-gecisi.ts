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
export interface SiraIsi extends GecisIsi { no: string }

const calisanSirasi = (isler: readonly SiraIsi[]): number => isler.findIndex((is) => !is.empty && is.state === 'running');

export function yeniOneAlinan(oncekiSira: readonly string[], isler: readonly SiraIsi[]): string | null {
  const calisan = calisanSirasi(isler);
  if (calisan < 0 || oncekiSira.length === 0) return null;
  const eskiYer = oncekiSira.indexOf(isler[calisan]!.no);
  if (eskiYer < 0) return null;
  const is = isler.slice(0, calisan).find((x) => !x.empty && x.state === 'queued' && !oncekiSira.slice(0, eskiYer).includes(x.no));
  return is === undefined ? null : is.no;
}

export function oneAlinanSuruyor(no: string, isler: readonly SiraIsi[]): boolean {
  const calisan = calisanSirasi(isler);
  return calisan >= 0 && isler.slice(0, calisan).some((x) => x.no === no && !x.empty && x.state === 'queued');
}
