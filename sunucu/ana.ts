import { fileURLToPath } from 'node:url';
import type { ArayuzKapisi } from '#cekirdek/arayuz.ts';
import { ayarOku, dinlemeAdresi } from '#cekirdek/ayar.ts';
import { mesgulGunlugu, uygulamaHavuzuAc, type Veritabani } from '#cekirdek/db.ts';
import { bekleyenGocler } from '#cekirdek/goc.ts';
import { yakalanmamisRetiDinle } from '#cekirdek/surec.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isHavuzuBoyutu, modulIsleriniKesfet, zamanlayiciKur } from '#cekirdek/zamanlayici.ts';
import { kablola } from './kablolama.ts';
import { uygulamaSecenekleri } from './uygulama-secenekleri.ts';

try {
  kablola();
} catch (hata) {
  console.error(`Sunucu açılamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
}
const ayar = ayarOku();
// `--arayuz`: derlenmiş istemci de bu süreçten, telefonların bağlandığı kapıdan verilir (baslat, güncelleyici, ekran testleri).
// Geliştirmede o kapıyı Vite tutar; bayrak verilmez. Arayüz kodu (istemci ve Arkon dosyalarını ithal eder) yalnız bayrakla yüklenir.
const arayuzAcik = process.argv.includes('--arayuz');
const arayuzKodu = arayuzAcik
  ? await Promise.all([
    import('#cekirdek/arayuz.ts'), import('../istemci/src/ortak/pwa/https.ts'), import('../istemci/src/ortak/pwa/dinleme.ts'),
  ]).then(([arayuz, https, dinleme]) => ({ ...arayuz, ...https, ...dinleme }))
  : null;
let arayuzSecenegi: { port: number; host: string; https: ReturnType<NonNullable<typeof arayuzKodu>['httpsAyari']> } | null = null;
try {
  if (arayuzKodu !== null) {
    arayuzSecenegi = { port: arayuzKodu.arayuzPortuOku(process.env, ayar.port), host: arayuzKodu.onizlemeAdresi() ?? '127.0.0.1', https: arayuzKodu.httpsAyari() };
  }
} catch (hata) {
  console.error(`Sunucu açılamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
}
// Süren iş turu en çok bu kadar beklenir; sonra uygulama ve havuz kapanır.
const KAPANIS_IS_BEKLEMESI_MS = 10_000;
// Günlükleyici uygulamayla doğar, uygulama veritabanını ister: bildirim uygulama kurulunca bağlanır.
let mesgulYaz: (bekleyen: number) => void = () => undefined;
const vt = await uygulamaHavuzuAc(ayar, { mesgulBildir: (bekleyen) => { mesgulYaz(bekleyen); } }).catch((hata: unknown) => {
  console.error(`Sunucu açılamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
});
const gocKlasoru = fileURLToPath(new URL('./gocler/', import.meta.url));
let isVt: Veritabani | null = null;

try {
  const hedef = await vt.tek<{ ad: string }>('SELECT current_database() AS ad');
  const bekleyen = await bekleyenGocler(vt, gocKlasoru);
  if (bekleyen.length > 0) {
    console.error(`Bekleyen göç var (${bekleyen.length}); önce "npm run goc" çalıştırın:`);
    for (const ad of bekleyen) console.error(`  ${ad}`);
    await vt.kapat();
    process.exit(1);
  }

  const app = await uygulamaKur(uygulamaSecenekleri(vt, ayar));
  mesgulYaz = mesgulGunlugu(app.log);
  yakalanmamisRetiDinle(process, app.log);
  const isler = await modulIsleriniKesfet();
  // İşlerin kendi havuzu vardır: isteklerin sırası dolsa da Logo ve yansıma işleri bağlantı bulur.
  isVt = await uygulamaHavuzuAc(ayar, { havuzBoyutu: isHavuzuBoyutu(isler), mesgulBildir: (bekleyen) => { mesgulYaz(bekleyen); } });
  const zamanlayici = zamanlayiciKur({ vt: isVt, gunluk: app.log, isler, kalici: true });

  let arayuz: ArayuzKapisi | null = null;
  let kapaniyor = false;
  const kapat = async (isaret: string): Promise<void> => {
    if (kapaniyor) return;
    kapaniyor = true;
    console.log(`${isaret} alındı, kapanıyor.`);
    try {
      await zamanlayici.durdur(KAPANIS_IS_BEKLEMESI_MS);
      await arayuz?.kapat();
      await app.close();
      await isVt?.kapat();
      await vt.kapat();
    } catch (hata) {
      console.error(`Kapanış hatası: ${hata instanceof Error ? hata.message : String(hata)}`);
      process.exitCode = 1;
    }
  };
  process.on('SIGINT', () => void kapat('SIGINT'));
  process.on('SIGTERM', () => void kapat('SIGTERM'));

  await app.listen({ host: dinlemeAdresi(ayar.ortam), port: ayar.port });
  if (arayuzKodu !== null && arayuzSecenegi !== null) {
    const kok = fileURLToPath(new URL('../istemci/dist/', import.meta.url));
    arayuz = await arayuzKodu.arayuzKapisiAc({ ...arayuzSecenegi, kok, api: (istek, yanit) => { app.routing(istek, yanit); } });
  }
  zamanlayici.baslat();
  const arayuzMetni = arayuzSecenegi === null ? '' : ` | arayüz: ${arayuzSecenegi.https === null ? 'http' : 'https'}://${arayuzSecenegi.host}:${String(arayuzSecenegi.port)}`;
  console.log(`TMI CORE V2 dinliyor: port ${ayar.port}${arayuzMetni} | veritabanı: ${hedef?.ad ?? '?'} | ortam: ${ayar.ortam}`);
} catch (hata) {
  console.error(`Sunucu açılamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  await isVt?.kapat().catch(() => undefined);
  await vt.kapat().catch(() => undefined);
  process.exit(1);
}
