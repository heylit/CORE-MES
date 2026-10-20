/* Anahtar başına erteleme: aynı anahtardaki yeni çağrı öncekini iptal eder, başka anahtarın bekleyen işine dokunmaz.
   Sonuç kaydı paket başınadır; iş değiştirirken eski işin kaydı yeni işin kaydıyla iptal olmamalı (AR2). */
export function anahtarliErteleyici(): (anahtar: string, is: () => void, ms: number) => void {
  const bekleyen = new Map<string, ReturnType<typeof setTimeout>>();
  return (anahtar, is, ms) => {
    const onceki = bekleyen.get(anahtar);
    if (onceki !== undefined) clearTimeout(onceki);
    bekleyen.set(anahtar, setTimeout(() => { bekleyen.delete(anahtar); is(); }, ms));
  };
}
