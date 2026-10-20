import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VAR_OLAN_GOC_MESAJI, damgaIhlaliMesaji, degisenVarOlanGocler, degisenleriTopla, eskiDamgaliGocler, tabandakiGocleriTopla,
} from './sinir-denetimi.ts';
import type { DamgaIhlali } from './sinir-denetimi.ts';

// CI'da modülsüz koşan sınır denetimi göç damgasına bakmaz; eski damgalı göç birleşirse kurulu sistemde göç durur.
// Değişenler çekme isteğinin birleştirme commit'inden (ilk ebeveyn), son göç ana dalın güncel ucundan alınır:
// ana dal istek açıldıktan sonra yeni göç almış olabilir.
export function gocDamgasiniDenetle(kok: string, degisimTabani: string, gocTabani: string, an: Date): DamgaIhlali[] {
  return eskiDamgaliGocler(degisenleriTopla(kok, degisimTabani), tabandakiGocleriTopla(kok, gocTabani), an);
}

// Var olan göç, değişimin tabanında (birleştirme commit'inin ilk ebeveyni) bulunan göçtür.
export function degisenGocleriDenetle(kok: string, degisimTabani: string): string[] {
  return degisenVarOlanGocler(degisenleriTopla(kok, degisimTabani), tabandakiGocleriTopla(kok, degisimTabani));
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Kullanım: node araclar/goc-damgasi.ts <değişim tabanı> <son göç tabanı>
if (dogrudanKosuyor) {
  const [degisimTabani, gocTabani] = process.argv.slice(2);
  if (!degisimTabani || !gocTabani || process.argv.length !== 4) {
    console.error('Kullanım: node araclar/goc-damgasi.ts <değişim tabanı> <son göç tabanı>');
    process.exit(1);
  }
  const kok = fileURLToPath(new URL('../', import.meta.url));
  try {
    const ihlaller = gocDamgasiniDenetle(kok, degisimTabani, gocTabani, new Date());
    for (const i of ihlaller) console.error(`sunucu/gocler/${i.dosya} [göç] ${damgaIhlaliMesaji(i)}`);
    console.log(`Göç damgası denetimi (taban ${gocTabani}): ${ihlaller.length} ihlal.`);
    if (ihlaller.length > 0) process.exitCode = 1;
    const degisenler = degisenGocleriDenetle(kok, degisimTabani);
    for (const ad of degisenler) console.error(`sunucu/gocler/${ad} [göç] ${VAR_OLAN_GOC_MESAJI}`);
    console.log(`Var olan göç denetimi (taban ${degisimTabani}): ${degisenler.length} ihlal.`);
    if (degisenler.length > 0) process.exitCode = 1;
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exitCode = 1;
  }
}
