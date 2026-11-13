import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
  // Teslim başka teslimin üstüne kurulduysa önce uygulanan teslimlerin yamaları (3046 a); yoksa boş ya da yok.
  dayanak?: string[];
  // Küme ve göç adımı atlandıysa true (3221 a); PostgreSQL sürümü o zaman bilinmez.
  kisa?: boolean;
}

export interface VtBulgu { duzey: 'kirmizi' | 'uyari'; etiket: string; mesaj: string }

export function sonucMetni(s: VtSonuc, ayrinti: readonly string[]): string {
  return [
    '<!-- vt-sonuc',
    `pg: ${s.pg === null ? '?' : String(s.pg)}`,
    `yamalar: ${s.yamalar.join(', ')}`,
    ...(s.dayanak?.length ? [`dayanak: ${s.dayanak.join(', ')}`] : []),
    ...(s.kisa ? ['kisa: evet'] : []),
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
  const dayanak = alan('dayanak').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    pg: Number.isInteger(pg) ? pg : null,
    yamalar: alan('yamalar').split(',').map((s) => s.trim()).filter(Boolean),
    gecti: alan('sonuc') === 'gecti',
    ...(dayanak.length ? { dayanak } : {}),
    ...(alan('kisa') === 'evet' ? { kisa: true } : {}),
  };
}

// Yalnız istemci kaynağı değişen teslimde veritabanına dokunan bir şey yoktur: küme ve göç adımı atlanır, testler koşar (3221 a).
// İzin listesidir: tanınmayan her yol (ekran testleri, sunucu, paylaşılan, göç, yapılandırma, paket, araç) tam denemeye düşer.
// Yeniden adlandırmada yama eski ve yeni yolu birlikte verir; ikisi de bu klasörde olmalıdır.
export const KISA_YOL_KOKU = 'istemci/src/';
export function veritabanisizMi(dosyalar: readonly string[]): boolean {
  return dosyalar.length > 0 && dosyalar.every((f) => f.startsWith(KISA_YOL_KOKU) && !f.includes('..'));
}

// Kısa yol, modülün sunucu testlerini yerelde koşmaz. Bazı sunucu testleri istemci kaynağını okur (ör. iki tarafın aynı
// kuralı taşıdığını karşılaştıran testler); o modülde istemci değişikliği sunucu testini kırabilir, bu yüzden tam deneme koşar.
// Dosya değil modül düzeyinde bakılır: test hangi dosyayı okursa okusun modülün bütün istemci değişiklikleri tam denenir.
export function kisaYolKarari(dosyalar: readonly string[], bakanTestler: (modul: string) => readonly string[]): { kisa: boolean; neden: string | null } {
  if (!veritabanisizMi(dosyalar)) return { kisa: false, neden: null };
  const moduller = new Set<string>();
  for (const f of dosyalar) {
    const m = /^istemci\/src\/moduller\/([a-z][a-z0-9-]*)\//.exec(f);
    // Modül dışı istemci dosyasının (ortak, kabuk) test planı boştur: kısa yol hiç test koşmadan yeşil derdi.
    if (!m?.[1]) return { kisa: false, neden: `modül dışı istemci dosyası için koşulacak modül testi yok (${f})` };
    moduller.add(m[1]);
  }
  for (const ad of [...moduller].sort()) {
    const [ilk] = bakanTestler(ad);
    if (ilk) return { kisa: false, neden: `${ad} modülünün sunucu testi istemci kaynağına bakıyor (${ilk})` };
  }
  return { kisa: true, neden: null };
}

// Modülün, metninde istemci kaynak yolu geçen sunucu testleri; ana dalın o anki hâlinden okunur (kısa yol adayı yama sunucuya dokunmaz).
// Git okuyamazsa boş dönmez: bilinmeyen durum tam denemeye düşer.
export function istemciyeBakanSunucuTestleri(kok: string, dal: string, modul: string): string[] {
  const r = spawnSync('git', ['grep', '-l', '-F', '-e', KISA_YOL_KOKU.replace(/\/$/, ''), dal, '--', `sunucu/moduller/${modul}/`], { cwd: kok, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status === 1) return [];
  if (r.status !== 0) return [`git grep okunamadı: ${(r.stderr ?? '').trim().split('\n')[0] ?? ''}`];
  return (r.stdout ?? '').split('\n').map((s) => s.slice(dal.length + 1)).filter((s) => /\.test\.tsx?$/.test(s)).sort();
}

// Yazar ortamında PostgreSQL 18 bulunmayabilir (2340: konteynerde kurulamıyor). Temiz küme zorunludur, sürüm farkı
// uyarıdır; PG18 denetimi CI'daki Linux işindedir.
export function vtDenetle(sonuc: VtSonuc | null, yamaShalari: readonly string[], dayanakShalari: readonly string[] = []): VtBulgu[] {
  const kos = 'npm run teslim-denetle -- --vt <klasör>';
  if (!sonuc) return [{ duzey: 'kirmizi', etiket: 'vt', mesaj: `${SONUC_DOSYASI} yok; temiz veritabanı denemesi koşulmamış (${kos})` }];
  const b: VtBulgu[] = [];
  const farkli = yamaShalari.length !== sonuc.yamalar.length || yamaShalari.some((s) => !sonuc.yamalar.includes(s));
  if (farkli) b.push({ duzey: 'kirmizi', etiket: 'vt', mesaj: `${SONUC_DOSYASI} bugünkü yamalarla koşulmamış (sha farklı); yeniden koşun (${kos})` });
  else if (!sonuc.gecti) b.push({ duzey: 'kirmizi', etiket: 'vt', mesaj: `temiz veritabanı denemesi kırmızı (${SONUC_DOSYASI})` });
  // Dayanılan teslim yeniden yazıldıysa deneme eski hâliyle koşmuştur (3046 a).
  const eski = sonuc.dayanak ?? [];
  if (eski.length !== dayanakShalari.length || dayanakShalari.some((s) => !eski.includes(s))) {
    b.push({ duzey: 'kirmizi', etiket: 'vt-dayanak', mesaj: `${SONUC_DOSYASI} dayanılan teslimin bugünkü yamalarıyla koşmamış; yeniden koşun (${kos})` });
  }
  if (!sonuc.kisa && sonuc.pg !== HEDEF_PG) {
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
// Kısa yolda modülün sunucu testleri koşmaz: veritabanı ister. İstemci kaynağına bakan sunucu testi olan modül kısa yola girmez (kisaYolKarari; 3221 a).
export function testPlani(dosyalar: readonly string[], varMi: (yol: string) => boolean, yalnizIstemci = false): TestAdimi[] {
  const adimlar: TestAdimi[] = [];
  const moduller = new Set<string>();
  for (const f of dosyalar) {
    const m = /^(?:sunucu\/moduller|istemci\/src\/moduller)\/([a-z][a-z0-9-]*)\//.exec(f);
    if (m?.[1]) moduller.add(m[1]);
  }
  for (const ad of [...moduller].sort()) {
    for (const k of modulTestKomutlari(ad)) {
      if (varMi(k.klasor) && !(yalnizIstemci && k.taraf === 'sunucu')) adimlar.push({ ad: `test:modul ${ad} (${k.taraf})`, argv: k.komut === 'npx' ? k.argumanlar : [k.komut, ...k.argumanlar] });
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

// Birleştirici yamaları commit olarak uygular (git am); ana dal sonradan aynı satırları değiştirse de yamanın patch-id'si
// aynı kalır. Ters yönde uygulama denemesi bu durumda "birleşmemiş" der, patch-id demez.
export function yamaKimlikleri(yama: string, cwd: string): string[] {
  const r = spawnSync('git', ['patch-id', '--stable'], { cwd, input: yama, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return (r.stdout ?? '').split('\n').map((s) => s.split(' ')[0] ?? '').filter(Boolean);
}

// Son commit'lerin patch-id'leri; birleşen dayanak teslim bu pencerenin içindedir.
// Fark metni yüzlerce MB olabilir; dizgeye alınmaz, git log'dan git patch-id'ye akıtılır.
export function anaDalYamaKimlikleri(cwd: string, taban: string, enCok = 2000): Promise<Set<string>> {
  return new Promise((coz, reddet) => {
    const log = spawn('git', ['log', '-p', '--no-merges', '-n', String(enCok), taban], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const pid = spawn('git', ['patch-id', '--stable'], { cwd, stdio: ['pipe', 'pipe', 'ignore'] });
    log.stdout.pipe(pid.stdin);
    const kume = new Set<string>();
    let artik = '';
    pid.stdout.setEncoding('utf8');
    pid.stdout.on('data', (parca: string) => {
      const satirlar = (artik + parca).split('\n');
      artik = satirlar.pop() ?? '';
      for (const s of satirlar) if (s) kume.add(s.split(' ')[0] ?? '');
    });
    log.on('error', reddet);
    pid.on('error', reddet);
    pid.on('close', (kod) => {
      if (artik) kume.add(artik.split(' ')[0] ?? '');
      if (kod === 0) coz(kume);
      else reddet(new Error(`git patch-id çıkış kodu ${String(kod)}`));
    });
  });
}

// Yama dosyası başına patch-id listesi: hepsi ana dalda ise birleşmiş, hiçbiri değilse uygulanır, kısmen ise karar verilmez.
export function dayanakDurumu(dosyalar: readonly (readonly string[])[], ana: ReadonlySet<string>): 'birlesmis' | 'birlesmemis' | 'kismen' {
  const var_ = dosyalar.map((k) => k.length > 0 && k.every((x) => ana.has(x)));
  if (var_.length > 0 && var_.every(Boolean)) return 'birlesmis';
  return var_.some(Boolean) ? 'kismen' : 'birlesmemis';
}

export interface VtYamasi { ad: string; sha256: string; dosyalar: string[] }
export interface VtGirdisi {
  kok: string;
  klasor: string;
  dal: string;
  yamalar: VtYamasi[];
  // Teslimin dayandığı, henüz ana dalda olmayabilecek teslimler; en alttaki önce (3046 a).
  dayanaklar?: { ad: string; klasor: string; yamalar: VtYamasi[] }[];
}

// Yerel ayarsız küme kabuğun LANG'ından C olur; C'de lower('Ç') = 'Ç' kalır ve Türkçe harf tekilliği CI'dan (en_US.utf8) farklı
// davranır (2457 a). C.UTF-8 sıralamayı C ile aynı bırakır, yalnız harf katlamayı açar. Windows'ta C.UTF-8 yoktur.
export function initdbArgumanlari(veri: string, platform: NodeJS.Platform = process.platform): string[] {
  const temel = ['-D', veri, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-instructions'];
  return platform === 'win32' ? temel : [...temel, '--locale=C.UTF-8'];
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

// Kısa yol kararının girdisi: teslimin ve dayandığı bütün teslimlerin dosyaları. Dayanılan teslim ana dalda olsa da sayılır;
// yanlış yöne düşen tam denemedir.
export function kararDosyalari(g: Pick<VtGirdisi, 'yamalar' | 'dayanaklar'>): string[] {
  return [...new Set([...(g.dayanaklar ?? []).flatMap((d) => d.yamalar.flatMap((y) => y.dosyalar)), ...g.yamalar.flatMap((y) => y.dosyalar)])];
}

export async function vtDenemesi(g: VtGirdisi): Promise<{ sonuc: VtSonuc; satirlar: string[] }> {
  const satirlar: string[] = [];
  const yaz = (s: string): void => { satirlar.push(s); console.log(s); };
  const shalar = g.yamalar.map((y) => y.sha256);
  const dayanakShalari = (g.dayanaklar ?? []).flatMap((d) => d.yamalar.map((y) => y.sha256));
  const karar = kisaYolKarari(kararDosyalari(g), (modul) => istemciyeBakanSunucuTestleri(g.kok, g.dal, modul));
  const kisa = karar.kisa;
  if (karar.neden) yaz(`Tam deneme: ${karar.neden}.`);
  const pg = kisa ? { ana: null, bin: '' } : pgBinBul();
  if (!pg) {
    yaz('KIRMIZI PostgreSQL ikilileri bulunamadı (initdb). TMIV2_TESLIM_PG_BIN ile bin klasörünü verin.');
    return { sonuc: { pg: null, yamalar: shalar, gecti: false, dayanak: dayanakShalari }, satirlar };
  }
  yaz(kisa
    ? `--vt atlandı: yalnız ${KISA_YOL_KOKU.replace(/\/$/, '')} (küme, göç denemesi ve sunucu testleri koşmaz, değişen modülün istemci testleri koşar; 3221 a)`
    : `PostgreSQL ${String(pg.ana)} (${pg.bin})${pg.ana === HEDEF_PG ? '' : `; hedef ${String(HEDEF_PG)} değil, uyarı`}`);
  const exe = process.platform === 'win32' ? '.exe' : '';
  const pgAraci = (ad: string): string => join(pg.bin, `${ad}${exe}`);
  const kullanici = kisa ? null : kullaniciAyari();
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
    const uygula = (yollar: string[]) => spawnSync('git', ['-c', 'user.name=teslim', '-c', 'user.email=teslim@yerel', 'am', '-q', '-3', ...yollar], { cwd: agac, encoding: 'utf8' });
    const dayanakDosyalari: string[] = [];
    let anaKume: Set<string> | null = null;
    for (const d of g.dayanaklar ?? []) {
      const yollar = d.yamalar.map((y) => join(d.klasor, y.ad));
      anaKume ??= await anaDalYamaKimlikleri(agac, tabanSha);
      const durum = dayanakDurumu(yollar.map((y) => yamaKimlikleri(readFileSync(y, 'utf8'), agac)), anaKume);
      if (durum === 'birlesmis') { yaz(`Dayanılan teslim ${d.ad} ${g.dal} içinde (patch-id); yeniden uygulanmadı.`); continue; }
      if (durum === 'kismen') {
        yaz(`KIRMIZI dayanılan teslim ${d.ad} ${g.dal} içinde kısmen var; birleşen yamalar dayanak klasöründen çıkarılmalı.`);
        return { sonuc: { pg: pg.ana, yamalar: shalar, gecti: false, dayanak: dayanakShalari }, satirlar };
      }
      const r = uygula(yollar);
      if (r.status !== 0) {
        yaz(`KIRMIZI dayanılan teslim ${d.ad} ${g.dal} (${tabanSha.slice(0, 7)}) üstüne uygulanmadı: ${sonSatirlar(`${r.stdout}${r.stderr}`, 3).join(' | ')}`);
        return { sonuc: { pg: pg.ana, yamalar: shalar, gecti: false, dayanak: dayanakShalari }, satirlar };
      }
      dayanakDosyalari.push(...d.yamalar.flatMap((y) => y.dosyalar));
      yaz(`Dayanılan teslim ${d.ad} uygulandı (${String(d.yamalar.length)} yama).`);
    }
    const am = uygula(g.yamalar.map((y) => join(g.klasor, y.ad)));
    if (am.status !== 0) {
      yaz(`KIRMIZI yama ${g.dal} (${tabanSha.slice(0, 7)}) üstüne uygulanmadı: ${sonSatirlar(`${am.stdout}${am.stderr}`, 3).join(' | ')}`);
      return { sonuc: { pg: pg.ana, yamalar: shalar, gecti: false, dayanak: dayanakShalari }, satirlar };
    }
    yaz(`Yama ${g.dal} (${tabanSha.slice(0, 7)}) üstüne uygulandı.`);
    // Birleşik ağaç denenir: dayanılan teslimin değişen yerlerinin testleri de koşar.
    const dosyalar = [...new Set([...dayanakDosyalari, ...g.yamalar.flatMap((y) => y.dosyalar)])];
    if (dosyalar.some((f) => /^package(-lock)?\.json$/.test(f))) yaz('UYARI paket dosyası değişti; deneme ana ağacın node_modules klasörüyle koştu.');
    symlinkSync(join(g.kok, 'node_modules'), join(agac, 'node_modules'), 'junction');
    writeFileSync(join(agac, VT_ISTEMCI_YAPILANDIRMASI), istemciSarmalayicisi([agac, realpathSync(join(g.kok, 'node_modules'))]));

    // Kısa yolda dinleyen veritabanı yoktur: port 0'a bağlanmaya çalışan test düşer, yazarın veritabanına gitmez.
    let ortam = denemeOrtami(0);
    let psql: ((vt: string, a: string[]) => void) | null = null;
    if (!kisa) {
      if (kullanici) chmodSync(gecici, 0o755);
      mkdirSync(kume);
      if (kullanici) chownSync(kume, kullanici.uid, kullanici.gid);
      const veri = join(kume, 'veri');
      const init = pgKos('initdb', initdbArgumanlari(veri));
      if (init.kod !== 0) throw new Error(`initdb: ${sonSatirlar(init.cikti, 3).join(' | ')}`);
      const port = await bosPort();
      // CI'daki atılacak test sunucusunun ayarları (kontrol.yml): diske yazma beklenmez.
      const secenek = [`-p ${String(port)}`, '-c listen_addresses=127.0.0.1', '-c fsync=off', '-c synchronous_commit=off', '-c full_page_writes=off', "-c max_wal_size=4GB"];
      if (process.platform !== 'win32') secenek.push(`-k ${kume}`);
      const bas = pgKos('pg_ctl', ['-D', veri, '-l', join(kume, 'sunucu.log'), '-w', '-t', '60', '-o', secenek.join(' '), 'start']);
      if (bas.kod !== 0) throw new Error(`pg_ctl start: ${sonSatirlar(bas.cikti, 3).join(' | ')}`);
      kumeAcik = true;
      ortam = denemeOrtami(port);
      psql = (vt: string, a: string[]): void => {
        const r = spawnSync(pgAraci('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', vt, ...a], { encoding: 'utf8', env: ortam });
        if (r.status !== 0) throw new Error(`psql: ${sonSatirlar(`${r.stdout ?? ''}${r.stderr ?? ''}`, 3).join(' | ')}`);
      };
      // CI sunucu test işindeki gibi yalnız test veritabanı vardır; asıl veritabanına dayanan test burada düşer.
      psql('postgres', ['-c', 'CREATE DATABASE tmiv2_test']);
      psql('tmiv2_test', ['-v', 'goc_parola=tmiv2-goc', '-v', 'uygulama_parola=tmiv2-uygulama', '-f', join(agac, 'araclar', 'vt', 'kurulum.sql')]);
      yaz(`Temiz küme açıldı (port ${String(port)}, yalnız tmiv2_test).`);
    }

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
    const plan = testPlani(dosyalar, (y) => existsSync(join(agac, y)), kisa);
    if (plan.length === 0) yaz(kisa ? 'Değişen modülde koşulacak istemci testi yok (modül klasörü kalmamış).' : 'Değişen yerde koşulacak test yok; yalnız göç denemesi.');
    for (const adim of plan) kos(adim.ad, adim.argv);

    if (psql) {
      psql('postgres', ['-c', 'CREATE DATABASE tmiv2']);
      psql('tmiv2', ['-v', 'goc_parola=tmiv2-goc', '-v', 'uygulama_parola=tmiv2-uygulama', '-f', join(agac, 'araclar', 'vt', 'kurulum.sql')]);
      kos('boş veritabanına bütün göçler (npm run goc)', ['node', '--import', './araclar/ortam-yukle-goc.ts', 'sunucu/cekirdek/goc-calistir.ts']);
    }
  } catch (hata) {
    gecti = false;
    yaz(`KIRMIZI deneme kurulamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  } finally {
    if (kumeAcik) pgKos('pg_ctl', ['-D', join(kume, 'veri'), '-m', 'immediate', '-w', 'stop']);
    rmSync(gecici, { recursive: true, force: true });
  }
  return { sonuc: { pg: pg.ana, yamalar: shalar, gecti, ...(dayanakShalari.length ? { dayanak: dayanakShalari } : {}), ...(kisa ? { kisa: true } : {}) }, satirlar };
}

export function sonucuKaydet(klasor: string, sonuc: VtSonuc, satirlar: readonly string[]): void {
  writeFileSync(join(klasor, SONUC_DOSYASI), sonucMetni(sonuc, ['```', ...satirlar, '```']));
}

export function sonucuYukle(klasor: string): VtSonuc | null {
  const yol = join(klasor, SONUC_DOSYASI);
  return existsSync(yol) ? sonucOku(readFileSync(yol, 'utf8')) : null;
}
