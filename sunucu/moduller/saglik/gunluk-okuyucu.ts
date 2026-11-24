import { open, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { GunlukCevabi, GunlukSatiri, GunlukSorgusu } from '#paylasilan/sozlesme/saglik.ts';
import { GUNLUK_DOSYA_DESENI, gunlukImleciCoz, gunlukSatiriCoz, gunlukSatiriUyar } from './kurallar.ts';

// Sunucu günlüğünü ekrandan okur (kart 3668, A2): kopya tutulmaz, dosya sondan okunur. Bugünkü ve önceki günün dosyası okunur
// (günlük 60 gün saklanır; daha eskisi gün dönerken silinir). Bir istekte en çok `adet` satır ve BLOK_BUTCESI bayt taranır.
export const OKUNAN_DOSYA_SAYISI = 2;
const BLOK = 256 * 1024;
const BAYT_BUTCESI = 64 * 1024 * 1024;

// Klasördeki bütün günlük dosyaları, en yeniden eskiye (günlük 60 gün saklanır).
export async function gunlukDosyalari(dizin: string): Promise<string[]> {
  let adlar: string[];
  try { adlar = await readdir(dizin); } catch { return []; }
  return adlar.filter((a) => GUNLUK_DOSYA_DESENI.test(a)).sort().reverse();
}

const gunAdi = (dosya: string): string => dosya.slice('sunucu-'.length, 'sunucu-'.length + 10);

interface Parca { satir: string; baslangic: number }

// Dosyanın `bitis` baytından geriye doğru tam satırlar, en sondan başa. Yarım satır (blok sınırı) sonraki bloğa taşınır.
async function* satirlariGeriOku(dosya: string, bitis: number, okunan: { bayt: number }): AsyncGenerator<Parca> {
  const fd = await open(dosya, 'r');
  try {
    let konum = bitis;
    let artik: Buffer = Buffer.alloc(0);
    while (konum > 0) {
      const boy = Math.min(BLOK, konum);
      konum -= boy;
      const blok = Buffer.alloc(boy);
      await fd.read(blok, 0, boy, konum);
      okunan.bayt += boy;
      const veri = Buffer.concat([blok, artik]);
      const ilk = konum === 0 ? -1 : veri.indexOf(0x0a);
      let tam: Buffer;
      let tamBasi: number;
      if (konum === 0) { tam = veri; artik = Buffer.alloc(0); tamBasi = 0; }
      else if (ilk === -1) { artik = veri; continue; }
      else { artik = veri.subarray(0, ilk); tam = veri.subarray(ilk + 1); tamBasi = konum + ilk + 1; }
      // Satırlar sondan başa; her satırın başlangıç baytı imleç olur.
      let son = tam.length;
      for (let i = tam.length - 1; i >= -1; i -= 1) {
        if (i === -1 || tam[i] === 0x0a) {
          if (son > i + 1) yield { satir: tam.subarray(i + 1, son).toString('utf8'), baslangic: tamBasi + i + 1 };
          son = i;
        }
      }
      if (okunan.bayt > BAYT_BUTCESI) return;
    }
  } finally {
    await fd.close();
  }
}

export async function gunlukOku(dizin: string, sorgu: GunlukSorgusu): Promise<GunlukCevabi> {
  const tum = await gunlukDosyalari(dizin);
  const gunler = tum.map(gunAdi);
  // Gün verilmişse yalnız o dosya; yoksa bugünkü ve önceki. Olmayan gün boş cevaptır (dosya silinmiş ya da o gün günlük yok).
  const dosyalar = sorgu.gun === undefined ? tum.slice(0, OKUNAN_DOSYA_SAYISI) : tum.filter((a) => gunAdi(a) === sorgu.gun);
  if (dosyalar.length === 0) return { satirlar: [], sonraki: null, dosyalar: [], gunler };
  const baslangic = gunlukImleciCoz(sorgu.imlec, dosyalar);
  const satirlar: GunlukSatiri[] = [];
  const okunan = { bayt: 0 };
  let sonraki: string | null = null;
  for (let d = baslangic.dosya; d < dosyalar.length && sonraki === null; d += 1) {
    const ad = dosyalar[d] as string;
    const yol = path.join(dizin, ad);
    const boyut = d === baslangic.dosya && baslangic.ofset !== null ? baslangic.ofset : await sonBayt(yol);
    let sonOfset = boyut;
    for await (const parca of satirlariGeriOku(yol, boyut, okunan)) {
      sonOfset = parca.baslangic;
      const s = gunlukSatiriCoz(parca.satir);
      if (s !== null && gunlukSatiriUyar(s, sorgu)) satirlar.push(s);
      if (satirlar.length >= sorgu.adet) break;
    }
    const dosyaBitti = sonOfset === 0 || boyut === 0;
    if (satirlar.length >= sorgu.adet || okunan.bayt > BAYT_BUTCESI) {
      // Doldu ya da bütçe bitti: aynı dosyanın o satırdan öncesi (dosya bittiyse sıradaki dosya) sonraki sayfadır.
      if (!dosyaBitti) sonraki = `${ad}:${String(sonOfset)}`;
      else if (d + 1 < dosyalar.length) sonraki = `${dosyalar[d + 1] as string}:${String(await sonBayt(path.join(dizin, dosyalar[d + 1] as string)))}`;
    }
  }
  return { satirlar, sonraki, dosyalar, gunler };
}

async function sonBayt(yol: string): Promise<number> {
  const f = await open(yol, 'r');
  try { return (await f.stat()).size; } finally { await f.close(); }
}
