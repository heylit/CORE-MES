// Prototip (gömülü 3B kütüphanesi ile yaklaşık 2 MB) ayrı parça olarak, yalnız istenince yüklenir. STEP okuyucusunun base64 WASM'ı
// (~10 MB, tek satır) HTML'in içinde değil ayrı dosyadadır ve ilk STEP dosyası açılınca çerçevenin köprü isteğiyle yüklenir;
// açılışta ne indirilir ne çerçeveye gönderilir. HTML'deki yer tutucu boş bırakılır.
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

// Başarılı yükleme saklanır (ikinci STEP açılışı yeniden yüklemez); hata saklanmaz, sonraki açılış yeniden dener.
export function stepOkuyucuKur(yukle: () => Promise<string>): () => Promise<string> {
  let bekleyen: Promise<string> | null = null;
  return () => {
    if (bekleyen === null) {
      const bu = yukle();
      bekleyen = bu;
      bu.catch(() => { if (bekleyen === bu) bekleyen = null; });
    }
    return bekleyen;
  };
}

export const stepOkuyucuYukle = stepOkuyucuKur(async () => (await import('./step-dosyasi.ts')).stepDosyasiOku());
