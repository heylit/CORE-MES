import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Ihlal {
  dosya: string;
  satir: number;
  kural: 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'h';
  mesaj: string;
}

const TARANAN_KLASORLER = ['sunucu', 'paylasilan', 'istemci'];
const ATLANAN_KLASORLER = new Set(['node_modules', 'dist']);

const ITHAL_DESENLERI = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
];

// Tip parametreli çağrı (.sorgu<T>(...)) da yakalanmalı.
const SQL_CAGRISI = /\.(sorgu|tek)\s*[<(]/;

// Sezgisel: fs okuma adları ve Vite'ın dosyayı metin olarak veren ithal biçimleri. '?url' metin vermez.
const KAYNAK_OKUMA =
  /\b(?:readFile(?:Sync)?|createReadStream)\b|\?(?:raw|inline)['"`&]|\bas:\s*['"`]raw['"`]|\bquery:\s*\{\s*raw\b/;

const TAKMA_ADLAR: ReadonlyArray<readonly [string, string]> = [
  ['#paylasilan/', 'paylasilan/'],
  ['#cekirdek/', 'sunucu/cekirdek/'],
];

function yorumSatiriMi(satir: string): boolean {
  const kirpik = satir.trimStart();
  return kirpik.startsWith('//') || kirpik.startsWith('*') || kirpik.startsWith('/*');
}

// Depo içi hedefi depo köküne göre yol olarak verir; paket ithali null döner.
function hedefiCoz(dosya: string, belirtec: string): string | null {
  if (belirtec.startsWith('.')) return posix.normalize(posix.join(posix.dirname(dosya), belirtec));
  for (const [onek, klasor] of TAKMA_ADLAR) {
    if (belirtec.startsWith(onek)) return posix.normalize(klasor + belirtec.slice(onek.length));
  }
  return null;
}

export function modulAdi(yol: string): string | null {
  const parcalar = yol.split('/');
  if (parcalar[0] !== 'sunucu' || parcalar[1] !== 'moduller') return null;
  return parcalar[2] ?? null;
}

export type Taraf = 'sunucu' | 'istemci';

export interface ModulYeri {
  taraf: Taraf;
  ad: string;
}

// Sunucu ve istemci modülleri ayrı ad uzayıdır: aynı adlı iki klasör aynı modülün iki tarafıdır, birbirinin başka modülü değil.
// Modüller klasörünün kendi dosyası (ortak yer tutucu ekran) modül değildir. Uzantısız ad klasör ithalidir
// (`from '../b'`): çözücü onu klasörün index dosyasına götürür, o yüzden modülün kendisi sayılır.
export function modulYeri(yol: string): ModulYeri | null {
  const parcalar = yol.split('/');
  const taraf: Taraf | null = parcalar[0] === 'sunucu' && parcalar[1] === 'moduller' ? 'sunucu'
    : parcalar[0] === 'istemci' && parcalar[1] === 'src' && parcalar[2] === 'moduller' ? 'istemci' : null;
  if (taraf === null) return null;
  const sira = taraf === 'sunucu' ? 2 : 3;
  const ad = parcalar[sira];
  if (ad === undefined || ad === '' || (parcalar.length === sira + 1 && ad.includes('.'))) return null;
  return { taraf, ad };
}

const tarafKlasoru = (modul: string, taraf: Taraf): string =>
  taraf === 'sunucu' ? `sunucu/moduller/${modul}` : `istemci/src/moduller/${modul}`;

function satirdakiHedefler(dosya: string, satir: string): string[] {
  const hedefler: string[] = [];
  for (const desen of ITHAL_DESENLERI) {
    for (const eslesme of satir.matchAll(desen)) {
      const hedef = eslesme[1] === undefined ? null : hedefiCoz(dosya, eslesme[1]);
      if (hedef !== null) hedefler.push(hedef);
    }
  }
  return hedefler;
}

function satirliHedefler(dosya: string, icerik: string): Array<{ satir: number; hedef: string }> {
  return icerik.split(/\r?\n/).flatMap((satir, sira) =>
    (yorumSatiriMi(satir) ? [] : satirdakiHedefler(dosya, satir).map((hedef) => ({ satir: sira + 1, hedef }))));
}

const altinda = (yol: string, klasor: string): boolean => yol === klasor || yol.startsWith(`${klasor}/`);

function ithalKurali(dosya: string, hedef: string): Pick<Ihlal, 'kural' | 'mesaj'> | null {
  const kaynakModul = modulYeri(dosya);
  const hedefModul = modulYeri(hedef);
  // Taraflar arası ithal bu kuralın işi değil: istemciden sunucuya olanı kural d yakalar.
  if (kaynakModul !== null && hedefModul !== null && kaynakModul.taraf === hedefModul.taraf && kaynakModul.ad !== hedefModul.ad) {
    const disari = `${tarafKlasoru(hedefModul.ad, hedefModul.taraf)}/disari`;
    if (hedef !== disari && hedef !== `${disari}.ts`) {
      return { kural: 'a', mesaj: `modül başka modülün yalnız disari.ts dosyasını ithal eder (${hedef})` };
    }
  }
  if (altinda(dosya, 'sunucu/cekirdek') && altinda(hedef, 'sunucu/moduller')) {
    return { kural: 'b', mesaj: `cekirdek, modülleri ithal edemez (${hedef})` };
  }
  if (altinda(dosya, 'paylasilan') && (altinda(hedef, 'sunucu') || altinda(hedef, 'istemci'))) {
    return { kural: 'c', mesaj: `paylasilan, sunucu ya da istemciyi ithal edemez (${hedef})` };
  }
  if (altinda(dosya, 'istemci') && altinda(hedef, 'sunucu')) {
    return { kural: 'd', mesaj: `istemci, sunucuyu ithal edemez (${hedef})` };
  }
  return null;
}

export const testDosyasiMi = (dosya: string): boolean => /\.test\.tsx?$/.test(dosya);

// Testlerin ortak kurulum dosyası da yalnız testte koşar: ithali üretimdeki akış yönü değildir.
// Modülün örnek verisini hiçbir üretim kodu ithal etmez, çalıştırıcı klasörden bulur; onun ithali de akış yönü değildir.
// SQL ve kaynak okuma kuralları için test dosyası sayılmaz; orada ad kalıbı dardır.
const testKenariMi = (dosya: string): boolean =>
  testDosyasiMi(dosya) || /(?:^|\/)test-ortak\.tsx?$/.test(dosya) || /^sunucu\/moduller\/[^/]+\/ornek-veri\.ts$/.test(dosya);

function sqlSerbestMi(dosya: string): boolean {
  return posix.basename(dosya) === 'sorgular.ts' || testDosyasiMi(dosya);
}

// dosya: depo köküne göre, '/' ayraçlı yol.
export function ihlalleriBul(dosya: string, icerik: string): Ihlal[] {
  const ihlaller: Ihlal[] = [];
  const sqlDenetlenir = modulAdi(dosya) !== null && !sqlSerbestMi(dosya);
  const okumaDenetlenir = testDosyasiMi(dosya) && TARANAN_KLASORLER.some((klasor) => altinda(dosya, klasor));

  icerik.split(/\r?\n/).forEach((satir, sira) => {
    const satirNo = sira + 1;

    // Yorum satırı atlanmadan önce: '/* x */' ile başlayan satır da kod taşıyabilir.
    if (okumaDenetlenir && KAYNAK_OKUMA.test(satir)) {
      ihlaller.push({ dosya, satir: satirNo, kural: 'h', mesaj: 'test kaynak dosyasını metin olarak okumaz; davranışı ölçer' });
    }

    if (yorumSatiriMi(satir)) return;

    for (const hedef of satirdakiHedefler(dosya, satir)) {
      const sonuc = ithalKurali(dosya, hedef);
      if (sonuc) ihlaller.push({ dosya, satir: satirNo, ...sonuc });
    }

    if (sqlDenetlenir && SQL_CAGRISI.test(satir)) {
      ihlaller.push({
        dosya,
        satir: satirNo,
        kural: 'e',
        mesaj: 'modülde veritabanı çağrısı yalnız sorgular.ts içinde olur',
      });
    }
  });
  return ihlaller;
}

export interface KaynakDosya {
  dosya: string;
  icerik: string;
}

// hedef: ithal edilen modül. kaynak null: ithal eden dosya hiçbir modülün değil (giriş noktası, araç).
export interface ModulIthali {
  dosya: string;
  satir: number;
  test: boolean;
  kaynak: ModulYeri | null;
  hedef: ModulYeri;
}

const adSirasi = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Başka modüle giden her ithal, dosya ve satır sırasıyla. Hedefin hangi dosya olduğuna bakılmaz: disari.ts dışı ithal de bağımlılıktır.
export function modulIthalleri(dosyalar: readonly KaynakDosya[]): ModulIthali[] {
  const sonuc: ModulIthali[] = [];
  for (const { dosya, icerik } of [...dosyalar].sort((a, b) => adSirasi(a.dosya, b.dosya))) {
    const kaynak = modulYeri(dosya);
    const test = testKenariMi(dosya);
    for (const { satir, hedef: hedefYol } of satirliHedefler(dosya, icerik)) {
      const hedef = modulYeri(hedefYol);
      if (hedef === null || (kaynak !== null && kaynak.taraf === hedef.taraf && kaynak.ad === hedef.ad)) continue;
      sonuc.push({ dosya, satir, test, kaynak, hedef });
    }
  }
  return sonuc;
}

export interface ModulKenari {
  taraf: Taraf;
  kaynak: string;
  hedef: string;
  // Yalnız test dosyasından geçen kenar ayrı tutulur: testin kurulumu üretimdeki akış yönü değildir.
  test: boolean;
  dosya: string;
  satir: number;
}

// Modülden modüle kenarlar, taraf başına ayrı grafik; kenarın yeri onu kuran ilk dosya ve satırdır.
// Aynı çift hem üretim hem test dosyasından geçiyorsa iki ayrı kenardır. Taraflar arası ithal kenar değildir.
export function modulKenarlari(dosyalar: readonly KaynakDosya[]): ModulKenari[] {
  const kenarlar = new Map<string, ModulKenari>();
  for (const { dosya, satir, test, kaynak, hedef } of modulIthalleri(dosyalar)) {
    if (kaynak === null || kaynak.taraf !== hedef.taraf) continue;
    const anahtar = [kaynak.taraf, kaynak.ad, hedef.ad, test].join(' ');
    if (!kenarlar.has(anahtar)) kenarlar.set(anahtar, { taraf: kaynak.taraf, kaynak: kaynak.ad, hedef: hedef.ad, test, dosya, satir });
  }
  return [...kenarlar.values()];
}

export interface Dongu {
  taraf: Taraf;
  // Birbirine döngüyle bağlı bütün modüller, ada göre sıralı.
  bilesen: string[];
  // Bileşendeki en kısa döngülerden biri; en küçük adlı modülünden başlar ve ona döner: a, b, c, a.
  yol: string[];
  dosya: string;
  satir: number;
}

const TARAFLAR: readonly Taraf[] = ['sunucu', 'istemci'];

type Komsular = ReadonlyMap<string, ReadonlyMap<string, ModulKenari>>;

// Güçlü bağlı bileşenler (Tarjan), özyinelemesiz: uzun bir zincir çağrı yığınını taşırmaz.
function bilesenleriBul(dugumler: readonly string[], komsular: ReadonlyMap<string, readonly string[]>): string[][] {
  const sira = new Map<string, number>();
  const alt = new Map<string, number>();
  const yiginda = new Set<string>();
  const yigin: string[] = [];
  const bilesenler: string[][] = [];
  let sayac = 0;
  for (const kok of dugumler) {
    if (sira.has(kok)) continue;
    const is: Array<{ dugum: string; siradaki: number }> = [{ dugum: kok, siradaki: 0 }];
    while (is.length > 0) {
      const cerceve = is[is.length - 1];
      if (cerceve === undefined) break;
      const { dugum } = cerceve;
      if (cerceve.siradaki === 0) {
        sira.set(dugum, sayac);
        alt.set(dugum, sayac);
        sayac += 1;
        yigin.push(dugum);
        yiginda.add(dugum);
      }
      const hedef = (komsular.get(dugum) ?? [])[cerceve.siradaki];
      if (hedef !== undefined) {
        cerceve.siradaki += 1;
        if (!sira.has(hedef)) is.push({ dugum: hedef, siradaki: 0 });
        else if (yiginda.has(hedef)) alt.set(dugum, Math.min(alt.get(dugum) ?? 0, sira.get(hedef) ?? 0));
        continue;
      }
      is.pop();
      const ust = is[is.length - 1];
      if (ust !== undefined) alt.set(ust.dugum, Math.min(alt.get(ust.dugum) ?? 0, alt.get(dugum) ?? 0));
      if (alt.get(dugum) === sira.get(dugum)) {
        const bilesen: string[] = [];
        for (let uye = yigin.pop(); uye !== undefined; uye = yigin.pop()) {
          yiginda.delete(uye);
          bilesen.push(uye);
          if (uye === dugum) break;
        }
        bilesenler.push(bilesen.sort(adSirasi));
      }
    }
  }
  return bilesenler;
}

// Başlangıçtan çıkıp ona dönen en kısa yol (enine arama; komşular ada göre sıralı olduğundan seçim kararlıdır).
function enKisaDonus(baslangic: string, komsular: ReadonlyMap<string, readonly string[]>): string[] | null {
  const onceki = new Map<string, string>();
  let dalga = [baslangic];
  while (dalga.length > 0) {
    const sonraki: string[] = [];
    for (const dugum of dalga) {
      for (const hedef of komsular.get(dugum) ?? []) {
        if (hedef === baslangic) {
          const yol = [baslangic];
          for (let geri: string | undefined = dugum; geri !== undefined && geri !== baslangic; geri = onceki.get(geri)) yol.push(geri);
          return [baslangic, ...yol.slice(1).reverse(), baslangic];
        }
        if (onceki.has(hedef)) continue;
        onceki.set(hedef, dugum);
        sonraki.push(hedef);
      }
    }
    dalga = sonraki;
  }
  return null;
}

// Üretim kenarlarındaki döngüler, bileşen başına tek kayıt: bütün yalın döngüleri saymak orta boy grafikte bile
// üstel büyür ve tek hatalı ithal için binlerce satır basar. Düzeltilecek yer bileşendir; yol ona bir örnektir.
export function donguleriBul(kenarlar: readonly ModulKenari[]): Dongu[] {
  const donguler: Dongu[] = [];
  for (const taraf of TARAFLAR) {
    const kenarYeri = new Map<string, Map<string, ModulKenari>>();
    const dugumler = new Set<string>();
    for (const kenar of kenarlar) {
      if (kenar.taraf !== taraf || kenar.test) continue;
      const liste = kenarYeri.get(kenar.kaynak) ?? new Map<string, ModulKenari>();
      kenarYeri.set(kenar.kaynak, liste);
      if (!liste.has(kenar.hedef)) liste.set(kenar.hedef, kenar);
      dugumler.add(kenar.kaynak);
      dugumler.add(kenar.hedef);
    }
    const yerler: Komsular = kenarYeri;
    const komsular = new Map([...yerler].map(([kaynak, liste]) => [kaynak, [...liste.keys()].sort(adSirasi)] as const));
    const bulunan: Dongu[] = [];
    for (const bilesen of bilesenleriBul([...dugumler].sort(adSirasi), komsular)) {
      if (bilesen.length < 2) continue;
      let yol: string[] | null = null;
      for (const baslangic of bilesen) {
        const aday = enKisaDonus(baslangic, komsular);
        if (aday !== null && (yol === null || aday.length < yol.length)) yol = aday;
        if (yol !== null && yol.length === 3) break;
      }
      const ilk = yol === null ? undefined : yerler.get(yol[0] ?? '')?.get(yol[1] ?? '');
      if (yol !== null && ilk !== undefined) bulunan.push({ taraf, bilesen, yol, dosya: ilk.dosya, satir: ilk.satir });
    }
    for (const dongu of bulunan.sort((a, b) => adSirasi(a.bilesen[0] ?? '', b.bilesen[0] ?? ''))) donguler.push(dongu);
  }
  return donguler;
}

export function donguIhlali(dongu: Dongu): Ihlal {
  return {
    dosya: dongu.dosya, satir: dongu.satir, kural: 'f',
    mesaj: `döngü: ${dongu.yol.join(' -> ')} (bileşen: ${dongu.bilesen.join(', ')})`,
  };
}

export const modulunDonguleri = (donguler: readonly Dongu[], modul: string): Dongu[] =>
  donguler.filter((d) => d.bilesen.includes(modul));

export const ihlalSatiri = (i: Ihlal): string => `${i.dosya}:${i.satir} [kural ${i.kural}] ${i.mesaj}`;

export async function dosyalariTopla(kok: string, goreli: string): Promise<string[]> {
  const girdiler = await readdir(join(kok, goreli), { withFileTypes: true });
  const dosyalar: string[] = [];
  for (const girdi of girdiler) {
    const yol = `${goreli}/${girdi.name}`;
    if (girdi.isDirectory()) {
      if (ATLANAN_KLASORLER.has(girdi.name) || girdi.name.startsWith('.')) continue;
      dosyalar.push(...(await dosyalariTopla(kok, yol)));
    } else if (/\.tsx?$/.test(girdi.name)) {
      dosyalar.push(yol);
    }
  }
  return dosyalar;
}

// Döngü dosyaya değil depoya bakar: ihlalleri dosya ihlallerinden sonra gelir.
export async function depoyuDenetle(kok: string): Promise<{ dosyaSayisi: number; ihlaller: Ihlal[]; donguler: Dongu[] }> {
  const ihlaller: Ihlal[] = [];
  const dosyalar: KaynakDosya[] = [];
  for (const klasor of TARANAN_KLASORLER) {
    if (!existsSync(join(kok, klasor))) continue;
    for (const dosya of (await dosyalariTopla(kok, klasor)).sort()) {
      const icerik = await readFile(join(kok, dosya), 'utf8');
      dosyalar.push({ dosya, icerik });
      ihlaller.push(...ihlalleriBul(dosya, icerik));
    }
  }
  const donguler = donguleriBul(modulKenarlari(dosyalar));
  return { dosyaSayisi: dosyalar.length, ihlaller: [...ihlaller, ...donguler.map(donguIhlali)], donguler };
}

export interface Degisiklik {
  yol: string;
  yeni: boolean;
}

const GOC_YOLU = /^sunucu\/gocler\/([^/]+\.sql)$/;

const gocAdi = (yol: string): string | null => GOC_YOLU.exec(yol)?.[1] ?? null;

// Modül dalı yalnız kendi klasörlerine, kendi sözleşme, işlem, sayfa ve ayar dosyasına ve yeni göç dosyalarına yazar;
// var olan göç değişmezdir. Bunlar modül başına tek dosyadır ki iki dal aynı dosyaya yazmasın.
// Toplayan ortak dosyalar modül dalına kapalıdır: yeni modül dosyasını oraya çekirdek ekler.
//
// Taraf verilince dal yalnız o tarafın klasörüne yazar: iki taraf aynı modülde yan yana çalışırken
// ortak dosyalar paylasilan altındaki modül dosyalarıdır, o yüzden ikisine de kapalıdır ve ayrı, önce girer. Göç sunucu tarafınındır.
const MODUL_BASINA_DOSYA = ['sozlesme', 'islemler', 'sayfalar', 'ayarlar'];
// Modül klasörleri dışında modüle ait üst düzey klasör: kullanıcı kararıyla tek tek yazılır. Arkon kaynağı ayrı derlenir
// (`derle:arkon`) ve sunucu ile istemci ikisi de ondan alır; iki tarafa da açıktır.
export const MODUL_EK_KLASORLERI: Readonly<Record<string, readonly string[]>> = { arkon: ['arkon'] };

export function yolIhlalleri(modul: string, degisenler: readonly Degisiklik[], taraf: Taraf | null = null): string[] {
  const izinli = taraf === null
    ? [
      tarafKlasoru(modul, 'sunucu'), tarafKlasoru(modul, 'istemci'),
      ...MODUL_BASINA_DOSYA.map((klasor) => `paylasilan/${klasor}/${modul}.ts`),
    ]
    : [tarafKlasoru(modul, taraf)];
  izinli.push(...(Object.hasOwn(MODUL_EK_KLASORLERI, modul) ? MODUL_EK_KLASORLERI[modul] ?? [] : []));
  const gocSerbest = taraf !== 'istemci';
  return degisenler
    .filter((d) => !izinli.some((klasor) => altinda(d.yol, klasor)))
    .filter((d) => !(gocSerbest && d.yeni && GOC_YOLU.test(d.yol)))
    .map((d) => d.yol)
    .sort();
}

// Eşittirli yazım (`--taraf=sunucu`) bayrak olarak tanınmaz; yok sayılırsa daha gevşek denetim
// yeşil verir, o yüzden kullanım hatasıdır.
function bayrakYeri(argumanlar: readonly string[], ad: string, kullanim: string): number {
  if (argumanlar.some((a) => a.startsWith(`${ad}=`))) throw new Error(kullanim);
  return argumanlar.indexOf(ad);
}

const BILINEN_BAYRAKLAR = ['--modul', '--taraf', '--taban'];

// Yanlış yazılmış bayrak (`--tarf`) yok sayılırsa daha gevşek denetim yeşil verir; araç yalnız
// bildiği bayrakları ve onların değerlerini kabul eder, her biri en çok bir kez.
export function argumanlariDogrula(argumanlar: readonly string[]): void {
  const kullanim = 'Kullanım: npm run sinir -- [--modul <modul_adi> [--taraf sunucu|istemci] [--taban <dal>]]';
  const gorulen = new Set<string>();
  for (let sira = 0; sira < argumanlar.length; sira += 2) {
    const bayrak = argumanlar[sira] ?? '';
    if (!BILINEN_BAYRAKLAR.includes(bayrak)) throw new Error(`Tanınmayan argüman: ${bayrak}. ${kullanim}`);
    if (gorulen.has(bayrak)) throw new Error(`${bayrak} iki kez verildi. ${kullanim}`);
    gorulen.add(bayrak);
  }
}

export function modulSec(argumanlar: readonly string[]): string | null {
  const kullanim = 'Kullanım: npm run sinir -- --modul <modul_adi>';
  const bayrak = bayrakYeri(argumanlar, '--modul', kullanim);
  if (bayrak < 0) return null;
  const modul = argumanlar[bayrak + 1];
  if (!modul || !/^[a-z][a-z0-9-]*$/.test(modul)) throw new Error(kullanim);
  return modul;
}

// Taraf yalnız yol denetimini daraltır; `--modul` olmadan verilmesi sessizce yok sayılmaz.
// İki kez verilirse hangisinin geçerli olduğu tahmin edilmez.
export function tarafSec(argumanlar: readonly string[]): Taraf | null {
  const kullanim = 'Kullanım: npm run sinir -- --modul <modul_adi> --taraf sunucu|istemci';
  const bayrak = bayrakYeri(argumanlar, '--taraf', kullanim);
  if (bayrak < 0) return null;
  const taraf = argumanlar[bayrak + 1];
  const tek = argumanlar.lastIndexOf('--taraf') === bayrak;
  if (!tek || !argumanlar.includes('--modul') || (taraf !== 'sunucu' && taraf !== 'istemci')) throw new Error(kullanim);
  return taraf;
}

export function yolDenetimiBasligi(modul: string, taraf: Taraf | null, taban: string): string {
  return `Yol denetimi (${[modul, ...(taraf === null ? [] : [taraf]), `taban ${taban}`].join(', ')})`;
}

export function yolIhlaliMesaji(modul: string, taraf: Taraf | null): string {
  return taraf === null
    ? `${modul} modülünün klasörleri dışında değişiklik`
    : `${modul} modülünün ${taraf} tarafı dışında değişiklik`;
}

export function git(kok: string, argumanlar: string[]): string[] {
  // Tırnaklı yol (ASCII dışı ad) yol kalıplarına uymaz ve denetimden sessizce düşer.
  return execFileSync('git', ['-c', 'core.quotePath=false', ...argumanlar], { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').filter((s) => s !== '');
}

// Yanlış yazılmış ya da yerelde olmayan dal ve ortak atası olmayan dal aynı yere düşer.
function ayrilmaNoktasi(kok: string, taban: string): string {
  try {
    const [ayrilma] = git(kok, ['merge-base', 'HEAD', taban]);
    if (ayrilma) return ayrilma;
  } catch { /* aşağıdaki hata nedeni söyler */ }
  throw new Error(`Taban dal bulunamadı ya da bu dalla ortak atası yok: ${taban}`);
}

export const VARSAYILAN_TABAN = 'main';

// `--taban <dal>` verilmemişse ana dal; dal başka bir dalın üstüne kurulduysa o dal verilir.
export function tabanSec(argumanlar: readonly string[]): string {
  const kullanim = 'Kullanım: npm run sinir -- --modul <modul_adi> --taban <dal>';
  const bayrak = bayrakYeri(argumanlar, '--taban', kullanim);
  if (bayrak < 0) return VARSAYILAN_TABAN;
  const taban = argumanlar[bayrak + 1];
  if (!taban || taban.startsWith('-') || !argumanlar.includes('--modul')) throw new Error(kullanim);
  return taban;
}

// Tabandan ayrılma noktasından bu yana değişenler ile henüz commit'e girmemiş değişiklikler.
// Ayrılma noktası alınır, tabanın ucu değil: taban ilerlemişse onun yeni dosyaları bu dala yazılmaz.
export function degisenleriTopla(kok: string, taban: string): Degisiklik[] {
  const sonuc = new Map<string, boolean>();
  const ayrilma = ayrilmaNoktasi(kok, taban);
  // Çalışma ağacı doğrudan ayrılma noktasıyla kıyaslanır: dalda eklenip commit'siz yeniden adlandırılan
  // dosyanın eski adı düşer, yeni adı yeni sayılır. Yeniden adlandırma tek satıra inerse dışarıdan
  // taşınan dosyanın eski yolu görünmez.
  for (const satir of git(kok, ['diff', '--name-status', '--no-renames', ayrilma])) {
    const [durum, yol] = satir.split('\t');
    if (yol) sonuc.set(yol, durum === 'A');
  }
  for (const satir of git(kok, ['ls-files', '--others', '--exclude-standard'])) sonuc.set(satir, true);
  return [...sonuc].map(([yol, yeni]) => ({ yol, yeni }));
}

export function gocDamgasi(an: Date): string {
  const iki = (sayi: number): string => String(sayi).padStart(2, '0');
  return `${an.getFullYear()}${iki(an.getMonth() + 1)}${iki(an.getDate())}` +
    `${iki(an.getHours())}${iki(an.getMinutes())}${iki(an.getSeconds())}`;
}

function damgaAni(ad: string): Date | null {
  const p = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(ad)?.slice(1).map(Number);
  return p ? new Date(p[0] ?? 0, (p[1] ?? 1) - 1, p[2] ?? 1, p[3] ?? 0, p[4] ?? 0, p[5] ?? 0) : null;
}

export interface DamgaIhlali {
  dosya: string;
  sonGoc: string;
  // false: kendi damgası yeni, ama dalın eski damgalı göçünden sonra koşmalı.
  eski: boolean;
  onerilen: string;
}

// Göç koşucusu sırayı dosya adının tamamına göre kurar ve uygulanmış son göçten önce sıralanan yeni
// dosyayı reddeder; aynı kıyas burada birleştirmeden önce yapılır. Dalın bütün yeni göçleri birlikte
// yeniden damgalanır, birer saniye arayla: yalnız eskiler yenilenirse dalın kendi sırası bozulur.
// Saat tabandaki son göçün gerisindeyse öneri o göçün hemen sonrasından başlar.
export function eskiDamgaliGocler(
  degisenler: readonly Degisiklik[], tabandakiGocler: readonly string[], an: Date,
): DamgaIhlali[] {
  const sonGoc = [...tabandakiGocler].sort().pop();
  if (sonGoc === undefined) return [];
  const yeniler = degisenler
    .filter((d) => d.yeni)
    .map((d) => gocAdi(d.yol))
    .filter((ad): ad is string => ad !== null && !tabandakiGocler.includes(ad))
    .sort();
  if (!yeniler.some((ad) => ad < sonGoc)) return [];
  const baslangic = Math.max(an.getTime(), (damgaAni(sonGoc)?.getTime() ?? 0) + 1000);
  return yeniler.map((ad, sira) => ({
    dosya: ad,
    sonGoc,
    eski: ad < sonGoc,
    onerilen: `${gocDamgasi(new Date(baslangic + sira * 1000))}_${ad.replace(/^\d+_?/, '')}`,
  }));
}

// Var olan göç değişmezdir: kurulu sistemde göç koşucusu uygulanmış dosyanın özeti tutmazsa ya da dosya yoksa durur
// (sunucu/cekirdek/goc.ts). Tabanda bulunan göçün değişmesi ya da silinmesi ihlaldir; yeniden adlandırma silme sayılır.
export function degisenVarOlanGocler(degisenler: readonly Degisiklik[], tabandakiGocler: readonly string[]): string[] {
  return degisenler
    .filter((d) => !d.yeni)
    .map((d) => gocAdi(d.yol))
    .filter((ad): ad is string => ad !== null && tabandakiGocler.includes(ad))
    .sort();
}

export const VAR_OLAN_GOC_MESAJI = 'var olan göç değiştirilmiş ya da silinmiş; göç değişmezdir, değişikliği yeni göç dosyasıyla yapın';

export function damgaIhlaliMesaji(ihlal: DamgaIhlali): string {
  const neden = ihlal.eski
    ? `damga eski: tabandaki son göçten (${ihlal.sonGoc}) önce sıralanıyor`
    : 'dalın eski damgalı göçünden sonra koşmalı, sırası korunsun diye o da yenilenir';
  return `${neden}; yeni ad: ${ihlal.onerilen}`;
}

// Tabanın ucuna bakılır, ayrılma noktasına değil: öbür dalın göçü ayrılmadan sonra girmiştir.
export function tabandakiGocleriTopla(kok: string, taban: string): string[] {
  return git(kok, ['ls-tree', '--name-only', taban, 'sunucu/gocler/'])
    .map(gocAdi)
    .filter((ad): ad is string => ad !== null);
}

const dogrudanKosuyor =process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (dogrudanKosuyor) {
  const kok = fileURLToPath(new URL('../', import.meta.url));
  const { dosyaSayisi, ihlaller, donguler } = await depoyuDenetle(kok);
  for (const i of ihlaller) console.error(ihlalSatiri(i));
  console.log(`Sınır denetimi: ${dosyaSayisi} dosya, ${ihlaller.length} ihlal.`);
  if (ihlaller.length > 0) process.exitCode = 1;

  try {
    argumanlariDogrula(process.argv.slice(2));
    const modul = modulSec(process.argv);
    const taraf = tarafSec(process.argv);
    const taban = tabanSec(process.argv);
    if (modul !== null) {
      // Döngüler yukarıda depo genelinde raporlandı; burada yalnız bu modülün payı sayılır. Taban dala bakmaz.
      console.log(`Döngü denetimi (${modul}): ${modulunDonguleri(donguler, modul).length} döngü.`);

      const degisenler = degisenleriTopla(kok, taban);
      const disarida = yolIhlalleri(modul, degisenler, taraf);
      for (const yol of disarida) console.error(`${yol} [yol] ${yolIhlaliMesaji(modul, taraf)}`);
      console.log(`${yolDenetimiBasligi(modul, taraf, taban)}: ${disarida.length} ihlal.`);
      if (disarida.length > 0) process.exitCode = 1;

      // İstemci tarafında yeni göç zaten yol ihlalidir.
      if (taraf !== 'istemci') {
        const damgalar = eskiDamgaliGocler(degisenler, tabandakiGocleriTopla(kok, taban), new Date());
        for (const d of damgalar) console.error(`sunucu/gocler/${d.dosya} [göç] ${damgaIhlaliMesaji(d)}`);
        console.log(`Göç damgası denetimi (${modul}, taban ${taban}): ${damgalar.length} ihlal.`);
        if (damgalar.length > 0) process.exitCode = 1;
      }
    }
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exitCode = 1;
  }
}
