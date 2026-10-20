// İlk tanıtım kişi başına bir kez önerilir. Kayıt tarayıcıdadır: aynı kişi başka cihazda bir kez daha görür, bu zararsızdır;
// sunucuya yazmak tablo ve uç isterdi. Tanıtım değişip yeniden gösterilmek istenirse sürüm artırılır.
export const TANITIM_SURUMU = 1;
const anahtar = (kisiId: number): string => `tmi:tanitim:${String(kisiId)}`;

// Depo kapalıysa (gizli pencere, engelli site verisi) "görüldü" sayılır: öneri her açılışta çıkıp işi bölmesin; tanıtım Yardım'dan açılır.
export function tanitimGorulduMu(kisiId: number): boolean {
  try { return localStorage.getItem(anahtar(kisiId)) === String(TANITIM_SURUMU); } catch { return true; }
}

export function tanitimGoruldu(kisiId: number): void {
  try { localStorage.setItem(anahtar(kisiId), String(TANITIM_SURUMU)); } catch { /* depo kapalı */ }
}
