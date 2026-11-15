// Başka görünümden Kokpit'in Onay ve canlı bölümünü açma isteği (3282-4 a: canlıya alma yalnız Kokpit'te). Görünüm değişince Kokpit yeniden
// kurulduğu için istek modülde tutulur. Kokpit açılışta okur (onayIstegiVar), kurulunca siler: geliştirmedeki çift çizim isteği yutmaz.
let onayIstegi = false;
export function onayAcIste(): void { onayIstegi = true; }
export const onayIstegiVar = (): boolean => onayIstegi;
export function onayIstegiAl(): boolean {
  const v = onayIstegi;
  onayIstegi = false;
  return v;
}
