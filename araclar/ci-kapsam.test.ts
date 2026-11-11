import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../', import.meta.url));

interface Kapsam { sunucu: boolean; istemci: boolean; ekran: boolean }

function kapsam(olay: string, degisenler: readonly string[]): Kapsam {
  const r = spawnSync('bash', ['araclar/ci-kapsam.sh'], {
    cwd: KOK, input: degisenler.join('\n') + '\n', encoding: 'utf8', env: { ...process.env, OLAY: olay },
  });
  assert.equal(r.status, 0, r.stderr);
  const son = r.stdout.trim().split('\n').slice(-3);
  const deger = (ad: string): boolean => {
    const satir = son.find((s) => s.startsWith(`${ad}=`));
    assert.ok(satir, `${ad} satırı yok: ${r.stdout}`);
    return satir === `${ad}=true`;
  };
  return { sunucu: deger('sunucu'), istemci: deger('istemci'), ekran: deger('ekran') };
}

const HEPSI: Kapsam = { sunucu: true, istemci: true, ekran: true };
const HICBIRI: Kapsam = { sunucu: false, istemci: false, ekran: false };

test('ci-kapsam: ortak parça ve bilinmeyen yol her işi koşturur', () => {
  for (const yol of ['paylasilan/sayfalar.ts', 'istemci/src/ortak/Dugme.tsx', 'sunucu/cekirdek/db.ts', 'package.json',
    'package-lock.json', '.github/workflows/kontrol.yml', 'araclar/harita.ts', 'eslint.config.js', 'yeni-klasor/a.ts']) {
    assert.deepEqual(kapsam('pull_request', [yol]), HEPSI, yol);
  }
});

test('ci-kapsam: sunucunun ithal ettiği istemci klasörü sunucu testlerini de koşturur', () => {
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/recete-rota/kaynak-komutlari.ts']), HEPSI);
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/stok/StokSayfa.tsx']), { sunucu: false, istemci: true, ekran: true });
});

test('ci-kapsam: göç sunucu ve ekran işini her zaman koşturur', () => {
  assert.deepEqual(kapsam('pull_request', ['sunucu/gocler/20990101000000_x.sql']), { sunucu: true, istemci: false, ekran: true });
});

test('ci-kapsam: yalnız belge değişince ağır işler atlanır; modül klasöründeki .md çekme isteğinde koşturur', () => {
  assert.deepEqual(kapsam('pull_request', ['belgeler/a.md', 'kurulum/b.md', 'OKU.md']), HICBIRI);
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/stok/NOT.md']), { sunucu: false, istemci: true, ekran: true });
});

test('ci-kapsam: ana dal gönderimi yalnız belgeyle de daraltılmaz (2705 a), elle koşu ve boş fark daraltılmaz', () => {
  assert.deepEqual(kapsam('push', ['belgeler/a.md']), HEPSI);
  assert.deepEqual(kapsam('push', ['belgeler/a.md', 'istemci/src/moduller/stok/StokSayfa.tsx']), HEPSI);
  assert.deepEqual(kapsam('workflow_dispatch', ['belgeler/a.md']), HEPSI);
  assert.deepEqual(kapsam('pull_request', []), HEPSI);
});

test('ci-kapsam: taşımada eski ve yeni yol birlikte gelir, kontrol.yml farkı --no-renames ile alır', () => {
  assert.deepEqual(kapsam('pull_request', ['belgeler/a.ts', 'sunucu/a.ts']), { sunucu: true, istemci: false, ekran: true });
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/stok/X.tsx', 'istemci/src/ortak/X.tsx']), HEPSI);
  const is = readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8');
  assert.match(is, /degisenler=\$\(git diff --name-only --no-renames "\$taban" HEAD\)/);
});

test('kontrol.yml: ana dalda hiçbir iş iptal edilmez; ana dal ilerlemişse ağır işler atlanır, kontrol kırmızı (3045 a)', () => {
  const is = readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8').replaceAll('\r\n', '\n');
  assert.match(is, /^concurrency:\n {2}group: kontrol-\$\{\{ github\.ref == 'refs\/heads\/main' && github\.sha \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
  for (const ad of ['kapsam', 'tip', 'denetim', 'lint', 'istemci-test', 'sunucu-test', 'ekran', 'windows', 'windows-butunluk', 'kontrol']) {
    assert.ok(!isBlogu(is, ad).includes('concurrency:'), `${ad} iş düzeyinde iptal grubu taşımamalı`);
  }
  const kapsam = isBlogu(is, 'kapsam');
  assert.match(kapsam, /\n {6}eski: \$\{\{ steps\.uc\.outputs\.eski \}\}\n/, 'kapsam eski çıktısını verir');
  assert.match(kapsam, /- id: uc\n {8}if: github\.event_name == 'push'\n/, 'uç denetimi yalnız ana dal gönderiminde');
  assert.match(kapsam, /uc=\$\(git ls-remote origin refs\/heads\/main \| cut -f1\)\n {10}\[ -n "\$uc" \] \|\| \{/, 'uç okunamazsa iş düşer');
  assert.match(kapsam, /if \[ "\$uc" = "\$SHA" \]; then\n {12}echo 'eski=false' >> "\$GITHUB_OUTPUT"\n {10}else\n[^\n]*\n {12}echo 'eski=true' >> "\$GITHUB_OUTPUT"\n/, 'uç bu commit değilse eski');
  assert.match(kapsam, /\n {10}SHA: \$\{\{ github\.sha \}\}\n/);
  for (const [ad, cikti] of [['istemci-test', 'istemci'], ['sunucu-test', 'sunucu'], ['ekran', 'ekran']] as const) {
    assert.match(isBlogu(is, ad), new RegExp(`\\n {4}if: needs\\.kapsam\\.outputs\\.${cikti} == 'true' && needs\\.kapsam\\.outputs\\.eski != 'true'\\n`), ad);
  }
  // Windows ana dal ilerlese de koşar: her commit'in kendi Windows sonucu vardır (3018 a).
  assert.ok(!isBlogu(is, 'windows').includes('outputs.eski'), 'windows atlanmamalı');
  const kontrol = isBlogu(is, 'kontrol');
  assert.match(kontrol, /\n {10}ESKI: \$\{\{ needs\.kapsam\.outputs\.eski \}\}\n/);
  assert.match(kontrol, /if \[ "\$ESKI" = "true" \]; then\n {12}echo "::error::[^\n]*"\n {12}exit 1\n {10}fi\n/, 'atlanan ağır iş yeşil sayılmaz');
  assert.match(kontrol, /any\(\.\[\]; \.result == "cancelled"\)/, 'elle iptal de kırmızı');
});

test('kontrol.yml: Windows dört parçalı, parçalar test kümesinin tamamını sayarak alır (3018 a)', () => {
  const blok = isBlogu(readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8').replaceAll('\r\n', '\n'), 'windows');
  assert.match(blok, /\n {4}strategy:\n {6}fail-fast: false\n {6}matrix:\n {8}parca: \[1, 2, 3, 4\]\n/);
  assert.match(blok, /p=\$\(\( k % 4 \+ 1 \)\)/, 'dönüşümlü dağıtım');
  assert.match(blok, /parcalar\[0\] \+ parcalar\[1\] \+ parcalar\[2\] \+ parcalar\[3\] \)\) -eq "\$toplam"/, 'toplam denetimi');
  assert.match(blok, /--test-reporter=tap "\$\{benim\[@\]\}"/, 'parça yalnız kendi dosyalarını koşar');
  assert.match(blok, /\n {10}PARCA: \$\{\{ matrix\.parca \}\}\n/, 'PARCA matris parçasından gelir');
  assert.match(blok, /\n {12}\[ "\$p" -eq "\$PARCA" \] && benim\+=\("\$\{sirali\[\$k\]\}"\)\n/, 'parça yalnız kendi sırasındaki dosyayı seçer');
  assert.match(blok, /printf '%s\\n' "\$\{benim\[@\]\}" > "windows-parca-\$PARCA\.txt"/, 'koşan liste dosyaya yazılır');
  assert.match(blok, /name: windows-parca-\$\{\{ matrix\.parca \}\}\n {10}path: windows-parca-\$\{\{ matrix\.parca \}\}\.txt\n {10}if-no-files-found: error\n/);
  assert.ok(!/- name: Parçanın koştuğu dosya listesi\n {8}if:/.test(blok), 'liste yalnız yeşil parçada yüklenir (varsayılan koşul)');
  const butun = isBlogu(readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8').replaceAll('\r\n', '\n'), 'windows-butunluk');
  assert.match(butun, /for p in 1 2 3 4; do\n {12}\[ -s "parcalar\/windows-parca-\$p\.txt" \] \|\| \{/, 'dört liste aranır');
  assert.match(butun, /tekrar=\$\(uniq -d kosan\.txt\)/, 'iki parçada koşan dosya kırmızı');
  assert.match(butun, /diff tam\.txt kosan\.txt \|\|/, 'birleşim tam kümeye eşit');
  assert.match(butun, /sunucu\/cekirdek\/\*\*\/\*\.test\.ts' 'sunucu\/moduller\/stok\/\*\*\/\*\.test\.ts'\n {12}'sunucu\/moduller\/uretim-emirleri\/\*\*\/\*\.test\.ts' 'sunucu\/moduller\/plan\/\*\*\/\*\.test\.ts'\)/, 'aynı desenler');
  assert.match(blok, /grep -qx '# skipped 0'[^\n]*grep -qx '# todo 0'/, 'atlanan test kırmızı');
});

function isBlogu(is: string, ad: string): string {
  const bas = is.indexOf(`\n  ${ad}:\n`);
  assert.ok(bas >= 0, `${ad} işi yok`);
  const sonraki = is.slice(bas + 1).search(/\n {2}[a-z-]+:\n/);
  return sonraki === -1 ? is.slice(bas) : is.slice(bas, bas + 1 + sonraki);
}

test('kontrol.yml: Windows yeşili etiketi yalnız ana dalda, Windows ve kontrol yeşilken, zorlamasız (2964)', () => {
  const is = readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8').replaceAll('\r\n', '\n');
  const blok = isBlogu(is, 'windows-yesil');
  assert.match(blok, /\n {4}needs: \[windows, windows-butunluk, kontrol\]\n/);
  for (const kosul of ["needs.windows.result == 'success'", "needs['windows-butunluk'].result == 'success'", "needs.kontrol.result == 'success'", "github.ref == 'refs/heads/main'",
    "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')"]) assert.ok(blok.includes(kosul), kosul);
  assert.ok(!/always\(\)|failure\(\)|cancelled\(\)/.test(blok), 'iptal ya da kırmızı koşuda iş açılmamalı');
  assert.match(blok, /\n {4}permissions:\n {6}contents: write\n {4}steps:/);
  assert.match(is, /\npermissions:\n {2}contents: read\n {2}pull-requests: read\n\n/, 'üst düzey yetki yalnız okuma');
  const yazanlar = is.split('\n').filter((s) => /:\s*write\b/.test(s));
  assert.deepEqual(yazanlar, ['      contents: write'], 'yazma yetkisi tek satır');
  assert.equal(is.split('\n').filter((s) => /^ {4}permissions:/.test(s)).length, 1, 'iş düzeyi yetki yalnız etiket işinde');
  assert.ok(!/--force|\s-f\b|\+refs|tag -d|--delete/.test(blok), 'zorla gönderme ya da etiket silme yok');
});

test('windows-yesil adımı: commit başına bir etiket, yeniden koşu ikinci açmaz, var olan ad yeniden yazılmaz', () => {
  const is = readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8').replaceAll('\r\n', '\n');
  const satirlar = isBlogu(is, 'windows-yesil').split('\n');
  const bas = satirlar.findIndex((s) => s === '        run: |');
  assert.ok(bas >= 0, 'run bloğu yok');
  const betik = satirlar.slice(bas + 1).filter((s) => s.startsWith('          ') || s === '').map((s) => s.slice(10)).join('\n');
  const kok = mkdtempSync(join(tmpdir(), 'windows-yesil-'));
  try {
    const git = (cwd: string, ...a: string[]): string => {
      const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    const uzak = join(kok, 'uzak');
    const yerel = join(kok, 'yerel');
    git(kok, 'init', '-q', '--bare', uzak);
    git(kok, 'init', '-q', yerel);
    git(yerel, 'commit', '-q', '--allow-empty', '-m', 'bir');
    git(yerel, 'remote', 'add', 'origin', uzak);
    git(yerel, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
    const sha = git(yerel, 'rev-parse', 'HEAD');
    const dosya = join(kok, 'adim.sh');
    writeFileSync(dosya, betik);
    const kos = (s: string): ReturnType<typeof spawnSync> => spawnSync('bash', [dosya], {
      cwd: yerel, encoding: 'utf8', env: { ...process.env, SHA: s, KOSU: 'yerel', GITHUB_STEP_SUMMARY: join(kok, 'ozet') },
    });
    const etiketler = (): string[] => git(yerel, 'ls-remote', '--tags', 'origin').split('\n').filter(Boolean);
    assert.equal(kos(sha).status, 0);
    // Çok etiketle yeniden koşu: borudaki erken çıkış (SIGPIPE) "etiketli değil" sanılıp kırmızı bitmemeli.
    const dolgu = Array.from({ length: 3000 }, (_, i) => `create refs/tags/windows-yesil/99999999-0000-${String(i).padStart(4, '0')} ${sha}`);
    const r = spawnSync('git', ['update-ref', '--stdin'], { cwd: yerel, input: dolgu.join('\n') + '\n', encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    git(yerel, 'push', '-q', 'origin', 'refs/tags/windows-yesil/99999999-*:refs/tags/windows-yesil/99999999-*');
    for (let i = 0; i < 3; i++) assert.equal(kos(sha).status, 0, 'çok etiketle yeniden koşu');
    git(yerel, 'push', '-q', 'origin', '--delete', ...dolgu.map((d) => d.split(' ')[1] ?? ''));
    const ilk = etiketler();
    assert.equal(ilk.length, 2, ilk.join('\n'));
    assert.match(ilk[1] ?? '', new RegExp(`^${sha}\trefs/tags/windows-yesil/\\d{8}-\\d{4}-${sha.slice(0, 8)}\\^\\{\\}$`));
    const ad = (ilk[0] ?? '').split('\t')[1] ?? '';
    git(yerel, 'commit', '-q', '--allow-empty', '-m', 'iki');
    const yeni = git(yerel, 'rev-parse', 'HEAD');
    git(yerel, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
    git(yerel, 'push', '-q', 'origin', `--delete`, ad);
    git(yerel, 'tag', '-a', ad.replace('refs/tags/', ''), '-f', '-m', 'baska', yeni);
    git(yerel, 'push', '-q', 'origin', ad);
    git(yerel, 'tag', '-d', ad.replace('refs/tags/', ''));
    assert.notEqual(kos(sha).status, 0, 'aynı adda başka commit gösteren etiket yeniden yazılmamalı');
    assert.ok(etiketler().some((s) => s === `${yeni}\t${ad}^{}`));
  } finally {
    rmSync(kok, { recursive: true, force: true });
  }
});
