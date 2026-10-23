import occtimportjs from 'occt-import-js';

// STEP dosyası ayrı iş parçacığında üçgenlenir: büyük makine modelinde ekran donmaz. Dosya ve sonuç bu cihazda kalır.

export interface StepIstegi {
  wasm: string;
  veri: ArrayBuffer;
  // Çizgisel sapma: modelin ortalama kutu boyuna oran (küçük değer ince üçgenleme, büyük dosya).
  ayrinti: number;
}

export interface StepAgi {
  ad: string;
  renk: [number, number, number] | null;
  konum: Float32Array;
  normal: Float32Array | null;
  dizin: Uint32Array;
}

export type StepCevabi = { aglar: StepAgi[] } | { hata: string };

interface Isci {
  onmessage: ((o: MessageEvent<StepIstegi>) => void) | null;
  postMessage: (ileti: StepCevabi, aktarim?: ArrayBufferLike[]) => void;
}
const isci = self as unknown as Isci;

isci.onmessage = (o) => {
  void (async () => {
    try {
      const occt = await occtimportjs({ locateFile: () => o.data.wasm });
      const s = occt.ReadStepFile(new Uint8Array(o.data.veri), {
        linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: o.data.ayrinti, angularDeflection: 0.5,
      });
      if (!s.success || s.meshes.length === 0) {
        isci.postMessage({ hata: 'STEP dosyası okunamadı ya da içinde katı model yok.' });
        return;
      }
      const aglar: StepAgi[] = s.meshes.map((m) => ({
        ad: m.name,
        renk: m.color ?? null,
        konum: new Float32Array(m.attributes.position.array),
        normal: m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null,
        dizin: new Uint32Array(m.index.array),
      }));
      isci.postMessage({ aglar }, aglar.flatMap((a) => [a.konum.buffer, a.dizin.buffer, ...(a.normal ? [a.normal.buffer] : [])]));
    } catch (hata) {
      isci.postMessage({ hata: `STEP dönüştürülemedi: ${hata instanceof Error ? hata.message : String(hata)}` });
    }
  })();
};
