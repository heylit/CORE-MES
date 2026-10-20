/* STEP okuyucuyu ayrı çalışanda kullanan ince sarmalayıcı (#199 TBw): ana iş parçacığındaki okuyucuyla aynı iki işlevi verir, sonuç Promise'tir.
   Çalışan açılamaz ya da kurulamazsa bütün bekleyen istekler hatayla döner. Bayt dizisi kopyalanır (çağıran önbellek özeti için tutar). */
export interface CalisanBenzeri {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(veri: unknown, aktar?: Transferable[]): void;
  terminate(): void;
}
export interface OcctOkuyucu { ReadStepFile(bytes: Uint8Array, ayar: unknown): Promise<any>; ReadIgesFile(bytes: Uint8Array, ayar: null): Promise<any> }

export const CALISAN_ACILAMADI = 'STEP okuyucu çalışanı açılamadı.';

export function calisanOkuyucu(calisan: CalisanBenzeri, wasm: ArrayBuffer): Promise<OcctOkuyucu> {
  let sira = 0;
  const bekleyen = new Map<number, { coz: (s: any) => void; reddet: (h: Error) => void }>();
  calisan.onmessage = (e) => {
    const b = bekleyen.get(e.data && e.data.no);
    if (!b) return;
    bekleyen.delete(e.data.no);
    if (e.data.tamam) b.coz(e.data.sonuc); else b.reddet(new Error(e.data.hata));
  };
  calisan.onerror = () => {
    for (const b of bekleyen.values()) b.reddet(new Error(CALISAN_ACILAMADI));
    bekleyen.clear();
  };
  const iste = (tur: string, veri: Record<string, unknown>, aktar: Transferable[] = []): Promise<any> => new Promise((coz, reddet) => {
    sira += 1;
    bekleyen.set(sira, { coz, reddet });
    calisan.postMessage(Object.assign({ no: sira, tur }, veri), aktar);
  });
  return iste('kur', { wasm }, [wasm]).then(
    () => ({ ReadStepFile: (bytes, ayar) => iste('step', { bytes, ayar }), ReadIgesFile: (bytes) => iste('iges', { bytes }) }),
    (h) => { calisan.terminate(); throw h; },
  );
}
