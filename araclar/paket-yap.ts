import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { paketBasliginiCoz } from '../sunucu/moduller/ayarlar/disari.ts';
import {
  BIRLESME_BICIMI, GOC_ADI, NPM_ONBELLEGI, SUNUCUDA_KURULMAYAN, YAYIN_ETIKETI, degisiklikleriAyikla, onbellekListesi, ortakAnahtarMetni,
  paketKur, platformlariOku, sunucuKurulumu, surumAdi, type Kilit, type PaketJson, type Platform,
} from './paket.ts';
import { tarAc, tarOku, type TarGirdisi } from './tar-oku.ts';
import { tarYaz } from './tar-yaz.ts';

// İmzalı güncelleme paketi (.tmip) üretir (kart #886, #1562). Paket HEAD commit'inden çıkar ve npm bağımlılıklarını taşır;
// gizli anahtar depo dışında durur.
// Etiket atmaz, push etmez: yayın etiketinin komutunu yazar.
const KULLANIM = [
  'Kullanım: npm run paket -- anahtar-uret <gizli.pem>',
  '          npm run paket -- --anahtar <gizli.pem> --cikti <paket.tmip> [--yuk <dosya>] [--surum <ad>] [--not <metin>]',
  '                             [--platform win32-x64] [--klasor <boş klasör>]',
  '  --yuk verilmezse yük HEAD commit\'inin `git archive` çıktısı ve lock dosyasındaki npm paketlerinin önbelleğidir (tar.gz).',
  '  --platform: sunucunun işletim sistemi ve işlemcisi (virgülle birkaç tane); yalnız onun ikilileri taşınır.',
  '  --klasor: yükü ayrıca bu klasöre açar (internetsiz kanala ilk geçiş, kurulum/guncelleme.md).',
].join('\n');

const KOK = fileURLToPath(new URL('../', import.meta.url));

function dur(ileti: string): never {
  console.error(ileti);
  process.exit(1);
}

function git(argumanlar: string[]): string {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...argumanlar], { cwd: KOK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const satirlar = (metin: string): string[] => metin.split('\n').map((s) => s.trim()).filter((s) => s !== '');

// Gizli anahtar depoya girmez (kırmızı çizgi): depo içindeki yol reddedilir.
function depoDisi(yol: string): string {
  const tam = resolve(yol);
  const goreli = relative(KOK, tam);
  if (goreli === '' || (!goreli.startsWith('..') && !isAbsolute(goreli))) dur(`Anahtar dosyası depo içinde olamaz: ${tam}`);
  return tam;
}

const npmCli = (): string => {
  const yol = process.env['npm_execpath'];
  if (yol === undefined || yol === '') dur('npm bulunamadı; komutu "npm run paket -- ..." ile çalıştırın.');
  return yol;
};

// cacache içerik yolu: bütünlük değerinin onaltılık özeti iki düzey klasöre bölünür.
function icerikYolu(onbellek: string, butunluk: string): string {
  const [algoritma = '', ozet = ''] = butunluk.split(' ')[0]?.split('-') ?? [];
  const hex = Buffer.from(ozet, 'base64').toString('hex');
  return join(onbellek, '_cacache', 'content-v2', algoritma, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
}

function klasorGirdileri(kok: string, onEk: string): TarGirdisi[] {
  const girdiler: TarGirdisi[] = [];
  for (const g of readdirSync(kok, { withFileTypes: true, recursive: true })) {
    const goreli = relative(kok, join(g.parentPath, g.name)).split(/[\\/]/).join('/');
    if (goreli.split('/')[0] === '_logs') continue;
    if (g.isDirectory()) girdiler.push({ yol: `${onEk}/${goreli}`, tur: 'klasor', veri: Buffer.alloc(0) });
    else if (g.isFile()) girdiler.push({ yol: `${onEk}/${goreli}`, tur: 'dosya', veri: readFileSync(join(g.parentPath, g.name)) });
    else dur(`Önbellekte beklenmeyen girdi: ${goreli}`);
  }
  return girdiler.sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
}

// Yük: HEAD'in ağacı, sunucuya göre budanmış package.json ve lock, lock'taki npm paketlerinin önbelleği (kart #1562).
// Önbellek bu makinede npm kayıt adresinden toplanır; sunucu internete çıkmaz. Her tarball'ın içeriği lock'taki bütünlük
// değeriyle önbellekte bulunmazsa paket yazılmaz.
function yukKur(platformlar: readonly Platform[], zaman: Date): { yuk: Buffer; tarball: number; onbellekBayt: number; cikan: string[] } {
  const agac = tarOku(execFileSync('git', ['archive', '--format=tar.gz', 'HEAD'], { cwd: KOK, maxBuffer: 1024 * 1024 * 1024 }));
  const oku = (yol: string): unknown => {
    const g = agac.find((x) => x.yol === yol);
    if (g === undefined) dur(`HEAD'de ${yol} yok.`);
    return JSON.parse(g.veri.toString('utf8'));
  };
  const { paketJson, kilit, cikan } = sunucuKurulumu(oku('package.json') as PaketJson, oku('package-lock.json') as Kilit, SUNUCUDA_KURULMAYAN);
  const tarballlar = onbellekListesi(kilit, platformlar);
  const onbellek = mkdtempSync(join(tmpdir(), 'tmip-npm-'));
  try {
    for (let i = 0; i < tarballlar.length; i += 100) {
      const adresler = tarballlar.slice(i, i + 100).map((t) => t.adres);
      execFileSync(process.execPath, [npmCli(), 'cache', 'add', ...adresler, '--cache', onbellek], { cwd: onbellek, stdio: ['ignore', 'ignore', 'inherit'] });
      console.log(`npm önbelleği: ${String(Math.min(i + 100, tarballlar.length))}/${String(tarballlar.length)}`);
    }
    const eksik = tarballlar.filter((t) => !existsSync(icerikYolu(onbellek, t.butunluk)));
    if (eksik.length > 0) dur(`Önbellekte lock'taki bütünlükle bulunmayan paket: ${eksik.slice(0, 5).map((t) => t.yol).join(', ')}`);
    const onbellekGirdileri = klasorGirdileri(onbellek, NPM_ONBELLEGI);
    const json = (deger: unknown): Buffer => Buffer.from(`${JSON.stringify(deger, null, 2)}\n`, 'utf8');
    const girdiler = [
      ...agac.map((g) => (g.yol === 'package.json' ? { ...g, veri: json(paketJson) } : g.yol === 'package-lock.json' ? { ...g, veri: json(kilit) } : g)),
      { yol: NPM_ONBELLEGI, tur: 'klasor' as const, veri: Buffer.alloc(0) },
      ...onbellekGirdileri,
    ];
    return {
      yuk: gzipSync(tarYaz(girdiler, zaman)), tarball: tarballlar.length,
      onbellekBayt: onbellekGirdileri.reduce((t, g) => t + g.veri.length, 0), cikan,
    };
  } finally {
    rmSync(onbellek, { recursive: true, force: true });
  }
}

function anahtarUret(yol: string): void {
  const hedef = depoDisi(yol);
  if (existsSync(hedef)) dur(`Anahtar dosyası zaten var: ${hedef}`);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  // 'wx': var olan anahtarın üstüne yazılmaz; eski anahtarla imzalı paketler sahipsiz kalırdı.
  writeFileSync(hedef, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' });
  console.log(`Gizli anahtar: ${hedef}`);
  console.log('Sunucunun .env dosyasına:');
  console.log(`TMIV2_GUNCELLEME_ANAHTARI=${ortakAnahtarMetni(publicKey)}`);
}

interface PaketSecenekleri {
  anahtar: string; cikti: string; yuk: string | undefined; surum: string | undefined; not: string | undefined;
  platform: string; klasor: string | undefined;
}

function paketYap(s: PaketSecenekleri): void {
  if (existsSync(resolve(s.cikti))) dur(`Çıktı dosyası zaten var: ${resolve(s.cikti)}`);
  if (s.klasor !== undefined && existsSync(resolve(s.klasor)) && readdirSync(resolve(s.klasor)).length > 0) dur(`Klasör boş değil: ${resolve(s.klasor)}`);
  const platformlar = platformlariOku(s.platform);
  if (satirlar(git(['status', '--porcelain', '--untracked-files=no'])).length > 0) dur('Çalışma ağacında commit\'lenmemiş değişiklik var; paket HEAD\'den çıkar.');
  const gizli = createPrivateKey(readFileSync(depoDisi(s.anahtar)));
  const commit = git(['rev-parse', 'HEAD']).trim();
  const tarih = new Date(git(['show', '-s', '--format=%cI', 'HEAD']).trim()).toISOString();
  const etiketler = satirlar(git(['tag', '--list', `${YAYIN_ETIKETI}*`]));
  const surum = s.surum ?? surumAdi(new Date(), etiketler);
  if (etiketler.includes(`${YAYIN_ETIKETI}${surum}`)) dur(`${YAYIN_ETIKETI}${surum} etiketi zaten var.`);
  const gocler = satirlar(git(['ls-tree', '--name-only', 'HEAD', 'sunucu/gocler/']))
    .map((y) => y.slice('sunucu/gocler/'.length))
    .filter((ad) => GOC_ADI.test(ad));
  // Önceki yayın: HEAD'in geçmişindeki en yeni yayın etiketi. Yoksa son 50 birleşme yazılır.
  const onceki = satirlar(git(['tag', '--merged', 'HEAD', '--list', `${YAYIN_ETIKETI}*`, '--sort=-creatordate']))[0] ?? null;
  const aralik = onceki === null ? ['-n', '50', 'HEAD'] : [`${onceki}..HEAD`];
  const degisiklikler = degisiklikleriAyikla(git(['log', '--first-parent', '--merges', `--format=${BIRLESME_BICIMI}`, ...aralik]));
  const kurulan = s.yuk === undefined ? yukKur(platformlar, new Date(tarih)) : null;
  const yuk = kurulan === null ? readFileSync(resolve(s.yuk ?? '')) : kurulan.yuk;
  const not = s.not === undefined || s.not.trim() === '' ? null : s.not.trim();

  const oncekiYayin = onceki === null ? null : onceki.slice(YAYIN_ETIKETI.length);
  const paket = paketKur({ surum, commit, tarih, gocler, not, degisiklikler, oncekiYayin }, yuk, gizli);
  // Sunucunun okuyacağı gibi geri okunur: üretici ile doğrulayıcı ayrışırsa paket yazılmaz.
  const cozum = paketBasliginiCoz(paket, createPublicKey(gizli));
  if ('red' in cozum) dur(`Üretilen paket doğrulanmadı (${cozum.red}); paket yazılmadı.`);
  writeFileSync(resolve(s.cikti), paket, { flag: 'wx' });

  console.log(`Paket: ${resolve(s.cikti)} (${paket.length} bayt)`);
  console.log(`Sürüm ${surum}, commit ${commit.slice(0, 7)}, ${gocler.length} göç, ${degisiklikler.length} değişiklik`
    + (onceki === null ? ' (önceki yayın etiketi yok; son 50 birleşme)' : ` (${onceki} sonrası)`));
  if (kurulan !== null) {
    console.log(`npm: ${String(kurulan.tarball)} paket (${s.platform}), önbellek ${(kurulan.onbellekBayt / 1048576).toFixed(1)} MB; `
      + `sunucuya kurulmayan: ${SUNUCUDA_KURULMAYAN.join(', ')} (${String(kurulan.cikan.length)} lock girdisi)`);
  }
  if (s.klasor !== undefined) {
    console.log(`Yük açıldı: ${resolve(s.klasor)} (${String(tarAc(yuk, resolve(s.klasor)))} dosya)`);
  }
  console.log(`Ortak anahtar: ${ortakAnahtarMetni(createPublicKey(gizli))}`);
  console.log('Yayın etiketi (paket kuruma verildikten sonra):');
  console.log(`  git tag -a ${YAYIN_ETIKETI}${surum} ${commit} -m "Yayin ${surum}" && git push origin ${YAYIN_ETIKETI}${surum}`);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    anahtar: { type: 'string' }, cikti: { type: 'string' }, yuk: { type: 'string' }, surum: { type: 'string' }, not: { type: 'string' },
    platform: { type: 'string', default: 'win32-x64' }, klasor: { type: 'string' },
  },
});

if (positionals[0] === 'anahtar-uret') {
  if (positionals[1] === undefined) dur(KULLANIM);
  anahtarUret(positionals[1]);
} else if (positionals.length > 0 || values.anahtar === undefined || values.cikti === undefined) {
  dur(KULLANIM);
} else {
  paketYap({
    anahtar: values.anahtar, cikti: values.cikti, yuk: values.yuk, surum: values.surum, not: values.not,
    platform: values.platform, klasor: values.klasor,
  });
}
