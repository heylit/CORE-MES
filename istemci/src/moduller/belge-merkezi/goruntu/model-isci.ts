import occtimportjs from 'occt-import-js';

// STEP ve IGES ayrı iş parçacığında üçgenlenir: büyük modelde ekran donmaz. Dosya bu cihazda kalır; özgün dosya sunucuda
// değişmeden durur, burada üretilen ağ yalnız görüntü içindir.

export interface ModelIstegi {
  wasm: string;
  veri: ArrayBuffer;
  bicim: 'step' | 'iges';
}

export interface ModelAgi {
  renk: [number, number, number] | null;
  konum: Float32Array;
  normal: Float32Array | null;
  dizin: Uint32Array;
  // B-rep yüzlerinin üçgen aralıkları, yüz başına [ilk, son] çifti (dosyadaki yüz sırasıyla). Okuyucu vermezse yoktur.
  yuzler?: Uint32Array;
}

// Okuyucunun yayımlanmamış alanı: her B-rep yüzünün üçgen aralığı (ilk ve son üçgen dahil).
declare module 'occt-import-js' {
  interface OcctAgi { brep_faces?: { first: number; last: number }[] }
}

export type ModelCevabi = { aglar: ModelAgi[] } | { hata: string };

interface Isci {
  onmessage: ((o: MessageEvent<ModelIstegi>) => void) | null;
  postMessage: (ileti: ModelCevabi, aktarim?: ArrayBufferLike[]) => void;
}
const isci = self as unknown as Isci;

// Görüntü için orta ayrıntı: model kutusunun binde biri.
const AYAR = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 } as const;

isci.onmessage = (o) => {
  void (async () => {
    try {
      const occt = await occtimportjs({ locateFile: () => o.data.wasm });
      const icerik = new Uint8Array(o.data.veri);
      const s = o.data.bicim === 'step' ? occt.ReadStepFile(icerik, AYAR) : occt.ReadIgesFile(icerik, AYAR);
      if (!s.success || s.meshes.length === 0) {
        isci.postMessage({ hata: 'Dosya okunamadı ya da içinde katı model yok.' });
        return;
      }
      const aglar: ModelAgi[] = s.meshes.map((m) => ({
        renk: m.color ?? null,
        konum: new Float32Array(m.attributes.position.array),
        normal: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null,
        dizin: new Uint32Array(m.index.array),
        ...(m.brep_faces ? { yuzler: new Uint32Array(m.brep_faces.flatMap((y) => [y.first, y.last])) } : {}),
      }));
      isci.postMessage({ aglar }, aglar.flatMap((a) => [a.konum.buffer, a.dizin.buffer, ...(a.normal ? [a.normal.buffer] : []), ...(a.yuzler ? [a.yuzler.buffer] : [])]));
    } catch (hata) {
      isci.postMessage({ hata: `Model açılamadı: ${hata instanceof Error ? hata.message : String(hata)}` });
    }
  })();
};
