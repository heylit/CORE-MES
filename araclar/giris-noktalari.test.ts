import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku, testAyari } from '#cekirdek/ayar.ts';
import { anaAgacKoku } from './ortam.ts';

const ASIL_KOK = fileURLToPath(new URL('../', import.meta.url));
const KOMUTLAR = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }).scripts;

const SAHIP_REDDI = /şemayı değiştirebilen kullanıcıyla açılamaz/;
const GOC_KIMLIGI_REDDI = /Göç kimliği bu süreçte tanımlı/;

// Süreçler test veritabanına, boş bir porta ve sahip kimliğine yönlendirilir: bunlar .env'deki değerlerden
// farklıdır ve .env görülen ağaçta ön yükleme çelişki diye durur. Bu yüzden depo dışında, .env'siz bir kopyada koşarlar.
let kok = '';

before(() => {
  kok = mkdtempSync(join(tmpdir(), 'tmiv2-giris-'));
  for (const ad of ['araclar', 'sunucu', 'paylasilan']) cpSync(join(ASIL_KOK, ad), join(kok, ad), { recursive: true });
  copyFileSync(join(ASIL_KOK, 'package.json'), join(kok, 'package.json'));
  symlinkSync(join(ASIL_KOK, 'node_modules'), join(kok, 'node_modules'), 'junction');
  assert.equal(anaAgacKoku(kok), null, 'geçici klasör bir git deposunun içinde; süreçler başka .env dosyasına düşer');
});

after(() => {
  rmSync(kok, { recursive: true, force: true });
});

interface Sonuc {
  kod: number | null;
  cikti: string;
}

async function bosPort(): Promise<number> {
  const sunucu = createServer();
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  const { port } = sunucu.address() as AddressInfo;
  await new Promise((coz) => sunucu.close(coz));
  return port;
}

// Komut package.json'daki haliyle koşar (izleme kipi dışında): hangi ön yüklemeyi seçtiği de ölçülür.
// Süreç test veritabanının boş public şemasına bağlanır; denetimleri geçen sunucu "bekleyen göç" ile durur.
function komutSatiri(komut: string): string {
  const satir = KOMUTLAR[komut];
  if (satir === undefined || !satir.startsWith('node ')) throw new Error(`${komut} komutu node ile başlamıyor`);
  return satir;
}

async function kos(satir: string, ortam: Record<string, string>, ek: string[] = [], girdi = ''): Promise<Sonuc> {
  const argumanlar = [...satir.split(' ').slice(1).filter((a) => a !== '--watch'), ...ek];
  const ayar = testAyari(ayarOku());
  const surec = spawn(process.execPath, argumanlar, {
    cwd: kok,
    env: { ...process.env, TMIV2_PG_DATABASE: ayar.pg.veritabani, TMIV2_PORT: String(await bosPort()), ...ortam },
  });
  let cikti = '';
  surec.stdout.on('data', (parca: Buffer) => { cikti += parca.toString('utf8'); });
  surec.stderr.on('data', (parca: Buffer) => { cikti += parca.toString('utf8'); });
  surec.stdin.end(girdi);
  // Denetimleri geçip dinlemeye başlayan sunucu kendiliğinden kapanmaz; süre dolunca öldürülür ve kod null kalır.
  const zamanlayici = setTimeout(() => { surec.kill(); }, 20_000);
  const kod = await new Promise<number | null>((coz) => surec.on('close', coz));
  clearTimeout(zamanlayici);
  return { kod, cikti };
}

const sahipKimligi = (): Record<string, string> => {
  const goc = gocKimligiOku();
  return { TMIV2_PG_USER: goc.kullanici, TMIV2_PG_PASSWORD: goc.parola };
};

test('testin ortamı göç kimliğini taşır: aşağıdaki süreçler onu ortamdan devralır', () => {
  assert.equal(typeof gocKimligiOku().parola, 'string');
});

for (const komut of ['sunucu', 'gelistir:sunucu']) {
  test(`npm run ${komut}: göç kimliği ortamdayken de açılış denetimlerini geçer; sahip kimliğiyle açılmaz`, { timeout: 60_000 }, async () => {
    const uygulama = await kos(komutSatiri(komut), {});
    assert.match(uygulama.cikti, /Bekleyen göç var/);
    assert.doesNotMatch(uygulama.cikti, GOC_KIMLIGI_REDDI);
    assert.doesNotMatch(uygulama.cikti, SAHIP_REDDI);
    assert.equal(uygulama.kod, 1);

    const sahip = await kos(komutSatiri(komut), sahipKimligi());
    assert.match(sahip.cikti, SAHIP_REDDI);
    assert.doesNotMatch(sahip.cikti, /Bekleyen göç var|dinliyor/);
    assert.equal(sahip.kod, 1);
  });
}

test('npm run yonetici: göç kimliği ortamdayken de açılış denetimlerini geçer; sahip kimliğiyle açılmaz', { timeout: 60_000 }, async () => {
  // Kısa parola: denetimleri geçen araç kişi eklemeden, kendi doğrulamasında durur.
  const uygulama = await kos(komutSatiri('yonetici'), {}, ['deneme', 'Deneme Kisi'], 'kisa\n');
  assert.match(uygulama.cikti, /Oluşturulamadı: Parola en az/);
  assert.equal(uygulama.kod, 1);

  const sahip = await kos(komutSatiri('yonetici'), sahipKimligi(), ['deneme', 'Deneme Kisi'], 'kisa\n');
  assert.match(sahip.cikti, SAHIP_REDDI);
  assert.doesNotMatch(sahip.cikti, /Parola en az/);
  assert.equal(sahip.kod, 1);
});

test('npm run ornek-veri: canlı ortamda bağlanmadan reddeder; sahip kimliğiyle açılmaz', { timeout: 60_000 }, async () => {
  const canli = await kos(komutSatiri('ornek-veri'), { TMIV2_ORTAM: 'canli' });
  assert.match(canli.cikti, /canlı ortama yüklenmez/);
  assert.doesNotMatch(canli.cikti, /yüklendi|Bağlanılamadı/);
  assert.equal(canli.kod, 1);

  const sahip = await kos(komutSatiri('ornek-veri'), sahipKimligi());
  assert.match(sahip.cikti, SAHIP_REDDI);
  assert.doesNotMatch(sahip.cikti, /yüklendi|modül yok/);
  assert.equal(sahip.kod, 1);
});

test('ön yüklemesiz başlatılan sunucu ve yönetici aracı, göç kimliği ortamdayken açılmaz', { timeout: 60_000 }, async () => {
  const sunucu = await kos('node sunucu/ana.ts', {});
  assert.match(sunucu.cikti, GOC_KIMLIGI_REDDI);
  assert.doesNotMatch(sunucu.cikti, /Bekleyen göç var|dinliyor/);
  assert.equal(sunucu.kod, 1);

  const arac = await kos('node araclar/yonetici-olustur.ts', {}, ['deneme', 'Deneme Kisi'], 'kisa\n');
  assert.match(arac.cikti, GOC_KIMLIGI_REDDI);
  assert.doesNotMatch(arac.cikti, /Parola en az/);
  assert.equal(arac.kod, 1);
});
