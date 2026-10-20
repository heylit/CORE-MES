// Ctrl K'den Üretim Terminali'ne "emir seç" (kullanıcı kararı 16.10): TMI adresindeki `?emir=<üretim emri id>` çerçeveye
// `__tmiEmirSec` olarak bırakılır ve bu olayla duyurulur (istemci/src/moduller/arkon/baglanti.ts emirSeciminiGonder). Çerçeve TMI
// yüklenmeden önce açılabilir: istek pencerede bekler, operatör ekranı kurulunca okunur.
export const EMIR_SEC_OLAYI = 'tmi-emir-sec';

export interface EmirSecimiPenceresi { __tmiEmirSec?: number | undefined }

interface SecilebilirIs { pkg?: { id?: unknown; tmi?: { emirId?: unknown } | null } | null }

// Emrin bu istasyondaki işinin sırası; rotalı emirde iş emri paketi (`tmi.emirId`), rotasız emirde emir paketi (`tmi-ue-<id>`).
// Operatörün listesinde yoksa (başka istasyonun işi) -1: istek yok sayılır.
export function emirSirasi(isler: readonly SecilebilirIs[], emirId: number): number {
  return isler.findIndex((x) => x.pkg != null && (x.pkg.tmi?.emirId === emirId || x.pkg.id === `tmi-ue-${emirId}`));
}

// Bekleyen isteği alır ve pencereden siler: aynı istek ikinci kez uygulanmaz.
export function emirSeciminiAl(pencere: EmirSecimiPenceresi): number | null {
  const id = pencere.__tmiEmirSec;
  delete pencere.__tmiEmirSec;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}
