import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derlemeGuncelMi, derlemeImzasi, imzayiYaz } from './derleme-imzasi.ts';
import { SUNUCU_ARGUMANLARI, guncelleyiciKur } from './guncelleyici.ts';
import { binYolu } from './paket-bin.ts';

// Derlenmiş sürümü tek komutla açar: Arkon ve istemci derlenir, sonra sunucu açılır; API 4100'de, derlenmiş arayüz ve /api
// telefonların bağlandığı 4101'de (TMIV2_ARAYUZ_PORT) aynı süreçten verilir.
// Geliştirme sunucusu her modülü istendikçe dönüştürür; derlenmiş sürüm bu bekleyişi taşımaz. Süreçler kabuksuz açılır:
// Windows'ta kabuk ara süreci kapanınca sunucu sahipsiz kalıyordu (kurulum/devir.md).
const kok = fileURLToPath(new URL('../', import.meta.url));

// Güncelleme klasörü ve anahtarı tanımlıysa sunucuyu güncelleyici açar ve Sistem Ayarları'ndan istenen paketi uygular (kart #1210).
let guncelleyici: ReturnType<typeof guncelleyiciKur>;
try {
  guncelleyici = guncelleyiciKur(kok);
} catch (hata) {
  console.error(hata instanceof Error ? hata.message : String(hata));
  process.exit(1);
}
if (guncelleyici === null) {
  eskiBaslat();
} else {
  const g = guncelleyici;
  process.on('SIGINT', () => void g.kapat(0));
  process.on('SIGTERM', () => void g.kapat(0));
  await g.baslat().catch(async (hata: unknown) => {
    console.error(`Güncelleyici durdu: ${hata instanceof Error ? hata.message : String(hata)}`);
    await g.kapat(1);
  });
}

function eskiBaslat(): void {
  const vite = binYolu(kok, 'vite');

  // İki derleme birbirinin dosyasını okur (istemci arkon/sun.ts'yi, Arkon istemcinin yazı tiplerini): girdi kümesi ortaktır.
  const girdiler = ['arkon', 'istemci', 'paylasilan', 'package.json', 'package-lock.json'];
  for (const [ayar, cikti] of [['arkon/vite.config.ts', 'arkon/dist'], ['istemci/vite.config.ts', 'istemci/dist']] as const) {
    const ciktiYolu = join(kok, cikti);
    if (derlemeGuncelMi(kok, girdiler, ciktiYolu, process.env)) {
      console.log(`${cikti} güncel, derleme atlandı.`);
      continue;
    }
    const imza = derlemeImzasi(kok, girdiler, process.env);
    const sonuc = spawnSync(process.execPath, [vite, 'build', '--config', ayar], { cwd: kok, stdio: 'inherit' });
    if (sonuc.status !== 0) process.exit(sonuc.status ?? 1);
    imzayiYaz(ciktiYolu, imza);
  }

  const sunucu = spawn(process.execPath, [...SUNUCU_ARGUMANLARI], { cwd: kok, stdio: 'inherit' });
  sunucu.on('exit', (kod) => { process.exitCode = kod ?? 1; });
  // Sinyal sunucuya iletilir; sunucu kendi kapanışını yapar (zamanlayıcı, bağlantılar), bu süreç onun çıkışıyla biter.
  const ilet = (isaret: NodeJS.Signals): void => { if (sunucu.exitCode === null) sunucu.kill(isaret); };
  process.on('SIGINT', () => { ilet('SIGINT'); });
  process.on('SIGTERM', () => { ilet('SIGTERM'); });
}
