// STEP okuyucusunun base64 WASM'ı (~10 MB, tek satır) ayrı parçadır ve ilk STEP dosyası açılınca yüklenir; açılışta indirilmez.
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
