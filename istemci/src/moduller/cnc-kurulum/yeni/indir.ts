import { machine } from './secici.ts';
import { state } from './depo.ts';

// Prototipin download ve fname'i: birçok görünüm (kurulum kartı, NC programı, kütüphane, ömür dökümü) dosya verir.
export function download(name: string, data: BlobPart, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function fname(ext: string): string {
  const p = (state.meta.part || 'kurulum').replace(/[^\w\-ğüşıöçĞÜŞİÖÇ]+/g, '_');
  return `CNC_${p}_${machine().id}.${ext}`;
}
