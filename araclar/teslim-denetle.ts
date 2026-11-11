import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sonucuKaydet, sonucuYukle, vtDenemesi, vtDenetle } from './teslim-vt.ts';
import type { VtSonuc, VtYamasi } from './teslim-vt.ts';
import { SONUC_DOSYASI } from './teslim-vt.ts';
import { depoKaynaklari, kontrolEt, komsuModuller, onizlemeFarkiOku, vtModulleri, yamaAyrintisi, yetkiDegisimi } from './teslim-kontrolleri.ts';
import type { Komsu, OnizlemeFarki } from './teslim-kontrolleri.ts';

// Yazarın bıraktığı yama klasörünü (format-patch + DEVIR.md) kapının beş maddesine göre tek seferde denetler.
// Aynı denetim yazar, koordinatör ve Birleştirici'de elle üç kez yapılıyordu ve maddeler yine kaçıyordu;
// tek araç, tek çıktı. `--grup` birden çok klasörde hangi teslimlerin aynı birleştirme turuna girebileceğini basar.
// Ağ çağrısı yok, yama uygulanmaz, kod çalıştırılmaz: yalnız metin okunur ve yerel git'e sorulur. Tek istisna `--vt`:
// yazar yamayı temiz bir PostgreSQL kümesinde dener ve sonucu klasöre yazar (teslim-vt.ts); düz denetim o sonucu okur.

export const KULLANIM = [
  'Kullanım: npm run teslim-denetle -- <yama klasörü> [--taban-dal origin/main]',
  '          npm run teslim-denetle -- --vt <yama klasörü> [--taban-dal origin/main]',
  '          npm run teslim-denetle -- --grup <klasör> <klasör> ... [--taban-dal origin/main]',
].join('\n');

// Bu yollara dokunan yama sade değildir ve grup turuna girmez (talimat: BIRLESTIRME, Grup birleştirme; TESLIM, Sade yama).
export const ORTAK_NOKTALAR: readonly RegExp[] = [
  /^paylasilan\//, /^sunucu\/cekirdek\//, /^sunucu\/gocler\//, /^istemci\/src\/ortak\//, /^kurulum\//, /^araclar\//,
  /^\.claude\//, /^\.github\//, /^CLAUDE\.md$/, /^package(-lock)?\.json$/, /(^|\/)ayarlar\.ts$/, /^belgeler\/adr\//,
];

// Talimat ONAY: yazılı onay gerektiren dosya türleri (göç ve yetki içeriğe bağlı, uyarı olarak ayrıca bakılır).
export const ONAY_GEREKEN: readonly RegExp[] = [/^\.github\//, /^\.claude\//, /^CLAUDE\.md$/, /^araclar\//, /^belgeler\/adr\//, /^package(-lock)?\.json$/];

export const GOC_YOLU = /^sunucu\/gocler\/(\d{14})_[^/]+\.sql$/;

export interface Devir {
  taban: string | null;
  // Dosya adı ya da kısaltması değil, metinde geçen tam sha256 değerleri.
  shalar: string[];
  kilit: string[];
  baslikVar: boolean;
  // Yama başka bir teslimin üstüne kurulduysa o teslimin klasör adı (başlıkta `ustune:`).
  ustune: string | null;
  // DEVIR.md'de yazılan; yazılmadıysa null.
  sade: boolean | null;
  onaySatiri: boolean;
  taramaSatiri: boolean;
  testSatiri: boolean;
  tamTest: boolean;
  // 3041 a: koşulan modül testleri, komşu testi ve yetkisiz test için gerekçe satırları, ön izlemeden farklar.
  testSatirlari: string[];
  komsuMuafSatirlari: string[];
  yetkiMuaf: boolean;
  onizlemeFarki: OnizlemeFarki | null;
}

export type Duzey = 'kirmizi' | 'uyari';
export interface Bulgu { duzey: Duzey; etiket: string; mesaj: string }

const SHA256 = /\b[0-9a-f]{64}\b/g;
const KOMIT = /\b[0-9a-f]{7,40}\b/;

// Makinece okunur başlık önceliklidir: <!-- teslim\nkart: ..\ntaban: ..\nkilit: a, b\nsade: evet|hayir\nonay: ..\n-->
function baslikOku(metin: string): Map<string, string> {
  const blok = /<!--\s*teslim\s*\n([\s\S]*?)-->/.exec(metin);
  const alanlar = new Map<string, string>();
  if (!blok) return alanlar;
  for (const satir of (blok[1] ?? '').split('\n')) {
    const m = /^\s*([a-z-]+)\s*:\s*(.*)$/.exec(satir);
    if (m?.[1] && m[2] !== undefined) alanlar.set(m[1], m[2].trim());
  }
  return alanlar;
}

// `a/{b, c}.ts` biçimini açar; iç içe süslü parantez yok sayılır.
export function suslu(desen: string): string[] {
  const m = /^(.*?)\{([^{}]*)\}(.*)$/.exec(desen);
  if (!m) return [desen];
  const [, on = '', ic = '', son = ''] = m;
  return ic.split(',').flatMap((parca) => suslu(`${on}${parca.trim()}${son}`));
}

export function devirOku(metin: string): Devir {
  const baslik = baslikOku(metin);
  const tabanBaslik = baslik.get('taban');
  const tabanSatiri = tabanBaslik ?? metin.split('\n').find((s) => /\btaban\b/i.test(s))?.replace(/^[\s\S]*?\btaban\b/i, '') ?? '';
  const taban = KOMIT.exec(tabanSatiri)?.[0] ?? null;

  // Serbest metindeki kilit tarifi güvenilir okunamıyor (göreli yollar, "aynı modülde yeni alt dosyalar"); yanlış kırmızı
  // aracı güvenilmez kılar. Bu yüzden kilit yalnız başlıktan okunur; başlık yoksa dosyalar uyarıyla listelenir.
  const baslikKilit = baslik.get('kilit');
  const kilit = baslikKilit ? baslikKilit.split(/,(?![^{]*\})/).flatMap((y) => suslu(y.trim())).filter(Boolean) : [];

  const sadeMetni = baslik.get('sade') ?? /Sade\s*:\s*(evet|hay[ıi]r)/i.exec(metin)?.[1] ?? null;
  const sade = sadeMetni === null ? null : /^evet/i.test(sadeMetni);
  const onaySatiri = Boolean(baslik.get('onay')) || /\b\d{3,4}(-\d+)?\s+(?:[a-e]\b|teyit)|cmsg_[A-Za-z0-9]+/.test(metin);

  return {
    taban,
    shalar: [...new Set(metin.match(SHA256) ?? [])],
    kilit: [...new Set(kilit)],
    baslikVar: baslik.size > 0,
    ustune: baslik.get('ustune') || null,
    sade,
    onaySatiri,
    taramaSatiri: /taram/i.test(metin),
    testSatiri: /#\s*pass\s+\d|passed|\bpass\s+\d|\d+\s*ihlal|\d+\/\d+|hatas[ıi]z|ok\b/i.test(metin),
    // Satır bazında: "Koşulmadı: tam test:sunucu" ya da "test:sunucu yerelde koşulmadı" koşu sayılmaz.
    tamTest: metin.split('\n').some((s) => /tam\s+test:sunucu|npm run test:sunucu\b|npm run kontrol\b/i.test(s) && !/ko[sş]ulmad|çalıştırılmad|calistirilmad/i.test(s)),
    testSatirlari: metin.split('\n').filter((s) => s.includes('test:modul')),
    komsuMuafSatirlari: metin.split('\n').filter((s) => /kom[sş]u test gerekmez\s*:/i.test(s)).map((s) => s.replace(/^[\s\S]*?gerekmez\s*:/i, '')),
    yetkiMuaf: /yetki d[uü][gğ]mesi de[gğ]i[sş]medi\s*:/i.test(metin),
    onizlemeFarki: onizlemeFarkiOku(metin),
  };
}

// format-patch çıktısındaki dosya yolları (eski ve yeni ad; silinen ve taşınan dosya da kilide girer).
export function yamaDosyalari(yama: string): string[] {
  const yollar = new Set<string>();
  for (const m of yama.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)) {
    if (m[1]) yollar.add(m[1]);
    if (m[2]) yollar.add(m[2]);
  }
  return [...yollar];
}

function desenRegex(desen: string): RegExp {
  const kacik = desen.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`(^|/)${kacik}${desen.endsWith('/') ? '' : '(/|$)'}`);
}

// Kilit desenleri çoğu zaman modül klasörüne göreli yazılıyor (ör. `kalite-merkezi/terminal.ts`): son ekle eşleşir.
export function kilitIcinde(dosya: string, kilit: readonly string[]): boolean {
  return kilit.some((d) => desenRegex(d.replace(/^\.\//, '')).test(dosya));
}

export const ortakNoktaMi = (dosya: string): boolean => ORTAK_NOKTALAR.some((r) => r.test(dosya));

export interface TeslimGirdisi {
  klasor: string;
  devir: Devir | null;
  yamalar: { ad: string; sha256: string; dosyalar: string[] }[];
  // Taban yerel git'te yoksa null; varsa taban dalına göre geride kalan commit sayısı (ata değilse -1).
  tabanGeride: number | null;
  enBuyukGoc: string | null;
  anaDaldakiGocler: string[];
  // Klasördeki VT-SONUC.md; yoksa null.
  vtSonuc: VtSonuc | null;
  // 3041 a kontrollerinin yama ve depodan okunan girdisi; verilmezse o üç madde koşmaz (birim testleri).
  // Başlıktaki `ustune:` zincirinin bugünkü yama sha'ları (en alttaki önce); zincir okunamazsa hata (3046 a).
  dayanak?: { shalar: string[]; hata: string | null };
  ek?: { yamaTarihi: number | null; komsular: Komsu[]; vtModuller: string[]; yetkiKapilari: string[]; yetkisizTestler: string[] };
}

export function denetle(g: TeslimGirdisi): Bulgu[] {
  const b: Bulgu[] = [];
  const k = (etiket: string, mesaj: string) => b.push({ duzey: 'kirmizi', etiket, mesaj });
  const u = (etiket: string, mesaj: string) => b.push({ duzey: 'uyari', etiket, mesaj });
  if (g.yamalar.length === 0) k('yama-yok', 'klasörde .patch dosyası yok');
  if (!g.devir) {
    k('devir-yok', 'DEVIR.md yok');
    return b;
  }
  const d = g.devir;

  for (const y of g.yamalar) if (!d.shalar.includes(y.sha256)) k('sha', `${y.ad}: sha256 DEVIR.md'de yok ya da tutmuyor (${y.sha256.slice(0, 12)}…)`);

  if (!d.taban) k('taban', 'DEVIR.md\'de taban commit yazılı değil');
  // Başka teslimin üstüne kurulan teslimin tabanı o teslimin commit'i olabilir; deneme zinciri ana dala kendisi uygular (3046 a).
  else if (g.tabanGeride === null || g.tabanGeride < 0) {
    const neden = g.tabanGeride === null ? 'yerel depoda yok (git fetch?)' : 'ana dalın atası değil';
    if (g.dayanak?.shalar.length) u('taban-dayanak', `taban ${d.taban} ${neden}; teslim ${d.ustune ?? ''} üstüne kurulu, deneme zinciri ana dala uygular`);
    else k('taban', `taban ${d.taban} ${neden}`);
  }
  else if (g.tabanGeride > 0) u('taban-geride', `taban ${d.taban} ana dalın ${g.tabanGeride} commit gerisinde; git am -3 ile güncel ana dala uygulanmalı`);

  const dosyalar = [...new Set(g.yamalar.flatMap((y) => y.dosyalar))];
  if (d.kilit.length === 0) {
    u('kilit-basligi-yok', `<!-- teslim --> başlığında kilit yok; ${dosyalar.length} dosya elle karşılaştırılır: ${dosyalar.slice(0, 6).join(', ')}${dosyalar.length > 6 ? ' …' : ''}`);
  }
  else {
    const disarida = dosyalar.filter((f) => !kilitIcinde(f, d.kilit));
    if (disarida.length) k('kilit-disi', `kilit dışı dosya: ${disarida.join(', ')}`);
  }

  const ortak = dosyalar.filter(ortakNoktaMi);
  const goc = dosyalar.filter((f) => GOC_YOLU.test(f));
  const gercekSade = ortak.length === 0;
  if (d.sade === null) u('sade-yazilmamis', `"Sade: evet|hayır" satırı yok (hesaplanan: ${gercekSade ? 'evet' : 'hayır'})`);
  else if (d.sade && !gercekSade) k('sade-yanlis', `"Sade: evet" yazılı ama ortak noktaya dokunuyor: ${ortak.join(', ')}`);
  const onayli = dosyalar.filter((f) => ONAY_GEREKEN.some((r) => r.test(f)));
  if (onayli.length && !d.onaySatiri) k('onay', `yazılı onay gereken dosya var ama onay satırı (karar no ya da mesaj id'si) yok: ${onayli.join(', ')}`);
  else if ((goc.length || dosyalar.some((f) => /islem|yetki/.test(f))) && !d.onaySatiri) {
    u('onay-denetle', 'göç ya da yetki dosyası var, onay satırı yok; dolu tabloyu değiştiren göç ya da rol x işlem ise onay gerekir');
  }

  for (const f of goc) {
    const damga = GOC_YOLU.exec(f)?.[1] ?? '';
    if (g.anaDaldakiGocler.includes(f)) u('zaten-ana-dalda', `${f} ana dalda var; yama birleşmiş olabilir`);
    else if (g.enBuyukGoc && damga <= g.enBuyukGoc) k('goc-damgasi', `${f}: damga ana daldaki en büyük göçten (${g.enBuyukGoc}) küçük ya da eşit; yazar yeniden damgalar`);
  }

  if (!d.taramaSatiri) k('tarama', 'açık depo taraması satırı yok');
  if (!d.testSatiri) k('test', 'koşulan komutların son satırı yok');
  if (g.dayanak?.hata) k('dayanak', g.dayanak.hata);
  for (const x of vtDenetle(g.vtSonuc, g.yamalar.map((y) => y.sha256), g.dayanak?.shalar ?? [])) b.push(x);
  if (g.ek) {
    for (const x of kontrolEt({ ...g.ek, dosyalar, testSatirlari: d.testSatirlari, komsuMuafSatirlari: d.komsuMuafSatirlari, yetkiMuaf: d.yetkiMuaf, onizlemeFarki: d.onizlemeFarki })) b.push(x);
  }
  if (d.tamTest) u('tam-test', 'yerelde tam sunucu testi ya da kontrol koşulmuş görünüyor; talimat: yerelde modül ve bağımlıları, tam test CI\'da');
  return b;
}

export interface GrupOzeti { kart: string; dosyalar: string[]; ayriTur: string | null; kirmizi: boolean; ustune?: string | null }

// Göçsüz, ortak noktaya dokunmayan, kırmızısız ve birbirinin dosyasına dokunmayan teslimler 8'lik gruplara girer.
// Başka teslimin üstüne kurulan teslim, dayandığı teslimin grubuna ya da sonrakine girer; dayandığı teslim listede yoksa ayrı kalır.
export function grupla(teslimler: readonly GrupOzeti[], enCok = 8): { gruplar: string[][]; ayri: { kart: string; neden: string }[] } {
  const ayri: { kart: string; neden: string }[] = [];
  const gruplar: { kartlar: string[]; dosyalar: Set<string> }[] = [];
  const yeri = new Map<string, number>();
  for (const t of teslimler) {
    if (t.kirmizi) { ayri.push({ kart: t.kart, neden: 'kapı kırmızı' }); continue; }
    if (t.ayriTur) { ayri.push({ kart: t.kart, neden: t.ayriTur }); continue; }
    const enErken = t.ustune ? yeri.get(t.ustune) : 0;
    if (enErken === undefined) { ayri.push({ kart: t.kart, neden: `önce ${t.ustune ?? ''} birleşmeli` }); continue; }
    let i = gruplar.findIndex((g, j) => j >= enErken && g.kartlar.length < enCok && t.dosyalar.every((f) => !g.dosyalar.has(f)));
    if (i < 0) i = gruplar.push({ kartlar: [], dosyalar: new Set() }) - 1;
    const g = gruplar[i];
    if (!g) continue;
    g.kartlar.push(t.kart);
    t.dosyalar.forEach((f) => g.dosyalar.add(f));
    yeri.set(t.kart, i);
  }
  return { gruplar: gruplar.map((g) => g.kartlar), ayri };
}

export function ayriTurNedeni(dosyalar: readonly string[]): string | null {
  if (dosyalar.some((f) => GOC_YOLU.test(f))) return 'göç var (göç zinciri turu)';
  const ortak = dosyalar.filter(ortakNoktaMi);
  return ortak.length ? `ortak nokta: ${ortak.slice(0, 3).join(', ')}${ortak.length > 3 ? ' …' : ''}` : null;
}

export function sonucSatirlari(klasor: string, bulgular: readonly Bulgu[]): string[] {
  const kirmizi = bulgular.filter((x) => x.duzey === 'kirmizi');
  const satirlar = bulgular.map((x) => `${x.duzey === 'kirmizi' ? 'KIRMIZI' : 'UYARI  '} [${x.etiket}] ${x.mesaj}`);
  satirlar.push(`teslim-denetle ${basename(klasor)}: ${kirmizi.length ? `KIRMIZI (${kirmizi.length})` : 'GEÇTİ'}, ${bulgular.length - kirmizi.length} uyarı`);
  return satirlar;
}

function gitSatir(kok: string, a: string[]): string | null {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', ...a], { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function tabanGeride(kok: string, taban: string | null, dal: string): number | null {
  if (!taban || gitSatir(kok, ['cat-file', '-e', `${taban}^{commit}`]) === null) return null;
  if (gitSatir(kok, ['merge-base', '--is-ancestor', taban, dal]) === null) return -1;
  const sayi = gitSatir(kok, ['rev-list', '--count', `${taban}..${dal}`]);
  return sayi === null ? null : Number(sayi);
}

export function anaDalGocleri(kok: string, dal: string): string[] {
  const liste = gitSatir(kok, ['ls-tree', '--name-only', `${dal}:sunucu/gocler`]);
  return (liste ?? '').split('\n').filter(Boolean).map((a) => `sunucu/gocler/${a}`);
}

export function enBuyukGoc(adlar: readonly string[]): string | null {
  const damgalar = adlar.map((s) => basename(s)).map((s) => /^(\d{14})_/.exec(s)?.[1]).filter((s): s is string => Boolean(s)).sort();
  return damgalar.at(-1) ?? null;
}

// Ek yama "<kart>-<n>.patch" adıyla ilk yamanın ("<kart>.patch") ardından gelir; düz sıralamada '-' '.'den küçük olduğu için önce gelirdi.
export function yamaSirasi(a: string, b: string): number {
  const ayir = (ad: string): [string, number] => {
    const m = /^(.*?)(?:-(\d+))?\.patch$/.exec(ad);
    return m ? [m[1] ?? '', Number(m[2] ?? 0)] : [ad, 0];
  };
  const [ka, na] = ayir(a);
  const [kb, nb] = ayir(b);
  return ka === kb ? na - nb : ka.localeCompare(kb, 'tr', { numeric: true });
}

export interface DayanakTeslimi { ad: string; klasor: string; yamalar: VtYamasi[] }

// `ustune:` teslimin kardeş klasörünün adıdır; o da başka teslimin üstüne kurulmuş olabilir. En alttaki önce döner.
export function dayanakZinciri(
  klasor: string,
  ustune: string | null,
  oku: (klasor: string) => { ustune: string | null; yamalar: VtYamasi[] } | null,
  enCok = 5,
): { zincir: DayanakTeslimi[]; hata: string | null } {
  const zincir: DayanakTeslimi[] = [];
  const gorulen = new Set([basename(klasor)]);
  for (let ad = ustune; ad; ) {
    if (gorulen.has(ad)) return { zincir, hata: `ustune zinciri kendine dönüyor (${ad})` };
    if (zincir.length >= enCok) return { zincir, hata: `ustune zinciri ${String(enCok)} teslimden uzun` };
    gorulen.add(ad);
    const yol = join(dirname(klasor), ad);
    const d = oku(yol);
    if (!d) return { zincir, hata: `dayanılan teslim klasörü yok: ${ad}` };
    if (d.yamalar.length === 0) return { zincir, hata: `dayanılan teslimde yama yok: ${ad}` };
    zincir.unshift({ ad, klasor: yol, yamalar: d.yamalar });
    ad = d.ustune;
  }
  return { zincir, hata: null };
}

function yamalariOku(klasor: string): VtYamasi[] {
  return readdirSync(klasor).filter((a) => a.endsWith('.patch') && statSync(join(klasor, a)).isFile()).sort(yamaSirasi).map((ad) => {
    const icerik = readFileSync(join(klasor, ad));
    return { ad, sha256: createHash('sha256').update(icerik).digest('hex'), dosyalar: yamaDosyalari(icerik.toString('utf8')) };
  });
}

export function dayanakOku(klasor: string): { ustune: string | null; yamalar: VtYamasi[] } | null {
  if (!existsSync(klasor) || !statSync(klasor).isDirectory()) return null;
  const devirYolu = join(klasor, 'DEVIR.md');
  return { ustune: existsSync(devirYolu) ? devirOku(readFileSync(devirYolu, 'utf8')).ustune : null, yamalar: yamalariOku(klasor) };
}

export function klasorOku(kok: string, klasor: string, dal: string): TeslimGirdisi {
  const devirYolu = join(klasor, 'DEVIR.md');
  const devir = existsSync(devirYolu) ? devirOku(readFileSync(devirYolu, 'utf8')) : null;
  const metinler: string[] = [];
  const yamalar = readdirSync(klasor).filter((a) => a.endsWith('.patch') && statSync(join(klasor, a)).isFile()).sort(yamaSirasi).map((ad) => {
    const icerik = readFileSync(join(klasor, ad));
    metinler.push(icerik.toString('utf8'));
    return { ad, sha256: createHash('sha256').update(icerik).digest('hex'), dosyalar: yamaDosyalari(icerik.toString('utf8')) };
  });
  const gocler = anaDalGocleri(kok, dal);
  const ayrintilar = metinler.map(yamaAyrintisi);
  const tarihler = ayrintilar.map((a) => a.tarih);
  const dosyaOku = (y: string) => (existsSync(join(kok, y)) ? readFileSync(join(kok, y), 'utf8') : null);
  const { kapilar, yetkisizTestler } = yetkiDegisimi(ayrintilar, dosyaOku);
  const vtYolu = join(klasor, SONUC_DOSYASI);
  const zincir = dayanakZinciri(klasor, devir?.ustune ?? null, dayanakOku);
  return {
    dayanak: { shalar: zincir.zincir.flatMap((d) => d.yamalar.map((y) => y.sha256)), hata: zincir.hata },
    klasor, devir, yamalar, tabanGeride: tabanGeride(kok, devir?.taban ?? null, dal), enBuyukGoc: enBuyukGoc(gocler), anaDaldakiGocler: gocler,
    vtSonuc: sonucuYukle(klasor),
    ek: {
      // Bir yama bile tarihsizse ya da karardan sonra yazıldıysa geçiş sayılmaz.
      yamaTarihi: tarihler.some((t) => t === null) ? null : tarihler.length ? Math.max(...(tarihler as number[])) : null,
      komsular: komsuModuller([...new Set(yamalar.flatMap((y) => y.dosyalar))], depoKaynaklari(kok)),
      vtModuller: vtModulleri(existsSync(vtYolu) ? readFileSync(vtYolu, 'utf8') : null),
      yetkiKapilari: kapilar,
      yetkisizTestler,
    },
  };
}

export function argumanOku(a: readonly string[]): { grup: boolean; vt: boolean; klasorler: string[]; dal: string } {
  const dalYeri = a.indexOf('--taban-dal');
  const dal = dalYeri >= 0 ? a[dalYeri + 1] : 'origin/main';
  if (!dal || dal.startsWith('--')) throw new Error(KULLANIM);
  const kalan = a.filter((x, i) => x !== '--grup' && x !== '--vt' && (dalYeri < 0 || (i !== dalYeri && i !== dalYeri + 1)));
  if (kalan.length === 0 || kalan.some((x) => x.startsWith('--'))) throw new Error(KULLANIM);
  const grup = a.includes('--grup');
  const vt = a.includes('--vt');
  if ((grup && vt) || (!grup && kalan.length > 1)) throw new Error(KULLANIM);
  return { grup, vt, klasorler: kalan, dal };
}

async function calistir(): Promise<number> {
  let secenek: ReturnType<typeof argumanOku>;
  try {
    secenek = argumanOku(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const kok = resolve(fileURLToPath(new URL('..', import.meta.url)));
  if (secenek.vt) {
    const klasor = resolve(secenek.klasorler[0] ?? '');
    const g = klasorOku(kok, klasor, secenek.dal);
    if (g.yamalar.length === 0) {
      console.error('klasörde .patch dosyası yok');
      return 1;
    }
    const zincir = dayanakZinciri(klasor, g.devir?.ustune ?? null, dayanakOku);
    if (zincir.hata) {
      console.error(zincir.hata);
      return 1;
    }
    const { sonuc, satirlar } = await vtDenemesi({ kok, klasor, dal: secenek.dal, yamalar: g.yamalar, dayanaklar: zincir.zincir });
    sonucuKaydet(klasor, sonuc, satirlar);
    console.log(`teslim-denetle --vt ${basename(klasor)}: ${sonuc.gecti ? 'GEÇTİ' : 'KIRMIZI'} (PostgreSQL ${sonuc.pg === null ? '?' : String(sonuc.pg)}), sonuç ${join(basename(klasor), 'VT-SONUC.md')}`);
    return sonuc.gecti ? 0 : 1;
  }
  let kirmiziVar = false;
  const ozetler: GrupOzeti[] = [];
  for (const klasor of secenek.klasorler) {
    const g = klasorOku(kok, resolve(klasor), secenek.dal);
    const bulgular = denetle(g);
    const kirmizi = bulgular.some((x) => x.duzey === 'kirmizi');
    kirmiziVar ||= kirmizi;
    const dosyalar = [...new Set(g.yamalar.flatMap((y) => y.dosyalar))];
    ozetler.push({ kart: basename(resolve(klasor)), dosyalar, ayriTur: ayriTurNedeni(dosyalar), kirmizi, ustune: g.devir?.ustune ?? null });
    for (const s of sonucSatirlari(klasor, bulgular)) console.log(s);
  }
  if (secenek.grup) {
    const { gruplar, ayri } = grupla(ozetler);
    gruplar.forEach((g, i) => console.log(`GRUP ${i + 1}: ${g.join(', ')}`));
    for (const x of ayri) console.log(`AYRI TUR: ${x.kart} (${x.neden})`);
    return 0;
  }
  return kirmiziVar ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await calistir();
