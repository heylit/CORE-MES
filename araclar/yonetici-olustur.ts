import { createInterface } from 'node:readline/promises';
import { ayarOku } from '#cekirdek/ayar.ts';
import { uygulamaHavuzuAc } from '#cekirdek/db.ts';
import { yoneticiOlustur } from '../sunucu/moduller/kisiler/disari.ts';

// Kullanım: npm run yonetici -- <kullanici_adi> "<Ad Soyad>"
// Parola komut satırına yazılmaz (kabuk geçmişinde kalır); sorulur.
const [kullaniciAdi, ad] = process.argv.slice(2);
if (!kullaniciAdi || !ad) {
  console.error('Kullanım: npm run yonetici -- <kullanici_adi> "<Ad Soyad>"');
  process.exit(1);
}

const okuyucu = createInterface({ input: process.stdin, output: process.stdout });
const parola = await okuyucu.question('Parola: ');
okuyucu.close();

const vt = await uygulamaHavuzuAc(ayarOku()).catch((hata: unknown) => {
  console.error(`Oluşturulamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
});
try {
  const id = await vt.tx((db) => yoneticiOlustur(db, { ad, kullaniciAdi, parola }));
  console.log(`Yönetici oluşturuldu: ${kullaniciAdi} (kişi no ${id})`);
} catch (hata) {
  console.error(`Oluşturulamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exitCode = 1;
} finally {
  await vt.kapat();
}
