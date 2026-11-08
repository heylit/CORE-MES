import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku } from '#cekirdek/ayar.ts';
import { gocBaglantisiAc } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { diskKunyeOzetleri } from '../sunucu/moduller/dosya/disari.ts';
import {
  MEDYA_AYNA_KLASORU, dosyasiOlmayanlar, medyaAynala, medyaDiziniOku, medyaGeriYukle, yedekAl, yedekOrtamiOku, yedekSifresiniCoz, type YedekOrtami,
} from '../sunucu/moduller/ayarlar/disari.ts';
// Dış kopya her dosyayı gece yedeğiyle aynı yazıcıyla şifreler; biçim tek yerde kalsın diye.
import { sifreliYaz } from '../sunucu/moduller/ayarlar/yedek.ts';
import { denemeKaydiYaz, denemeSayilari, denemeVeritabani, denemeYap } from './geri-yukleme-denemesi.ts';
import { geriYuklemeKilidiniDenetle, yedegiGeriYukle } from './guncelleyici.ts';

// Komut satırından veritabanı yedeği ve geri yükleme: `npm run yedek`, `npm run geri-yukle -- <dosya>`; yeni yedek anahtarı
// `npm run yedek-anahtari` (yalnız ekrana yazar, hiçbir yere kaydetmez: anahtarı bilgi işlem saklar). Elle pg_restore için şifreli
// yedek düz dosyaya açılır: `npm run yedek-coz -- <yedek> <hedef>`. Talimat medyası (1004 a, 1008 a): `npm run yedek -- medya
// [--hedef <klasör>]` aynayı elle ya da ikinci diske (haftalık dış kopya) yazar, `npm run geri-yukle-medya [-- --kaynak <klasör>]`
// aynadan eksik dosyaları geri yazar; veritabanı geri yüklemesi de ardından medyayı geri yazar. WAL arşivi ve taban yedeğin şifreli
// dış kopyası (2290): `npm run yedek -- dis-kopya ...`, açması `npm run yedek-coz -- dis-kopya ...`. Sunucu ve yönetici
// ekranı gerekmez; göç taşıyan bir `git pull` öncesi tek komutla yedek alınsın diye. Yönetici (Windows) yetkisi ve PostgreSQL
// süper kullanıcısı istemez: yedeği uygulama kullanıcısı, geri yüklemeyi şemanın sahibi göç kullanıcısı yapar.
const kok = fileURLToPath(new URL('../', import.meta.url));

// Klasör seçilmediyse depo klasörünün yanına yazılır: yedek bütün veriyi taşır, deponun içine girmemeli.
export function yedekKlasoru(env: NodeJS.ProcessEnv, depoKoku: string): string {
  const secili = env['TMIV2_YEDEK_DIZINI']?.trim() ?? '';
  return secili !== '' ? secili : path.resolve(depoKoku, '..', 'TMIV2-YEDEK');
}

// Sunucu (ve gece yedeği, zamanlayıcı) uygulama kullanıcısıyla bağlıdır. Açıkken geri yükleme ya kilitte takılır ya da
// geri yüklenen veritabanına eski bağlantılar yazmayı sürdürür; "sunucu kapalı olmalı" yazmak yetmedi (kesinti tatbikatı D2).
export async function uygulamaOturumuSay(db: Pick<Db, 'tek'>, kullanici: string): Promise<number> {
  const satir = await db.tek<{ sayi: number }>(
    'SELECT count(*)::int AS sayi FROM pg_stat_activity WHERE usename = $1 AND datname = current_database() AND pid <> pg_backend_pid()',
    [kullanici],
  );
  return satir?.sayi ?? 0;
}

export function geriYuklemeEngeli(oturum: number): string | null {
  if (oturum === 0) return null;
  return `Sunucu açık: veritabanında uygulamanın ${String(oturum)} bağlantısı var. Sunucuyu (ve bekçi penceresini) kapatıp yeniden deneyin; `
    + 'hiçbir şey değişmedi.';
}

async function al(ortam: YedekOrtami): Promise<string> {
  const dizin = yedekKlasoru(process.env, kok);
  await mkdir(dizin, { recursive: true });
  const dosya = await yedekAl(ortam, dizin, 'elle', new Date());
  const yol = path.join(dizin, dosya.ad);
  const { size } = await stat(yol);
  console.log(`Yedek alındı: ${yol} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return yol;
}

function secenek(argumanlar: readonly string[], ad: string): string | null {
  const sira = argumanlar.indexOf(ad);
  if (sira === -1) return null;
  const deger = argumanlar[sira + 1];
  if (deger === undefined || deger.startsWith('--')) throw new Error(`${ad} için klasör verin.`);
  return path.resolve(deger);
}

function medyaIste(ortam: YedekOrtami): { medya: string; anahtar: Buffer } {
  const medya = medyaDiziniOku();
  if (medya === null) throw new Error('Talimat medyası klasörü yok: .env dosyasında TMIV2_MEDYA_DIZINI mutlak yol olmalı.');
  if (ortam.anahtar.durum !== 'tamam') throw new Error(ortam.anahtar.ileti);
  return { medya, anahtar: ortam.anahtar.anahtar };
}

// Komut satırının medya işleri veritabanının denetim kaydına yazamaz (sunucu kapalı olabilir); her çalıştırma aynanın yanındaki
// kayıt dosyasına bir satır bırakır: ne zaman, hangi işletim sistemi kullanıcısı, hangi komut, sonuç.
async function medyaKaydiYaz(yedekDizini: string, komut: string, sonuc: string): Promise<void> {
  const kullanici = process.env['USERNAME'] ?? process.env['USER'] ?? '?';
  const satir = `${new Date().toISOString()}\t${kullanici}\t${komut}\t${sonuc}\n`;
  await mkdir(path.join(yedekDizini, MEDYA_AYNA_KLASORU), { recursive: true });
  await appendFile(path.join(yedekDizini, MEDYA_AYNA_KLASORU, 'islem-kaydi.txt'), satir);
}

const konsolGunlugu = { uyar: (m: string) => { console.warn(m); }, hata: (m: string) => { console.error(m); } };

async function medyaAl(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  const { medya, anahtar } = medyaIste(ortam);
  const hedef = secenek(argumanlar, '--hedef') ?? yedekKlasoru(process.env, kok);
  await mkdir(hedef, { recursive: true });
  const s = await medyaAynala(anahtar, medya, hedef, new Date(), konsolGunlugu);
  const ozet = `kopyalanan ${String(s.kopyalanan)} (${(s.kopyalananBayt / 1024 / 1024).toFixed(1)} MB), zaten var ${String(s.zatenVar)}, `
    + `silindi işaretlenen ${String(s.silindiIsaretlenen)}, 30 günü geçip silinen ${String(s.silinen)}, bozuk ${String(s.bozuk.length)}`;
  await medyaKaydiYaz(hedef, 'medya-ayna', ozet);
  console.log(`Medya aynalandı: ${path.join(hedef, MEDYA_AYNA_KLASORU)}; ${ozet}.`);
  if (s.bozuk.length > 0) {
    console.error(`Özetiyle tutmayan medya (aynaya alınmadı): ${s.bozuk.join(', ')}`);
    process.exitCode = 1;
  }
}

async function medyaGeriYaz(ortam: YedekOrtami, kaynak: string): Promise<void> {
  const { medya, anahtar } = medyaIste(ortam);
  if (!existsSync(path.join(kaynak, MEDYA_AYNA_KLASORU))) {
    throw new Error(`Medya aynası yok: ${path.join(kaynak, MEDYA_AYNA_KLASORU)}. Aynanın bulunduğu klasörü --kaynak ile verin.`);
  }
  const s = await medyaGeriYukle(anahtar, kaynak, medya);
  const ozet = `yazılan ${String(s.yazilan)}, zaten var ${String(s.zatenVar)}, açılamayan ${String(s.bozuk.length)}`;
  await medyaKaydiYaz(kaynak, 'medya-geri-yukle', ozet);
  console.log(`Medya geri yüklendi: ${medya} <- ${path.join(kaynak, MEDYA_AYNA_KLASORU)}; ${ozet}.`);
  if (s.bozuk.length > 0) {
    console.error(`Açılamayan ya da özetiyle tutmayan medya (yazılmadı): ${s.bozuk.join(', ')}. Anahtarı ve aynayı denetleyin.`);
    process.exitCode = 1;
  }
  await kunyeEksiginiYaz(medya, kaynak);
}

// Veritabanı okunamazsa (göç kullanıcısı yok, sunucu kapalı) sayım atlanır ve bu söylenir; medya yine yazılmıştır.
async function kunyeEksiginiYaz(medya: string, kaynak: string): Promise<void> {
  let ozetler: string[];
  try {
    const db = gocBaglantisiAc({ ...ayarOku(), goc: gocKimligiOku() });
    try { ozetler = await db.okumaTx((d) => diskKunyeOzetleri(d)); } finally { await db.kapat(); }
  } catch (hata) {
    console.warn(`Künyesi olup dosyası olmayan medya sayılamadı (veritabanı okunamadı): ${hata instanceof Error ? hata.message : String(hata)}`);
    return;
  }
  const eksik = await dosyasiOlmayanlar(medya, ozetler);
  await medyaKaydiYaz(kaynak, 'medya-kunye-denetimi', `künye ${String(ozetler.length)}, dosyası olmayan ${String(eksik.length)}`);
  console.log(`Künyesi olup dosyası olmayan medya: ${String(eksik.length)} (künye ${String(ozetler.length)}); 0 olmalı.`);
  if (eksik.length > 0) {
    console.error(`Dosyası olmayan özetler (ilk 10): ${eksik.slice(0, 10).join(', ')}. Daha eski bir aynayı --kaynak ile deneyin.`);
    process.exitCode = 1;
  }
}

async function geriYukle(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  const dosya = argumanlar.find((a) => !a.startsWith('--'));
  if (dosya === undefined) throw new Error('Geri yüklenecek yedek dosyasını verin: npm run geri-yukle -- <dosya>');
  const yedek = path.resolve(dosya);
  if (!existsSync(yedek)) throw new Error(`Yedek dosyası yok: ${yedek}`);
  const vt = ortam.pg.veritabani;
  const denetim = gocBaglantisiAc({ ...ayarOku(), goc: gocKimligiOku() });
  try {
    const engel = geriYuklemeEngeli(await uygulamaOturumuSay(denetim, ortam.pg.kullanici));
    if (engel !== null) throw new Error(engel);
  } finally {
    await denetim.kapat();
  }
  const goc = { kullanici: process.env['TMIV2_PG_GOC_USER']?.trim() ?? '', parola: process.env['TMIV2_PG_GOC_PASSWORD'] ?? '' };
  // Kilit tablosu yetmeyecekse onay ve ön yedek beklenmeden söylenir; yedeğin kendi sayısıyla yükleme öncesinde yeniden bakılır.
  await geriYuklemeKilidiniDenetle(ortam, goc, kok);
  if (!argumanlar.includes('--evet')) {
    console.log(`"${vt}" veritabanının bütün içeriği silinip ${yedek} yedeğiyle değiştirilecek. Sunucu kapalı olmalı.`);
    const satir = createInterface({ input: process.stdin, output: process.stdout });
    const cevap = await satir.question(`Onaylıyorsanız veritabanı adını yazın (${vt}): `);
    satir.close();
    if (cevap.trim() !== vt) { console.log('Vazgeçildi; hiçbir şey değişmedi.'); return; }
  }
  // Yanlış dosya seçilirse geri dönülebilsin: bugünkü hal önce yedeklenir.
  console.log('Önce bugünkü veritabanı yedekleniyor...');
  await al(ortam);
  await yedegiGeriYukle(ortam, goc, yedek, kok);
  console.log(`Geri yüklendi: ${vt} <- ${yedek}`);
  // Önce veritabanı, sonra medya: geri gelen künyelerin dosyası aynadan tamamlanır. Dump elle başka yere kopyalanmış olabilir;
  // ayna her zaman yedek klasöründedir.
  if (medyaDiziniOku() !== null) await medyaGeriYaz(ortam, yedekKlasoru(process.env, kok));
  console.log('Kod yedekten yeniyse önce eski koda dönün; sonra "npm run goc" ve "npm run baslat".');
}

// `npm run geri-yukle-deneme -- <yedek>` (1670): asıl veritabanına dokunmaz; sunucu açıkken de koşar. Sonuç yedek klasörüne yazılır.
async function geriYuklemeDenemesi(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  const dosya = argumanlar.find((a) => !a.startsWith('--'));
  if (dosya === undefined) throw new Error('Denenecek yedek dosyasını verin: npm run geri-yukle-deneme -- <dosya>');
  const yedek = path.resolve(dosya);
  if (!existsSync(yedek)) throw new Error(`Yedek dosyası yok: ${yedek}`);
  const ad = denemeVeritabani(process.env);
  const deneme = { ...ortam, pg: { ...ortam.pg, veritabani: ad } };
  const goc = { kullanici: process.env['TMIV2_PG_GOC_USER']?.trim() ?? '', parola: process.env['TMIV2_PG_GOC_PASSWORD'] ?? '' };
  console.log(`"${yedek}" yedeği "${ad}" deneme veritabanına yükleniyor; asıl veritabanı değişmez...`);
  const sonuc = await denemeYap(yedek, {
    yukle: async () => {
      await geriYuklemeKilidiniDenetle(deneme, goc, kok);
      await yedegiGeriYukle(deneme, goc, yedek, kok);
    },
    say: async () => {
      const vt = gocBaglantisiAc({ ...ayarOku({ ...process.env, TMIV2_PG_DATABASE: ad }), goc: gocKimligiOku() });
      try {
        return await denemeSayilari(vt);
      } finally {
        await vt.kapat();
      }
    },
    simdi: () => new Date(),
  });
  const kayit = await denemeKaydiYaz(yedekKlasoru(process.env, kok), sonuc);
  if (sonuc.sonuc === 'basarili') {
    console.log(`Deneme başarılı (${String(sonuc.sureSn)} sn): ${String(sonuc.kisiSayisi)} kişi, ${String(sonuc.gocSayisi)} göç kaydı. Kayıt: ${kayit}`);
  } else {
    console.error(`Deneme başarısız: ${sonuc.hata ?? ''} Kayıt: ${kayit}`);
    process.exitCode = 1;
  }
}

async function coz(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  const [kaynak, hedef] = argumanlar;
  if (kaynak === undefined || hedef === undefined) throw new Error('Kullanım: npm run yedek-coz -- <şifreli yedek> <düz hedef dosya>');
  if (ortam.anahtar.durum !== 'tamam') throw new Error(ortam.anahtar.ileti);
  await yedekSifresiniCoz(ortam.anahtar.anahtar, path.resolve(kaynak), path.resolve(hedef));
  console.log(`Açıldı: ${path.resolve(hedef)}. Düz dosya bütün veriyi şifresiz taşır; işiniz bitince silin.`);
}

// Şifreli dış kopya (2283-1 a+e, 2283-2 a, kart 2290): WAL arşivi ve taban yedek sunucuda BitLocker'lı ikinci diskte düz durur;
// döner çevrimdışı diske yalnız şifreli gider. Diskte bir takım durur: en yeni tamamlanmış taban yedek ve onun başlangıcından
// bugüne WAL. Her dosya ayrı şifrelenir (gece yedeğiyle aynı anahtar ve biçim), klasör düzeni aynen korunur; WAL dosyaları
// değişmediği için diskte zaten olan atlanır. Yeni takım tamamlanmadan eskisi silinmez: yarıda sökülen disk son tam takımı taşır.
export const DIS_KOPYA_KLASORU = 'TMIV2-DIS-KOPYA';
const TAMAM_DOSYASI = '.tamam';
const YARIM_EKI = '.yarim';
const WAL_ADI = /^[0-9A-F]{24}$/;
const WAL_EKI_ADI = /^[0-9A-F]{24}\.[0-9A-F]{8}\.backup$/;
const ZAMAN_CIZGISI_ADI = /^[0-9A-F]{8}\.history$/;

// pg_basebackup'ın yazdığı backup_label: "START WAL LOCATION: 0/2000028 (file 000000010000000000000002)".
export function tabanBaslangicWal(backupLabel: string): string | null {
  return /^START WAL LOCATION: \S+ \(file ([0-9A-F]{24})\)\s*$/m.exec(backupLabel)?.[1] ?? null;
}

// Taban yedeğin başlangıç dosyası ve sonrası; zaman çizgisi dosyaları her zaman (küçüktür, geri dönüşte gerekir). Ad sırası WAL
// sırasıdır: zaman çizgisi önektedir, sonraki çizginin dosyaları sonra gelir. Yarım (.partial) ve tanınmayan dosya alınmaz.
export function gerekenWallar(adlar: readonly string[], baslangic: string): string[] {
  return adlar.filter((ad) => ZAMAN_CIZGISI_ADI.test(ad)
    || ((WAL_ADI.test(ad) || WAL_EKI_ADI.test(ad)) && ad.slice(0, 24) >= baslangic)).sort();
}

interface TabanYedek { ad: string; yol: string; baslangic: string }

// En yeni tamamlanmış taban yedek: backup_manifest pg_basebackup'ın en son yazdığı dosyadır, yoksa yedek sürüyor ya da yarım.
export async function sonTabanYedek(tabanDizini: string): Promise<TabanYedek> {
  const adlar = (await readdir(tabanDizini, { withFileTypes: true })).filter((g) => g.isDirectory()).map((g) => g.name).sort().reverse();
  for (const ad of adlar) {
    const yol = path.join(tabanDizini, ad);
    if (!existsSync(path.join(yol, 'backup_manifest'))) continue;
    const etiket = await readFile(path.join(yol, 'backup_label'), 'utf8').catch(() => '');
    const baslangic = tabanBaslangicWal(etiket);
    if (baslangic !== null) return { ad, yol, baslangic };
  }
  throw new Error(`Tamamlanmış taban yedek yok: ${tabanDizini} (backup_manifest ve backup_label taşıyan klasör). Önce taban yedek alın.`);
}

// Taban yedeğin ağacı: boş klasörler de (PostgreSQL veri klasörü boş klasör ister). Bağlantı (tablespace) desteklenmez.
async function agac(kok: string, alt = ''): Promise<{ klasorler: string[]; dosyalar: string[] }> {
  const sonuc = { klasorler: [] as string[], dosyalar: [] as string[] };
  for (const g of await readdir(path.join(kok, alt), { withFileTypes: true })) {
    const goreli = alt === '' ? g.name : path.join(alt, g.name);
    if (g.isDirectory()) {
      sonuc.klasorler.push(goreli);
      const ic = await agac(kok, goreli);
      sonuc.klasorler.push(...ic.klasorler);
      sonuc.dosyalar.push(...ic.dosyalar);
    } else if (g.isFile()) sonuc.dosyalar.push(goreli);
    else throw new Error(`Taban yedekte dosya ya da klasör olmayan öğe var (${goreli}); ek tablespace desteklenmez.`);
  }
  return sonuc;
}

async function sifreliKopyala(anahtar: Buffer, kaynak: string, hedef: string): Promise<void> {
  await mkdir(path.dirname(hedef), { recursive: true });
  const yarim = hedef + YARIM_EKI;
  try {
    await sifreliYaz(anahtar, createReadStream(kaynak), yarim);
    await rename(yarim, hedef);
  } catch (hata) {
    await rm(yarim, { force: true });
    throw hata;
  }
}

export interface DisKopyaSonucu {
  taban: string; tabanDosyasi: number; tabanBayt: number; tabanZatenVar: boolean; walAdet: number; walBayt: number; walYazilan: number;
  walZatenVar: number; silinen: number;
}

export async function disKopyaAl(anahtar: Buffer, kaynak: { wal: string; taban: string }, hedef: string): Promise<DisKopyaSonucu> {
  const taban = await sonTabanYedek(kaynak.taban);
  const kok = path.join(hedef, DIS_KOPYA_KLASORU);
  const tabanHedef = path.join(kok, 'taban', taban.ad);
  const sonuc: DisKopyaSonucu = {
    taban: taban.ad, tabanDosyasi: 0, tabanBayt: 0, tabanZatenVar: existsSync(path.join(tabanHedef, TAMAM_DOSYASI)), walAdet: 0, walBayt: 0,
    walYazilan: 0, walZatenVar: 0, silinen: 0,
  };
  const { klasorler, dosyalar } = await agac(taban.yol);
  for (const d of dosyalar) sonuc.tabanBayt += (await stat(path.join(taban.yol, d))).size;
  if (!sonuc.tabanZatenVar) {
    for (const k of klasorler) await mkdir(path.join(tabanHedef, k), { recursive: true });
    for (const d of dosyalar) await sifreliKopyala(anahtar, path.join(taban.yol, d), path.join(tabanHedef, d));
    sonuc.tabanDosyasi = dosyalar.length;
  }
  const gereken = gerekenWallar(await readdir(kaynak.wal), taban.baslangic);
  if (!gereken.some((ad) => ad.startsWith(taban.baslangic))) {
    throw new Error(`WAL arşivinde taban yedeğin başlangıç dosyası yok (${taban.baslangic}): ${kaynak.wal}. Arşiv ayarını denetleyin.`);
  }
  const walHedef = path.join(kok, 'wal');
  sonuc.walAdet = gereken.length;
  for (const ad of gereken) {
    sonuc.walBayt += (await stat(path.join(kaynak.wal, ad))).size;
    if (existsSync(path.join(walHedef, ad))) { sonuc.walZatenVar += 1; continue; }
    await sifreliKopyala(anahtar, path.join(kaynak.wal, ad), path.join(walHedef, ad));
    sonuc.walYazilan += 1;
  }
  // Taban tamam işareti WAL'dan sonra yazılır: işaretli takım geri dönüşe yeter.
  if (!sonuc.tabanZatenVar) await writeFile(path.join(tabanHedef, TAMAM_DOSYASI), `${new Date().toISOString()}\t${String(sonuc.tabanDosyasi)}\n`);
  for (const ad of await readdir(path.join(kok, 'taban'))) {
    if (ad === taban.ad) continue;
    await rm(path.join(kok, 'taban', ad), { recursive: true, force: true });
    sonuc.silinen += 1;
  }
  const kalan = new Set(gereken);
  for (const ad of await readdir(walHedef)) {
    if (kalan.has(ad)) continue;
    await rm(path.join(walHedef, ad), { force: true });
    sonuc.silinen += 1;
  }
  return sonuc;
}

export interface DisKopyaAcmaSonucu { taban: string; veriKlasoru: string; walKlasoru: string; dosya: number }

// Diskteki tam takımı düz hale açar: veri klasörü taban yedeğin aynısı, WAL klasörü restore_command'ın okuyacağı yer.
// Hedef boş olmalı; açılamayan ilk dosyada durur (yanlış anahtar ya da bozuk disk), yarım düz dosya bırakmaz.
export async function disKopyaAc(anahtar: Buffer, kaynak: string, hedef: string): Promise<DisKopyaAcmaSonucu> {
  const kok = path.basename(kaynak) === DIS_KOPYA_KLASORU ? kaynak : path.join(kaynak, DIS_KOPYA_KLASORU);
  const tabanlar = existsSync(path.join(kok, 'taban')) ? (await readdir(path.join(kok, 'taban'))).sort().reverse() : [];
  const ad = tabanlar.find((t) => existsSync(path.join(kok, 'taban', t, TAMAM_DOSYASI)));
  if (ad === undefined) throw new Error(`Dış kopyada tamamlanmış taban yedek yok: ${kok}.`);
  if (existsSync(hedef) && (await readdir(hedef)).length > 0) throw new Error(`Hedef klasör boş değil: ${hedef}. Boş ya da olmayan bir klasör verin.`);
  const veriKlasoru = path.join(hedef, 'veri');
  const walKlasoru = path.join(hedef, 'wal');
  const { klasorler, dosyalar } = await agac(path.join(kok, 'taban', ad));
  await mkdir(veriKlasoru, { recursive: true, mode: 0o700 });
  await mkdir(walKlasoru, { recursive: true, mode: 0o700 });
  for (const k of klasorler) await mkdir(path.join(veriKlasoru, k), { recursive: true, mode: 0o700 });
  let dosya = 0;
  const ac = async (k: string, h: string): Promise<void> => {
    try { await yedekSifresiniCoz(anahtar, k, h); } catch (hata) {
      throw new Error(`${k}: ${hata instanceof Error ? hata.message : String(hata)} Açılan düz dosyaları (${hedef}) silin.`);
    }
    dosya += 1;
  };
  for (const d of dosyalar) if (d !== TAMAM_DOSYASI && !d.endsWith(YARIM_EKI)) await ac(path.join(kok, 'taban', ad, d), path.join(veriKlasoru, d));
  const wallar = existsSync(path.join(kok, 'wal')) ? (await readdir(path.join(kok, 'wal'))).filter((w) => !w.endsWith(YARIM_EKI)) : [];
  for (const w of wallar) await ac(path.join(kok, 'wal', w), path.join(walKlasoru, w));
  return { taban: ad, veriKlasoru, walKlasoru, dosya };
}

// Sunucunun okuyabildiği kayıt (2290, 2282b): dış disk sökülünce oradaki kayıt görünmez. Yedek klasörüne her çalıştırmada bir
// JSON satırı; içerik adı ya da veri taşımaz, yalnız ne zaman, hangi taban ve ne kadar.
export const DIS_KOPYA_KAYDI_DOSYASI = 'dis-kopya.jsonl';

export interface DisKopyaKaydi {
  zaman: string; sonuc: 'basarili' | 'basarisiz'; hedef: string; taban: string | null; tabanBayt: number | null; walAdet: number | null;
  walBayt: number | null; hata: string | null;
}

export function disKopyaSatiri(k: DisKopyaKaydi): string {
  return `${JSON.stringify(k)}\n`;
}

export async function disKopyaKaydiEkle(yedekDizini: string, k: DisKopyaKaydi): Promise<string> {
  await mkdir(yedekDizini, { recursive: true });
  const dosya = path.join(yedekDizini, DIS_KOPYA_KAYDI_DOSYASI);
  await appendFile(dosya, disKopyaSatiri(k));
  return dosya;
}

function zorunluSecenek(argumanlar: readonly string[], ad: string, ornek: string): string {
  const deger = secenek(argumanlar, ad);
  if (deger === null) throw new Error(`${ad} verin. Örnek: ${ornek}`);
  return deger;
}

const DIS_KOPYA_ORNEGI = 'npm run yedek -- dis-kopya --wal E:\\TMIV2-WAL --taban E:\\TMIV2-TABAN --hedef F:\\';

async function disKopyaKaydiYaz(kok: string, komut: string, sonuc: string): Promise<void> {
  const kullanici = process.env['USERNAME'] ?? process.env['USER'] ?? '?';
  await mkdir(kok, { recursive: true });
  await appendFile(path.join(kok, 'islem-kaydi.txt'), `${new Date().toISOString()}\t${kullanici}\t${komut}\t${sonuc}\n`);
}

async function disKopyaKomutu(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  if (ortam.anahtar.durum !== 'tamam') throw new Error(ortam.anahtar.ileti);
  const wal = zorunluSecenek(argumanlar, '--wal', DIS_KOPYA_ORNEGI);
  const taban = zorunluSecenek(argumanlar, '--taban', DIS_KOPYA_ORNEGI);
  const hedef = zorunluSecenek(argumanlar, '--hedef', DIS_KOPYA_ORNEGI);
  if (!existsSync(hedef)) throw new Error(`Hedef yok: ${hedef}. Dış diski takın ya da var olan bir klasör verin.`);
  const yedekDizini = yedekKlasoru(process.env, kok);
  const zaman = new Date().toISOString();
  let s: DisKopyaSonucu;
  try {
    s = await disKopyaAl(ortam.anahtar.anahtar, { wal, taban }, hedef);
  } catch (hata) {
    const ileti = (hata instanceof Error ? hata.message : String(hata)).replace(/[\r\n]+/g, ' ').slice(0, 300);
    await disKopyaKaydiEkle(yedekDizini, { zaman, sonuc: 'basarisiz', hedef, taban: null, tabanBayt: null, walAdet: null, walBayt: null, hata: ileti });
    throw hata;
  }
  await disKopyaKaydiEkle(yedekDizini, {
    zaman, sonuc: 'basarili', hedef, taban: s.taban, tabanBayt: s.tabanBayt, walAdet: s.walAdet, walBayt: s.walBayt, hata: null,
  });
  const ozet = `taban ${s.taban} (${s.tabanZatenVar ? 'zaten vardı' : `${String(s.tabanDosyasi)} dosya`}), WAL yazılan ${String(s.walYazilan)}, `
    + `zaten var ${String(s.walZatenVar)}, eski takımdan silinen ${String(s.silinen)}`;
  await disKopyaKaydiYaz(path.join(hedef, DIS_KOPYA_KLASORU), 'dis-kopya', ozet);
  console.log(`Şifreli dış kopya yazıldı: ${path.join(hedef, DIS_KOPYA_KLASORU)}; ${ozet}. Diski çıkarıp sunucudan uzakta saklayın.`);
}

async function disKopyaAcKomutu(ortam: YedekOrtami, argumanlar: string[]): Promise<void> {
  if (ortam.anahtar.durum !== 'tamam') throw new Error(ortam.anahtar.ileti);
  const ornek = 'npm run yedek-coz -- dis-kopya --kaynak F:\\ --hedef D:\\GERI-DONUS';
  const kaynak = zorunluSecenek(argumanlar, '--kaynak', ornek);
  const hedef = zorunluSecenek(argumanlar, '--hedef', ornek);
  const s = await disKopyaAc(ortam.anahtar.anahtar, kaynak, hedef);
  console.log(`Açıldı (taban ${s.taban}, ${String(s.dosya)} dosya): veri klasörü ${s.veriKlasoru}, WAL ${s.walKlasoru}. `
    + 'Bu klasörler bütün veriyi şifresiz taşır. Zaman noktasına dönüş kurulum/yedek.md\'dedir; iş bitince silin.');
}

const dogrudanKosuyor = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (dogrudanKosuyor) {
  const [komut, ...argumanlar] = process.argv.slice(2);
  try {
    if (komut === 'anahtar') {
      console.log(`TMIV2_YEDEK_ANAHTARI=${randomBytes(32).toString('base64')}`);
      console.log('Bu satırı sunucunun .env dosyasına ekleyin ve bilgi işlemde ayrıca saklayın: anahtar kaybolursa yedekler açılmaz.');
      process.exit(0);
    }
    const ortam = yedekOrtamiOku();
    if (komut === 'al' && argumanlar[0] === 'dis-kopya') await disKopyaKomutu(ortam, argumanlar.slice(1));
    else if (komut === 'coz' && argumanlar[0] === 'dis-kopya') await disKopyaAcKomutu(ortam, argumanlar.slice(1));
    else if (komut === 'al' && argumanlar[0] === 'medya') await medyaAl(ortam, argumanlar.slice(1));
    else if (komut === 'al') await al(ortam);
    else if (komut === 'medya-geri-yukle') await medyaGeriYaz(ortam, secenek(argumanlar, '--kaynak') ?? yedekKlasoru(process.env, kok));
    else if (komut === 'geri-yukle') await geriYukle(ortam, argumanlar);
    else if (komut === 'geri-yukle-deneme') await geriYuklemeDenemesi(ortam, argumanlar);
    else if (komut === 'coz') await coz(ortam, argumanlar);
    else {
      throw new Error('Kullanım: npm run yedek | npm run yedek -- medya [--hedef <klasör>] | npm run geri-yukle -- <dosya> | '
        + 'npm run geri-yukle-medya [-- --kaynak <klasör>] | npm run geri-yukle-deneme -- <dosya> | npm run yedek-anahtari | '
        + 'npm run yedek-coz -- <yedek> <hedef> | npm run yedek -- dis-kopya --wal <k> --taban <k> --hedef <k> | '
        + 'npm run yedek-coz -- dis-kopya --kaynak <k> --hedef <k>');
    }
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exitCode = 1;
  }
}
