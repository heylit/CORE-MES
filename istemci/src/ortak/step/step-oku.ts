import type { StepAgi, StepCevabi, StepIstegi } from './step-isci.ts';
import StepIsci from './step-isci.ts?worker&inline';
import wasmAdresi from 'occt-import-js/dist/occt-import-js.wasm?url';

export type { StepAgi } from './step-isci.ts';

// STEP dosyasını ayrı iş parçacığında üçgen ağlarına çevirir (atölye ve CNC Kurulum aynı çeviriciyi kullanır). Dosya bu cihazda
// kalır; çevirici paketin kendi wasm'ıdır, dışarıya istek yoktur. `veri` iş parçacığına aktarılır, çağıranda boşalır.
// ayrinti: çizgisel sapmanın modelin kutu boyuna oranı.
export function stepOku(veri: ArrayBuffer, ayrinti: number): Promise<StepAgi[]> {
  return new Promise((coz, reddet) => {
    const isci = new StepIsci();
    isci.onmessage = (o: MessageEvent<StepCevabi>) => {
      isci.terminate();
      const c = o.data;
      if ('hata' in c) { reddet(new Error(c.hata)); return; }
      coz(c.aglar);
    };
    isci.onerror = (o) => { isci.terminate(); reddet(new Error(o.message || 'STEP çevirici açılamadı.')); };
    const istek: StepIstegi = { wasm: new URL(wasmAdresi, document.baseURI).href, veri, ayrinti };
    isci.postMessage(istek, [veri]);
  });
}
