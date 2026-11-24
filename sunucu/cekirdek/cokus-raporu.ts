import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Tanı raporu (3668-1): süreç ölümcül hatayla ya da yakalanmamış istisnayla düşerse Node, JSON raporu `TMIV2-GUNLUK\cokus\` altına yazar;
// açılışta sağlık modülü okuyup kapanma kaydına geçirir. Rapor ortam değişkenlerini taşırdı (parola, anahtar): `excludeEnv` zorunludur.
// Bellek taşmasında (V8 ölümcül hatası) raporun yazılıp yazılmayacağı Node'a bağlıdır: Windows'ta denenip doğrulanacak (doğrulanmadı).
export interface RaporAyari {
  directory: string;
  reportOnFatalError: boolean;
  reportOnUncaughtException: boolean;
  reportOnSignal: boolean;
  compact: boolean;
  // Node 24 türlerinde yok, çalışma zamanında var (doğrulanmadı: Windows); yoksa ağ bilgisi rapora girer, zararsızdır.
  excludeNetwork?: boolean;
  excludeEnv: boolean;
}

export const COKUS_KLASORU = 'cokus';

export function cokusRaporunuKur(rapor: RaporAyari, gunlukDizini: string, klasorAc: (yol: string) => void = (y) => { mkdirSync(y, { recursive: true }); }): string | null {
  const klasor = path.join(gunlukDizini, COKUS_KLASORU);
  try {
    klasorAc(klasor);
  } catch {
    // Klasör açılamıyorsa rapor yazılamaz; sunucu raporsuz açılır (kapanma kaydı yine bekçi satırından kurulur).
    return null;
  }
  rapor.directory = klasor;
  rapor.reportOnFatalError = true;
  rapor.reportOnUncaughtException = true;
  rapor.reportOnSignal = false;
  rapor.compact = true;
  rapor.excludeNetwork = true;
  rapor.excludeEnv = true;
  return klasor;
}
