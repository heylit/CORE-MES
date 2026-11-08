import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, chownSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kabuksuzArgv } from './paket-bin.ts';
import { modulTestKomutlari } from './test-modul.ts';

// Teslim kapısının veritabanlı denemesi (2329-1 b): yama güncel ana dala uygulanır, yazarın kendi veritabanlarından ayrı,
// yalnız test veritabanı olan yeni bir PostgreSQL kümesinde değişen yerlerin testleri ve boş veritabanına bütün göçler koşar.
// CI'da yeşil, yerelde kırmızı farkının iki kaynağı buydu: yazarda var olan asıl veritabanı (2306) ve PostgreSQL sürümü (1765).
// Sonuç teslim klasörüne VT-SONUC.md olarak yazılır; düz `teslim-denetle` yalnız onu okur, kod çalıştırmaz.

export const SONUC_DOSYASI = 'VT-SONUC.md';
export const HEDEF_PG = 18;

export interface VtSonuc {
  pg: number | null;
  yamalar: string[];
  gecti: boolean;
}

export interface VtBulgu { duzey: 'kirmizi' | 'uyari'; etiket: string; mesaj: string }

export function sonucMetni(s: VtSonuc, ayrinti: readonly string[]): string {
  return [
    '<!-- vt-sonuc',
    `pg: ${s.pg === null ? '?' : String(s.pg)}`,
    `yamalar: ${s.yamalar.join(', ')}`,
    `sonuc: ${s.gecti ? 'gecti' : 'kirmizi'}`,
    '-->',
    '',
    `# Veritabanlı teslim denemesi (${s.gecti ? 'GEÇTİ' : 'KIRMIZI'})`,
    '',
    ...ayrinti,
    '',
  ].join('\n');
}

export function sonucOku(metin: string): VtSonuc | null {
  const blok = /<!--\s*vt-sonuc\s*\n([\s\S]*?)-->/.exec(metin)?.[1];
  if (blok === undefined) return null;
  const alan = (ad: string): string => new RegExp(`^[ \\t]*${ad}[ \\t]*:[ \\t]*(.*)$`, 'm').exec(blok)?.[1]?.trim() ?? '';
  const pg = Number.parseInt(alan('pg'), 10);
  return {
    pg: Number.isInteger(pg) ? pg : null,
    yamalar: alan('yamalar').split(',').map((s) => s.trim()).filter(Boolean),
    gecti: alan('sonuc') === 'gecti',
  };
}

// Yazar ortamında PostgreSQL 18 bulunmayabilir (2340: konteynerde kurulamıyor). Temiz küme zorunludur, sürüm farkı
// uyarıdır; PG18 denetimi CI'daki Linux işindedir.
export function vtDenetle(sonuc: VtSonuc | null, yamaShalari: readonly string[]): VtBulgu[] {
  const kos = 'npm run teslim-denetle -- --vt <klasör>';
  if (!sonuc) return [{ duzey: 'kirmizi', etiket: 'vt', mesaj: `${SONUC_DOSYASI} yok; temiz veritabanı denemesi koşulmamış (${kos})` }];
  const b: VtBulgu[] = [];
  const farkli = yamaShalari.length !== sonuc.yamalar.length || yamaShalari.some((s) => !sonuc.yamalar.includes(s));
  if (farkli) b.push({ duzey: 'kirmizi', etiket: 'vt', mesaj: `${SONUC_DOSYASI} bugünkü yamalarla koşulmamış (sha farklı); yeniden koşun (${kos})` });
  else if (!sonuc.gecti) b.push({ duzey: 'kirmizi', etiket: 'vt', mesaj: `temiz veritabanı denemesi kırmızı (${SONUC_DOSYASI})` });
  if (sonuc.pg !== HEDEF_PG) {
    b.push({ duzey: 'uyari', etiket: 'vt-pg', mesaj: `deneme PostgreSQL ${sonuc.pg === null ? '?' : String(sonuc.pg)} ile koştu; PG${String(HEDEF_PG)} farkı CI'da görülür` });
  }
  return b;
}

export interface PgKurulumu { bin: string; ana: number }

const sayiKlasorleri = (yol: string, oku: (y: string) => string[]): number[] => {
  try {
    return oku(yol).map((a) => /^(\d+)(\.\d+)?$/.exec(a)?.[1]).filter((a): a is string => a !== undefined).map(Number);
  } catch {
    return [];
  }
};

// PostgreSQL ikili klasörü: TMIV2_TESLIM_PG_BIN verildiyse o, yoksa bilinen kurulum yerlerinden en yeni sürüm.
export function pgBinBul(
  ortam: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  oku: (yol: string) => string[] = (y) => readdirSync(y),
  varMi: (yol: string) => boolean = existsSync,
  surumOku: (initdb: string) => string = (y) => execFileSync(y, ['--version'], { encoding: 'utf8' }),
): PgKurulumu | null {
  const exe = platform === 'win32' ? '.exe' : '';
  const surum = (bin: string): number | null => {
    const initdb = join(bin, `initdb${exe}`);
    if (!varMi(initdb)) return null;
    const m = /(\d+)(?:\.\d+)?/.exec(surumOku(initdb));
    return m?.[1] ? Number(m[1]) : null;
  };
  const verilen = ortam['TMIV2_TESLIM_PG_BIN']?.trim();
  if (verilen) {
    const ana = surum(verilen);
    return ana === null ? null : { bin: verilen, ana };
  }
  const kokler = platform === 'win32'
    ? [ortam['ProgramFiles'], ortam['ProgramW6432'], 'C:\\'].filter((k): k is string => Boolean(k)).map((k) => join(k, 'PostgreSQL'))
    : ['/usr/lib/postgresql'];
  const adaylar = kokler.flatMap((k) => sayiKlasorleri(k, oku).map((n) => ({ n, bin: join(k, String(n), 'bin') })));
  if (platform !== 'win32') adaylar.push(...sayiKlasorleri('/usr', (y) => oku(y).map((a) => /^pgsql-(\d+)$/.exec(a)?.[1] ?? '')).map((n) => ({ n, bin: `/usr/pgsql-${String(n)}/bin` })));
  for (const a of adaylar.sort((x, y) => y.n - x.n)) {
    const ana = surum(a.bin);
    if (ana !== null) return { bin: a.bin, ana };
  }
  return null;
}

export interface TestAdimi { ad: string; argv: string[] }

const NODE_TEST = ['node', '--import', './araclar/ortam-yukle-goc.ts', '--import', './araclar/kablolama-yukle.ts', '--test'];

// Değişen dosyalardan koşulacak testler: modül klasörü o modülün testleri (test:modul ile aynı tanım), çekirdek ve
// paylaşılan kendi testleri, araçta değişen dosyanın yanındaki test. Göçler ayrı adımda boş veritabanına uygulanır.
export function testPlani(dosyalar: readonly string[], varMi: (yol: string) => boolean): TestAdimi[] {
  const adimlar: TestAdimi[] = [];
  const moduller = new Set<string>();
  for (const f of dosyalar) {
    const m = /^(?:sunucu\/moduller|istemci\/src\/moduller)\/([a-z][a-z0-9-]*)\//.exec(f);
    if (m?.[1]) moduller.add(m[1]);
  }
  for (const ad of [...moduller].sort()) {
    for (const k of modulTestKomutlari(ad)) {
      if (varMi(k.klasor)) adimlar.push({ ad: `test:modul ${ad} (${k.taraf})`, argv: k.komut === 'npx' ? k.argumanlar : [k.komut, ...k.argumanlar] });
    }
  }
  if (dosyalar.some((f) => f.startsWith('sunucu/cekirdek/'))) adimlar.push({ ad: 'çekirdek testleri', argv: [...NODE_TEST, 'sunucu/cekirdek/**/*.test.ts'] });
  if (dosyalar.some((f) => f.startsWith('paylasilan/'))) adimlar.push({ ad: 'paylaşılan testleri', argv: [...NODE_TEST, 'paylasilan/**/*.test.ts'] });
  const aracTestleri = new Set(dosyalar.filter((f) => /^araclar\/[^/]+\.ts$/.test(f))
    .map((f) => (f.endsWith('.test.ts') ? f : f.replace(/\.ts$/, '.test.ts'))).filter(varMi));
  for (const t of [...aracTestleri].sort()) adimlar.push({ ad: t, argv: [...NODE_TEST, t] });
  return adimlar;
}

const ISTEMCI_YAPILANDIRMASI = 'istemci/vite.config.ts';
// Klona yazılır, depoya girmez: içindeki yollar denemenin kendi makinesinden gelir.
export const VT_ISTEMCI_YAPILANDIRMASI = 'istemci/vite.vt-deneme.config.ts';

// Klonun node_modules'u ana ağaca bağlantıdır; Vite gerçek yola bakar ve kök dışındaki dosyayı (wasm ve çalışan `?url`
// ithalleri) "Denied ID" ile reddeder, testler yalancı kırmızı verir (2358). Sarmalayıcı depodaki yapılandırmayı olduğu gibi alır,
// izinli klasörlere yalnız klonu ve ana ağacın node_modules'unu ekler. Kendi listesini vermek Vite'ın varsayılanını
// (çalışma alanı kökü) kaldırdığından klon da listededir.
export function istemciSarmalayicisi(izinli: readonly string[]): string {
  return [
    "import taban from './vite.config.ts';",
    '',
    `const IZINLI: string[] = ${JSON.stringify(izinli)};`,
    'const sunucu = taban.server ?? {};',
    'export default { ...taban, server: { ...sunucu, fs: { ...sunucu.fs, allow: [...(sunucu.fs?.allow ?? []), ...IZINLI] } } };',
    '',
  ].join('\n');
}

// İstemci testinin argv'sinde depodaki yapılandırma klondaki sarmalayıcıyla değişir; öteki argv olduğu gibi kalır.
export function sarmalayiciyaYonelt(argv: readonly string[]): string[] {
  return argv.map((a, i) => (a === ISTEMCI_YAPILANDIRMASI && argv[i - 1] === '--config' ? VT_ISTEMCI_YAPILANDIRMASI : a));
}

// Deneme süreçleri yalnız bu değerleri görür: CI'daki test ortamıyla aynı (kontrol.yml env). Yazarın TMIV2_ ve PG
// değişkenleri geçmez; klon .env taşımadığı için ortam yükleyicisi de yalnız bunları okur.
export function denemeOrtami(port: number, temel: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const ortam = Object.fromEntries(Object.entries(temel).filter(([ad]) => !/^(TMIV2_|PG)/i.test(ad)));
  return {
    ...ortam,
    TMIV2_ORTAM: 'test',
    TMIV2_PORT: '4100',
    TMIV2_PG_HOST: '127.0.0.1',
    TMIV2_PG_PORT: String(port),
    TMIV2_PG_USER: 'tmiv2_uygulama',
    TMIV2_PG_PASSWORD: 'tmiv2-uygulama',
    TMIV2_PG_GOC_USER: 'tmiv2_goc',
    TMIV2_PG_GOC_PASSWORD: 'tmiv2-goc',
    TMIV2_PG_DATABASE: 'tmiv2',
    TMIV2_PG_TEST_DATABASE: 'tmiv2_test',
    TMIV2_PG_BAGLANTI_SURE_MS: '5000',
    TMIV2_PG_SORGU_SURE_MS: '10000',
    TMIV2_PG_OKUMA_SURE_MS: '5000',
    TMIV2_PG_HAVUZ: '10',
    TMIV2_PG_KILIT_SURE_MS: '5000',
    TMIV2_PG_BOS_TX_SURE_MS: '30000',
  };
}

function bosPort(): Promise<number> {
  return new Promise((coz, red) => {
    const s = createServer();
    s.once('error', red);
    s.listen(0, '127.0.0.1', () => {
      const adres = s.address();
      s.close(() => (typeof adres === 'object' && adres ? coz(adres.port) : red(new Error('boş port alınamadı'))));
    });
  });
}

const sonSatirlar = (metin: string, n = 6): string[] => metin.split('\n').filter((s) => s.trim() !== '').slice(-n);

export interface VtGirdisi {
  kok: string;
  klasor: string;
  dal: string;
  yamalar: { ad: string; sha256: string; dosyalar: string[] }[];
}

// Root ile koşan konteynerde initdb ve postgres root'u reddeder: küme postgres kullanıcısıyla açılır.
function kullaniciAyari(): { uid: number; gid: number } | null {
  if (process.platform === 'win32' || process.getuid?.() !== 0) return null;
  try {
    return { uid: Number(execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' })), gid: Number(execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' })) };
  } catch {
    throw new Error('root ile koşuluyor ve postgres kullanıcısı yok; denemeyi root olmayan kullanıcıyla koşun');
  }
}

export async function vtDenemesi(g: VtGirdisi): Promise<{ sonuc: VtSonuc; satirlar: string[] }> {
  const satirlar: string[] = [];
  const yaz = (s: string): void => { satirlar.push(s); console.log(s); };
  const shalar = g.yamalar.map((y) => y.sha256);
  const pg = pgBinBul();
  if (!pg) {
    yaz('KIRMIZI PostgreSQL ikilileri bulunamadı (initdb). TMIV2_TESLIM_PG_BIN ile bin klasörünü verin.');
    return { sonuc: { pg: null, yamalar: shalar, gecti: false }, satirlar };
  }
  yaz(`PostgreSQL ${String(pg.ana)} (${pg.bin})${pg.ana === HEDEF_PG ? '' : `; hedef ${String(HEDEF_PG)} değil, uyarı`}`);
  const exe = process.platform === 'win32' ? '.exe' : '';
  const pgAraci = (ad: string): string => join(pg.bin, `${ad}${exe}`);
  const kullanici = kullaniciAyari();
  const pgKos = (ad: string, a: string[]): { kod: number; cikti: string } => {
    const [komut, argv] = kullanici ? ['runuser', ['-u', 'postgres', '--', pgAraci(ad), ...a]] : [pgAraci(ad), a];
    const r = spawnSync(komut, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { kod: r.status ?? 1, cikti: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}` };
  };

  const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-vt-'));
  const agac = join(gecici, 'agac');
  const kume = join(gecici, 'pg');
  let kumeAcik = false;
  let gecti = true;
  try {
    // Klon, git worktree değildir: ana ağacın .env'i bulunmaz ve deneme yazarın veritabanına bağlanamaz.
    const tabanSha = execFileSync('git', ['rev-parse', `${g.dal}^{commit}`], { cwd: g.kok, encoding: 'utf8' }).trim();
    execFileSync('git', ['clone', '-q', '--shared', '--no-checkout', g.kok, agac], { stdio: 'pipe' });
    execFileSync('git', ['checkout', '-q', '--detach', tabanSha], { cwd: agac, stdio: 'pipe' });
    const am = spawnSync('git', ['-c', 'user.name=teslim', '-c', 'user.email=teslim@yerel', 'am', '-q', '-3', ...g.yamalar.map((y) => join(g.klasor, y.ad))], { cwd: agac, encoding: 'utf8' });
    if (am.status !== 0) {
      yaz(`KIRMIZI yama ${g.dal} (${tabanSha.slice(0, 7)}) üstüne uygulanmadı: ${sonSatirlar(`${am.stdout}${am.stderr}`, 3).join(' | ')}`);
      return { sonuc: { pg: pg.ana, yamalar: shalar, gecti: false }, satirlar };
    }
    yaz(`Yama ${g.dal} (${tabanSha.slice(0, 7)}) üstüne uygulandı.`);
    const dosyalar = [...new Set(g.yamalar.flatMap((y) => y.dosyalar))];
    if (dosyalar.some((f) => /^package(-lock)?\.json$/.test(f))) yaz('UYARI paket dosyası değişti; deneme ana ağacın node_modules klasörüyle koştu.');
    symlinkSync(join(g.kok, 'node_modules'), join(agac, 'node_modules'), 'junction');
    writeFileSync(join(agac, VT_ISTEMCI_YAPILANDIRMASI), istemciSarmalayicisi([agac, realpathSync(join(g.kok, 'node_modules'))]));

    if (kullanici) chmodSync(gecici, 0o755);
    mkdirSync(kume);
    if (kullanici) chownSync(kume, kullanici.uid, kullanici.gid);
    const veri = join(kume, 'veri');
    const init = pgKos('initdb', ['-D', veri, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-instructions']);
    if (init.kod !== 0) throw new Error(`initdb: ${sonSatirlar(init.cikti, 3).join(' | ')}`);
    const port = await bosPort();
    // CI'daki atılacak test sunucusunun ayarları (kontrol.yml): diske yazma beklenmez.
    const secenek = [`-p ${String(port)}`, '-c listen_addresses=127.0.0.1', '-c fsync=off', '-c synchronous_commit=off', '-c full_page_writes=off', "-c max_wal_size=4GB"];
    if (process.platform !== 'win32') secenek.push(`-k ${kume}`);
    const bas = pgKos('pg_ctl', ['-D', veri, '-l', join(kume, 'sunucu.log'), '-w', '-t', '60', '-o', secenek.join(' '), 'start']);
    if (bas.kod !== 0) throw new Error(`pg_ctl start: ${sonSatirlar(bas.cikti, 3).join(' | ')}`);
    kumeAcik = true;
    const ortam = denemeOrtami(port);
    const psql = (vt: string, a: string[]): void => {
      const r = spawnSync(pgAraci('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', vt, ...a], { encoding: 'utf8', env: ortam });
      if (r.status !== 0) throw new Error(`psql: ${sonSatirlar(`${r.stdout ?? ''}${r.stderr ?? ''}`, 3).join(' | ')}`);
    };
    // CI sunucu test işindeki gibi yalnız test veritabanı vardır; asıl veritabanına dayanan test burada düşer.
    psql('postgres', ['-c', 'CREATE DATABASE tmiv2_test']);
    psql('tmiv2_test', ['-v', 'goc_parola=tmiv2-goc', '-v', 'uygulama_parola=tmiv2-uygulama', '-f', join(agac, 'araclar', 'vt', 'kurulum.sql')]);
    yaz(`Temiz küme açıldı (port ${String(port)}, yalnız tmiv2_test).`);

    const kos = (ad: string, argv: string[]): void => {
      const [komut = '', ...a] = kabuksuzArgv(sarmalayiciyaYonelt(argv), agac);
      const r = spawnSync(komut, a, { cwd: agac, env: ortam, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
      const cikti = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`;
      // Node eşleşmeyen deseni hata saymaz, sıfır testle yeşil biter (test-modul.ts ile aynı gerekçe).
      const bos = argv.includes('--test') && /^\S*\s*tests 0$/m.test(cikti);
      const tamam = r.status === 0 && !bos;
      gecti &&= tamam;
      yaz(`${tamam ? 'GEÇTİ  ' : 'KIRMIZI'} ${ad}${bos ? ' (desen hiçbir test bulmadı)' : ''}`);
      for (const s of sonSatirlar(cikti)) yaz(`    ${s}`);
    };
    const plan = testPlani(dosyalar, (y) => existsSync(join(agac, y)));
    if (plan.length === 0) yaz('Değişen yerde koşulacak test yok; yalnız göç denemesi.');
    for (const adim of plan) kos(adim.ad, adim.argv);

    psql('postgres', ['-c', 'CREATE DATABASE tmiv2']);
    psql('tmiv2', ['-v', 'goc_parola=tmiv2-goc', '-v', 'uygulama_parola=tmiv2-uygulama', '-f', join(agac, 'araclar', 'vt', 'kurulum.sql')]);
    kos('boş veritabanına bütün göçler (npm run goc)', ['node', '--import', './araclar/ortam-yukle-goc.ts', 'sunucu/cekirdek/goc-calistir.ts']);
  } catch (hata) {
    gecti = false;
    yaz(`KIRMIZI deneme kurulamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  } finally {
    if (kumeAcik) pgKos('pg_ctl', ['-D', join(kume, 'veri'), '-m', 'immediate', '-w', 'stop']);
    rmSync(gecici, { recursive: true, force: true });
  }
  return { sonuc: { pg: pg.ana, yamalar: shalar, gecti }, satirlar };
}

export function sonucuKaydet(klasor: string, sonuc: VtSonuc, satirlar: readonly string[]): void {
  writeFileSync(join(klasor, SONUC_DOSYASI), sonucMetni(sonuc, ['```', ...satirlar, '```']));
}

export function sonucuYukle(klasor: string): VtSonuc | null {
  const yol = join(klasor, SONUC_DOSYASI);
  return existsSync(yol) ? sonucOku(readFileSync(yol, 'utf8')) : null;
}
