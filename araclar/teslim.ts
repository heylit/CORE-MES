import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anaAgacKoku } from './ortam.ts';
import { binYolu, kabuksuzArgv, npmCliBul } from './paket-bin.ts';
import type { BinCoz } from './paket-bin.ts';
import { git, VARSAYILAN_TABAN } from './sinir-denetimi.ts';
import {
  belgeOzeti, bosTestDosyalari, denetimiDegerlendir, istemciKlasoru, kirmiziMi, kosmayanDenetim, kuralTestleriniAyir, siniflandir, sonSatirlar, sonucSayfasi,
  sarmalayiciyiSoy, statikDenetimler, sunucuKlasoru, TUR_ADLARI, uygulamaPlani,
} from './teslim-incele.ts';
import type { DenetimKimligi, DenetimSonucu, Depo, TeslimSonucu, Uygulama } from './teslim-incele.ts';
import { modulTestKomutlari } from './test-modul.ts';
import { zipOku, ZipReddi } from './zip-oku.ts';

// Dışarıda yazılmış modülün teslim arşivini ana dala dokunmadan dener: arşivi sınıflar, izinli dosyaları
// geçici bir çalışma ağacına koyar, denetimleri koşar ve tek sayfa sonuç yazar.

export const KULLANIM = [
  'Kullanım: npm run teslim -- --zip <yol> --modul <ad> [--kart <no>] [--yalniz-sinifla] [--tam] [--kit <commit>] [--yama <dizin>]',
  '          npm run teslim -- --temizle <ad>',
].join('\n');

export interface Secenekler {
  zip: string;
  modul: string;
  kart: number | null;
  // Ağaç açmaz, teslim kodunu çalıştırmaz: yalnız sınıflama ve statik denetim.
  yalnizSinifla: boolean;
  // Sonda `CI=true npm run kontrol` da koşar.
  tam: boolean;
  // Yazarın elindeki kopyanın alındığı commit: taban ilerlediyse yazarın dokunmadığı dosya kilit ihlali sayılmasın.
  kit: string | null;
  // Şefin hazırladığı dosyalar; teslimin üstüne yazılır, commit'e girmez.
  yama: string | null;
}

export type Komut = { kip: 'dene'; secenek: Secenekler } | { kip: 'temizle'; modul: string };

const MODUL_ADI = /^[a-z][a-z0-9-]*$/;
const DEGERLI = ['--zip', '--modul', '--kart', '--kit', '--yama', '--temizle'];
const DEGERSIZ = ['--tam', '--yalniz-sinifla'];

export function argumanOku(argumanlar: readonly string[]): Komut {
  const degerler = new Map<string, string>();
  const bayraklar = new Set<string>();
  for (let i = 0; i < argumanlar.length; i += 1) {
    const ad = argumanlar[i] ?? '';
    if (DEGERSIZ.includes(ad)) bayraklar.add(ad);
    else if (DEGERLI.includes(ad) && !degerler.has(ad)) {
      const deger = argumanlar[i + 1];
      if (deger === undefined || deger.startsWith('--')) throw new Error(KULLANIM);
      degerler.set(ad, deger);
      i += 1;
    } else throw new Error(KULLANIM);
  }
  const temizle = degerler.get('--temizle');
  if (temizle !== undefined) {
    if (degerler.size > 1 || bayraklar.size > 0 || !MODUL_ADI.test(temizle)) throw new Error(KULLANIM);
    return { kip: 'temizle', modul: temizle };
  }
  const zip = degerler.get('--zip');
  const modul = degerler.get('--modul');
  const kart = degerler.get('--kart');
  const kit = degerler.get('--kit') ?? null;
  const yama = degerler.get('--yama') ?? null;
  const yalnizSinifla = bayraklar.has('--yalniz-sinifla');
  if (zip === undefined || modul === undefined || !MODUL_ADI.test(modul)) throw new Error(KULLANIM);
  if (kart !== undefined && !/^[1-9]\d*$/.test(kart)) throw new Error(KULLANIM);
  if (kit !== null && !/^[0-9a-f]{7,40}$/.test(kit)) throw new Error(KULLANIM);
  // Kod çalıştırmayan kipte koşu isteyen seçeneğin sessizce yok sayılması yanlış güven verir.
  if (yalnizSinifla && (bayraklar.has('--tam') || yama !== null)) throw new Error(KULLANIM);
  return { kip: 'dene', secenek: { zip, modul, kart: kart === undefined ? null : Number(kart), yalnizSinifla, tam: bayraklar.has('--tam'), kit, yama } };
}

// Teslimin testleri bu makinede çalışan yabancı koddur. Alt süreç yalnız çalışması için gereken sistem
// değişkenlerini ve uygulamanın kendi ayarlarını görür; oturumdaki belirteç ve parolalar (GitHub, npm, PG*) geçmez.
const SISTEM_DEGISKENLERI = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'LANG', 'LC_ALL', 'TZ', 'CI',
]);

export function suzulmusOrtam(kaynak: NodeJS.ProcessEnv): Record<string, string> {
  const sonuc: Record<string, string> = {};
  for (const [ad, deger] of Object.entries(kaynak)) {
    // Windows'ta değişken adı harf ayırmaz (`Path`).
    if (deger !== undefined && (SISTEM_DEGISKENLERI.has(ad.toUpperCase()) || ad.startsWith('TMIV2_'))) sonuc[ad] = deger;
  }
  return sonuc;
}

export interface KosuSonucu {
  // null: süre aşımıyla kesildi.
  kod: number | null;
  cikti: string;
  sureMs: number;
}

export interface KosuSecenegi {
  ortam?: Record<string, string>;
  sureMs?: number;
}

// Komut, kabuk metni değil argüman dizisidir: ilk öğe çalıştırılır, kalanı ona olduğu gibi verilir.
export type Kosucu = (argv: readonly string[], klasor: string, secenek?: KosuSecenegi) => Promise<KosuSonucu>;

const DENETIM_SURESI_MS = 20 * 60_000;

// Kabuk kullanılmaz: argümanlar yorumlanmadan sürece geçer, teslimden gelen hiçbir ad komut olarak okunamaz.
// Windows'ta `npm` ve `npx` kabuk betiği olduğundan çağrılar `node <betik>` biçimine çevrilmiş gelir.
export const surecKos: Kosucu = (argv, klasor, secenek = {}) =>
  new Promise((coz) => {
    const baslangic = Date.now();
    const [komut = '', ...argumanlar] = argv;
    const surec = spawn(komut, argumanlar, {
      cwd: klasor,
      shell: false,
      env: { ...suzulmusOrtam(process.env), NO_COLOR: '1', FORCE_COLOR: '0', ...secenek.ortam },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Süre aşımında yalnız ilk süreç değil altındakiler de kapatılabilsin diye kendi grubunda açılır.
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    let cikti = '';
    let kesildi = false;
    let bitti = false;
    surec.stdout.on('data', (parca: Buffer) => { cikti += parca.toString('utf8'); });
    surec.stderr.on('data', (parca: Buffer) => { cikti += parca.toString('utf8'); });
    const zamanlayici = setTimeout(() => {
      kesildi = true;
      if (surec.pid === undefined) return;
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(surec.pid), '/T', '/F'], { stdio: 'ignore' });
      else {
        try { process.kill(-surec.pid, 'SIGKILL'); } catch { /* süreç çoktan bitmiş */ }
      }
    }, secenek.sureMs ?? DENETIM_SURESI_MS);
    const bitir = (kod: number | null): void => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayici);
      coz({ kod: kesildi ? null : kod ?? 1, cikti, sureMs: Date.now() - baslangic });
    };
    surec.on('error', (hata) => { cikti += `Komut başlatılamadı: ${hata.message}\n`; bitir(1); });
    surec.on('close', bitir);
  });

type Betikler = Record<string, string>;

// `package.json` betiğini kabuksuz koşulabilir parçalara ayırır: `a && b` iki komuttur, `npm run x` açılır.
// Birleşik betik ilk kırmızıda durup öbür yarıyı gizler; parçalar ayrı koşar. Tanım tek yerde kalır:
// betik burada çözülemeyecek bir biçime dönerse denetim sessizce eskisini koşmaz, hata verir.
export function betigiAyir(betikler: Betikler, ad: string, derinlik = 0): string[][] {
  const satir = betikler[ad];
  if (satir === undefined) throw new Error(`package.json içinde "${ad}" betiği yok`);
  if (derinlik > 5) throw new Error(`"${ad}" betiği kendini çağırıyor`);
  const komutlar: string[][] = [];
  for (const parca of satir.split('&&').map((p) => p.trim())) {
    if (parca === '' || /[|;<>`$&()'\r\n]|^\w+=/.test(parca)) throw new Error(`"${ad}" betiği kabuksuz koşulamıyor: ${satir}`);
    const sozcukler = [...parca.matchAll(/"([^"]*)"|(\S+)/g)].map((e) => e[1] ?? e[2] ?? '');
    const [ilk, ikinci, ucuncu] = sozcukler;
    if (ilk === 'npm' && ikinci === 'run' && ucuncu !== undefined && sozcukler.length === 3) komutlar.push(...betigiAyir(betikler, ucuncu, derinlik + 1));
    else if (ilk === 'npm' || ilk === 'npx') throw new Error(`"${ad}" betiği kabuksuz koşulamıyor: ${satir}`);
    else komutlar.push(sozcukler);
  }
  return komutlar;
}

function npmCliGerekli(): string {
  const yol = npmCliBul();
  if (yol === null) throw new Error('npm bulunamadı (npm-cli.js); komutu `npm run teslim` ile koş');
  return yol;
}

export interface Ortam {
  // Git komutlarının koştuğu depo (ana çalışma ağacı); dosyasına yazılmaz.
  depoKoku: string;
  // Çalışma ağaçlarının açıldığı klasör.
  agacDizini: string;
  // Açılan arşivin, çıktıların ve sonuç sayfasının yazıldığı klasörlerin üstü; deponun dışında olmalı.
  geciciUst: string;
  taban: string;
  an: Date;
  kos: Kosucu;
  binCoz: BinCoz;
  npmCli: string;
}

export function damga(an: Date): string {
  const iki = (sayi: number): string => String(sayi).padStart(2, '0');
  return `${an.getFullYear()}${iki(an.getMonth() + 1)}${iki(an.getDate())}-${iki(an.getHours())}${iki(an.getMinutes())}${iki(an.getSeconds())}`;
}

const icinde = (ust: string, alt: string): boolean => {
  const goreli = relative(resolve(ust), resolve(alt));
  // Başka sürücüdeki hedef için göreli yol mutlak döner.
  return goreli === '' || (!goreli.startsWith('..') && !isAbsolute(goreli));
};

// Tek süreçle çok dosya: `git show` dosya başına süreç açar, tam kopya zipinde yüzlerce dosya gelir.
function depoIcerikleri(kok: string, ref: string, yollar: readonly string[]): Map<string, Buffer> {
  const sonuc = new Map<string, Buffer>();
  if (yollar.length === 0) return sonuc;
  const cikti = execFileSync('git', ['cat-file', '--batch'], {
    cwd: kok,
    input: yollar.map((yol) => `${ref}:${yol}\n`).join(''),
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  let yer = 0;
  for (const yol of yollar) {
    const satirSonu = cikti.indexOf(0x0a, yer);
    if (satirSonu < 0) break;
    const baslik = cikti.subarray(yer, satirSonu).toString('utf8');
    yer = satirSonu + 1;
    const [, tur, boy] = /^[0-9a-f]+ (\w+) (\d+)$/.exec(baslik) ?? [];
    if (tur === undefined || boy === undefined) continue;
    if (tur === 'blob') sonuc.set(yol, Buffer.from(cikti.subarray(yer, yer + Number(boy))));
    yer += Number(boy) + 1;
  }
  return sonuc;
}

function depoGorunumu(kok: string, taban: string, kit: string | null, yollar: readonly string[]): Depo {
  const dosyalar = new Set(git(kok, ['ls-tree', '-r', '--name-only', taban]));
  const istenen = [...new Set([...yollar, 'package.json'])];
  const tabandaki = depoIcerikleri(kok, taban, istenen.filter((yol) => dosyalar.has(yol)));
  if (kit === null) return { dosyalar, icerik: (yol) => tabandaki.get(yol) ?? null };
  const kitteki = depoIcerikleri(kok, kit, istenen);
  return { dosyalar, icerik: (yol) => tabandaki.get(yol) ?? null, kitIcerigi: (yol) => kitteki.get(yol) ?? null };
}

function guvenliYaz(kok: string, goreli: string, icerik: Buffer): void {
  const hedef = resolve(kok, goreli);
  if (!icinde(kok, hedef) || hedef === resolve(kok)) throw new Error(`Yol hedef klasörün dışına çıkıyor: ${goreli}`);
  mkdirSync(dirname(hedef), { recursive: true });
  writeFileSync(hedef, icerik);
}

function agacaUygula(agac: string, plan: Uygulama): void {
  for (const yol of plan.silinecek) rmSync(resolve(agac, yol), { force: true });
  // Aynı sayılan dosya yazılmaz: yalnız satır sonu farklı kopya ağaçta sahte değişiklik göstermesin.
  for (const g of plan.yazilacak) {
    if (g.durum !== 'ayni') guvenliYaz(agac, g.yol, g.icerik);
  }
}

function dosyalariListele(kok: string, goreli = ''): string[] {
  return readdirSync(join(kok, goreli), { withFileTypes: true }).flatMap((girdi) => {
    const yol = goreli === '' ? girdi.name : `${goreli}/${girdi.name}`;
    if (girdi.name === '.git' || girdi.name === 'node_modules') return [];
    return girdi.isDirectory() ? dosyalariListele(kok, yol) : [yol];
  });
}

const sessizGit = (kok: string, argumanlar: string[]): boolean => {
  try {
    execFileSync('git', argumanlar, { cwd: kok, stdio: ['ignore', 'ignore', 'pipe'] });
    return true;
  } catch {
    return false;
  }
};

// Gelen hali ayrı commit olur: oturtma sırasında yapılan düzeltmeler ondan sonraki farkta okunur.
function gelenHaliniKaydet(agac: string, s: Secenekler, sha256: string): { commit: string | null; uyari: string | null } {
  sessizGit(agac, ['add', '-A']);
  if (sessizGit(agac, ['diff', '--cached', '--quiet'])) return { commit: null, uyari: null };
  const mesaj = `chore(${s.modul}): delivery as received, sha256 ${sha256.slice(0, 12)}${s.kart === null ? '' : ` (#${s.kart})`}`;
  if (!sessizGit(agac, ['commit', '-q', '-m', mesaj])) {
    return { commit: null, uyari: "Teslim commit'i atılamadı (git kimliği ya da kanca); dosyalar ağaçta commit'siz duruyor." };
  }
  return { commit: git(agac, ['rev-parse', '--short', 'HEAD'])[0] ?? null, uyari: null };
}

interface DenetimTanimi extends DenetimKimligi {
  // null: komut kurulamadı ya da koşmayacak; neden `engel` içinde.
  argv: string[] | null;
  ortam?: Record<string, string>;
  // `testYok`: olması gereken test dosyası yok. Kırmızı olup test eksiği olmayan engel, komutun kurulamamasıdır.
  engel?: { neden: string; kirmizi: boolean; testYok?: boolean };
}

interface Taraflar {
  sunucu: boolean;
  istemci: boolean;
}

// Komutlar depodaki tanımlardan türetilir (`package.json` betikleri ve `test-modul.ts`); burada kopyası tutulmaz.
// Teslimden gelen dosya adı hiçbir komuta girmez: testler kalıpla ya da klasörle verilir.
function denetimTanimlari(agac: string, s: Secenekler, ortam: Ortam, geldi: Taraflar): DenetimTanimi[] {
  const betikler = (JSON.parse(readFileSync(join(agac, 'package.json'), 'utf8')) as { scripts?: Betikler }).scripts ?? {};
  const tanimlar: DenetimTanimi[] = [];
  const betikten = (tur: 'tip' | 'lint' | 'sinir', ek: string[] = []): void => {
    try {
      betigiAyir(betikler, tur).forEach((sozcukler, sira, hepsi) => {
        const gorunen = [...sozcukler, ...ek].join(' ');
        tanimlar.push({
          kimlik: hepsi.length === 1 ? tur : `${tur}-${sira + 1}`, tur, ad: hepsi.length === 1 ? TUR_ADLARI[tur] : `${TUR_ADLARI[tur]} (${sozcukler.join(' ')})`,
          komut: gorunen, testZorunlu: false, argv: [...kabuksuzArgv(sozcukler, agac, ortam.binCoz), ...ek],
        });
      });
    } catch (hata) {
      const neden = hata instanceof Error ? hata.message : String(hata);
      tanimlar.push({ kimlik: tur, tur, ad: TUR_ADLARI[tur], komut: `npm run ${tur}`, testZorunlu: false, argv: null, engel: { neden, kirmizi: true } });
    }
  };
  betikten('tip');
  betikten('lint');
  betikten('sinir', ['--modul', s.modul]);

  const sunucu = sunucuKlasoru(s.modul);
  const sunucuVar = existsSync(join(agac, sunucu));
  const kuralTestiVar = sunucuVar && readdirSync(join(agac, sunucu)).some((ad) => /^kurallar.*\.test\.ts$/.test(ad));
  const kuralKalibi = `${sunucu}kurallar*.test.ts`;
  tanimlar.push({
    kimlik: 'kural', tur: 'kural', ad: TUR_ADLARI.kural, komut: `node --test ${kuralKalibi}`, testZorunlu: geldi.sunucu,
    argv: [process.execPath, '--test', kuralKalibi],
    ...(sunucuVar
      ? (kuralTestiVar ? {} : { engel: { neden: `${kuralKalibi} yok`, kirmizi: geldi.sunucu, testYok: true } })
      : { engel: { neden: `sunucu tarafı yok (${sunucu})`, kirmizi: false } }),
  });

  for (const k of modulTestKomutlari(s.modul)) {
    const tur = k.taraf === 'sunucu' ? 'vt-testi' : 'ekran-testi';
    const ortak = {
      kimlik: tur, tur, komut: [k.komut, ...k.argumanlar, ...(tur === 'ekran-testi' ? ['--allowOnly=false'] : [])].join(' '), testZorunlu: geldi[k.taraf],
      ad: tur === 'vt-testi' ? 'Veritabanı testi (gerçek PostgreSQL, test veritabanı; kural testleri ayrı sayılır)' : TUR_ADLARI[tur],
    } as const;
    if (!existsSync(join(agac, k.klasor))) {
      tanimlar.push({ ...ortak, argv: null, engel: { neden: `${k.taraf} tarafı yok (${k.klasor}/)`, kirmizi: false } });
      continue;
    }
    try {
      const sozcukler = k.komut === 'npx' ? k.argumanlar : [k.komut, ...k.argumanlar];
      // `only` ile daraltılmış ekran testi koşuyu kırmızı yapar. Sunucu koşucusunda `only` bayraksız zaten etkisizdir.
      tanimlar.push({ ...ortak, argv: [...kabuksuzArgv(sozcukler, agac, ortam.binCoz), ...(tur === 'ekran-testi' ? ['--allowOnly=false'] : [])] });
    } catch (hata) {
      tanimlar.push({ ...ortak, argv: null, engel: { neden: hata instanceof Error ? hata.message : String(hata), kirmizi: true } });
    }
  }
  if (s.tam) {
    tanimlar.push({
      kimlik: 'kontrol', tur: 'kontrol', ad: TUR_ADLARI.kontrol, komut: 'npm run kontrol', testZorunlu: false,
      argv: [process.execPath, ortam.npmCli, 'run', 'kontrol'], ortam: { CI: 'true' },
    });
  }
  return tanimlar;
}

async function denetimKos(t: DenetimTanimi, agac: string, ciktiKlasoru: string, kos: Kosucu): Promise<DenetimSonucu> {
  const engel = t.engel ?? (t.argv === null ? { neden: 'komut kurulamadı', kirmizi: true } : undefined);
  if (engel !== undefined || t.argv === null) {
    const neden = engel?.neden ?? 'komut kurulamadı';
    if (engel?.kirmizi === true && engel.testYok !== true) return denetimiDegerlendir(t, { kod: 1, cikti: `${neden}
`, sureMs: 0 });
    return kosmayanDenetim(t, neden, engel?.kirmizi ?? true);
  }
  const kosu = await kos(t.argv, agac, t.ortam === undefined ? {} : { ortam: t.ortam });
  writeFileSync(join(ciktiKlasoru, `${t.kimlik}.log`), kosu.cikti);
  return denetimiDegerlendir(t, kosu);
}

export async function teslimDene(s: Secenekler, ortam: Ortam): Promise<{ sonuc: TeslimSonucu; sayfaYolu: string }> {
  // Modül adı yola ve komuta girer; çağıran doğrulamış olsa da burada yeniden bakılır.
  if (!MODUL_ADI.test(s.modul)) throw new Error(`Geçersiz modül adı: ${JSON.stringify(s.modul)}`);
  if (icinde(ortam.depoKoku, ortam.geciciUst)) throw new Error(`Geçici klasör deponun içinde olamaz: ${ortam.geciciUst}`);
  // Sonradan patlayacak girdi ağaç açılmadan önce denetlenir: yarım ağaç ve dal bırakılmaz.
  if (s.yama !== null && (!existsSync(s.yama) || !statSync(s.yama).isDirectory())) throw new Error(`Yama dizini yok: ${s.yama}`);
  const zipTamponu = readFileSync(s.zip);
  const sha256 = createHash('sha256').update(zipTamponu).digest('hex');
  // Reddedilen arşiv için ne klasör ne ağaç açılır.
  const soyulmus = sarmalayiciyiSoy(zipOku(zipTamponu));
  if (s.kit !== null && !sessizGit(ortam.depoKoku, ['rev-parse', '--verify', '--quiet', `${s.kit}^{commit}`])) {
    throw new Error(`Kit commit'i depoda yok: ${s.kit}`);
  }

  const depo = depoGorunumu(ortam.depoKoku, ortam.taban, s.kit, soyulmus.girdiler.map((g) => g.yol));
  const sinifli = siniflandir(soyulmus.girdiler, s.modul, depo);
  const plan = uygulamaPlani(sinifli, s.modul, depo);

  const ad = `${s.modul}-${damga(ortam.an)}`;
  const gecici = join(ortam.geciciUst, ad);
  const ciktiKlasoru = join(gecici, 'ciktilar');
  // Aynı saniyede başlayan ikinci deneme aynı adı alır; öbürünün klasörüne yazılmaz, hata yolunda da silinmez.
  if (existsSync(gecici) || existsSync(join(ortam.agacDizini, `teslim-${ad}`))) {
    throw new Error(`Aynı saniyede başka deneme başladı (${ad}); yeniden koş.`);
  }
  let agacAcildi = false;
  try {
    mkdirSync(ciktiKlasoru, { recursive: true });
    for (const g of sinifli) {
      if (g.sinif !== 'atlanan' && g.sinif !== 'ozdes') guvenliYaz(join(gecici, 'acilan'), g.yol, g.icerik);
    }

    const sonuc: TeslimSonucu = {
      zipAdi: basename(s.zip),
      sha256,
      modul: s.modul,
      kart: s.kart,
      taban: ortam.taban,
      tabanCommit: git(ortam.depoKoku, ['rev-parse', '--short', ortam.taban])[0] ?? '',
      sarmalayici: soyulmus.sarmalayici,
      sinifli,
      plan,
      bosTestler: bosTestDosyalari(plan.yazilacak),
      belgeler: belgeOzeti(sinifli, s.modul),
      yalnizSinifla: s.yalnizSinifla,
      agac: null,
      dal: null,
      commit: null,
      yama: [],
      uyarilar: s.kart === null && !s.yalnizSinifla ? ['Kart verilmedi: dal adı kart numarasıyla başlamıyor, bu dal birleştirilemez.'] : [],
      hazirlik: null,
      denetimler: [],
      statik: statikDenetimler(sinifli, plan, depo),
      gecici,
    };

    if (plan.yazilacak.length > 0 && !s.yalnizSinifla) {
      const agacAdi = `teslim-${ad}`;
      const agac = join(ortam.agacDizini, agacAdi);
      const dal = s.kart === null ? agacAdi : `${s.kart}-${agacAdi}`;
      mkdirSync(ortam.agacDizini, { recursive: true });
      git(ortam.depoKoku, ['worktree', 'add', '-q', '-b', dal, agac, ortam.taban]);
      agacAcildi = true;
      sonuc.agac = agac;
      sonuc.dal = dal;

      agacaUygula(agac, plan);
      const kayit = gelenHaliniKaydet(agac, s, sha256);
      sonuc.commit = kayit.commit;
      if (kayit.uyari !== null) sonuc.uyarilar.push(kayit.uyari);
      if (s.yama !== null) {
        sonuc.yama = dosyalariListele(s.yama).sort();
        // Kopyalama kaynağın değişme zamanını taşır; aynı saniyede çekilmiş aynı boydaki dosyayı git değişmemiş sanar.
        for (const yol of sonuc.yama) guvenliYaz(agac, yol, readFileSync(join(s.yama, yol)));
      }

      const hazirlik = await ortam.kos([process.execPath, ortam.npmCli, 'ci', '--no-audit', '--no-fund'], agac);
      writeFileSync(join(ciktiKlasoru, 'hazirlik.log'), hazirlik.cikti);
      const hazirlikKimligi: DenetimKimligi = { kimlik: 'hazirlik', tur: 'kontrol', ad: 'Hazırlık', komut: 'npm ci', testZorunlu: false };
      sonuc.hazirlik = { ...denetimiDegerlendir(hazirlikKimligi, hazirlik), sonSatirlar: sonSatirlar(hazirlik.cikti, 8), kalem: null };
      if (hazirlik.kod === 0) {
        const geldi: Taraflar = {
          sunucu: plan.yazilacak.some((g) => g.yol.startsWith(sunucuKlasoru(s.modul))),
          istemci: plan.yazilacak.some((g) => g.yol.startsWith(istemciKlasoru(s.modul))),
        };
        for (const tanim of denetimTanimlari(agac, s, ortam, geldi)) {
          const sonucu = await denetimKos(tanim, agac, ciktiKlasoru, ortam.kos);
          const kural = sonuc.denetimler.find((d) => d.tur === 'kural');
          sonuc.denetimler.push(tanim.tur === 'vt-testi' ? kuralTestleriniAyir(sonucu, kural, tanim.testZorunlu) : sonucu);
        }
      }
    }

    const sayfaYolu = join(gecici, 'SONUC.md');
    writeFileSync(sayfaYolu, sonucSayfasi(sonuc));
    return { sonuc, sayfaYolu };
  } catch (hata) {
    // Ağaç açılmadan düşen denemenin artığı kalmaz; açıldıysa ağaç ve çıktılar incelenmek üzere bırakılır.
    if (!agacAcildi) rmSync(gecici, { recursive: true, force: true });
    throw hata;
  }
}

interface AgacKaydi {
  yol: string;
  dal: string | null;
}

function agaclar(kok: string): AgacKaydi[] {
  const kayitlar: AgacKaydi[] = [];
  for (const satir of git(kok, ['worktree', 'list', '--porcelain'])) {
    if (satir.startsWith('worktree ')) kayitlar.push({ yol: satir.slice('worktree '.length), dal: null });
    const son = kayitlar.at(-1);
    if (son !== undefined && satir.startsWith('branch refs/heads/')) son.dal = satir.slice('branch refs/heads/'.length);
  }
  return kayitlar;
}

// Yalnız bu aracın açtıklarını kaldırır: klasör adı da dal adı da aracın kalıbına uymalıdır (ağaçta sonradan başka
// dala geçilmiş olabilir). Zorlamaz: commit'siz değişikliği olan ağaç ve birleşmemiş dal yerinde kalır.
export function temizle(modul: string, ortam: Pick<Ortam, 'depoKoku' | 'geciciUst'>): string[] {
  if (!MODUL_ADI.test(modul)) throw new Error(`Geçersiz modül adı: ${JSON.stringify(modul)}`);
  const iletiler: string[] = [];
  const agacDeseni = new RegExp(`^teslim-${modul}-\\d{8}-\\d{6}$`);
  const dalDeseni = new RegExp(`^(?:\\d+-)?teslim-${modul}-\\d{8}-\\d{6}$`);
  for (const kayit of agaclar(ortam.depoKoku).filter((k) => agacDeseni.test(basename(k.yol)))) {
    if (kayit.dal === null || !dalDeseni.test(kayit.dal)) {
      iletiler.push(`Ağaca DOKUNULMADI (üstündeki dal bu aracın açtığı dal değil: ${kayit.dal ?? 'dalsız'}): ${resolve(kayit.yol)}`);
      continue;
    }
    try {
      git(ortam.depoKoku, ['worktree', 'remove', kayit.yol]);
      iletiler.push(`Ağaç kaldırıldı: ${resolve(kayit.yol)}`);
    } catch {
      iletiler.push(`Ağaç KALDIRILMADI (commit'siz değişiklik ya da açık dosya var): ${resolve(kayit.yol)}`);
      continue;
    }
    try {
      git(ortam.depoKoku, ['branch', '-d', kayit.dal]);
      iletiler.push(`Dal silindi (ana dalla aynı): ${kayit.dal}`);
    } catch {
      iletiler.push(`Dal DURUYOR (birleşmemiş commit taşıyor; silmek kullanıcı kararı): ${kayit.dal}`);
    }
  }
  // Ağacı kalan denemenin sonuç sayfası da kalır.
  const kalanlar = new Set(agaclar(ortam.depoKoku).map((k) => basename(k.yol).replace(/^teslim-/, '')));
  const geciciDeseni = new RegExp(`^${modul}-\\d{8}-\\d{6}$`);
  if (existsSync(ortam.geciciUst)) {
    for (const ad of readdirSync(ortam.geciciUst).filter((a) => geciciDeseni.test(a) && !kalanlar.has(a))) {
      rmSync(join(ortam.geciciUst, ad), { recursive: true, force: true });
      iletiler.push(`Geçici klasör silindi: ${join(ortam.geciciUst, ad)}`);
    }
  }
  if (iletiler.length === 0) iletiler.push(`Kaldırılacak teslim ağacı ya da klasörü yok: ${modul}`);
  return iletiler;
}

export function ozet(sonuc: TeslimSonucu, sayfaYolu: string): string {
  const say = (sinif: string): number => sonuc.sinifli.filter((g) => g.sinif === sinif).length;
  const durum = (d: DenetimSonucu): string => (d.kirmizi ? (d.testYok ? 'KIRMIZI (geçen test yok)' : 'KIRMIZI') : d.kosmadi ? 'koşmadı' : 'yeşil');
  const satirlar = [
    `Teslim denemesi (${sonuc.modul}): ${kirmiziMi(sonuc) ? 'KIRMIZI' : 'YEŞİL'}${sonuc.yalnizSinifla ? ' (yalnız sınıflama; teslim kodu çalıştırılmadı)' : ''}`,
    `Dosyalar: uygulanan ${sonuc.yalnizSinifla ? 0 : sonuc.plan.yazilacak.length}, silinen ${sonuc.plan.silinecek.length}, belge ${say('belge')}, kilitli ya da tanınmayan ${say('kilitli')}`,
    ...(sonuc.bosTestler.length > 0 ? [`Boş test dosyası: ${sonuc.bosTestler.length} (KIRMIZI)`] : []),
    ...(sonuc.hazirlik !== null && sonuc.hazirlik.kod !== 0 ? ['Hazırlık (npm ci): KIRMIZI'] : []),
    ...sonuc.denetimler.map((d) => `${d.ad}: ${durum(d)}`),
    `Statik uyarı: ${sonuc.statik.filter((x) => x.durum === 'uyari').length} denetimde`,
    ...(sonuc.agac === null ? [] : [`Ağaç: ${sonuc.agac} (dal ${sonuc.dal ?? ''})`]),
    `Sonuç sayfası: ${sayfaYolu}`,
  ];
  return satirlar.join('\n');
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (dogrudanKosuyor) {
  try {
    const komut = argumanOku(process.argv.slice(2));
    const aracKoku = fileURLToPath(new URL('../', import.meta.url));
    const depoKoku = anaAgacKoku(aracKoku) ?? aracKoku;
    const geciciUst = join(tmpdir(), 'tmiv2-teslim');
    if (komut.kip === 'temizle') {
      console.log(temizle(komut.modul, { depoKoku, geciciUst }).join('\n'));
    } else {
      const ortam: Ortam = {
        depoKoku,
        agacDizini: join(depoKoku, '.claude', 'worktrees'),
        geciciUst,
        taban: VARSAYILAN_TABAN,
        an: new Date(),
        kos: surecKos,
        binCoz: binYolu,
        // Kod çalıştırmayan kipte npm aranmaz.
        npmCli: komut.secenek.yalnizSinifla ? '' : npmCliGerekli(),
      };
      const { sonuc, sayfaYolu } = await teslimDene(komut.secenek, ortam);
      console.log(ozet(sonuc, sayfaYolu));
      if (kirmiziMi(sonuc)) process.exitCode = 1;
    }
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exitCode = hata instanceof ZipReddi ? 2 : 1;
  }
}
