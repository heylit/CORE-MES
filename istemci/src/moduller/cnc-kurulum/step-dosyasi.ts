// STEP okuyucusunun base64 WASM'ı (~10 MB): ayrı dosya, yalnız çağrılınca ayrı parça olarak iner.
export async function stepDosyasiOku(): Promise<string> {
  return (await import('./cerceve/cnc-step-okuyucu-wasm.txt?raw')).default;
}
