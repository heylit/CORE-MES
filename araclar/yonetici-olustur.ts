import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ayarOku } from '#cekirdek/ayar.ts';
import { uygulamaHavuzuAc } from '#cekirdek/db.ts';
import { yoneticiOlustur } from '../sunucu/moduller/kisiler/disari.ts';

export interface TusDurumu {
  deger: string;
  bitti: boolean;
  iptal: boolean;
}

// Uçbirimden gelen ham tuş parçasını işler: Enter bitirir, Ctrl+C ve Ctrl+D iptal eder, geri silme son karakteri siler,
// öbür denetim karakterleri yok sayılır. Ekrana hiçbir şey yazılmaz; parolanın uzunluğu da görünmez.
export function tuslariIsle(onceki: string, parca: string): TusDurumu {
  let deger = onceki;
  // Ok ve işlev tuşları kaçış dizisi gönderir (ESC [ D gibi); dizinin tamamı parolaya girmeden atlanır.
  const temiz = parca.replace(/\u001b(?:[[O][0-9;]*[A-Za-z~]?)?/g, '');
  for (const h of temiz) {
    if (h === '\r' || h === '\n') return { deger, bitti: true, iptal: false };
    if (h === '\u0003' || h === '\u0004') return { deger: '', bitti: true, iptal: true };
    if (h === '\u007f' || h === '\b') deger = [...deger].slice(0, -1).join('');
    else if (h >= ' ') deger += h;
  }
  return { deger, bitti: false, iptal: false };
}

function gizliSor(soru: string): Promise<string | null> {
  const girdi = process.stdin;
  process.stdout.write(soru);
  girdi.setRawMode(true);
  girdi.resume();
  girdi.setEncoding('utf8');
  let deger = '';
  return new Promise((coz) => {
    const dinle = (parca: string) => {
      const durum = tuslariIsle(deger, parca);
      deger = durum.deger;
      if (!durum.bitti) return;
      girdi.off('data', dinle);
      girdi.setRawMode(false);
      girdi.pause();
      process.stdout.write('\n');
      coz(durum.iptal ? null : deger);
    };
    girdi.on('data', dinle);
  });
}

// Uçbirimde parola görünmeden ve yanlış yazmaya karşı iki kez sorulur (2245, kullanıcı kararı 07.11 22:46). Girdi borudan
// geliyorsa (betik, test) ekranda yankı yoktur; tek satır okunur.
async function parolaAl(): Promise<string | null> {
  if (process.stdin.isTTY) {
    const ilk = await gizliSor('Parola: ');
    if (ilk === null) return null;
    const ikinci = await gizliSor('Parola (tekrar): ');
    if (ikinci === null) return null;
    if (ilk !== ikinci) {
      console.error('Parolalar aynı değil; yönetici oluşturulmadı.');
      process.exit(1);
    }
    return ilk;
  }
  const okuyucu = createInterface({ input: process.stdin });
  const satir = await okuyucu.question('');
  okuyucu.close();
  return satir;
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Kullanım: npm run yonetici -- <kullanici_adi> "<Ad Soyad>"
// Parola komut satırına yazılmaz (kabuk geçmişinde kalır); sorulur.
if (dogrudanKosuyor) {
  const [kullaniciAdi, ad] = process.argv.slice(2);
  if (!kullaniciAdi || !ad) {
    console.error('Kullanım: npm run yonetici -- <kullanici_adi> "<Ad Soyad>"');
    process.exit(1);
  }

  const parola = await parolaAl();
  if (parola === null) {
    console.error('Vazgeçildi; yönetici oluşturulmadı.');
    process.exit(1);
  }

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
}
