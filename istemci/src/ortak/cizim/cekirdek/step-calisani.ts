/* STEP okuyucuyu ayrı çalışanda kullanan ince sarmalayıcı (#199 TBw): ana iş parçacığındaki okuyucuyla aynı iki işlevi verir, sonuç Promise'tir.
   Çalışan açılamaz ya da kurulamazsa bütün bekleyen istekler hatayla döner. Bayt dizisi kopyalanır (çağıran önbellek özeti için tutar). */
export interface CalisanBenzeri {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(veri: unknown, aktar?: Transferable[]): void;
  terminate(): void;
}
// Okuyucunun sonucu: ortak/cizim/cekirdek.ts'teki OcctSonucu ile aynı biçim. O dosya Vite'a özgü glob kullandığı için bu dosyayı
// da derleyen Arkon tip programına alınamaz; biçim burada yazılır, eşliği istemci tip denetimi (kitaplik.ts atamasında) sınar.
export interface OcctSonucu {
  success?: boolean;
  meshes: { name?: string; attributes: { position: { array: ArrayLike<number> }; normal?: { array: ArrayLike<number> } }; index: { array: ArrayLike<number> } }[];
}
export interface OcctOkuyucu { ReadStepFile(bytes: Uint8Array, ayar: unknown): Promise<OcctSonucu>; ReadIgesFile(bytes: Uint8Array, ayar: null): Promise<OcctSonucu> }

export const CALISAN_ACILAMADI = 'STEP okuyucu çalışanı açılamadı.';

export function calisanOkuyucu(calisan: CalisanBenzeri, wasm: ArrayBuffer): Promise<OcctOkuyucu> {
  let sira = 0;
  const bekleyen = new Map<number, { coz: (s: unknown) => void; reddet: (h: Error) => void }>();
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
  // Çalışanın cevabı yapılandırılmış kopyadır, tip taşımaz: sonucun biçimine çalışan (step-calisan.js) kefildir.
  const iste = <T>(tur: string, veri: Record<string, unknown>, aktar: Transferable[] = []): Promise<T> => new Promise<T>((coz, reddet) => {
    sira += 1;
    bekleyen.set(sira, { coz: coz as (s: unknown) => void, reddet });
    calisan.postMessage(Object.assign({ no: sira, tur }, veri), aktar);
  });
  return iste<unknown>('kur', { wasm }, [wasm]).then(
    () => ({ ReadStepFile: (bytes, ayar) => iste<OcctSonucu>('step', { bytes, ayar }), ReadIgesFile: (bytes) => iste<OcctSonucu>('iges', { bytes }) }),
    (h) => { calisan.terminate(); throw h; },
  );
}
