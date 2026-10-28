import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { isBekliyor, type IsBekliyor } from '#cekirdek/zamanlayici.ts';
import {
  medyaAltYolu, medyaAynasiGerekliMi, medyaKlasoruMu, medyaYeriEksigi, medyaYeriTutarMi, silinenMedyaSilinsinMi, yedekAdiniCoz,
} from './kurallar.ts';
import { nabiz } from './sorgular.ts';
import { bosYerOku, sifreliYaz, yedekSifresiniCoz, type BosYerOkuyucu, type YedekOrtami } from './yedek.ts';

// Talimat medyası aynası (1004 a, 1005 a). Medya veritabanında değil, TMIV2_MEDYA_DIZINI altında içerik özetli dosyalardadır;
// gece pg_dump'ına girmez. Ayna yedek klasörünün `medya` alt klasörüdür, aynı `ab/cd/özet` düzeniyle, her dosya veritabanı
// yedeğiyle aynı anahtar ve biçimde şifreli. Her gün yalnız yeni özetler kopyalanır; ayna günlük tam kopya tutmaz.
// Ayna veritabanına bakmaz: kaynakta olan her özeti alır, kaynaktan gideni 30 gün sonra siler.
export const MEDYA_AYNA_KLASORU = 'medya';
const SILINDI_EKI = '.silindi';
const YARIM_EKI = '.yarim';
const SON_AYNA_DOSYASI = '.son-ayna';
const YARIM_SAKLAMA_MS = 24 * 60 * 60 * 1000;
const NABIZ_MS = 1000;

export function medyaDiziniOku(env: NodeJS.ProcessEnv = process.env): string | null {
  const dizin = env['TMIV2_MEDYA_DIZINI']?.trim() ?? '';
  return dizin !== '' && path.isAbsolute(dizin) ? dizin : null;
}

export interface MedyaAynaSonucu {
  kopyalanan: number;
  kopyalananBayt: number;
  zatenVar: number;
  bozuk: string[];
  silindiIsaretlenen: number;
  geriGelen: number;
  silinen: number;
}

export interface MedyaGeriYuklemeSonucu {
  yazilan: number;
  zatenVar: number;
  bozuk: string[];
}

interface MedyaKaydi {
  ozet: string;
  yol: string;
}

// Yalnız `ab/cd/özet` kalıbına uyan dosyalar medyadır; saklayıcının geçici dosyaları (nokta ile başlar) ve yabancı dosyalar atlanır.
async function medyaTara(kok: string, ek: string): Promise<MedyaKaydi[]> {
  const kayitlar: MedyaKaydi[] = [];
  const oku = (yol: string): Promise<string[]> => readdir(yol).catch((hata: NodeJS.ErrnoException) => {
    if (hata.code === 'ENOENT') return [];
    throw hata;
  });
  for (const ab of await oku(kok)) {
    if (!medyaKlasoruMu(ab)) continue;
    for (const cd of await oku(path.join(kok, ab))) {
      if (!medyaKlasoruMu(cd)) continue;
      for (const ad of await oku(path.join(kok, ab, cd))) {
        if (!ad.endsWith(ek)) continue;
        const ozet = ad.slice(0, ad.length - ek.length);
        if (medyaYeriTutarMi(ab, cd, ozet)) kayitlar.push({ ozet, yol: path.join(kok, ab, cd, ad) });
      }
    }
  }
  return kayitlar;
}

const aynaKoku = (yedekDizini: string): string => path.join(yedekDizini, MEDYA_AYNA_KLASORU);
const aynaYolu = (kok: string, ozet: string): string => path.join(kok, ...medyaAltYolu(ozet));
const rastgeleEk = (): string => randomBytes(6).toString('hex');

async function varMi(yol: string): Promise<boolean> {
  return (await stat(yol).catch(() => null)) !== null;
}

// Kaynak okunurken özeti hesaplanır: diskte bozulmuş dosya aynaya "sağlam" diye geçmesin. Tutmazsa yarım dosya silinir.
async function aynala(anahtar: Buffer, kaynak: string, ozet: string, hedef: string): Promise<boolean> {
  const yarim = `${hedef}.${rastgeleEk()}${YARIM_EKI}`;
  const hash = createHash('sha256');
  const okuma = async function* (): AsyncGenerator<Buffer> {
    for await (const parca of createReadStream(kaynak)) {
      hash.update(parca as Buffer);
      yield parca as Buffer;
    }
  };
  try {
    await mkdir(path.dirname(hedef), { recursive: true });
    await sifreliYaz(anahtar, okuma(), yarim);
    if (hash.digest('hex') !== ozet) {
      await rm(yarim, { force: true });
      return false;
    }
    await rename(yarim, hedef);
    return true;
  } catch (hata) {
    await rm(yarim, { force: true });
    throw hata;
  }
}

async function medyaTaraHam(kok: string): Promise<string[]> {
  const yollar: string[] = [];
  const oku = (yol: string): Promise<string[]> => readdir(yol).catch(() => []);
  for (const ab of await oku(kok)) {
    if (!medyaKlasoruMu(ab)) continue;
    for (const cd of await oku(path.join(kok, ab))) {
      if (!medyaKlasoruMu(cd)) continue;
      for (const ad of await oku(path.join(kok, ab, cd))) yollar.push(path.join(kok, ab, cd, ad));
    }
  }
  return yollar;
}

// Aynadaki yarım dosyalar (yarıda kesilen tur) bir gün sonra silinir; başka süreçte süren turun dosyası gençtir.
async function yarimlariTemizle(kok: string, simdi: Date): Promise<void> {
  for (const k of await medyaTaraHam(kok)) {
    if (!k.endsWith(YARIM_EKI)) continue;
    const bilgi = await stat(k).catch(() => null);
    if (bilgi !== null && simdi.getTime() - bilgi.mtimeMs > YARIM_SAKLAMA_MS) await rm(k, { force: true });
  }
}

// Aynanın bir turu. Sıra: önce kaynakta olmayanlar işaretlenir ve 30 günü geçenler silinir, sonra yeni özetler kopyalanır.
// Yer, kopyadan önce denetlenir: yetmiyorsa hiçbir dosya kopyalanmaz, eski aynaya dokunulmaz.
export async function medyaAynala(
  anahtar: Buffer, medyaDizini: string, yedekDizini: string, simdi: Date, gunluk: Gunluk, bosYer: BosYerOkuyucu = bosYerOku,
): Promise<MedyaAynaSonucu> {
  const kok = aynaKoku(yedekDizini);
  await mkdir(kok, { recursive: true });
  const kaynak = await medyaTara(medyaDizini, '');
  const kaynakOzetleri = new Set(kaynak.map((k) => k.ozet));
  const ayna = new Set((await medyaTara(kok, '')).map((k) => k.ozet));
  const sonuc: MedyaAynaSonucu = { kopyalanan: 0, kopyalananBayt: 0, zatenVar: 0, bozuk: [], silindiIsaretlenen: 0, geriGelen: 0, silinen: 0 };

  for (const k of await medyaTara(kok, SILINDI_EKI)) {
    if (kaynakOzetleri.has(k.ozet)) {
      // Kaynağa geri gelen dosya (medya geri yüklendi): içerik aynı özet olduğu için işaret kaldırılır, yeniden kopyalanmaz.
      if (ayna.has(k.ozet)) await rm(k.yol, { force: true });
      else await rename(k.yol, aynaYolu(kok, k.ozet));
      ayna.add(k.ozet);
      sonuc.geriGelen += 1;
      continue;
    }
    const bilgi = await stat(k.yol).catch(() => null);
    if (bilgi !== null && silinenMedyaSilinsinMi(bilgi.mtime, simdi)) {
      await rm(k.yol, { force: true });
      sonuc.silinen += 1;
    }
  }
  for (const ozet of ayna) {
    if (kaynakOzetleri.has(ozet)) continue;
    const yol = aynaYolu(kok, ozet);
    const isaretli = `${yol}${SILINDI_EKI}`;
    // Taşıma dosya zamanını korur; 30 gün işaret anından sayılsın diye zaman yeniden yazılır.
    await rename(yol, isaretli);
    await utimes(isaretli, simdi, simdi);
    sonuc.silindiIsaretlenen += 1;
  }

  const yeniler = kaynak.filter((k) => !ayna.has(k.ozet));
  sonuc.zatenVar = kaynak.length - yeniler.length;
  let gereken = 0;
  const boylar = new Map<string, number>();
  for (const k of yeniler) {
    const bilgi = await stat(k.yol).catch(() => null);
    if (bilgi === null) continue;
    boylar.set(k.ozet, bilgi.size);
    gereken += bilgi.size;
  }
  const eksik = medyaYeriEksigi(await bosYer(yedekDizini), gereken);
  if (eksik !== null) throw new Error(eksik);
  for (const k of yeniler) {
    const boy = boylar.get(k.ozet);
    // Tarama ile kopya arasında saklayıcının sildiği dosya bu tur atlanır.
    if (boy === undefined) continue;
    const hedef = aynaYolu(kok, k.ozet);
    if (await aynala(anahtar, k.yol, k.ozet, hedef)) {
      sonuc.kopyalanan += 1;
      sonuc.kopyalananBayt += boy;
    } else {
      sonuc.bozuk.push(k.ozet);
      gunluk.hata(`Medya dosyası özetiyle tutmuyor, aynaya alınmadı: ${k.ozet}`);
    }
  }
  await yarimlariTemizle(kok, simdi);
  return sonuc;
}

// Geri yükleme veritabanından sonra koşar: aynadaki (30 günlük silinenler dahil) her özetten medya klasöründe olmayanı yazar.
// Fazladan gelen bağsız dosyayı saklayıcının kendi 30 günlük temizliği siler; eksik dosya ise talimatta resmin açılmamasıdır.
// Çözülen içerik özetiyle tutmazsa yazılmaz. Medya klasöründeki dosyaya dokunulmaz.
export async function medyaGeriYukle(anahtar: Buffer, yedekDizini: string, medyaDizini: string): Promise<MedyaGeriYuklemeSonucu> {
  const kok = aynaKoku(yedekDizini);
  const kayitlar = [...await medyaTara(kok, ''), ...await medyaTara(kok, SILINDI_EKI)];
  const sonuc: MedyaGeriYuklemeSonucu = { yazilan: 0, zatenVar: 0, bozuk: [] };
  const islenen = new Set<string>();
  for (const k of kayitlar) {
    if (islenen.has(k.ozet)) continue;
    islenen.add(k.ozet);
    const hedef = path.join(medyaDizini, ...medyaAltYolu(k.ozet));
    if (await varMi(hedef)) { sonuc.zatenVar += 1; continue; }
    await mkdir(path.dirname(hedef), { recursive: true });
    // Saklayıcının geçici dosya kalıbı (nokta ile başlar): yarım yazım medya taramasına girmez.
    const gecici = path.join(path.dirname(hedef), `.${k.ozet}.${rastgeleEk()}.tmp`);
    try {
      await yedekSifresiniCoz(anahtar, k.yol, gecici);
      const hash = createHash('sha256');
      for await (const parca of createReadStream(gecici)) hash.update(parca as Buffer);
      if (hash.digest('hex') !== k.ozet) {
        sonuc.bozuk.push(k.ozet);
        continue;
      }
      await rename(gecici, hedef);
      sonuc.yazilan += 1;
    } catch {
      sonuc.bozuk.push(k.ozet);
    } finally {
      await rm(gecici, { force: true });
    }
  }
  return sonuc;
}

async function sonAynaOku(kok: string): Promise<Date | null> {
  const metin = await readFile(path.join(kok, SON_AYNA_DOSYASI), 'utf8').catch(() => null);
  if (metin === null) return null;
  const an = new Date(metin.trim());
  return Number.isNaN(an.getTime()) ? null : an;
}

async function sonAynaYaz(kok: string, an: Date): Promise<void> {
  const yol = path.join(kok, SON_AYNA_DOSYASI);
  await writeFile(`${yol}${YARIM_EKI}`, `${an.toISOString()}\n`);
  await rename(`${yol}${YARIM_EKI}`, yol);
}

async function sonGeceYedegi(dizin: string, veritabani: string): Promise<Date | null> {
  let son: Date | null = null;
  for (const ad of await readdir(dizin).catch(() => [])) {
    const y = yedekAdiniCoz(ad);
    if (y === null || y.veritabani !== veritabani || y.tur !== 'gece') continue;
    if (son === null || y.zaman > son) son = y.zaman;
  }
  return son;
}

let suren = false;

// Gece işinin medya adımı: veritabanı yedeği turundan sonra çağrılır. Medya klasörü tanımlı değilse sessizce geçer (talimat medyası
// yok demektir); yedek klasörü ya da anahtar yoksa veritabanı turu zaten bekliyordur.
export async function geceMedyaTuru(
  db: Db, gunluk: Gunluk, ortam: YedekOrtami, simdi: Date, env: NodeJS.ProcessEnv = process.env,
): Promise<void | IsBekliyor> {
  const medya = medyaDiziniOku(env);
  if (medya === null) return;
  if (ortam.dizin === null || ortam.anahtar.durum !== 'tamam') return;
  const dizin = ortam.dizin;
  const kok = aynaKoku(dizin);
  if (!medyaAynasiGerekliMi(await sonGeceYedegi(dizin, ortam.pg.veritabani), await sonAynaOku(kok))) return;
  if (suren) return isBekliyor('Medya aynası sürüyor; sonraki turda bakılır.');
  suren = true;
  const sayac = setInterval(() => {
    nabiz(db).catch((hata: unknown) => { gunluk.uyar('Medya aynası sürerken veritabanı nabzı gitmedi', hata); });
  }, NABIZ_MS);
  try {
    const sonuc = await medyaAynala(ortam.anahtar.anahtar, medya, dizin, simdi, gunluk);
    // Bozuk dosya turu düşürmez: kalanlar aynalandı; bozuk olan aynada olmadığı için sonraki gece yeniden denenir ve yine günlüğe düşer.
    await sonAynaYaz(kok, simdi);
    if (sonuc.bozuk.length > 0) gunluk.hata(`Medya aynası: ${String(sonuc.bozuk.length)} dosya özetiyle tutmadı.`);
  } finally {
    clearInterval(sayac);
    suren = false;
  }
}
