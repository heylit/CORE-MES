import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ucEnvanteri, yetkiMetni } from '#cekirdek/uc.ts';
import type { UcOzeti } from '#cekirdek/uc.ts';
import { modulBasinaUclar } from '#cekirdek/uygulama.ts';
import { dinamikSqlGocleri, disariImzalari, ekranCagrilari, sutunMetni, tabloSutunlari } from './harita-ayrinti.ts';
import type { EkranCagrilari, Imzalar, TabloSutunlari } from './harita-ayrinti.ts';
import { dosyalariTopla, modulIthalleri, modulKenarlari, testDosyasiMi } from './sinir-denetimi.ts';
import type { KaynakDosya } from './sinir-denetimi.ts';

export interface GocOzeti {
  ad: string;
  kurar: string[];
  degistirir: string[];
  siler: string[];
  adlandirir: Array<{ eski: string; yeni: string }>;
}

// sorgu: tabloya yalnız bu modülün sorgular.ts dosyası yazıyor. goc-adi: yazan yok, kuran göç modülün adını taşıyor.
// goc-yazan: ikisi de yok; tabloya satır yazan adlı göçlerin hepsi bu modülün adını taşıyor (ör. rol_islemi: rol x işlem
// satırları yalnız kisiler göçleriyle girer).
export interface ModulTablosu {
  ad: string;
  kaynak: 'sorgu' | 'goc-adi' | 'goc-yazan';
}

export interface BelirsizTablo {
  ad: string;
  goc: string;
  yazanlar: string[];
  okuyanlar: string[];
}

export interface ModulHaritasi {
  ad: string;
  sunucu: boolean;
  istemci: boolean;
  rota: boolean;
  sozlesme: boolean;
  uclar: UcOzeti[];
  islemler: string[];
  tablolar: ModulTablosu[];
  gocler: GocOzeti[];
  disaAciklar: string[];
  bagimli: string[];
  testteBagimli: string[];
  bagimlilar: string[];
  testteBagimlilar: string[];
  disKullananlar: string[];
}

export interface Harita {
  moduller: ModulHaritasi[];
  sahipsizGocler: GocOzeti[];
  belirsizTablolar: BelirsizTablo[];
  // Uygulanış sırası: koşucu dosya adına göre sıralar.
  gocSirasi: string[];
  sayfaIslemleri: string[];
  // Yaşayan bütün tabloların sütunları; kaynak göç DDL'i.
  sutunlar: TabloSutunlari[];
  // Tablo komutunu dizgeden kurabilen göçler; varsa sütun listesi eksik olabilir.
  dinamikSqlGocleri: string[];
}

// Yalnız tek modül kipinde üretilir: derleyiciyi yüklemek tam haritayı yavaşlatır.
export interface ModulAyrintisi {
  imzalar: Imzalar;
  cagrilar: EkranCagrilari;
}

const KOK = fileURLToPath(new URL('../', import.meta.url));

async function altKlasorler(yol: string): Promise<string[]> {
  if (!existsSync(yol)) return [];
  return (await readdir(yol, { withFileTypes: true })).filter((g) => g.isDirectory()).map((g) => g.name).sort();
}

async function dosyaAdlari(yol: string, uzanti: string): Promise<string[]> {
  if (!existsSync(yol)) return [];
  return (await readdir(yol)).filter((ad) => ad.endsWith(uzanti) && !testDosyasiMi(ad)).sort();
}

const sirali = (kume: Iterable<string>): string[] => [...new Set(kume)].sort();

const adlar = (metin: string, desenler: readonly RegExp[]): string[] =>
  desenler.flatMap((desen) => [...metin.matchAll(desen)].map((e) => (e[1] ?? '').toLowerCase()));

// <ad>: tablo adı; şema öneki (`public.t`) ve tırnak atılır, yakalanan yalnız tablodur.
const desen = (kalip: string): RegExp =>
  new RegExp(kalip.replaceAll('<ad>', String.raw`(?:"?\w+"?\s*\.\s*)?"?(\w+)"?`), 'gi');

const KURAR = desen(String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?<ad>`);
const SILER = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]+)/gi;
const ADLANDIRIR = desen(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?<ad>\s+RENAME\s+TO\s+"?(\w+)"?`);
const YAZAR = [
  desen(String.raw`\bINSERT\s+INTO\s+<ad>`),
  // Takma adlı yazım da yazmadır: `UPDATE t x SET`, `UPDATE t AS x SET`.
  desen(String.raw`\bUPDATE\s+(?:ONLY\s+)?<ad>(?:\s+(?:AS\s+)?\w+)?\s+SET\b`),
  desen(String.raw`\bDELETE\s+FROM\s+(?:ONLY\s+)?<ad>`),
];
const OKUR = [desen(String.raw`\b(?:FROM|JOIN)\s+(?:ONLY\s+)?<ad>`)];
// Dizin ve tetikleyici tabloyu `ON <tablo>` ile anar; çıplak `ON` birleştirme koşulunu da yakalardı.
const DEGISTIRIR = [
  ...YAZAR,
  desen(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?<ad>`),
  desen(String.raw`\bTRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?<ad>`),
  desen(String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?\w+\s+ON\s+(?:ONLY\s+)?<ad>`),
  desen(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+\w+\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+[\w\s,]+?\s+ON\s+<ad>`),
  desen(String.raw`\bDROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?\w+\s+ON\s+<ad>`),
];

// Yorum ve dizge içeriği komut değildir: `COMMENT ON TABLE t IS 'DROP TABLE t'` tabloyu silmez.
// Dolar tırnaklı gövde korunur; DO bloğundaki komut gerçekten koşar.
function sqlAyikla(metin: string): string {
  let sonuc = '';
  let i = 0;
  while (i < metin.length) {
    if (metin.startsWith('--', i)) {
      const son = metin.indexOf('\n', i);
      i = son < 0 ? metin.length : son;
    } else if (metin.startsWith('/*', i)) {
      const son = metin.indexOf('*/', i + 2);
      i = son < 0 ? metin.length : son + 2;
      sonuc += ' ';
    } else if (metin[i] === "'") {
      i += 1;
      while (i < metin.length && (metin[i] !== "'" || metin[i + 1] === "'")) i += metin[i] === "'" ? 2 : 1;
      i += 1;
      sonuc += "''";
    } else {
      sonuc += metin[i];
      i += 1;
    }
  }
  return sonuc;
}

// Kaynak dosyada yorum atılır, dizgeler koddan ayrılır: kodda `"<sıra>"` kalır, içerik ayrı listede.
// disari.ts için kod, sorgular.ts için dizgeler (SQL orada) okunur.
function tsAyir(metin: string): { kod: string; dizgeler: string[] } {
  const dizgeler: string[] = [];
  let kod = '';
  let i = 0;
  while (i < metin.length) {
    const c = metin[i] ?? '';
    if (metin.startsWith('//', i)) {
      const son = metin.indexOf('\n', i);
      i = son < 0 ? metin.length : son;
    } else if (metin.startsWith('/*', i)) {
      const son = metin.indexOf('*/', i + 2);
      i = son < 0 ? metin.length : son + 2;
      kod += ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      let son = i + 1;
      while (son < metin.length && metin[son] !== c) son += metin[son] === '\\' ? 2 : 1;
      kod += `"${dizgeler.length}"`;
      dizgeler.push(metin.slice(i + 1, son));
      i = son + 1;
    } else {
      kod += c;
      i += 1;
    }
  }
  return { kod, dizgeler };
}

const sorguSqli = (icerik: string): string => tsAyir(icerik).dizgeler.map(sqlAyikla).join('\n');

type Olay =
  | { yer: number; tur: 'kur'; tablo: string }
  | { yer: number; tur: 'sil'; tablo: string }
  | { yer: number; tur: 'adlandir'; tablo: string; yeni: string };

interface GocAyrintisi extends GocOzeti {
  sql: string;
  // Kurma, silme ve yeniden adlandırma dosyadaki sırasıyla: canlı tablo kümesi bu sırayla yürütülür.
  olaylar: Olay[];
}

function gocOzeti(ad: string, icerik: string): GocAyrintisi {
  const sql = sqlAyikla(icerik);
  const olaylar: Olay[] = [];
  for (const e of sql.matchAll(KURAR)) olaylar.push({ yer: e.index, tur: 'kur', tablo: (e[1] ?? '').toLowerCase() });
  for (const e of sql.matchAll(SILER)) {
    for (const parca of (e[1] ?? '').split(',')) {
      const tablo = ((parca.trim().split(/\s+/)[0] ?? '').replace(/"/g, '').split('.').pop() ?? '').toLowerCase();
      if (tablo !== '') olaylar.push({ yer: e.index, tur: 'sil', tablo });
    }
  }
  for (const e of sql.matchAll(ADLANDIRIR)) {
    olaylar.push({ yer: e.index, tur: 'adlandir', tablo: (e[1] ?? '').toLowerCase(), yeni: (e[2] ?? '').toLowerCase() });
  }
  olaylar.sort((a, b) => a.yer - b.yer);
  const kurar = sirali(olaylar.filter((o) => o.tur === 'kur').map((o) => o.tablo));
  const siler = sirali(olaylar.filter((o) => o.tur === 'sil').map((o) => o.tablo));
  const adlandirir = olaylar.flatMap((o) => (o.tur === 'adlandir' ? [{ eski: o.tablo, yeni: o.yeni }] : []));
  const anilan = new Set([...kurar, ...siler, ...adlandirir.flatMap((a) => [a.eski, a.yeni])]);
  const degistirir = sirali(adlar(sql, DEGISTIRIR)).filter((t) => !anilan.has(t));
  return { ad, kurar, degistirir, siler, adlandirir, olaylar, sql };
}

// Göç adı `<damga>_<modül>[_konu].sql` ise modülü verir; konu adı taşıyan göçte null.
function gocAdindakiModul(goc: string, moduller: readonly string[]): string | null {
  const govde = goc.replace(/^\d+_/, '').replace(/\.sql$/, '');
  return moduller.filter((m) => govde === m || govde.startsWith(`${m}_`)).sort((a, b) => b.length - a.length)[0] ?? null;
}

interface Sahiplik {
  sahip: Map<string, ModulTablosu & { modul: string }>;
  belirsiz: BelirsizTablo[];
  canli: Set<string>;
}

// Sahip, tabloya gerçekten yazan modüldür; göç adı yalnız yazan yokken sözü alır, önce kuran göçün adı, o da
// modül adı taşımıyorsa tabloya satır yazan adlı göçlerin adı. İki modül yazıyorsa ya da hiçbiri bir şey
// söylemiyorsa sahip uydurulmaz.
function sahipligiCoz(gocler: readonly GocAyrintisi[], sorgular: ReadonlyMap<string, string>, moduller: readonly string[]): Sahiplik {
  const kuran = new Map<string, string>();
  const canli = new Set<string>();
  // Yeniden adlandırılan tablonun eski adı yeni adın sahibine bağlanır; eski adı anan göç o modülde görünür.
  const ardil = new Map<string, string>();
  for (const goc of gocler) {
    for (const olay of goc.olaylar) {
      if (olay.tur === 'kur') {
        if (!kuran.has(olay.tablo)) kuran.set(olay.tablo, goc.ad);
        canli.add(olay.tablo);
        ardil.delete(olay.tablo);
      } else if (olay.tur === 'sil') {
        canli.delete(olay.tablo);
      } else {
        canli.delete(olay.tablo);
        canli.add(olay.yeni);
        kuran.set(olay.yeni, kuran.get(olay.tablo) ?? goc.ad);
        ardil.delete(olay.yeni);
        ardil.set(olay.tablo, olay.yeni);
      }
    }
  }
  const kullanan = (tablo: string, desenler: readonly RegExp[]): string[] =>
    [...sorgular].filter(([, icerik]) => adlar(icerik, desenler).includes(tablo)).map(([modul]) => modul).sort();

  // Adsız göçün yazması bir şey söylemez; yalnız modül adı taşıyan göçler sayılır. Tek modül çıkmazsa null.
  const gocYazani = (tablo: string): string | null => {
    const adlilar = sirali(gocler.filter((g) => adlar(g.sql, YAZAR).includes(tablo)).flatMap((g) => gocAdindakiModul(g.ad, moduller) ?? []));
    return adlilar.length === 1 ? adlilar[0] ?? null : null;
  };

  const sahip: Sahiplik['sahip'] = new Map();
  const belirsiz: BelirsizTablo[] = [];
  for (const [tablo, goc] of kuran) {
    if (ardil.has(tablo)) continue;
    const yazanlar = kullanan(tablo, YAZAR);
    const addan = gocAdindakiModul(goc, moduller);
    const gocYazan = yazanlar.length === 0 && addan === null ? gocYazani(tablo) : null;
    if (yazanlar.length === 1 && yazanlar[0] !== undefined) sahip.set(tablo, { ad: tablo, kaynak: 'sorgu', modul: yazanlar[0] });
    else if (yazanlar.length === 0 && addan !== null) sahip.set(tablo, { ad: tablo, kaynak: 'goc-adi', modul: addan });
    else if (gocYazan !== null) sahip.set(tablo, { ad: tablo, kaynak: 'goc-yazan', modul: gocYazan });
    else belirsiz.push({ ad: tablo, goc, yazanlar, okuyanlar: kullanan(tablo, OKUR).filter((m) => !yazanlar.includes(m)) });
  }
  for (const eski of ardil.keys()) {
    let son = eski;
    for (let adim = 0; adim < ardil.size && ardil.has(son); adim += 1) son = ardil.get(son) ?? son;
    const bulunan = sahip.get(son);
    if (bulunan) sahip.set(eski, { ...bulunan, ad: eski });
  }
  return { sahip, belirsiz: belirsiz.filter((b) => canli.has(b.ad)).sort((a, b) => a.ad.localeCompare(b.ad)), canli };
}

// Tip dışa açımı `(tip)` ile işaretlenir: çalışma anında yoktur, ithal eden `import type` yazar.
function disaAciklar(icerik: string): string[] {
  const { kod, dizgeler: kaynaklar } = tsAyir(icerik);
  const sonuc: string[] = [];
  for (const e of kod.matchAll(/\bexport\s+(type\s+)?\{([^}]*)\}/g)) {
    for (const parca of (e[2] ?? '').split(',').map((p) => p.trim()).filter((p) => p !== '')) {
      const tip = e[1] !== undefined || parca.startsWith('type ');
      const ad = parca.replace(/^type\s+/, '').split(/\s+as\s+/).pop() ?? '';
      sonuc.push(tip ? `${ad} (tip)` : ad);
    }
  }
  for (const e of kod.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(const|let|var|function\*?|class|enum|type|interface)\s+(\w+)/g)) {
    sonuc.push(e[1] === 'type' || e[1] === 'interface' ? `${e[2] ?? ''} (tip)` : (e[2] ?? ''));
  }
  for (const e of kod.matchAll(/\bexport\s+\*\s+(?:as\s+(\w+)\s+)?from\s+"(\d+)"/g)) {
    sonuc.push(e[1] ?? `* (${kaynaklar[Number(e[2])] ?? ''})`);
  }
  if (/\bexport\s+default\b/.test(kod)) sonuc.push('default');
  return sirali(sonuc);
}

const dizgeler = (deger: unknown): string[] =>
  Array.isArray(deger) ? deger.filter((o): o is string => typeof o === 'string') : [];

async function ithalEt(dosya: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(dosya).href)) as Record<string, unknown>;
}

interface Bagimlilik {
  bagimli: Set<string>;
  testteBagimli: Set<string>;
  bagimlilar: Set<string>;
  testteBagimlilar: Set<string>;
  disKullananlar: Set<string>;
}

// A, B'nin dosyasını ithal ediyorsa A bağımlıdır; B'nin "ona bağımlı" listesine A girer.
async function bagimliliklariTopla(kok: string): Promise<Map<string, Bagimlilik>> {
  const sonuc = new Map<string, Bagimlilik>();
  const al = (modul: string): Bagimlilik => {
    const var_ = sonuc.get(modul) ?? {
      bagimli: new Set(), testteBagimli: new Set(), bagimlilar: new Set(), testteBagimlilar: new Set(), disKullananlar: new Set(),
    };
    sonuc.set(modul, var_);
    return var_;
  };
  const dosyalar: KaynakDosya[] = [];
  for (const klasor of ['sunucu', 'araclar']) {
    if (!existsSync(join(kok, klasor))) continue;
    for (const dosya of await dosyalariTopla(kok, klasor)) dosyalar.push({ dosya, icerik: await readFile(join(kok, dosya), 'utf8') });
  }
  // Kenarlar sınır aracının döngü denetimiyle aynı kaynaktan okunur.
  for (const kenar of modulKenarlari(dosyalar)) {
    (kenar.test ? al(kenar.kaynak).testteBagimli : al(kenar.kaynak).bagimli).add(kenar.hedef);
    (kenar.test ? al(kenar.hedef).testteBagimlilar : al(kenar.hedef).bagimlilar).add(kenar.kaynak);
  }
  for (const ithal of modulIthalleri(dosyalar)) {
    if (ithal.kaynak === null && !ithal.test && ithal.hedef.taraf === 'sunucu') al(ithal.hedef.ad).disKullananlar.add(ithal.dosya);
  }
  return sonuc;
}

// Liste elle tutulmaz: uçlar çekirdeğin keşfinden, işlemler modülün işlem dosyasından, gerisi diskten okunur.
export async function haritaTopla(kok: string = KOK): Promise<Harita> {
  const sunucuKlasoru = join(kok, 'sunucu/moduller');
  const istemciKlasoru = join(kok, 'istemci/src/moduller');
  const sunucuAdlari = await altKlasorler(sunucuKlasoru);
  const istemciAdlari = await altKlasorler(istemciKlasoru);
  const tsAdlari = async (klasor: string): Promise<string[]> =>
    (await dosyaAdlari(join(kok, klasor), '.ts')).map((ad) => ad.replace(/\.ts$/, ''));
  const sozlesmeler = await tsAdlari('paylasilan/sozlesme');
  const islemDosyalari = await tsAdlari('paylasilan/islemler');

  const uclar = new Map((await modulBasinaUclar(sunucuKlasoru)).map((m) => [m.modul, ucEnvanteri(m.uclar)]));
  const gocKlasoru = join(kok, 'sunucu/gocler');
  const gocler: GocAyrintisi[] = [];
  for (const ad of await dosyaAdlari(gocKlasoru, '.sql')) gocler.push(gocOzeti(ad, await readFile(join(gocKlasoru, ad), 'utf8')));

  const sorgular = new Map<string, string>();
  for (const ad of sunucuAdlari) {
    const dosya = join(sunucuKlasoru, ad, 'sorgular.ts');
    if (existsSync(dosya)) sorgular.set(ad, sorguSqli(await readFile(dosya, 'utf8')));
  }
  const { sahip, belirsiz, canli } = sahipligiCoz(gocler, sorgular, sunucuAdlari);
  const tabloModulu = (tablo: string): string | null => sahip.get(tablo)?.modul ?? null;
  const bagimlilik = await bagimliliklariTopla(kok);

  const moduller: ModulHaritasi[] = [];
  for (const ad of sirali([...sunucuAdlari, ...istemciAdlari, ...sozlesmeler, ...islemDosyalari])) {
    const disari = join(sunucuKlasoru, ad, 'disari.ts');
    const islemDosyasi = join(kok, 'paylasilan/islemler', `${ad}.ts`);
    const bag = bagimlilik.get(ad);
    const haric = (kume: Set<string> | undefined, asil: Set<string> | undefined): string[] =>
      sirali(kume ?? []).filter((m) => !(asil?.has(m) ?? false));
    moduller.push({
      ad,
      sunucu: sunucuAdlari.includes(ad),
      istemci: istemciAdlari.includes(ad),
      // Araç istemci kodunu çalıştıramaz; uygulamanın keşfettiği dosyanın varlığına bakar.
      rota: existsSync(join(istemciKlasoru, ad, 'rotalar.tsx')),
      sozlesme: sozlesmeler.includes(ad),
      uclar: uclar.get(ad) ?? [],
      islemler: islemDosyalari.includes(ad) ? Object.values(await ithalEt(islemDosyasi)).flatMap(dizgeler) : [],
      tablolar: [...sahip.values()].filter((t) => t.modul === ad && canli.has(t.ad))
        .map(({ ad: tablo, kaynak }) => ({ ad: tablo, kaynak })).sort((a, b) => a.ad.localeCompare(b.ad)),
      gocler: gocler
        .map((g) => ({
          ad: g.ad,
          kurar: g.kurar.filter((t) => tabloModulu(t) === ad),
          degistirir: g.degistirir.filter((t) => tabloModulu(t) === ad),
          siler: g.siler.filter((t) => tabloModulu(t) === ad),
          adlandirir: g.adlandirir.filter((a) => tabloModulu(a.yeni) === ad || tabloModulu(a.eski) === ad),
        }))
        .filter((g) => g.kurar.length + g.degistirir.length + g.siler.length + g.adlandirir.length > 0
          || gocAdindakiModul(g.ad, sunucuAdlari) === ad),
      disaAciklar: existsSync(disari) ? disaAciklar(await readFile(disari, 'utf8')) : [],
      bagimli: sirali(bag?.bagimli ?? []),
      testteBagimli: haric(bag?.testteBagimli, bag?.bagimli),
      bagimlilar: sirali(bag?.bagimlilar ?? []),
      testteBagimlilar: haric(bag?.testteBagimlilar, bag?.bagimlilar),
      disKullananlar: sirali(bag?.disKullananlar ?? []),
    });
  }

  const sayfaDosyasi = join(kok, 'paylasilan/sayfalar.ts');
  return {
    moduller,
    sahipsizGocler: gocler.filter((g) => !moduller.some((m) => m.gocler.some((mg) => mg.ad === g.ad)))
      .map(({ ad, kurar, degistirir, siler, adlandirir }) => ({ ad, kurar, degistirir, siler, adlandirir })),
    belirsizTablolar: belirsiz,
    gocSirasi: gocler.map((g) => g.ad),
    sayfaIslemleri: existsSync(sayfaDosyasi) ? dizgeler((await ithalEt(sayfaDosyasi)).SAYFA_ISLEMLERI) : [],
    sutunlar: tabloSutunlari(gocler),
    dinamikSqlGocleri: dinamikSqlGocleri(gocler),
  };
}

export async function modulAyrintisi(harita: Harita, modul: string, kok: string = KOK): Promise<ModulAyrintisi> {
  const uclar = harita.moduller.flatMap((m) => m.uclar.map((u) => ({ modul: m.ad, yontem: u.yontem, yol: u.yol })));
  return { imzalar: await disariImzalari(kok, modul), cagrilar: await ekranCagrilari(kok, modul, uclar) };
}

const girinti = (satirlar: string[], bosluk: string): string[] => satirlar.map((s) => `${bosluk}${s}`.trimEnd());

function sutunlar(satirlar: string[][]): string[] {
  const en = (sira: number): number => Math.max(0, ...satirlar.map((s) => (s[sira] ?? '').length));
  return satirlar.map((s) => s.map((hucre, sira) => hucre.padEnd(en(sira))).join('  ').trimEnd());
}

const bolum = (baslik: string, satirlar: string[]): string[] =>
  [`  ${baslik} (${satirlar.length})`, ...girinti(satirlar.length > 0 ? satirlar : ['yok'], '    ')];

const tekSatir = (baslik: string, ogeler: string[], ekler: Array<[string, string[]]> = []): string =>
  [`  ${baslik} (${ogeler.length}): ${ogeler.length > 0 ? ogeler.join(', ') : 'yok'}`,
    ...ekler.filter(([, liste]) => liste.length > 0).map(([ad, liste]) => `${ad}: ${liste.join(', ')}`)].join('; ');

function gocSatirlari(gocler: readonly GocOzeti[]): string[] {
  return sutunlar(gocler.map((g) => [g.ad, [
    ...(g.kurar.length > 0 ? [`kurar: ${g.kurar.join(', ')}`] : []),
    ...(g.degistirir.length > 0 ? [`değiştirir: ${g.degistirir.join(', ')}`] : []),
    ...(g.siler.length > 0 ? [`siler: ${g.siler.join(', ')}`] : []),
    ...(g.adlandirir.length > 0 ? [`adlandırır: ${g.adlandirir.map((a) => `${a.eski} -> ${a.yeni}`).join(', ')}`] : []),
  ].join('; ')]));
}

const SUTUN_ACIKLAMASI = '? boş olabilir, PK birincil anahtar, FK->tablo yabancı anahtar, kimlik ve türetilen değeri veritabanı üretir';

// Okunamayan tanım satırda görünür: eksik liste tam listeymiş gibi okunmasın.
function sutunSatirlari(adlar: readonly string[], sutunlar: readonly TabloSutunlari[]): string[] {
  return adlar.map((ad) => {
    const tablo = sutunlar.find((t) => t.ad === ad);
    if (!tablo) return `${ad}: çözülemedi (göçlerde tanımı bulunamadı)`;
    const liste = tablo.sutunlar.length > 0 ? tablo.sutunlar.map(sutunMetni).join(', ') : 'sütun okunamadı';
    return `${ad}: ${liste}${tablo.cozulemeyen.length > 0 ? `; çözülemedi (liste eksik ya da eski olabilir): ${tablo.cozulemeyen.join(' | ')}` : ''}`;
  });
}

function cagriSatirlari(cagrilar: EkranCagrilari): string[] {
  return sutunlar(cagrilar.cagrilar.map((c) => [
      c.yontem,
      c.yol,
      c.dosyalar.join(', '),
      c.durum === 'tam' ? c.moduller.join(', ') : c.durum === 'aday' ? `aday: ${c.adaylar.join(', ')}` : 'eşleşen uç yok',
    ]));
}

// Çözülemeyen sayıya katılmaz, başlıkta ayrı yazılır: "9 uç" ile "7 uç, 2 bilinmiyor" aynı şey değildir.
function sayili(baslik: string, cozulen: string[], cozulemeyen: string[], dolayli: string[] = []): string[] {
  const hepsi = [...cozulen, ...cozulemeyen, ...dolayli];
  return [
    `  ${baslik} (${cozulen.length}${cozulemeyen.length > 0 ? `; çözülemedi ${cozulemeyen.length}` : ''}${dolayli.length > 0 ? `; dolaylı ${dolayli.length}` : ''})`,
    ...girinti(hepsi.length > 0 ? hepsi : ['yok'], '    '),
  ];
}

const dinamikSatiri = (harita: Harita): string[] =>
  (harita.dinamikSqlGocleri.length > 0 ? [`    dinamik SQL, sütunlar eksik olabilir: ${harita.dinamikSqlGocleri.join(', ')}`] : []);

function ayrintiMetni(m: ModulHaritasi, harita: Harita, ayrinti: ModulAyrintisi): string[] {
  const satirlar: string[] = [];
  if (m.sunucu) {
    satirlar.push(
      `  Sütunlar (${m.tablolar.length}) [${SUTUN_ACIKLAMASI}]`,
      ...girinti(m.tablolar.length > 0 ? sutunSatirlari(m.tablolar.map((t) => t.ad), harita.sutunlar) : ['yok'], '    '),
      ...dinamikSatiri(harita),
      ...sayili('Dışa açık imzalar', ayrinti.imzalar.imzalar, ayrinti.imzalar.cozulemeyen.map((ad) => `çözülemedi  ${ad}`)),
    );
  }
  if (m.istemci) {
    // "Doğrudan": ortak veri dosyası ya da başka modülün ekranı üzerinden giden çağrı sayılmaz, ithal yolu anılır.
    satirlar.push(...sayili(
      'Ekranın doğrudan çağırdığı uçlar',
      cagriSatirlari(ayrinti.cagrilar),
      ayrinti.cagrilar.cozulemeyen.map((c) => `çözülemedi  ${c}`),
      ayrinti.cagrilar.dolayli.map((yol) => `dolaylı: ${yol}`),
    ));
  }
  return satirlar;
}

const KAYNAK_METNI: Record<ModulTablosu['kaynak'], string> = {
  'sorgu': 'sorgular.ts yazıyor',
  'goc-adi': 'göç adından',
  'goc-yazan': 'yazan göçlerin adından',
};

function modulMetni(m: ModulHaritasi): string[] {
  const parcalar = [
    `sunucu ${m.sunucu ? 'var' : 'yok'}`,
    `istemci ${m.istemci ? `var (rota ${m.rota ? 'var' : 'yok'})` : 'yok'}`,
    `sözleşme ${m.sozlesme ? `paylasilan/sozlesme/${m.ad}.ts` : 'yok'}`,
  ];
  const satirlar = [m.ad, `  ${parcalar.join(', ')}`];
  if (m.sunucu) {
    satirlar.push(...bolum('Uçlar', sutunlar(m.uclar.map((u) => [u.yontem, u.yol, yetkiMetni(u.yetki), u.txDisi ? 'txDisi' : '', u.denetim ? `denetim:${u.denetim}` : '']))));
  }
  if (m.sunucu || m.islemler.length > 0) satirlar.push(tekSatir('İşlemler', m.islemler));
  if (!m.sunucu) return satirlar;
  satirlar.push(
    ...bolum('Tablolar', sutunlar(m.tablolar.map((t) => [t.ad, KAYNAK_METNI[t.kaynak]]))),
    ...bolum('Göçler', gocSatirlari(m.gocler)),
    tekSatir('Dışa açtıkları', m.disaAciklar),
    tekSatir('Bağımlı olduğu', m.bagimli, [['testte', m.testteBagimli]]),
    tekSatir('Ona bağımlı', m.bagimlilar, [['testte', m.testteBagimlilar], ['modül dışı', m.disKullananlar]]),
  );
  return satirlar;
}

function ortakMetni(harita: Harita): string[] {
  const belirsiz = sutunlar(harita.belirsizTablolar.map((t) => [
    t.ad,
    'belirsiz',
    t.goc,
    [...(t.yazanlar.length > 0 ? [`yazan: ${t.yazanlar.join(', ')}`] : []),
      ...(t.okuyanlar.length > 0 ? [`okuyan: ${t.okuyanlar.join(', ')}`] : [])].join('; '),
  ]));
  return [
    'Modüle ait olmayanlar',
    ...bolum('Göçler', gocSatirlari(harita.sahipsizGocler)),
    ...bolum('Sahibi belirsiz tablolar', belirsiz),
    tekSatir('Göç sırası', harita.gocSirasi),
    tekSatir('Sayfa işlemleri', harita.sayfaIslemleri),
    ...bolum('Sahibi belirsiz tabloların sütunları', sutunSatirlari(harita.belirsizTablolar.map((t) => t.ad), harita.sutunlar)),
    ...dinamikSatiri(harita),
    '  Sütunlar, dışa açık imzalar ve ekranın çağırdığı uçlar: npm run harita -- --modul <modul_adi>',
  ];
}

// Uç satırı: yöntem, yol, işlem (ya da acik / oturum), transaction dışı (txDisi), tam olmayan denetim kipi.
// Ayrıntı verilirse (tek modül kipi) modül bölümünün sonuna sütunlar, imzalar ve ekranın çağırdığı uçlar eklenir.
export function haritaMetni(harita: Harita, modul: string | null = null, ayrinti: ModulAyrintisi | null = null): string {
  const secilen = harita.moduller.filter((m) => modul === null || m.ad === modul);
  const bolumler = secilen.map((m) => [...modulMetni(m), ...(ayrinti !== null && modul !== null ? ayrintiMetni(m, harita, ayrinti) : [])]);
  if (modul === null) bolumler.push(ortakMetni(harita));
  return bolumler.map((b) => b.join('\n')).join('\n\n');
}

// Konu açılışında okunur: tam harita çok büyük. Modül başına bir satır, sonunda son göç; ayrıntı --modul ile alınır.
export function ozetMetni(harita: Harita): string {
  const satirlar = sutunlar(harita.moduller.map((m) => [
    m.ad,
    `uç ${m.uclar.length}, işlem ${m.islemler.length}, tablo ${m.tablolar.length}, göç ${m.gocler.length}`,
    `bağımlı: ${m.bagimli.length > 0 ? m.bagimli.join(', ') : 'yok'}; ona bağımlı: ${m.bagimlilar.length > 0 ? m.bagimlilar.join(', ') : 'yok'}`,
  ]));
  const son = harita.gocSirasi.at(-1) ?? 'yok';
  return [
    `Modüller (${harita.moduller.length})`,
    ...girinti(satirlar, '  '),
    `Son göç: ${son} (toplam ${harita.gocSirasi.length})`,
    'Ayrıntı: npm run harita -- --modul <modul_adi>; tam harita: npm run harita',
  ].join('\n');
}

const KULLANIM = 'Kullanım: npm run harita -- [--modul <modul_adi> | --ozet]';

export type HaritaKipi = { tur: 'tam' } | { tur: 'ozet' } | { tur: 'modul'; modul: string };

// Yanlış yazılmış bayrak yok sayılırsa tek modül isteyen bütün haritayı alır; araç yalnız bildiğini kabul eder.
export function kipSec(argumanlar: readonly string[]): HaritaKipi {
  if (argumanlar.length === 0) return { tur: 'tam' };
  const [bayrak, modul, ...fazla] = argumanlar;
  if (bayrak === '--ozet') {
    if (modul !== undefined) throw new Error(`Tanınmayan argüman: ${modul}. ${KULLANIM}`);
    return { tur: 'ozet' };
  }
  if (bayrak !== '--modul') throw new Error(`Tanınmayan argüman: ${bayrak ?? ''}. ${KULLANIM}`);
  if (fazla.length > 0) throw new Error(`Tanınmayan argüman: ${fazla[0] ?? ''}. ${KULLANIM}`);
  if (!modul || !/^[a-z][a-z0-9-]*$/.test(modul)) throw new Error(KULLANIM);
  return { tur: 'modul', modul };
}

export async function haritaKos(argumanlar: readonly string[], kok: string = KOK): Promise<{ kod: 0 | 1; cikti: string }> {
  let kip: HaritaKipi;
  try {
    kip = kipSec(argumanlar);
  } catch (hata) {
    return { kod: 1, cikti: hata instanceof Error ? hata.message : String(hata) };
  }
  const harita = await haritaTopla(kok);
  if (kip.tur === 'ozet') return { kod: 0, cikti: ozetMetni(harita) };
  if (kip.tur === 'tam') return { kod: 0, cikti: haritaMetni(harita) };
  const { modul } = kip;
  if (!harita.moduller.some((m) => m.ad === modul)) {
    return { kod: 1, cikti: `Bilinmeyen modül: ${modul}. Modüller: ${harita.moduller.map((m) => m.ad).join(', ')}. ${KULLANIM}` };
  }
  return { kod: 0, cikti: haritaMetni(harita, modul, await modulAyrintisi(harita, modul, kok)) };
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (dogrudanKosuyor) {
  const { kod, cikti } = await haritaKos(process.argv.slice(2));
  if (kod === 0) console.log(cikti);
  else console.error(cikti);
  process.exitCode = kod;
}
