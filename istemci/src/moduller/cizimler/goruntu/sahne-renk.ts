import { Color, LinearSRGBColorSpace } from 'three';

// Sahne renkleri tasarım değişkenlerinden okunur (tokens.css); değişken yoksa (test ortamı) nötr gri.
export function renk(stil: CSSStyleDeclaration, ad: string, dogrusal = true): Color {
  const deger = stil.getPropertyValue(ad).trim();
  const c = new Color();
  if (deger === '') return c.setRGB(0.5, 0.5, 0.5);
  return dogrusal ? c.setStyle(deger, LinearSRGBColorSpace) : c.setStyle(deger);
}
