import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type ts from 'typescript';
import { testDosyasiMi } from './sinir-denetimi.ts';

// Derleyici yalnız tek modül kipinde yüklenir; tam harita onun yüklenme süresini ödemez.
type Ts = typeof ts;
const tsYukle = async (): Promise<Ts> => (await import('typescript')).default;

export interface Sutun {
  ad: string;
  tip: string;
  bos: boolean;
  pk: boolean;
  fk: string[];
  uretim: 'kimlik' | 'turetilen' | null;
}

// cozulemeyen: okunamayan tanım parçaları (`<göç>: <ifade>`); doluysa sütun listesi eksik ya da eski olabilir.
export interface TabloSutunlari {
  ad: string;
  sutunlar: Sutun[];
  cozulemeyen: string[];
}

interface Kisit {
  tur: 'pk' | 'fk' | 'diger';
  sutunlar: string[];
  hedef: string | null;
}

// kisitlar: ad -> kısıt; aynı ad iki kez üretildiyse null (hangisinin düştüğü bilinemez).
interface TabloDurumu extends TabloSutunlari {
  kisitlar: Map<string, Kisit | null>;
}

const AD = String.raw`(?:"?\w+"?\s*\.\s*)?"?(\w+)"?`;
const kucuk = (metin: string | undefined): string => (metin ?? '').toLowerCase();
const kisalt = (metin: string): string => {
  const tek = metin.replace(/\s+/g, ' ').trim();
  return tek.length > 70 ? `${tek.slice(0, 67)}...` : tek;
};

// Üst düzey ifadeler: dolar tırnaklı gövdedeki ve parantez içindeki `;` ifadeyi bölmez.
function ifadeler(sql: string): string[] {
  const sonuc: string[] = [];
  let bas = 0;
  let derinlik = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const dolar = c === '$' ? /^\$\w*\$/.exec(sql.slice(i, i + 80)) : null;
    if (dolar) {
      const son = sql.indexOf(dolar[0], i + dolar[0].length);
      i = son < 0 ? sql.length : son + dolar[0].length;
      continue;
    }
    if (c === '(') derinlik += 1;
    else if (c === ')') derinlik -= 1;
    else if (c === ';' && derinlik <= 0) {
      sonuc.push(sql.slice(bas, i));
      bas = i + 1;
      derinlik = 0;
    }
    i += 1;
  }
  sonuc.push(sql.slice(bas));
  return sonuc.map((s) => s.trim()).filter((s) => s !== '');
}

function virgulleBol(metin: string): string[] {
  const sonuc: string[] = [];
  let bas = 0;
  let derinlik = 0;
  for (let i = 0; i < metin.length; i += 1) {
    const c = metin[i];
    if (c === '(' || c === '[') derinlik += 1;
    else if (c === ')' || c === ']') derinlik -= 1;
    else if (c === ',' && derinlik === 0) {
      sonuc.push(metin.slice(bas, i));
      bas = i + 1;
    }
  }
  sonuc.push(metin.slice(bas));
  return sonuc.map((s) => s.trim()).filter((s) => s !== '');
}

// `(` ile başlayan metinde eşleşen `)` konumu; yoksa -1.
function parantezSonu(metin: string): number {
  let derinlik = 0;
  for (let i = 0; i < metin.length; i += 1) {
    if (metin[i] === '(') derinlik += 1;
    else if (metin[i] === ')') {
      derinlik -= 1;
      if (derinlik === 0) return i;
    }
  }
  return -1;
}

// Parantez içi boşaltılır: `CHECK (x IS NOT NULL)` sütunu NOT NULL yapmaz.
function icBosalt(metin: string): string {
  let sonuc = '';
  let derinlik = 0;
  for (const c of metin) {
    if (c === '(') {
      if (derinlik === 0) sonuc += '(';
      derinlik += 1;
    } else if (c === ')') {
      derinlik -= 1;
      if (derinlik === 0) sonuc += ')';
    } else if (derinlik === 0) sonuc += c;
  }
  return sonuc;
}

const sutunAdlari = (parantezli: string): string[] =>
  virgulleBol(parantezli.slice(1, parantezSonu(parantezli))).map((s) => kucuk(s.replace(/"/g, '')));

function kisitYaz(tablo: TabloDurumu, ad: string, kisit: Kisit): void {
  tablo.kisitlar.set(ad, tablo.kisitlar.has(ad) ? null : kisit);
}

const SUTUN_KISITI = /\b(?:CONSTRAINT|NOT\s+NULL|NULL|DEFAULT|PRIMARY\s+KEY|REFERENCES|CHECK|UNIQUE|GENERATED|COLLATE)\b/i;
const TABLO_KISITI = /^(?:CONSTRAINT\s+"?(\w+)"?\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b\s*([\s\S]*)$/i;

// Sütun tanımı: ad, tip, sonra kısıtlar. Okunamıyorsa false; çağıran "çözülemedi" yazar.
function sutunEkle(tablo: TabloDurumu, metin: string): boolean {
  const e = /^"?(\w+)"?\s+([\s\S]+)$/.exec(metin.trim());
  if (!e) return false;
  const ad = kucuk(e[1]);
  const govde = e[2] ?? '';
  const ilk = govde.search(SUTUN_KISITI);
  const tip = (ilk < 0 ? govde : govde.slice(0, ilk)).trim().replace(/\s+/g, ' ')
    .replace(/\s*([(,])\s*/g, '$1').replace(/\s+\)/g, ')').toLowerCase();
  if (tip === '' || tablo.sutunlar.some((s) => s.ad === ad)) return false;
  const kisit = ilk < 0 ? '' : icBosalt(govde.slice(ilk));
  const adli = new Map<string, string>();
  for (const k of kisit.matchAll(/\bCONSTRAINT\s+"?(\w+)"?\s+(PRIMARY\s+KEY|REFERENCES|\w+)/gi)) {
    adli.set(kucuk(k[2]).replace(/\s+/g, ' '), kucuk(k[1]));
  }
  const kimlik = /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(kisit);
  const turetilen = /\bGENERATED\s+ALWAYS\s+AS\s*\(/i.test(kisit);
  const pk = /\bPRIMARY\s+KEY\b/i.test(kisit);
  const hedefler = [...kisit.matchAll(new RegExp(String.raw`\bREFERENCES\s+${AD}`, 'gi'))].map((h) => kucuk(h[1]));
  const zorunlu = pk || kimlik || /\bNOT\s+NULL\b/i.test(kisit) || /^(?:small|big)?serial$/.test(tip);
  tablo.sutunlar.push({ ad, tip, bos: !zorunlu, pk, fk: hedefler, uretim: kimlik ? 'kimlik' : turetilen ? 'turetilen' : null });
  if (pk) kisitYaz(tablo, adli.get('primary key') ?? `${tablo.ad}_pkey`, { tur: 'pk', sutunlar: [ad], hedef: null });
  for (const hedef of hedefler) {
    kisitYaz(tablo, adli.get('references') ?? `${tablo.ad}_${ad}_fkey`, { tur: 'fk', sutunlar: [ad], hedef });
  }
  for (const [tur, kisitAdi] of adli) {
    if (tur !== 'primary key' && tur !== 'references') kisitYaz(tablo, kisitAdi, { tur: 'diger', sutunlar: [ad], hedef: null });
  }
  return true;
}

// Tablo düzeyi kısıt: birincil ve yabancı anahtar sütunlara işlenir; ötekiler yalnız adıyla kaydedilir.
function tabloKisitiEkle(tablo: TabloDurumu, metin: string): boolean {
  const e = TABLO_KISITI.exec(metin.trim());
  if (!e) return false;
  const tur = kucuk(e[2]).replace(/\s+/g, ' ');
  const govde = (e[3] ?? '').trim();
  const ad = e[1] === undefined ? null : kucuk(e[1]);
  if (tur !== 'primary key' && tur !== 'foreign key') {
    if (ad !== null) kisitYaz(tablo, ad, { tur: 'diger', sutunlar: [], hedef: null });
    return true;
  }
  if (!govde.startsWith('(') || parantezSonu(govde) < 0) return false;
  const adlar = sutunAdlari(govde);
  const sutunlar = adlar.map((s) => tablo.sutunlar.find((x) => x.ad === s));
  if (sutunlar.length === 0 || sutunlar.some((s) => s === undefined)) return false;
  if (tur === 'primary key') {
    for (const s of sutunlar) if (s) Object.assign(s, { pk: true, bos: false });
    kisitYaz(tablo, ad ?? `${tablo.ad}_pkey`, { tur: 'pk', sutunlar: adlar, hedef: null });
    return true;
  }
  const hedef = new RegExp(String.raw`^\s*REFERENCES\s+${AD}`, 'i').exec(govde.slice(parantezSonu(govde) + 1));
  if (!hedef) return false;
  for (const s of sutunlar) s?.fk.push(kucuk(hedef[1]));
  kisitYaz(tablo, ad ?? `${tablo.ad}_${adlar.join('_')}_fkey`, { tur: 'fk', sutunlar: adlar, hedef: kucuk(hedef[1]) });
  return true;
}

function fkCikar(tablo: TabloDurumu, kisit: Kisit): void {
  for (const ad of kisit.sutunlar) {
    const sutun = tablo.sutunlar.find((s) => s.ad === ad);
    const sira = sutun?.fk.indexOf(kisit.hedef ?? '') ?? -1;
    if (sutun && sira >= 0) sutun.fk.splice(sira, 1);
  }
}

function kisitDusur(tablo: TabloDurumu, ad: string): boolean {
  const kisit = tablo.kisitlar.get(ad);
  // Adı kaydedilmemiş kısıt: PostgreSQL'in denetim, teklik ve dışlama için ürettiği adlar sütun bilgisini etkilemez.
  if (kisit === undefined) return /_(?:check|key|excl)\d*$/.test(ad);
  if (kisit === null) return false;
  if (kisit.tur === 'pk') {
    for (const s of tablo.sutunlar) if (kisit.sutunlar.includes(s.ad)) s.pk = false;
  } else if (kisit.tur === 'fk') fkCikar(tablo, kisit);
  tablo.kisitlar.delete(ad);
  return true;
}

function sutunDusur(tablo: TabloDurumu, ad: string): void {
  for (const [kisitAdi, kisit] of tablo.kisitlar) {
    if (!kisit?.sutunlar.includes(ad)) continue;
    if (kisit.tur === 'fk') fkCikar(tablo, kisit);
    if (kisit.tur === 'pk') for (const s of tablo.sutunlar) if (kisit.sutunlar.includes(s.ad)) s.pk = false;
    tablo.kisitlar.delete(kisitAdi);
  }
  tablo.sutunlar = tablo.sutunlar.filter((s) => s.ad !== ad);
}

const ETKISIZ = /^(?:ENABLE|DISABLE|OWNER\s+TO|VALIDATE\s+CONSTRAINT|ALTER\s+CONSTRAINT|CLUSTER\s+ON|SET\s+WITHOUT\s+CLUSTER|SET\s*\(|RESET\s*\(|FORCE\s+ROW|NO\s+FORCE\s+ROW|REPLICA\s+IDENTITY|SET\s+(?:LOGGED|UNLOGGED|TABLESPACE))\b/i;
const SUTUN_AYARI = /^(?:SET\s+DEFAULT|DROP\s+DEFAULT|SET\s+STATISTICS|SET\s+STORAGE|SET\s+COMPRESSION|SET\s*\(|RESET\s*\()/i;

// Tek ALTER TABLE eylemi; tanınmayan eylem false döner ve tablo "çözülemedi" ile işaretlenir.
function eylemUygula(tablo: TabloDurumu, eylem: string): boolean {
  let e = /^RENAME\s+CONSTRAINT\s+"?(\w+)"?\s+TO\s+"?(\w+)"?$/i.exec(eylem);
  if (e) {
    const kisit = tablo.kisitlar.get(kucuk(e[1]));
    if (kisit === undefined) return /_(?:check|key|excl)\d*$/.test(kucuk(e[1]));
    tablo.kisitlar.delete(kucuk(e[1]));
    tablo.kisitlar.set(kucuk(e[2]), kisit);
    return true;
  }
  e = /^RENAME\s+(?:COLUMN\s+)?"?(\w+)"?\s+TO\s+"?(\w+)"?$/i.exec(eylem);
  if (e) {
    const eski = kucuk(e[1]);
    const sutun = tablo.sutunlar.find((s) => s.ad === eski);
    if (!sutun) return false;
    sutun.ad = kucuk(e[2]);
    for (const kisit of tablo.kisitlar.values()) {
      if (kisit) kisit.sutunlar = kisit.sutunlar.map((s) => (s === eski ? sutun.ad : s));
    }
    return true;
  }
  e = /^DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?"?(\w+)"?(?:\s+(?:CASCADE|RESTRICT))?$/i.exec(eylem);
  if (e) return kisitDusur(tablo, kucuk(e[2]));
  e = /^DROP\s+(?:COLUMN\s+)?(IF\s+EXISTS\s+)?"?(\w+)"?(?:\s+(?:CASCADE|RESTRICT))?$/i.exec(eylem);
  if (e) {
    const ad = kucuk(e[2]);
    if (!tablo.sutunlar.some((s) => s.ad === ad)) return e[1] !== undefined;
    sutunDusur(tablo, ad);
    return true;
  }
  e = /^ADD\s+((?:CONSTRAINT\s+"?\w+"?\s+)?(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b[\s\S]*)$/i.exec(eylem);
  if (e) return tabloKisitiEkle(tablo, e[1] ?? '');
  e = /^ADD\s+(?:COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i.exec(eylem);
  if (e) {
    const ad = kucuk(/^"?(\w+)"?/.exec(e[2] ?? '')?.[1]);
    if (e[1] !== undefined && tablo.sutunlar.some((s) => s.ad === ad)) return true;
    return sutunEkle(tablo, e[2] ?? '');
  }
  e = /^ALTER\s+(?:COLUMN\s+)?"?(\w+)"?\s+([\s\S]+)$/i.exec(eylem);
  if (e) {
    const sutun = tablo.sutunlar.find((s) => s.ad === kucuk(e?.[1]));
    const is = (e[2] ?? '').trim();
    if (!sutun) return false;
    const tip = /^(?:SET\s+DATA\s+)?TYPE\s+([\s\S]+?)(?:\s+COLLATE\s+[\s\S]+?)?(?:\s+USING\s+[\s\S]+)?$/i.exec(is);
    if (tip) {
      sutun.tip = (tip[1] ?? '').trim().replace(/\s+/g, ' ').replace(/\s*([(,])\s*/g, '$1').replace(/\s+\)/g, ')').toLowerCase();
      return true;
    }
    if (/^SET\s+NOT\s+NULL$/i.test(is)) sutun.bos = false;
    else if (/^DROP\s+NOT\s+NULL$/i.test(is)) sutun.bos = true;
    else if (/^DROP\s+IDENTITY(?:\s+IF\s+EXISTS)?$/i.test(is) || /^DROP\s+EXPRESSION(?:\s+IF\s+EXISTS)?$/i.test(is)) sutun.uretim = null;
    else if (/^ADD\s+GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(is)) sutun.uretim = 'kimlik';
    else return SUTUN_AYARI.test(is);
    return true;
  }
  return ETKISIZ.test(eylem);
}

const KUR = new RegExp(String.raw`^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?${AD}\s*([\s\S]*)$`, 'i');
const DEGISTIR = new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${AD}\s*\*?\s+([\s\S]*)$`, 'i');
const SIL = /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\s\S]+)$/i;
const GOMULU = new RegExp(String.raw`\b(?:CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?)${AD}`, 'gi');

// Kaynak göç DDL'idir (tablo listesinin de kaynağı); sorgu metni okunmaz, veritabanına bağlanılmaz.
// `gocler` uygulanış sırasıyla, yorum ve dizge içeriği ayıklanmış SQL ile verilir.
export function tabloSutunlari(gocler: ReadonlyArray<{ ad: string; sql: string }>): TabloSutunlari[] {
  const tablolar = new Map<string, TabloDurumu>();
  const al = (ad: string): TabloDurumu => {
    const var_ = tablolar.get(ad) ?? { ad, sutunlar: [], cozulemeyen: [], kisitlar: new Map<string, Kisit | null>() };
    tablolar.set(ad, var_);
    return var_;
  };
  const hedefiDegistir = (eski: string, yeni: string | null): void => {
    for (const tablo of tablolar.values()) {
      for (const s of tablo.sutunlar) s.fk = s.fk.flatMap((h) => (h === eski ? (yeni === null ? [] : [yeni]) : [h]));
      for (const [ad, kisit] of tablo.kisitlar) {
        if (kisit?.hedef !== eski) continue;
        if (yeni === null) tablo.kisitlar.delete(ad);
        else kisit.hedef = yeni;
      }
    }
  };

  for (const goc of gocler) {
    for (const ifade of ifadeler(goc.sql)) {
      const not = `${goc.ad}: ${kisalt(ifade)}`;
      const kur = KUR.exec(ifade);
      const degistir = kur ? null : DEGISTIR.exec(ifade);
      const sil = kur || degistir ? null : SIL.exec(ifade);
      if (kur) {
        const ad = kucuk(kur[2]);
        if (kur[1] !== undefined && tablolar.has(ad)) continue;
        tablolar.delete(ad);
        const tablo = al(ad);
        const govde = kur[3] ?? '';
        const son = govde.startsWith('(') ? parantezSonu(govde) : -1;
        if (son < 0) {
          tablo.cozulemeyen.push(not);
          continue;
        }
        if (/\b(?:INHERITS|PARTITION)\b/i.test(govde.slice(son + 1))) tablo.cozulemeyen.push(not);
        const ogeler = virgulleBol(govde.slice(1, son));
        // Tablo kısıtı sütunları adıyla arar; önce bütün sütunlar girer.
        const kisitlar = ogeler.filter((o) => /^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i.test(o));
        for (const oge of ogeler.filter((o) => !kisitlar.includes(o))) {
          if (!sutunEkle(tablo, oge)) tablo.cozulemeyen.push(`${goc.ad}: ${kisalt(oge)}`);
        }
        for (const oge of kisitlar) {
          if (!tabloKisitiEkle(tablo, oge)) tablo.cozulemeyen.push(`${goc.ad}: ${kisalt(oge)}`);
        }
      } else if (degistir) {
        const ad = kucuk(degistir[1]);
        const govde = (degistir[2] ?? '').trim();
        const yeniAd = /^RENAME\s+TO\s+"?(\w+)"?$/i.exec(govde);
        const tablo = al(ad);
        if (yeniAd) {
          const yeni = kucuk(yeniAd[1]);
          tablolar.delete(ad);
          tablolar.set(yeni, { ...tablo, ad: yeni });
          hedefiDegistir(ad, yeni);
          continue;
        }
        for (const eylem of virgulleBol(govde)) {
          const eylemNotu = `${goc.ad}: ${kisalt(`ALTER TABLE ${ad} ${eylem}`)}`;
          if (!eylemUygula(tablo, eylem)) tablo.cozulemeyen.push(eylemNotu);
          // CASCADE bu sütuna bağlı yabancı anahtarları da düşürür; hangi sütuna bağlandıkları izlenmediğinden
          // bu tabloya yabancı anahtar veren her tablo işaretlenir.
          if (/^DROP\s+(?!CONSTRAINT\b)[\s\S]*\bCASCADE$/i.test(eylem)) {
            for (const baska of tablolar.values()) {
              if (baska !== tablo && baska.sutunlar.some((s) => s.fk.includes(ad))) baska.cozulemeyen.push(eylemNotu);
            }
          }
        }
      } else if (sil) {
        for (const parca of virgulleBol(sil[1] ?? '')) {
          const ad = kucuk((parca.split(/\s+/)[0] ?? '').replace(/"/g, '').split('.').pop());
          tablolar.delete(ad);
          hedefiDegistir(ad, null);
        }
      } else {
        // Blok ya da işlev gövdesindeki tablo komutu yürütülmez; andığı tablo işaretlenir, sessizce geçilmez.
        for (const e of ifade.matchAll(GOMULU)) al(kucuk(e[1])).cozulemeyen.push(not);
      }
    }
  }
  return [...tablolar.values()].map(({ ad, sutunlar, cozulemeyen }) => ({ ad, sutunlar, cozulemeyen }))
    .sort((a, b) => a.ad.localeCompare(b.ad));
}

// Gövdesinde EXECUTE geçen blok ya da işlev tablo komutunu dizgeden kurar; metinden okunamaz. Tetikleyicinin
// `EXECUTE FUNCTION` yan tümcesi gövde dışındadır, sayılmaz.
export function dinamikSqlGocleri(gocler: ReadonlyArray<{ ad: string; sql: string }>): string[] {
  return gocler.filter((goc) => [...goc.sql.matchAll(/(\$\w*\$)([\s\S]*?)\1/g)].some((e) => /\bEXECUTE\b/i.test(e[2] ?? ''))).map((goc) => goc.ad);
}

export function sutunMetni(s: Sutun): string {
  return [
    `${s.ad} ${s.tip}${s.bos ? '?' : ''}`,
    ...(s.pk ? ['PK'] : []),
    ...(s.fk.length > 0 ? [`FK->${[...new Set(s.fk)].join(',')}`] : []),
    ...(s.uretim === 'kimlik' ? ['kimlik'] : s.uretim === 'turetilen' ? ['türetilen'] : []),
  ].join(' ');
}

export interface Imzalar {
  imzalar: string[];
  cozulemeyen: string[];
}

// Tipi çözülememiş (ithali bulunamamış) değer derleyicide hata tipidir; `any` diye basılırsa yanlış bilgi olur.
function hataliTip(tsm: Ts, denetci: ts.TypeChecker, tip: ts.Type, derinlik = 0): boolean {
  if ((tip as ts.Type & { intrinsicName?: string }).intrinsicName === 'error') return true;
  if (derinlik >= 3) return false;
  if (tip.isUnionOrIntersection()) return tip.types.some((t) => hataliTip(tsm, denetci, t, derinlik + 1));
  if ((tip.flags & tsm.TypeFlags.Object) !== 0 && ((tip as ts.ObjectType).objectFlags & tsm.ObjectFlags.Reference) !== 0) {
    return denetci.getTypeArguments(tip as ts.TypeReference).some((t) => hataliTip(tsm, denetci, t, derinlik + 1));
  }
  return false;
}

// `disari.ts` dışa açımları derleyicinin tip denetçisinden okunur: yeniden dışa açılan fonksiyonun imzası
// kaynak dosyasındadır, metinden çıkarılamaz. Yalnız değerler; tipler "Dışa açtıkları" satırında.
export async function disariImzalari(kok: string, modul: string): Promise<Imzalar> {
  const dosya = join(kok, 'sunucu/moduller', modul, 'disari.ts');
  if (!existsSync(dosya)) return { imzalar: [], cozulemeyen: [] };
  const tsm = await tsYukle();
  const ayarDosyasi = join(kok, 'sunucu/tsconfig.json');
  const okunan = existsSync(ayarDosyasi)
    ? tsm.getParsedCommandLineOfConfigFile(ayarDosyasi, {}, { ...tsm.sys, onUnRecoverableConfigFileDiagnostic: () => undefined })
    : undefined;
  const secenekler: ts.CompilerOptions = okunan?.options ?? {
    target: tsm.ScriptTarget.ES2023,
    module: tsm.ModuleKind.NodeNext,
    moduleResolution: tsm.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    types: [],
  };
  const program = tsm.createProgram([dosya], secenekler);
  const denetci = program.getTypeChecker();
  const kaynak = program.getSourceFile(dosya);
  const modulSimgesi = kaynak ? denetci.getSymbolAtLocation(kaynak) : undefined;
  if (!kaynak || !modulSimgesi) return { imzalar: [], cozulemeyen: [] };

  const bicim = tsm.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
  const imzalar: string[] = [];
  const cozulemeyen: string[] = [];
  for (const simge of denetci.getExportsOfModule(modulSimgesi)) {
    const hedef = (simge.flags & tsm.SymbolFlags.Alias) !== 0 ? denetci.getAliasedSymbol(simge) : simge;
    if ((hedef.declarations ?? []).length === 0) {
      cozulemeyen.push(simge.name);
      continue;
    }
    if ((hedef.flags & tsm.SymbolFlags.Value) === 0) continue;
    const tip = denetci.getTypeOfSymbolAtLocation(hedef, kaynak);
    const cagrilar = tip.getCallSignatures();
    const bozuk = hataliTip(tsm, denetci, tip) || cagrilar.some((c) =>
      hataliTip(tsm, denetci, c.getReturnType())
      || c.getParameters().some((p) => hataliTip(tsm, denetci, denetci.getTypeOfSymbolAtLocation(p, kaynak))));
    if (bozuk) cozulemeyen.push(simge.name);
    else if (cagrilar.length === 0) imzalar.push(`${simge.name}: ${denetci.typeToString(tip, kaynak, bicim)}`);
    else for (const cagri of cagrilar) imzalar.push(`${simge.name}${denetci.signatureToString(cagri, kaynak, bicim)}`);
  }
  return { imzalar: imzalar.sort(), cozulemeyen: cozulemeyen.sort() };
}

export interface SunucuUcu {
  modul: string;
  yontem: string;
  yol: string;
}

// durum: tam (yol sunucudaki tek uçla örtüşüyor), aday (değişken parça sabit bir yol parçasına denk gelebilir), yok.
export interface EkranCagrisi {
  yontem: string;
  yol: string;
  durum: 'tam' | 'aday' | 'yok';
  moduller: string[];
  adaylar: string[];
  dosyalar: string[];
}

// dolayli: çağrıyı kendi yapmayıp başkasına yaptıran ithaller (ortak veri dosyası, başka modülün disari.ts'i);
// o dosyaların çağırdığı uçlar burada sayılmaz, yalnız yolu anılır.
export interface EkranCagrilari {
  cagrilar: EkranCagrisi[];
  cozulemeyen: string[];
  dolayli: string[];
}

const YONTEMLER: Record<string, string> = { get: 'GET', post: 'POST', put: 'PUT', sil: 'DELETE' };
// Yol içindeki değişken parça; gerçek yolda bulunamayacak bir işaret.
const DEGISKEN = '\u0000';
const EN_COK_YOL = 16;

function yolDegerleri(tsm: Ts, kaynak: ts.SourceFile, ifade: ts.Expression, derinlik = 0): string[] | null {
  if (derinlik > 6) return null;
  const alt = (dugum: ts.Expression): string[] | null => yolDegerleri(tsm, kaynak, dugum, derinlik + 1);
  const carp = (sol: string[], sag: string[]): string[] | null => {
    const sonuc = sol.flatMap((a) => sag.map((b) => a + b));
    return sonuc.length > EN_COK_YOL ? null : sonuc;
  };
  if (tsm.isStringLiteral(ifade) || tsm.isNoSubstitutionTemplateLiteral(ifade)) return [ifade.text];
  if (tsm.isParenthesizedExpression(ifade) || tsm.isAsExpression(ifade) || tsm.isSatisfiesExpression(ifade) || tsm.isNonNullExpression(ifade)) {
    return alt(ifade.expression);
  }
  if (tsm.isConditionalExpression(ifade)) {
    const evet = alt(ifade.whenTrue);
    const hayir = alt(ifade.whenFalse);
    return evet && hayir ? [...evet, ...hayir] : null;
  }
  if (tsm.isTemplateExpression(ifade)) {
    let sonuc: string[] | null = [ifade.head.text];
    for (const parca of ifade.templateSpans) {
      if (sonuc === null) return null;
      sonuc = carp(sonuc, alt(parca.expression) ?? [DEGISKEN]);
      if (sonuc !== null) sonuc = sonuc.map((s) => s + parca.literal.text);
    }
    return sonuc;
  }
  if (tsm.isBinaryExpression(ifade) && ifade.operatorToken.kind === tsm.SyntaxKind.PlusToken) {
    const sol = alt(ifade.left);
    const sag = alt(ifade.right);
    return sol === null && sag === null ? null : carp(sol ?? [DEGISKEN], sag ?? [DEGISKEN]);
  }
  if (tsm.isIdentifier(ifade)) {
    // Ad dosyada tek bir `const` ile bağlanmışsa değeri okunur; parametre ya da ikinci bağ varsa bilinmez.
    const baglar: ts.Node[] = [];
    const gez = (dugum: ts.Node): void => {
      if ((tsm.isVariableDeclaration(dugum) || tsm.isParameter(dugum) || tsm.isBindingElement(dugum))
        && tsm.isIdentifier(dugum.name) && dugum.name.text === ifade.text) baglar.push(dugum);
      tsm.forEachChild(dugum, gez);
    };
    gez(kaynak);
    const [bag] = baglar;
    if (baglar.length !== 1 || !bag || !tsm.isVariableDeclaration(bag) || !bag.initializer) return null;
    if ((tsm.getCombinedNodeFlags(bag) & tsm.NodeFlags.Const) === 0) return null;
    return alt(bag.initializer);
  }
  return null;
}

// Sorgu dizgesi atılır; değişken yalnız bütün bir yol parçasıysa kabul edilir (`/x/${id}`), parça içindeyse bilinmez.
function yolDeseni(deger: string): string[] | null {
  const yol = deger.split(/[?#]/)[0] ?? '';
  if (!yol.startsWith('/')) return null;
  const parcalar = yol.split('/').slice(1);
  return parcalar.some((p) => p.includes(DEGISKEN) && p !== DEGISKEN) ? null : parcalar;
}

function ucEsle(yontem: string, parcalar: string[], uclar: readonly SunucuUcu[]): Pick<EkranCagrisi, 'yol' | 'durum' | 'moduller' | 'adaylar'> {
  const ayni = uclar.filter((u) => u.yontem === yontem && u.yol.split('/').length - 1 === parcalar.length);
  const uyan = (kati: boolean): SunucuUcu[] => ayni.filter((u) => u.yol.split('/').slice(1).every((s, i) => {
    const p = parcalar[i] ?? '';
    if (s.startsWith(':')) return kati ? p === DEGISKEN : true;
    return p === s || (!kati && p === DEGISKEN);
  }));
  const yazili = `/${parcalar.map((p) => (p === DEGISKEN ? ':?' : p)).join('/')}`;
  const tam = uyan(true);
  const [tek] = tam;
  if (tam.length === 1 && tek) return { yol: tek.yol, durum: 'tam', moduller: [tek.modul], adaylar: [] };
  const adaylar = tam.length > 1 ? tam : uyan(false);
  return {
    yol: yazili,
    durum: adaylar.length > 0 ? 'aday' : 'yok',
    moduller: [...new Set(adaylar.map((u) => u.modul))].sort(),
    adaylar: adaylar.map((u) => u.yol),
  };
}

// Kaynak, ekranın ortak istek yardımcısına (`ortak/veri/api.ts` içindeki `api`) yaptığı çağrıların yol argümanıdır;
// yalnız söz dizimi okunur. Yolu dosyadan okunamayan çağrı (parametre, fonksiyon sonucu) çözülemedi sayılır.
export async function ekranCagrilari(kok: string, modul: string, uclar: readonly SunucuUcu[]): Promise<EkranCagrilari> {
  const klasor = join(kok, 'istemci/src/moduller', modul);
  if (!existsSync(klasor)) return { cagrilar: [], cozulemeyen: [], dolayli: [] };
  const tsm = await tsYukle();
  const dosyalar = (await readdir(klasor, { recursive: true }))
    .map((d) => d.replaceAll('\\', '/')).filter((d) => /\.tsx?$/.test(d) && !testDosyasiMi(d)).sort();
  const bulunan = new Map<string, EkranCagrisi>();
  const cozulemeyen: string[] = [];
  const dolayli = new Set<string>();

  for (const dosya of dosyalar) {
    const metin = await readFile(join(klasor, dosya), 'utf8');
    const kaynak = tsm.createSourceFile(dosya, metin, tsm.ScriptTarget.Latest, true, dosya.endsWith('x') ? tsm.ScriptKind.TSX : tsm.ScriptKind.TS);
    const yerelAdlar = new Set<string>();
    for (const ifade of kaynak.statements) {
      if (!tsm.isImportDeclaration(ifade) || !tsm.isStringLiteral(ifade.moduleSpecifier)) continue;
      if (!/(?:^|\/)veri\/api(?:\.ts)?$/.test(ifade.moduleSpecifier.text)) {
        // Tip ithali çalışma anında yoktur, çağrı yaptıramaz.
        const hedef = posix.join('moduller', modul, posix.dirname(dosya), ifade.moduleSpecifier.text);
        const baskasi = /^ortak\/veri\//.test(hedef) || (/^moduller\/[^/]+\/disari(?:\.ts)?$/.test(hedef) && !hedef.startsWith(`moduller/${modul}/`));
        if (baskasi && ifade.importClause?.isTypeOnly !== true && ifade.moduleSpecifier.text.startsWith('.')) dolayli.add(hedef);
        continue;
      }
      const adlar = ifade.importClause?.namedBindings;
      if (!adlar || !tsm.isNamedImports(adlar)) continue;
      for (const oge of adlar.elements) if ((oge.propertyName ?? oge.name).text === 'api') yerelAdlar.add(oge.name.text);
    }
    if (yerelAdlar.size === 0) continue;
    const yer = (dugum: ts.Node): string => `${dosya}:${kaynak.getLineAndCharacterOfPosition(dugum.getStart(kaynak)).line + 1}`;

    const gez = (dugum: ts.Node): void => {
      if (tsm.isImportDeclaration(dugum)) return;
      if (tsm.isIdentifier(dugum) && yerelAdlar.has(dugum.text)) {
        const erisim = dugum.parent;
        const cagri = erisim.parent;
        const dogrudan = tsm.isPropertyAccessExpression(erisim) && erisim.expression === dugum
          && tsm.isCallExpression(cagri) && cagri.expression === erisim;
        const yontem = dogrudan ? YONTEMLER[erisim.name.text] : undefined;
        const ilk = dogrudan ? cagri.arguments[0] : undefined;
        if (!dogrudan || yontem === undefined || !ilk) {
          // Özellik adı ya da başka bir nesnenin alanı olarak geçen ad istek yardımcısı değildir.
          const baskaAd = (tsm.isPropertyAccessExpression(erisim) && erisim.name === dugum)
            || (tsm.isPropertyAssignment(erisim) && erisim.name === dugum);
          if (!baskaAd) cozulemeyen.push(`${yer(dugum)}  ${kisalt((dogrudan ? cagri : erisim).getText(kaynak))}`);
          return;
        }
        const degerler = yolDegerleri(tsm, kaynak, ilk);
        const desenler = degerler?.map(yolDeseni) ?? [null];
        if (desenler.some((d) => d === null)) {
          cozulemeyen.push(`${yer(dugum)}  ${erisim.getText(kaynak)}(${kisalt(ilk.getText(kaynak))})`);
          return;
        }
        for (const parcalar of desenler) {
          if (parcalar === null) continue;
          const esleme = ucEsle(yontem, parcalar, uclar);
          const anahtar = `${yontem} ${esleme.yol} ${parcalar.join('/')}`;
          const var_ = bulunan.get(anahtar) ?? { yontem, ...esleme, dosyalar: [] };
          if (!var_.dosyalar.includes(dosya)) var_.dosyalar.push(dosya);
          bulunan.set(anahtar, var_);
        }
        return;
      }
      tsm.forEachChild(dugum, gez);
    };
    gez(kaynak);
  }
  // Aynı uca düşen farklı yazımlar tek satırdır.
  const tekil = new Map<string, EkranCagrisi>();
  for (const cagri of bulunan.values()) {
    const anahtar = `${cagri.yontem} ${cagri.yol} ${cagri.durum}`;
    const var_ = tekil.get(anahtar);
    if (var_) var_.dosyalar = [...new Set([...var_.dosyalar, ...cagri.dosyalar])].sort();
    else tekil.set(anahtar, cagri);
  }
  return {
    cagrilar: [...tekil.values()].sort((a, b) => (`${a.yol} ${a.yontem}` < `${b.yol} ${b.yontem}` ? -1 : 1)),
    cozulemeyen,
    dolayli: [...dolayli].sort(),
  };
}
