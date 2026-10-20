import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  dokunulanModul, durumKos, durumMetni, durumTopla, ghKartKaynagi, kartCoz, kartlariTopla, kartNo, KART_ATLANDI, MODUL_DISI, uyarilariBul,
} from './durum.ts';
import type { DalDurumu, Kart, KartKaynagi } from './durum.ts';

const GUN = 86_400_000;
const SIMDI = new Date('2027-03-10T12:00:00Z');
const gunOnce = (gun: number): string => new Date(SIMDI.getTime() - gun * GUN).toISOString();

function komut(klasor: string, tarih: string, ...a: string[]): string {
  return execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], {
    cwd: klasor, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_AUTHOR_DATE: tarih, GIT_COMMITTER_DATE: tarih },
  });
}

function isle(klasor: string, gun: number, dosyalar: readonly string[], ...mesaj: string[]): void {
  for (const yol of dosyalar) {
    mkdirSync(dirname(join(klasor, yol)), { recursive: true });
    writeFileSync(join(klasor, yol), `export const deger = '${mesaj[0] ?? ''} ${yol}';\n`);
  }
  komut(klasor, gunOnce(gun), 'add', '-A');
  komut(klasor, gunOnce(gun), 'commit', '-q', ...mesaj.flatMap((m) => ['-m', m]));
}

const ORTAK_DOSYA = 'sunucu/moduller/alfa/servis.ts';

// Üç açık dal: 23-alfa-is (taban 2 geride, 2 ileride, son commit 4 gün önce), kartsiz-dal (1 geride,
// aynı dosyaya dokunur), modul/24-beta (worktree'de, 0 geride, son commit 2 gün önce, ayrı dosyalar).
let ust = '';
let depo = '';
let agac = '';

before(() => {
  // Git worktree yolunu uzun adla verir; kısa (8.3) geçici yol eşleşmez.
  ust = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-durum-')));
  depo = join(ust, 'depo');
  agac = join(ust, 'agac');
  mkdirSync(depo);
  komut(depo, gunOnce(10), 'init', '-q', '-b', 'main');
  isle(depo, 10, [ORTAK_DOSYA, 'kok.txt'], 'taban');

  komut(depo, gunOnce(9), 'switch', '-q', '-c', '23-alfa-is');
  isle(depo, 9, [ORTAK_DOSYA], 'feat: first step', 'Yapıldı: eski satır\nSıradaki: eski sıradaki');
  isle(depo, 4, ['istemci/src/moduller/alfa/Ekran.tsx', 'paylasilan/sozlesme/gama.ts', 'paylasilan/ortam.ts'],
    'feat: screen', 'Body line.\n\nYapıldı: uç ve ekran\nSıradaki: akış testi');
  komut(depo, gunOnce(4), 'switch', '-q', 'main');

  isle(depo, 3, ['kok.txt'], 'taban ilerler 1');
  komut(depo, gunOnce(1), 'switch', '-q', '-c', 'kartsiz-dal');
  isle(depo, 1, [ORTAK_DOSYA], 'wip');
  komut(depo, gunOnce(1), 'switch', '-q', 'main');
  isle(depo, 1, ['kok2.txt'], 'taban ilerler 2');

  komut(depo, gunOnce(2), 'worktree', 'add', '-q', '-b', 'modul/24-beta', agac, 'main');
  isle(agac, 2, ['sunucu/moduller/beta/kurallar.ts', 'paylasilan/islemler/beta.ts'], 'feat: beta rule', 'Sıradaki: ekran');
});

after(() => {
  rmSync(ust, { recursive: true, force: true });
});

function dal(dallar: readonly DalDurumu[], ad: string): DalDurumu {
  const bulunan = dallar.find((d) => d.ad === ad);
  assert.ok(bulunan, `açık dallarda ${ad} yok`);
  return bulunan;
}

const kaynak = (kartlar: Record<number, Kart>): KartKaynagi => (no) => kartlar[no] ?? null;
const kart = (durum: string | null, baslik = 'Başlık'): Kart => ({ baslik, durum, acik: true });
const iceren = (uyarilar: readonly string[], desen: RegExp): string[] => uyarilar.filter((u) => desen.test(u));

test('durum: açık dallar, worktree yolu, dokunulan modüller ve commit satırları toplanır', () => {
  const dallar = durumTopla(depo);
  assert.deepEqual(dallar.map((d) => d.ad), ['23-alfa-is', 'kartsiz-dal', 'modul/24-beta']);

  const alfa = dal(dallar, '23-alfa-is');
  assert.equal(alfa.worktree, null);
  // Tabanın sonradan değiştirdiği kok.txt dalın dokunuşu sayılmaz.
  assert.deepEqual(alfa.dosyalar, ['istemci/src/moduller/alfa/Ekran.tsx', 'paylasilan/ortam.ts', 'paylasilan/sozlesme/gama.ts', ORTAK_DOSYA]);
  assert.deepEqual(alfa.moduller, ['alfa', 'gama', MODUL_DISI]);
  assert.equal(alfa.yapildi, 'uç ve ekran');
  assert.equal(alfa.siradaki, 'akış testi');

  const beta = dal(dallar, 'modul/24-beta');
  assert.equal(resolve(beta.worktree ?? ''), resolve(agac));
  assert.deepEqual(beta.moduller, ['beta']);
  assert.equal(beta.yapildi, null);
  assert.equal(beta.siradaki, 'ekran');

  const kartsiz = dal(dallar, 'kartsiz-dal');
  assert.deepEqual(kartsiz.moduller, ['alfa']);
  assert.deepEqual([kartsiz.yapildi, kartsiz.siradaki], [null, null]);
});

test('durum: dalın tabandan kaç commit geride ve ileride olduğu sayılır', () => {
  const dallar = durumTopla(depo);
  assert.deepEqual([dal(dallar, '23-alfa-is').geride, dal(dallar, '23-alfa-is').ileride], [2, 2]);
  assert.deepEqual([dal(dallar, 'kartsiz-dal').geride, dal(dallar, 'kartsiz-dal').ileride], [1, 1]);
  assert.deepEqual([dal(dallar, 'modul/24-beta').geride, dal(dallar, 'modul/24-beta').ileride], [0, 1]);
  assert.match(durumKos([], depo, { simdi: SIMDI, kartKaynagi: kaynak({}) }).cikti, /main\s+2 geride, 2 ileride; son commit 4 gün önce/);
});

test('durum: aynı dosyaya dokunan iki dal uyarılır, ayrı dosyalara dokunan uyarılmaz', () => {
  const dallar = durumTopla(depo);
  const uyarilar = iceren(uyarilariBul(dallar, new Map(), SIMDI), /^aynı dosya/);
  assert.deepEqual(uyarilar, [`aynı dosya: ${ORTAK_DOSYA} (23-alfa-is, kartsiz-dal)`]);

  const ayri = dallar.filter((d) => d.ad !== 'kartsiz-dal');
  assert.equal(ayri.length, 2);
  assert.deepEqual(iceren(uyarilariBul(ayri, new Map(), SIMDI), /^aynı dosya/), []);
});

test('durum: devam kartı 3 günden eski commit ile uyarılır; 2 günlük ve başka durumdaki uyarılmaz', () => {
  const dallar = durumTopla(depo);
  const bekleyen = (kartlar: Record<number, Kart>, simdi: Date): string[] =>
    iceren(uyarilariBul(dallar, kartlariTopla(dallar, kaynak(kartlar)), simdi), /^bekleyen kart/);

  // 23: son commit 4 gün önce; 24: 2 gün önce.
  assert.deepEqual(bekleyen({ 23: kart('devam'), 24: kart('devam') }, SIMDI),
    ['bekleyen kart: #23 23-alfa-is (durum: devam, son commit 4 gün önce)']);
  assert.deepEqual(bekleyen({ 23: kart('denetimde'), 24: kart('devam') }, SIMDI), []);
  assert.deepEqual(bekleyen({ 23: kart(null), 24: kart('planlandi') }, SIMDI), []);
  assert.deepEqual(bekleyen({ 23: { ...kart('devam'), acik: false }, 24: kart('devam') }, SIMDI), []);

  const ikiGunSonra = new Date(SIMDI.getTime() + 2 * GUN);
  assert.deepEqual(bekleyen({ 23: kart('denetimde'), 24: kart('devam') }, ikiGunSonra),
    ['bekleyen kart: #24 modul/24-beta (durum: devam, son commit 4 gün önce)']);
});

test('durum: tam 3 gün uyarı vermez, 3 gün 1 saniye verir', () => {
  const dallar = durumTopla(depo);
  const kartlar = kartlariTopla(dallar, kaynak({ 23: kart('devam') }));
  // 23'ün son commit'i SIMDI'den tam 4 gün önce.
  const ucGun = new Date(SIMDI.getTime() - GUN);
  assert.deepEqual(iceren(uyarilariBul(dallar, kartlar, ucGun), /^bekleyen kart/), []);
  assert.deepEqual(iceren(uyarilariBul(dallar, kartlar, new Date(ucGun.getTime() + 1000)), /^bekleyen kart/),
    ['bekleyen kart: #23 23-alfa-is (durum: devam, son commit 3 gün önce)']);
});

test("durum: birleşmiş dal listelenmez; commit'siz worktree dalı ve ortak atası olmayan dal listelenir", () => {
  const ust2 = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-durum-kenar-')));
  const kok = join(ust2, 'depo');
  const bosAgac = join(ust2, 'bos');
  try {
    mkdirSync(kok);
    komut(kok, gunOnce(9), 'init', '-q', '-b', 'main');
    isle(kok, 9, ['kok.txt'], 'taban');
    komut(kok, gunOnce(8), 'switch', '-q', '-c', 'birlesmis');
    isle(kok, 8, ['sunucu/moduller/alfa/servis.ts'], 'feat: merged work', 'Yapıldı: tabana girmiş iş\nSıradaki: tabanın sıradakisi');
    komut(kok, gunOnce(8), 'switch', '-q', 'main');
    komut(kok, gunOnce(8), 'merge', '-q', '--ff-only', 'birlesmis');
    komut(kok, gunOnce(7), 'worktree', 'add', '-q', '-b', '30-bos', bosAgac, 'main');
    komut(kok, gunOnce(6), 'switch', '-q', '--orphan', 'yetim');
    isle(kok, 6, ['yetim.txt'], 'orphan', 'Sıradaki: yetim iş');
    komut(kok, gunOnce(6), 'switch', '-q', 'main');

    const dallar = durumTopla(kok);
    assert.deepEqual(dallar.map((d) => d.ad), ['30-bos', 'yetim']);

    const bos = dal(dallar, '30-bos');
    assert.equal(resolve(bos.worktree ?? ''), resolve(bosAgac));
    assert.deepEqual([bos.geride, bos.ileride, bos.ortakAta], [0, 0, true]);
    // Ucu tabanın commit'i: o commit'in satırları bu dalın işi diye gösterilmez.
    assert.deepEqual([bos.yapildi, bos.siradaki], [null, null]);

    const yetim = dal(dallar, 'yetim');
    assert.deepEqual([yetim.ortakAta, yetim.dosyalar, yetim.siradaki], [false, [], 'yetim iş']);

    const { kod, cikti } = durumKos([], kok, { simdi: SIMDI, kartKaynagi: kaynak({ 30: kart('planlandi') }) });
    assert.equal(kod, 0);
    assert.match(cikti, /^yetim\n {2}modüller\s+ortak ata yok$/m);
    assert.match(cikti, /^30-bos {2}#30 /m);
    assert.doesNotMatch(cikti, /tabana girmiş iş|tabanın sıradakisi|birlesmis/);
  } finally {
    rmSync(ust2, { recursive: true, force: true });
  }
});

test('gh kart kaynağı: başarılı cevap kart, çözülemeyen numara kart yok, başka hata ve olmayan komut gh yok', () => {
  const klasor = mkdtempSync(join(tmpdir(), 'tmiv2-durum-gh-'));
  const betik = join(klasor, 'sahte-gh.mjs');
  writeFileSync(betik, [
    'const [is, alt, no, bayrak, alanlar] = process.argv.slice(2);',
    "if (is !== 'issue' || alt !== 'view' || bayrak !== '--json' || alanlar !== 'title,labels,state') { console.error('beklenmeyen çağrı'); process.exit(2); }",
    "if (no === '17') console.log(JSON.stringify({ labels: [{ id: 'LA_x', name: 'durum: denetimde', description: '', color: '006b75' }], state: 'OPEN', title: 'C5: Ortak durum' }));",
    "else if (no === '99999') { console.error('GraphQL: Could not resolve to an issue or pull request with the number of 99999. (repository.issue)'); process.exit(1); }",
    "else { console.error('HTTP 401: Bad credentials'); process.exit(1); }",
  ].join('\n'));
  try {
    const sahte = ghKartKaynagi(klasor, [process.execPath, betik]);
    assert.deepEqual(sahte(17), { baslik: 'C5: Ortak durum', durum: 'denetimde', acik: true });
    assert.equal(sahte(99999), null);
    assert.equal(sahte(5), 'yok');
    assert.equal(ghKartKaynagi(klasor, ['tmiv2-olmayan-komut'])(17), 'yok');
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});

test('durum: adı kart numarasıyla başlamayan ve kartı bulunamayan dal uyarılır, kartı olan uyarılmaz', () => {
  const dallar = durumTopla(depo);
  const kartlar = kartlariTopla(dallar, kaynak({ 23: kart('denetimde') }));
  assert.deepEqual(iceren(uyarilariBul(dallar, kartlar, SIMDI), /^kartsız dal/), [
    'kartsız dal: kartsiz-dal (ad kart numarasıyla başlamıyor)',
    'kartsız dal: modul/24-beta (#24 bulunamadı)',
  ]);
});

test('durum: kart başlığı ve durum etiketi dal satırında görünür', () => {
  const { kod, cikti } = durumKos([], depo, { simdi: SIMDI, kartKaynagi: kaynak({ 23: kart('devam', 'Alfa akışı'), 24: kart(null, 'Beta') }) });
  assert.equal(kod, 0);
  assert.match(cikti, /^23-alfa-is {2}#23 Alfa akışı \[durum: devam\]$/m);
  assert.match(cikti, /^modul\/24-beta {2}#24 Beta \[durum etiketi yok\]$/m);
  assert.match(cikti, /^kartsiz-dal$/m);
  assert.match(cikti, /^ {2}Yapıldı\s+uç ve ekran$/m);
  assert.match(cikti, /^ {2}Sıradaki\s+akış testi$/m);
  assert.match(cikti, /^ {2}modüller\s+alfa, gama, çekirdek\/ortak \(4 dosya\)$/m);
  assert.doesNotMatch(cikti, /gh yok/);
});

test('durum: kart kaynağı yok derse kart bilgisi atlanır, ad kuralı uyarısı kalır ve çıkış 0 olur', () => {
  let cagri = 0;
  const { kod, cikti } = durumKos([], depo, { simdi: SIMDI, kartKaynagi: () => { cagri += 1; return 'yok'; } });
  assert.equal(kod, 0);
  assert.equal(cagri, 1);
  assert.ok(cikti.endsWith(`\n${KART_ATLANDI}`), cikti);
  assert.match(cikti, /kartsız dal: kartsiz-dal \(ad kart numarasıyla başlamıyor\)/);
  assert.doesNotMatch(cikti, /bulunamadı|bekleyen kart|#23|#24/);
  assert.match(cikti, /^23-alfa-is$/m);
});

test('durum: araç çalışma ağacını ve dalları değiştirmez', () => {
  const goruntu = (): string[] => [depo, agac].map((klasor) => komut(klasor, gunOnce(0), 'status', '--porcelain'))
    .concat(komut(depo, gunOnce(0), 'for-each-ref'), komut(depo, gunOnce(0), 'worktree', 'list', '--porcelain'));
  writeFileSync(join(depo, 'yarim.txt'), 'commit edilmemiş\n');
  try {
    const once = goruntu();
    assert.match(once[0] ?? '', /yarim\.txt/);
    assert.equal(durumKos([], depo, { simdi: SIMDI, kartKaynagi: kaynak({ 23: kart('devam') }) }).kod, 0);
    assert.deepEqual(goruntu(), once);
  } finally {
    rmSync(join(depo, 'yarim.txt'));
  }
});

test('durum: bilinmeyen argüman kullanım hatasıdır', () => {
  const sonuc = durumKos(['--dal'], depo, { simdi: SIMDI, kartKaynagi: kaynak({}) });
  assert.equal(sonuc.kod, 1);
  assert.match(sonuc.cikti, /Tanınmayan argüman: --dal\. Kullanım/);
});

test('araç alt süreç olarak: açık dal yokken tek satır, kartsız dal uyarısı çıkışı bozmaz, bilinmeyen bayrak 1 verir', () => {
  // Dalların adı kart numarası taşımaz: alt süreç gerçek gh çağırmaz.
  const kok = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-durum-arac-')));
  const kos = (...a: string[]) => {
    const s = spawnSync(process.execPath, [join(kok, 'araclar/durum.ts'), ...a], { cwd: kok, encoding: 'utf8' });
    return { kod: s.status, cikti: s.stdout, hata: s.stderr };
  };
  try {
    komut(kok, gunOnce(5), 'init', '-q', '-b', 'main');
    writeFileSync(join(kok, 'package.json'), '{ "type": "module" }\n');
    mkdirSync(join(kok, 'araclar'));
    for (const ad of ['durum.ts', 'sinir-denetimi.ts']) copyFileSync(fileURLToPath(new URL(`./${ad}`, import.meta.url)), join(kok, 'araclar', ad));
    isle(kok, 5, ['kok.txt'], 'taban');

    const bos = kos();
    assert.equal(bos.kod, 0, bos.hata);
    assert.equal(bos.cikti, 'Açık dal yok (taban main).\n');

    komut(kok, gunOnce(1), 'switch', '-q', '-c', 'deneme-dali');
    isle(kok, 1, ['sunucu/moduller/alfa/servis.ts'], 'wip');
    komut(kok, gunOnce(1), 'switch', '-q', 'main');
    const once = komut(kok, gunOnce(0), 'status', '--porcelain');

    const dolu = kos();
    assert.equal(dolu.kod, 0, dolu.hata);
    assert.match(dolu.cikti, /^Açık dal: 1 \(taban main\)$/m);
    assert.match(dolu.cikti, /^ {2}kartsız dal: deneme-dali \(ad kart numarasıyla başlamıyor\)$/m);
    assert.equal(komut(kok, gunOnce(0), 'status', '--porcelain'), once);

    const hatali = kos('--modul', 'alfa');
    assert.equal(hatali.kod, 1);
    assert.match(hatali.hata, /Kullanım: npm run durum/);
    assert.equal(hatali.cikti, '');
  } finally {
    rmSync(kok, { recursive: true, force: true });
  }
});

test('durum metni: açık dal yoksa tek satırdır', () => {
  assert.equal(durumMetni([], new Map(), [], SIMDI), 'Açık dal yok (taban main).');
});

test('kart numarası dal adının başından okunur; önek klasörü atlanır, ajan dalı sayılmaz', () => {
  assert.equal(kartNo('23-ic-ice-test'), 23);
  assert.equal(kartNo('modul/24-beta'), 24);
  assert.equal(kartNo('17'), 17);
  assert.equal(kartNo('stok-23'), null);
  assert.equal(kartNo('23abc'), null);
  assert.equal(kartNo('worktree-agent-12ab34'), null);
});

test('dokunulan modül: sunucu ve istemci klasörü, sözleşme ve işlem dosyası modüle, gerisi ortağa sayılır', () => {
  assert.equal(dokunulanModul('sunucu/moduller/stok/kurallar.ts'), 'stok');
  assert.equal(dokunulanModul('istemci/src/moduller/stok/Ekran.tsx'), 'stok');
  assert.equal(dokunulanModul('paylasilan/sozlesme/stok.ts'), 'stok');
  assert.equal(dokunulanModul('paylasilan/islemler/stok.ts'), 'stok');
  assert.equal(dokunulanModul('paylasilan/sayfalar/stok.ts'), 'stok');
  assert.equal(dokunulanModul('paylasilan/ayarlar/stok.ts'), 'stok');
  assert.equal(dokunulanModul('paylasilan/sayfalar.ts'), null);
  assert.equal(dokunulanModul('paylasilan/ayarlar.ts'), null);
  assert.equal(dokunulanModul('paylasilan/islemler.ts'), null);
  assert.equal(dokunulanModul('paylasilan/islemler/stok.test.ts'), null);
  assert.equal(dokunulanModul('istemci/src/moduller/Ortak.tsx'), null);
  assert.equal(dokunulanModul('sunucu/moduller/okuma.md'), null);
  assert.equal(dokunulanModul('sunucu/cekirdek/uc.ts'), null);
});

test('kart cevabı: başlık, boşluklu durum etiketi ve açıklık okunur; bozuk cevap null', () => {
  const cevap = { labels: [{ id: 'LA_a', name: 'tur: arac', description: '', color: 'ededed' }, { id: 'LA_b', name: 'durum: denetimde', description: '', color: '006b75' }], state: 'OPEN', title: 'C5: Ortak durum' };
  assert.deepEqual(kartCoz(JSON.stringify(cevap)), { baslik: 'C5: Ortak durum', durum: 'denetimde', acik: true });
  assert.deepEqual(kartCoz(JSON.stringify({ ...cevap, labels: [], state: 'CLOSED' })), { baslik: 'C5: Ortak durum', durum: null, acik: false });
  assert.equal(kartCoz('gh: hata'), null);
  assert.equal(kartCoz('{"title":"x"}'), null);
});
