import { spawn } from 'node:child_process';
import { closeSync, openSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

// 3432-2: yeni sürüm ilk açıldığında Logo yardımcısının kerelik geçişini arka planda bir kez başlatır (logo-yardimci-ilk-gecis.ts).
// Yalnız Windows'ta, canlıda, güncelleyicinin kurduğu sürüm klasöründen açılan sunucuda; işaret dosyası varsa hiç. İşaret
// başlamadan yazılır ('wx'): art arda iki açılış iki geçiş başlatmaz, yarıda kalan geçiş de kendiliğinden yinelenmez.
export const ILK_GECIS_ISARETI = 'logo-yardimci-ilk-gecis.json';
export const ILK_GECIS_GUNLUGU = 'logo-yardimci-ilk-gecis.log';

type Ortamlar = Readonly<Record<string, string | undefined>>;

// Saf: geçiş başlamalı mı; başlamalıysa güncelleme klasörü.
export function ilkGecisKlasoru(o: { platform: string; env: Ortamlar; kok: string; betik: string | undefined }): string | null {
  if (o.platform !== 'win32' || o.env['TMIV2_ORTAM'] !== 'canli') return null;
  if ((o.env['TMIV2_LOGO_YARDIMCI_KURULUM']?.trim() ?? '') !== '') return null;
  const dizin = o.env['TMIV2_GUNCELLEME_DIZINI']?.trim() ?? '';
  if (dizin === '' || o.betik === undefined || basename(o.betik).toLowerCase() !== 'ana.ts') return null;
  const kok = resolve(o.kok);
  if (resolve(dirname(kok)).toLowerCase() !== resolve(dizin, 'surumler').toLowerCase()) return null;
  return resolve(dizin);
}

// İşaret yalnız yoksa yazılır ('wx'); vardıysa false: geçiş yapıldı ya da sürüyor.
export function isaretAl(dizin: string, simdi = new Date()): boolean {
  try {
    writeFileSync(join(dizin, ILK_GECIS_ISARETI), `${JSON.stringify({ tarih: simdi.toISOString(), sonuc: 'basladi' })}\n`, { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

// Sunucu açılışını hiçbir durumda bozmaz: her hata yutulur, geçiş yalnız günlüğe yazar.
export function ilkGecisiBaslat(kok: string): void {
  try {
    const dizin = ilkGecisKlasoru({ platform: process.platform, env: process.env, kok, betik: process.argv[1] });
    if (dizin === null) return;
    if (!isaretAl(dizin)) return;
    const gunluk = openSync(join(dizin, ILK_GECIS_GUNLUGU), 'a');
    const s = spawn(process.execPath, [join(kok, 'araclar', 'logo-yardimci-ilk-gecis.ts')], {
      cwd: kok, detached: true, stdio: ['ignore', gunluk, gunluk], windowsHide: true,
    });
    s.unref();
    closeSync(gunluk);
  } catch {
    // İşaret zaten var (geçiş yapıldı ya da sürüyor) ya da klasör yazılamıyor: sunucu açılışı sürer.
  }
}
