import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku } from './ayar.ts';
import { gocBaglantisiAc } from './db.ts';
import { gocHataIletisi, gocleriUygula } from './goc.ts';

const ayar = { ...ayarOku(), goc: gocKimligiOku() };
const klasor = fileURLToPath(new URL('../gocler/', import.meta.url));
const vt = gocBaglantisiAc(ayar);

try {
  const hedef = await vt.tek<{ ad: string }>('SELECT current_database() AS ad');
  console.log(`Hedef veritabanı: ${hedef?.ad ?? '?'} (ortam: ${ayar.ortam})`);
  const uygulananlar = await gocleriUygula(ayar, klasor);
  if (uygulananlar.length === 0) {
    console.log('Uygulanacak göç yok.');
  } else {
    for (const ad of uygulananlar) console.log(`Uygulandı: ${ad}`);
    console.log(`Toplam ${uygulananlar.length} göç uygulandı.`);
  }
} catch (hata) {
  console.error(`Göç başarısız: ${gocHataIletisi(hata)}`);
  process.exitCode = 1;
} finally {
  await vt.kapat();
}
