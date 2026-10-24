import type * as THREE from 'three';

// Geçici karşılık (Soru 318 a): sahne katmanı (dilim 2b) gelene kadar alan çizilmez; sözleşmedeki "WebGL yoksa sessizce boş"
// davranışıdır. 2b'nin Sahne.tsx'i aynı adlarla yerine geçer.
export interface Cizim {
  renderer: THREE.WebGLRenderer;
  rect: { left: number; top: number; width: number; height: number };
  dt: number;
  sahneRengi: (ad: string) => string;
}

export function Sahne({ sinif }: { ciz: (c: Cizim) => void; sinif?: string }) {
  return <div className={sinif} />;
}
