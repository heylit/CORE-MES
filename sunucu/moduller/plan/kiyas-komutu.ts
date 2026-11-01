import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ayarOku } from '#cekirdek/ayar.ts';
import { uygulamaHavuzuAc } from '#cekirdek/db.ts';
import { karsilastir, raporMetni, type KiyasSonucu } from './kiyas-kurallar.ts';
import { goruntuKos, goruntuMu, kiyasGoruntusuAl } from './kiyas.ts';

// Plan motoru kıyas seti (1475 a), komut satırı. Görüntü gerçek veri taşır; klasör depo dışında olmalıdır (kırmızı çizgi: depoya veri girmez).
//   Görüntü al (veritabanından, yalnız okur):
//     node --import ./araclar/ortam-yukle.ts --import ./araclar/kablolama-yukle.ts sunucu/moduller/plan/kiyas-komutu.ts al <klasör>
//   Koş (veritabanı gerekmez; klasördeki bütün görüntüler):
//     node sunucu/moduller/plan/kiyas-komutu.ts kos <klasör> [--onceki <sonuç.json>] [--yaz <sonuç.json>]
// Bulgu varsa çıkış kodu 1: motor değişikliğinden önce ve sonra koşulup sonuçlar karşılaştırılır.
const KOK = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export function depoDisinda(yol: string, kok: string = KOK): boolean {
  const r = relative(kok, resolve(yol));
  return r.startsWith('..') || isAbsolute(r);
}

function secenek(args: readonly string[], ad: string): string | null {
  const i = args.indexOf(ad);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : null;
}

async function al(klasor: string): Promise<void> {
  const vt = await uygulamaHavuzuAc(ayarOku());
  try {
    const g = await vt.okumaTx((db) => kiyasGoruntusuAl(db));
    if (g === null) { console.error('Planlama çalışması yok; görüntü alınmadı.'); process.exitCode = 1; return; }
    mkdirSync(klasor, { recursive: true });
    const dosya = join(klasor, `goruntu-${g.alinma.replace(/[:.]/g, '-')}.json`);
    writeFileSync(dosya, JSON.stringify(g));
    console.log(`Görüntü yazıldı: ${dosya}`);
  } finally {
    await vt.kapat();
  }
}

function kos(klasor: string, args: readonly string[]): void {
  const dosyalar = readdirSync(klasor).filter((d) => d.startsWith('goruntu-') && d.endsWith('.json')).sort();
  if (dosyalar.length === 0) { console.error(`Görüntü yok: ${klasor}`); process.exitCode = 1; return; }
  const goruntuler = [];
  for (const d of dosyalar) {
    const x: unknown = JSON.parse(readFileSync(join(klasor, d), 'utf8'));
    if (!goruntuMu(x)) { console.error(`Görüntü biçimi tanınmadı, atlandı: ${d}`); continue; }
    goruntuler.push(goruntuKos(d.replace(/\.json$/, ''), x));
  }
  const sonuc: KiyasSonucu = { zaman: new Date().toISOString(), goruntuler };
  const oncekiYol = secenek(args, '--onceki');
  const onceki = oncekiYol === null ? null : JSON.parse(readFileSync(oncekiYol, 'utf8')) as KiyasSonucu;
  const bulgular = karsilastir(sonuc, onceki);
  console.log(raporMetni(sonuc, bulgular));
  const yaz = secenek(args, '--yaz');
  if (yaz !== null) {
    if (!depoDisinda(yaz)) { console.error('Sonuç depo içine yazılmaz (gerçek veriden türer); depo dışında bir yol verin.'); process.exitCode = 1; return; }
    writeFileSync(yaz, JSON.stringify(sonuc, null, 1));
  }
  if (bulgular.length > 0) process.exitCode = 1;
}

// Doğrudan koşulunca çalışır; testler yalnız depoDisinda'yı ithal eder.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [komut, klasor, ...args] = process.argv.slice(2);
  if ((komut !== 'al' && komut !== 'kos') || !klasor) {
    console.error('Kullanım: kiyas-komutu.ts al <klasör> | kos <klasör> [--onceki <sonuç.json>] [--yaz <sonuç.json>]');
    process.exitCode = 1;
  } else if (!depoDisinda(klasor)) {
    console.error('Görüntü klasörü depo dışında olmalı: görüntü gerçek atölye verisi taşır.');
    process.exitCode = 1;
  } else if (komut === 'al') {
    await al(klasor);
  } else {
    kos(klasor, args);
  }
}
