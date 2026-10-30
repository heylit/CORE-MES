// Prototip HTML'i sayfa olarak açılmaz; ekranın hesaplarının ve 3B modellerinin onunla aynı sonucu verdiğini sınayan testlerin
// başvurusudur. Yalnız testler ithal eder: uygulama kodu ithal ederse 2 MB'lık metin pakete ayrı parça olarak girer.
// STEP okuyucusunun WASM'ı HTML'de değil ayrı dosyadadır (prototip.ts); HTML'deki yer tutucu boş bırakılır.
export const WASM_YER_TUTUCU = '<!--cnc-step-okuyucu-wasm-->';

export function prototipBirlestir(html: string, wasm: string): string {
  if (html.split(WASM_YER_TUTUCU).length !== 2) throw new Error('CNC prototipinde WASM yer tutucusu tam bir kez bulunmalı');
  // İşlevli replace: değiştirme metnindeki `$` dizileri yorumlanmasın.
  return html.replace(WASM_YER_TUTUCU, () => wasm);
}

export async function prototipYukle(): Promise<string> {
  const html = await import('./cerceve/cnc-kurulum-motoru.html?raw');
  return prototipBirlestir(html.default, '');
}
