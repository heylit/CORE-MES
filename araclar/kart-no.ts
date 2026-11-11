import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Kart numarasını devir belgesinden verir (3022 a). Elle verilen numara kayıttan geri kalınca aynı numara iki işe
// verilebiliyordu: sonraki numara, DURUM'daki değerle belgelerde geçen en büyük kart numarasının büyüğüdür.
// Yalnız devir deposunun yerel kopyasını okur ve --yaz ile yalnız DURUM satırını günceller; göndermez.

export const DURUM_SATIRI = /^\| Sonraki serbest kart no \| `(\d{3,5})`/m;

export function durumNoOku(durum: string): number {
  const e = DURUM_SATIRI.exec(durum);
  if (!e) throw new Error('DURUM.md içinde "| Sonraki serbest kart no | `<no>`" satırı yok');
  return Number(e[1]);
}

// Kart numarası sayılan: DURUM değerinin 300 altı ile 300 üstü arasındaki dört-beş haneli sayı; "#" ile başlayan (PR) ve
// saat ya da kayıt adı parçası olan ("kayit-1851", "18:51") sayılmaz. Yıl ve PR numaraları bu aralığa düşmez.
export function enBuyukKartNo(metinler: readonly string[], durumNo: number): number | null {
  let enBuyuk: number | null = null;
  for (const m of metinler) {
    for (const e of m.matchAll(/(?<![#\w:-])(\d{4,5})(?![\w:])/g)) {
      const n = Number(e[1]);
      if (n < durumNo - 300 || n > durumNo + 300) continue;
      if (enBuyuk === null || n > enBuyuk) enBuyuk = n;
    }
  }
  return enBuyuk;
}

export function sonrakiNolar(durumNo: number, enBuyuk: number | null, adet: number): number[] {
  const ilk = Math.max(durumNo, (enBuyuk ?? 0) + 1);
  return Array.from({ length: adet }, (_, i) => ilk + i);
}

export function durumYaz(durum: string, yeniNo: number, not: string): string {
  return durum.replace(/^(\| Sonraki serbest kart no \| )`\d{3,5}`[^|\n]*\|[^|\n]*\|/m, `$1\`${String(yeniNo)}\` (${not}) | K: araclar/kart-no.ts |`);
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Kullanım: node araclar/kart-no.ts <devir-klasörü> [--adet N] [--yaz] [--ek <dosya> ...]
if (dogrudanKosuyor) {
  const arg = process.argv.slice(2);
  const devir = arg[0];
  if (devir === undefined || devir.startsWith('--')) {
    console.error('Kullanım: node araclar/kart-no.ts <devir-klasörü> [--adet N] [--yaz] [--ek <dosya> ...]');
    process.exit(1);
  }
  const adetIx = arg.indexOf('--adet');
  const adet = adetIx >= 0 ? Number(arg[adetIx + 1]) : 1;
  if (!Number.isInteger(adet) || adet < 1 || adet > 50) { console.error('--adet 1-50 arası tam sayı olmalı'); process.exit(1); }
  const ekler = arg.flatMap((a, i) => (a === '--ek' && arg[i + 1] ? [arg[i + 1] as string] : []));
  const durumYolu = join(devir, 'durum', 'DURUM.md');
  const durum = readFileSync(durumYolu, 'utf8');
  const durumNo = durumNoOku(durum);
  const metinler = ['KARARLAR.md', 'ACIK-ISLER.md', 'GUNLUK.md', 'DURUM.md'].map((d) => readFileSync(join(devir, 'durum', d), 'utf8'))
    .concat(ekler.map((d) => readFileSync(d, 'utf8')));
  const enBuyuk = enBuyukKartNo(metinler, durumNo);
  const nolar = sonrakiNolar(durumNo, enBuyuk, adet);
  console.log(`DURUM: ${String(durumNo)}; belgelerde en büyük: ${enBuyuk === null ? 'yok' : String(enBuyuk)}`);
  console.log(`Verilen: ${nolar.join(', ')}`);
  if (arg.includes('--yaz')) {
    const sonraki = (nolar.at(-1) ?? durumNo) + 1;
    const saat = new Date().toISOString().slice(11, 16);
    writeFileSync(durumYolu, durumYaz(durum, sonraki, `${nolar.join(', ')} verildi ${saat}Z`));
    console.log(`DURUM.md: sonraki serbest kart no ${String(sonraki)} (yerel; yamayla gönderilir)`);
  }
}
