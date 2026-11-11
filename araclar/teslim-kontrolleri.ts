import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

// Teslim kapısının üç ek maddesi (3041 a). Üçü de bir teslimin Test'ten geri döndüğü eksiği teslimden önce arar:
// D1 değişen dosyayı ithal eden başka modülün testi koşulmamıştı (3035), D2 yetkiye bağlı düğme değişti ama yetkisiz
// hesapla ekran testi yoktu (3030), D3 onaylanan ön izlemeden ayrılan madde yazılmamıştı (3029).
// Yanlış alarm veren madde DEVIR.md'deki gerekçe satırıyla uyarıya iner; teslimi yine Test görür.

// Bu andan önce yazılmış yamalar (karar 3041 a) geçiştedir: kırmızı yerine uyarı alır, yürüyen teslim geri düşmez.
export const GECIS_ANI = Date.parse('2026-11-11T21:08:26Z');

const MODUL_YOLU = /^(?:sunucu\/moduller|istemci\/src\/moduller)\/([a-z][a-z0-9-]*)\//;
export const modulAdi = (f: string): string | null => MODUL_YOLU.exec(f)?.[1] ?? null;
const testDosyasiMi = (f: string): boolean => /\.(test|spec)\.tsx?$/.test(f);
const SOZLESME = /^paylasilan\/sozlesme\//;

// Yetkiye göre gösterip gizleyen istemci çağrıları (istemci/src/ortak/veri/yetki.ts ve modüllerin kendi sarmalayıcıları).
export const YETKI_KAPISI = /\buseYetki\(|<Yetkili\b|\byetkiVar\(|\bizinli\(|\byetkili\(|\byetkiyse\(|\.var\(\s*['"][a-z-]+\.[a-z-]+['"]|\.herhangi\(/;
// Ekran testlerinde oturum `test.use({ hesap: 'ornek.<rol>' })` ile seçilir (ekran-testleri/ortak.ts); yönetici her şeyi görür.
export const YETKISIZ_HESAP = /hesap:\s*['"]ornek\.(?!yonetici['"])[a-z0-9]+['"]/;

export interface YamaAyrintisi {
  // format-patch "Date:" satırı (yazarın tarihi); okunamazsa null.
  tarih: number | null;
  // Dosya başına eklenen ve silinen satırlar.
  satirlar: Map<string, { eklenen: string[]; silinen: string[] }>;
}

export function yamaAyrintisi(yama: string): YamaAyrintisi {
  const tarihMetni = /^Date:\s*(.+)$/m.exec(yama)?.[1];
  const t = tarihMetni ? Date.parse(tarihMetni) : NaN;
  const satirlar = new Map<string, { eklenen: string[]; silinen: string[] }>();
  let dosya: { eklenen: string[]; silinen: string[] } | null = null;
  for (const s of yama.split('\n')) {
    const d = /^diff --git a\/\S+ b\/(\S+)$/.exec(s);
    if (d?.[1]) {
      dosya = satirlar.get(d[1]) ?? { eklenen: [], silinen: [] };
      satirlar.set(d[1], dosya);
      continue;
    }
    if (!dosya || s.startsWith('+++ ') || s.startsWith('--- ')) continue;
    if (s.startsWith('+')) dosya.eklenen.push(s.slice(1));
    else if (s.startsWith('-')) dosya.silinen.push(s.slice(1));
  }
  return { tarih: Number.isNaN(t) ? null : t, satirlar };
}

// D2 girdisi: yetki kapısı satırı değişen istemci dosyaları ve yetkisiz hesapla koşan ekran testi değişikliği.
export function yetkiDegisimi(ayrintilar: readonly YamaAyrintisi[], dosyaOku: (yol: string) => string | null): { kapilar: string[]; yetkisizTestler: string[] } {
  const kapilar = new Set<string>();
  const yetkisizTestler = new Set<string>();
  for (const a of ayrintilar) {
    for (const [f, { eklenen, silinen }] of a.satirlar) {
      if (f.startsWith('istemci/src/') && !testDosyasiMi(f) && [...eklenen, ...silinen].some((s) => YETKI_KAPISI.test(s))) kapilar.add(f);
      // Yeni test aynı dosyadaki var olan yetkisiz `test.use` bloğuna da eklenebilir; o zaman hesap satırı farkta görünmez.
      if (/^ekran-testleri\/.*\.spec\.ts$/.test(f) && eklenen.length > 0 && (eklenen.some((s) => YETKISIZ_HESAP.test(s)) || YETKISIZ_HESAP.test(dosyaOku(f) ?? ''))) {
        yetkisizTestler.add(f);
      }
    }
  }
  return { kapilar: [...kapilar].sort(), yetkisizTestler: [...yetkisizTestler].sort() };
}

const ITHAL = /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

// İthal yolunu depo köküne göre çözer; paket ithali ya da bulunamayan yol null.
export function ithalCoz(kaynak: string, belirtec: string, varMi: (yol: string) => boolean): string | null {
  let yol: string;
  if (belirtec.startsWith('#paylasilan/')) yol = `paylasilan/${belirtec.slice('#paylasilan/'.length)}`;
  else if (belirtec.startsWith('#cekirdek/')) yol = `sunucu/cekirdek/${belirtec.slice('#cekirdek/'.length)}`;
  else if (belirtec.startsWith('.')) yol = posix.normalize(posix.join(posix.dirname(kaynak), belirtec));
  else return null;
  for (const aday of [yol, `${yol}.ts`, `${yol}.tsx`, `${yol}/index.ts`, `${yol}/index.tsx`]) if (varMi(aday)) return aday;
  return null;
}

export interface Komsu { modul: string; neden: string }

// D1: değişen dosyayı (dolaylı da olsa) ithal eden başka modüller. Değişen modülün içinde ithal zinciri sonuna kadar izlenir;
// başka modüle geçince durulur, çünkü kırılacak test o modülün kendi testidir. Ortak yerlerden (çekirdek, paylaşılan, ortak
// arayüz) yalnız sözleşme dosyası izlenir: öteki ortak dosyaların tüketicisi bütün depodur ve tam test CI'dadır.
export function komsuModuller(degisen: readonly string[], dosyalar: ReadonlyMap<string, string>): Komsu[] {
  const varMi = (y: string) => dosyalar.has(y);
  const ithalEdenler = new Map<string, string[]>();
  for (const [f, icerik] of dosyalar) {
    for (const m of icerik.matchAll(ITHAL)) {
      const hedef = m[1] ? ithalCoz(f, m[1], varMi) : null;
      if (!hedef || hedef === f) continue;
      const liste = ithalEdenler.get(hedef) ?? [];
      liste.push(f);
      ithalEdenler.set(hedef, liste);
    }
  }
  const kaynaklar = degisen.filter((f) => !testDosyasiMi(f) && (modulAdi(f) !== null || SOZLESME.test(f)));
  const degisenModuller = new Set(kaynaklar.map(modulAdi).filter((m): m is string => m !== null));
  const komsular = new Map<string, string>();
  // Yama birden çok modüle doğrudan dokunuyorsa hangisinin kartın modülü olduğu yoldan bilinmez; her birinin testi istenir.
  if (degisenModuller.size > 1) {
    for (const m of degisenModuller) komsular.set(m, `yama doğrudan dokunuyor: ${kaynaklar.find((f) => modulAdi(f) === m) ?? m}`);
  }
  const gorulen = new Set(kaynaklar);
  const kuyruk = [...kaynaklar];
  for (let f = kuyruk.shift(); f !== undefined; f = kuyruk.shift()) {
    for (const i of ithalEdenler.get(f) ?? []) {
      const m = modulAdi(i);
      if (m !== null && !degisenModuller.has(m)) {
        if (!komsular.has(m)) komsular.set(m, `${i} -> ${f}`);
        continue;
      }
      if ((m !== null || SOZLESME.test(i)) && !gorulen.has(i)) {
        gorulen.add(i);
        kuyruk.push(i);
      }
    }
  }
  return [...komsular].map(([modul, neden]) => ({ modul, neden })).sort((a, b) => a.modul.localeCompare(b.modul));
}

// Depodaki kaynak dosyalar (yalnız ithal grafiği için okunur).
export function depoKaynaklari(kok: string): Map<string, string> {
  const dosyalar = new Map<string, string>();
  let liste = '';
  try {
    liste = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', '--', 'sunucu', 'istemci/src', 'paylasilan'], { cwd: kok, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return dosyalar;
  }
  for (const f of liste.split('\n')) {
    if (!/\.tsx?$/.test(f)) continue;
    const yol = posix.join(kok.replace(/\\/g, '/'), f);
    if (existsSync(yol)) dosyalar.set(f, readFileSync(yol, 'utf8'));
  }
  return dosyalar;
}

const MODUL_KELIMESI = (m: string) => new RegExp(`(?<![a-z0-9-])${m.replace(/[-]/g, '\\-')}(?![a-z0-9-])`);
const OLUMSUZ = /ko[sş]ulmad|[cç]al[iı][sş]t[iı]r[iı]lmad|yap[iı]lmad/i;
// Koşu sayılan satır yeşil sonucu yazar; kırmızı ya da sıfırdan büyük "fail" yazan satır koşu sayılmaz.
const KIRMIZI_SONUC = /K[Iİ]RMIZI|\bnot ok\b|\bfail(?:ed|ures?)?\s*[:=]?\s*[1-9]|\b[1-9]\d*\s+(?:fail|failed)\b(?!\s*[:=]?\s*\d)/i;
// Türkçe sonuç: "118 geçti, 2 kaldı", "başarısız: 1", "3 hata". "0 kaldı" ve "hatasız" kırmızı değildir.
const KIRMIZI_TURKCE = /(?<![\d.,])[1-9]\d*\s+(?:kald[ıi]|ba[sş]ar[ıi]s[ıi]z|hata(?:l[ıi])?)(?![a-zçğıöşü])|(?:kald[ıi]|ba[sş]ar[ıi]s[ıi]z|hata(?:l[ıi])?)\s*[:=]\s*[1-9]/i;
const YESIL_SONUC = /GE[CÇ]T[Iİ]|\bfail(?:ed)?\s*[:=]?\s*0\b|\b\d+\s+passed\b|\bpass(?:ed)?\s*[:=]?\s*\d+|\b\d+\s+pass\b|\b(\d+)\/\1\b/i;

export function modulKosuldu(modul: string, testSatirlari: readonly string[], vtModuller: readonly string[]): boolean {
  if (vtModuller.includes(modul)) return true;
  return testSatirlari.some((s) => !OLUMSUZ.test(s) && !KIRMIZI_SONUC.test(s) && !KIRMIZI_TURKCE.test(s) && YESIL_SONUC.test(s) && MODUL_KELIMESI(modul).test(s.slice(s.indexOf('test:modul'))));
}

export const muafMi = (modul: string, muafSatirlari: readonly string[]): boolean => muafSatirlari.some((s) => MODUL_KELIMESI(modul).test(s));

// VT-SONUC.md'de geçen modül testleri (teslim-vt.ts "GEÇTİ   test:modul <ad> (taraf)" satırı).
export function vtModulleri(metin: string | null): string[] {
  if (!metin) return [];
  // Bir tarafı (sunucu ya da istemci) kırmızı olan modül koşmuş sayılmaz.
  const kirmizi = new Set([...metin.matchAll(/^(?!GEÇTİ)\S+\s+test:modul ([a-z0-9-]+)\b/gm)].map((m) => m[1] ?? ''));
  return [...new Set([...metin.matchAll(/^GEÇTİ\s+test:modul ([a-z0-9-]+)\b/gm)].map((m) => m[1] ?? ''))].filter((m) => m && !kirmizi.has(m));
}

export type FarkSinifi = 'kartta-var' | '3020a' | 'kart-ister' | null;
export interface OnizlemeFarki { yok: boolean; maddeler: { metin: string; sinif: FarkSinifi }[] }

const sade = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g');

export function farkSinifi(madde: string): FarkSinifi {
  const s = sade(madde);
  if (/kart ister/.test(s)) return 'kart-ister';
  if (/kartta var/.test(s)) return 'kartta-var';
  if (/\b3020 a\b/.test(s)) return '3020a';
  return null;
}

// "Ön izlemeden fark: yok" ya da başlığın altında madde listesi; liste boş satırda ya da yeni başlıkta biter.
export function onizlemeFarkiOku(metin: string): OnizlemeFarki | null {
  const satirlar = metin.split('\n');
  const i = satirlar.findIndex((s) => /^[#\s*-]*on ?izlemeden fark\b/.test(sade(s)));
  if (i < 0) return null;
  const ilk = (satirlar[i] ?? '').replace(/^[^:]*:?/, '').replace(/\*/g, '').trim();
  if (/^yok\.?$/i.test(ilk)) return { yok: true, maddeler: [] };
  const maddeler: string[] = ilk ? [ilk] : [];
  for (const s of satirlar.slice(i + 1)) {
    if (!s.trim() || /^#/.test(s)) break;
    if (/^\s*[-*]|^\s*\d+[.)]/.test(s)) maddeler.push(s.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim());
  }
  return { yok: false, maddeler: maddeler.map((m) => ({ metin: m, sinif: farkSinifi(m) })) };
}

// D3 yalnız görünür değişiklikte: istemci ekranı ya da stil dosyası (test dışı).
export const arayuzDosyasiMi = (f: string): boolean => /^istemci\/src\/.*\.(tsx|css)$/.test(f) && !testDosyasiMi(f);

export interface KontrolGirdisi {
  dosyalar: string[];
  yamaTarihi: number | null;
  komsular: Komsu[];
  testSatirlari: string[];
  vtModuller: string[];
  komsuMuafSatirlari: string[];
  yetkiKapilari: string[];
  yetkisizTestler: string[];
  yetkiMuaf: boolean;
  onizlemeFarki: OnizlemeFarki | null;
}

export interface KontrolBulgusu { duzey: 'kirmizi' | 'uyari'; etiket: string; mesaj: string }

export function kontrolEt(g: KontrolGirdisi): KontrolBulgusu[] {
  const b: KontrolBulgusu[] = [];
  const gecis = g.yamaTarihi !== null && g.yamaTarihi < GECIS_ANI;
  const kirmizi = (etiket: string, mesaj: string) => b.push(gecis
    ? { duzey: 'uyari', etiket, mesaj: `${mesaj} (geçiş: yama 3041 a'dan önce yazılmış, uyarı)` }
    : { duzey: 'kirmizi', etiket, mesaj });

  for (const k of g.komsular) {
    if (modulKosuldu(k.modul, g.testSatirlari, g.vtModuller)) continue;
    if (muafMi(k.modul, g.komsuMuafSatirlari)) b.push({ duzey: 'uyari', etiket: 'komsu-test', mesaj: `${k.modul} testi koşulmadı, DEVIR.md'de gerekçesi var (${k.neden})` });
    else kirmizi('komsu-test', `${k.modul} modülü değişen dosyayı ithal ediyor (${k.neden}); "npm run test:modul -- ${k.modul}" koşulup sonucu DEVIR.md'ye yazılmalı ya da "Komşu test gerekmez: ${k.modul} <neden>" satırı`);
  }

  if (g.yetkiKapilari.length && !g.yetkisizTestler.length) {
    const mesaj = `yetkiye bağlı gösterim değişti (${g.yetkiKapilari.join(', ')}), yetkisiz hesapla (test.use({ hesap: 'ornek.<yönetici olmayan>' })) ekran testi değişikliği yok`;
    if (g.yetkiMuaf) b.push({ duzey: 'uyari', etiket: 'yetkisiz-test', mesaj: `${mesaj}; DEVIR.md'de "Yetki düğmesi değişmedi:" gerekçesi var` });
    else kirmizi('yetkisiz-test', mesaj);
  }

  if (g.dosyalar.some(arayuzDosyasiMi)) {
    const f = g.onizlemeFarki;
    if (!f) kirmizi('onizleme-farki', 'ekran değişiyor ama DEVIR.md\'de "Ön izlemeden fark:" satırı yok (fark yoksa "Ön izlemeden fark: yok")');
    else if (!f.yok && f.maddeler.length === 0) kirmizi('onizleme-farki', '"Ön izlemeden fark:" altında madde yok; fark yoksa "yok" yazılır');
    else {
      const sinifsiz = f.maddeler.filter((m) => m.sinif === null);
      if (sinifsiz.length) kirmizi('onizleme-farki', `sınıfsız fark (sonuna "kartta var", "3020 a" ya da "kart ister"): ${sinifsiz.map((m) => m.metin).join(' | ')}`);
      const kartIster = f.maddeler.filter((m) => m.sinif === 'kart-ister');
      if (kartIster.length) kirmizi('onizleme-farki', `yeni kart gelmeden birleşmez: ${kartIster.map((m) => m.metin).join(' | ')}`);
    }
  }
  return b;
}
