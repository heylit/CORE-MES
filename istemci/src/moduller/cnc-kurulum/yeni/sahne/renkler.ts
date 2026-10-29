import { Color, LinearSRGBColorSpace } from 'three';

// 3B sahne, tuval dokusu ve takım malzemesi renkleri. Tuval ve WebGL CSS okuyamadığı için renk addan çözülür: ad ortak tasarımın
// `--cnc3d-<ad>` değişkenidir (tokens.css; prototipin renkleri, temaya göre değişmez). Kodda renk değeri yazılmaz.
// Değişken yoksa (test ortamı) nötr gri döner: çizim kurulur, renk uydurulmaz.
const YEDEK = 'rgb(128, 128, 128)';

let onbellek = new Map<string, string>();

export function sahneRengi(ad: string): string {
  const v = onbellek.get(ad);
  if (v !== undefined) return v;
  let deger = '';
  try { deger = getComputedStyle(document.documentElement).getPropertyValue(`--cnc3d-${ad}`).trim(); } catch { /* tarayıcı dışı */ }
  const sonuc = deger || YEDEK;
  onbellek.set(ad, sonuc);
  return sonuc;
}

// Malzeme ve ışık rengi. Prototip three r128'de yazıldı: o sürüm renk değerini dönüştürmeden doğrusal sayar (çıkış sRGB). Aynı görünüm
// için değer burada da doğrusal okunur; sRGB okunsa koyu renkler belirgin biçimde kararır (eski çerçeveyle yan yana görüldü).
export function sahneRengi3(ad: string): Color {
  return new Color().setStyle(sahneRengi(ad), LinearSRGBColorSpace);
}

// Değişkenler değişince (tasarım yeniden yüklenince) yeniden okunur.
export function sahneRenkleriniYenile(): void { onbellek = new Map(); }
