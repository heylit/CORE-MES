import { kesitCizimi } from './kesit.ts';
import { OlcuKesiti } from './OlcuKesiti.tsx';
import './olcu-modeli.css';

// 3215 c: başka modülde (mal kabul) yalnız biçim ve ölçüden aynı kesit; çizilemeyen biçimde boş.
export function KesitGorunumu({ form, olcu, kod }: { form: string; olcu: Record<string, number>; kod: string }) {
  const cizim = kesitCizimi(form, olcu);
  return cizim ? <OlcuKesiti cizim={cizim} kod={kod} /> : null;
}
