import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Koşunun kendi açtığı sunucu: CPU profili yalnız sunucu sürecinin içinden alınır (`node --cpu-prof`), çalışan bir sürece
// dışarıdan bağlanılmaz (denetçi kapısı açılmaz). Profil dosyası sunucu SIGINT ile düzgün kapanınca yazılır.

const KOK = fileURLToPath(new URL('../../', import.meta.url));
const ACILIS_SURESI_MS = 120_000;
const KAPANIS_SURESI_MS = 60_000;
// Örnekleme aralığı (mikrosaniye): Node varsayılanı 1000; uzun koşuda dosya bununla yönetilebilir boyda kalır.
const PROFIL_ARALIGI_US = 1000;

export interface AcikSunucu { surec: ChildProcess; profilKlasoru: string | null }

const bekle = (ms: number): Promise<void> => new Promise((coz) => { setTimeout(coz, ms); });

export function sunucuArgumanlari(profilKlasoru: string | null): string[] {
  const profil = profilKlasoru === null ? [] : ['--cpu-prof', `--cpu-prof-dir=${profilKlasoru}`, `--cpu-prof-interval=${String(PROFIL_ARALIGI_US)}`];
  return ['--import', './araclar/ortam-yukle.ts', ...profil, 'sunucu/ana.ts'];
}

// Kapı doluysa açılmaz: başka bir sunucuya profil alındığı sanılmasın.
export async function sunucuAc(kok: string, profilKlasoru: string | null, yaz: (ileti: string) => void): Promise<AcikSunucu> {
  const once = await fetch(`${kok}/api/saglik`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
  if (once) throw new Error(`${kok} zaten cevap veriyor: --sunucu-ac ve --profil için önce o sunucuyu kapatın.`);
  if (profilKlasoru !== null) mkdirSync(profilKlasoru, { recursive: true, mode: 0o700 });
  const surec = spawn(process.execPath, sunucuArgumanlari(profilKlasoru), { cwd: KOK, stdio: ['ignore', 'ignore', 'inherit'] });
  const basla = Date.now();
  while (Date.now() - basla < ACILIS_SURESI_MS) {
    if (surec.exitCode !== null) throw new Error(`Sunucu açılamadı (çıkış ${String(surec.exitCode)}).`);
    const acik = await fetch(`${kok}/api/saglik`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
    if (acik) {
      yaz(`Sunucu açıldı (${String(Math.round((Date.now() - basla) / 1000))} sn${profilKlasoru === null ? '' : ', CPU profili alınıyor'}).`);
      return { surec, profilKlasoru };
    }
    await bekle(500);
  }
  surec.kill('SIGKILL');
  throw new Error('Sunucu süresinde açılmadı.');
}

// Profil dosyasının yolu döner (yoksa null).
export async function sunucuKapat(s: AcikSunucu): Promise<string | null> {
  if (s.surec.exitCode === null) {
    const kapandi = new Promise<void>((coz) => { s.surec.once('exit', () => { coz(); }); });
    s.surec.kill('SIGINT');
    let saat: NodeJS.Timeout | undefined;
    const zaman = new Promise<'zaman'>((coz) => { saat = setTimeout(() => { coz('zaman'); }, KAPANIS_SURESI_MS); });
    const sonuc = await Promise.race([kapandi.then(() => 'tamam' as const), zaman]);
    clearTimeout(saat);
    if (sonuc === 'zaman') {
      s.surec.kill('SIGKILL');
      throw new Error('Sunucu SIGINT ile kapanmadı; profil yazılmamış olabilir.');
    }
  }
  if (s.profilKlasoru === null) return null;
  const dosya = readdirSync(s.profilKlasoru).filter((d) => d.endsWith('.cpuprofile')).sort().at(-1);
  return dosya === undefined ? null : join(s.profilKlasoru, dosya);
}
