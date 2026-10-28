import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// `npm run baslat` her açılışta ekranı derliyordu; bekçinin her yeniden açışı kesintiye derleme süresini ekliyordu (kesinti
// tatbikatı D3). Girdi dosyalarının yolu, boyu ve zamanı değişmedikçe derlenmiş çıktı yeniden kullanılır. `git pull` ve
// `npm ci` değişen dosyanın zamanını yeniler; imza tutmazsa derlenir. Yanlış "güncel" kararı eski ekran sunar, bu yüzden
// şüphede (okunamayan imza, eksik çıktı) her zaman derlenir.
const ATLANAN = new Set(['dist', 'node_modules', '.git']);
const IMZA_DOSYASI = '.derleme-imzasi';
// Derlemeye ortamdan giren değerler (istemci/vite.config.ts derlemeBilgisi).
const ORTAM_GIRDILERI = ['TMIV2_COMMIT', 'TMIV2_SURUM'];

function dosyalar(kok: string, goreli: string, cikti: string[]): void {
  const tam = path.join(kok, goreli);
  if (!existsSync(tam)) { cikti.push(`${goreli}|yok`); return; }
  const bilgi = statSync(tam);
  if (!bilgi.isDirectory()) { cikti.push(`${goreli}|${String(bilgi.size)}|${String(bilgi.mtimeMs)}`); return; }
  for (const ad of readdirSync(tam).sort()) {
    if (!ATLANAN.has(ad)) dosyalar(kok, path.join(goreli, ad), cikti);
  }
}

export function derlemeImzasi(kok: string, girdiler: readonly string[], env: NodeJS.ProcessEnv): string {
  const satirlar: string[] = [];
  for (const girdi of girdiler) dosyalar(kok, girdi, satirlar);
  for (const ad of ORTAM_GIRDILERI) satirlar.push(`${ad}=${env[ad]?.trim() ?? ''}`);
  return createHash('sha256').update(satirlar.join('\n')).digest('hex');
}

export function derlemeGuncelMi(kok: string, girdiler: readonly string[], cikti: string, env: NodeJS.ProcessEnv): boolean {
  if (!existsSync(path.join(cikti, 'index.html'))) return false;
  try {
    return readFileSync(path.join(cikti, IMZA_DOSYASI), 'utf8').trim() === derlemeImzasi(kok, girdiler, env);
  } catch {
    return false;
  }
}

export function imzayiYaz(cikti: string, imza: string): void {
  writeFileSync(path.join(cikti, IMZA_DOSYASI), `${imza}\n`);
}
