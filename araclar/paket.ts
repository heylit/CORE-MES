import { createHash, sign, type KeyObject } from 'node:crypto';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { AZAMI_DEGISIKLIK, AZAMI_DEGISIKLIK_METNI, PAKET_IMLECI } from '../sunucu/moduller/ayarlar/disari.ts';

// Güncelleme paketinin üretici yarısı (kart #886): biçim ve sınırlar doğrulayan kodla aynı kaynaktan gelir.
export const YAYIN_ETIKETI = 'yayin/';
export const GOC_ADI = /^[0-9]{14}_[a-z0-9_]+\.sql$/;
// git log --format değeri: kayıt ayırıcı 0x1e, alan ayırıcı 0x1f; PR başlığı birleşme commit'inin gövdesindedir.
export const BIRLESME_BICIMI = '%s%x1f%b%x1e';

// Sürüm adı tesis gününden çıkar: aynı gün ikinci yayın -2 olur. Etiketler `yayin/` önekiyle verilir.
export function surumAdi(an: Date, etiketler: readonly string[]): string {
  const gun = tesisGunu(an).replaceAll('-', '.');
  const onek = `${YAYIN_ETIKETI}${gun}-`;
  const siralar = etiketler
    .filter((e) => e.startsWith(onek))
    .map((e) => Number(e.slice(onek.length)))
    .filter((n) => Number.isInteger(n) && n > 0);
  return `${gun}-${Math.max(0, ...siralar) + 1}`;
}

function kirp(metin: string): string {
  return metin.length > AZAMI_DEGISIKLIK_METNI ? `${metin.slice(0, AZAMI_DEGISIKLIK_METNI - 1)}…` : metin;
}

// Yalnız GitHub'ın PR birleşmeleri sayılır; dal içi birleşmeler (`Merge #840 into batch`) değişiklik değildir.
export function birlesmeleriAyikla(gunluk: string): { no: number; baslik: string }[] {
  const birlesmeler: { no: number; baslik: string }[] = [];
  for (const kayit of gunluk.split('\x1e')) {
    const [konu = '', govde = ''] = kayit.split('\x1f');
    const eslesme = /^Merge pull request #(\d+) /.exec(konu.trim());
    if (eslesme === null) continue;
    birlesmeler.push({ no: Number(eslesme[1]), baslik: govde.trim().split('\n')[0]?.trim() ?? '' });
  }
  return birlesmeler;
}

const birlesmeSatiri = (b: { no: number; baslik: string }): string => (b.baslik === '' ? `#${String(b.no)}` : `#${String(b.no)}: ${b.baslik}`);

// Paket bildirimindeki liste sunucunun sınırlarına kırpılır; tam liste sürüm notundadır.
export function degisiklikleriAyikla(gunluk: string): string[] {
  const satirlar = birlesmeleriAyikla(gunluk).map((b) => kirp(birlesmeSatiri(b)));
  if (satirlar.length <= AZAMI_DEGISIKLIK) return satirlar;
  const kalan = satirlar.length - (AZAMI_DEGISIKLIK - 1);
  return [...satirlar.slice(0, AZAMI_DEGISIKLIK - 1), `ve ${kalan} değişiklik daha`];
}

export interface PaketGirdisi {
  surum: string;
  commit: string;
  tarih: string;
  gocler: readonly string[];
  not: string | null;
  degisiklikler: readonly string[];
  // degisiklikler'in başladığı yayın (YAYIN_ETIKETI öneksiz); ilk yayında null. Sunucu çalışan sürümle karşılaştırıp atlanan yayını söyler.
  oncekiYayin: string | null;
}

// PR başlığının sonundaki parantezde kart numarası beklenir (1565 b): sürüm notundaki satır karta böyle bağlanır.
export const KART_NO_BASLIKTA = /\((?:[^()]*\D)?\d{3,5}(?:\D[^()]*)?\)\s*$/;

export function kartNoVarMi(baslik: string): boolean {
  return KART_NO_BASLIKTA.test(baslik.trim());
}

export interface SurumNotuGirdisi {
  surum: string;
  commit: string;
  tarih: string;
  oncekiYayin: string | null;
  yeniGocler: readonly string[];
  not: string | null;
  gunluk: string;
}

// Paketle aynı anda yazılan sürüm notu: bildirimdeki kırpılmış liste yerine bütün birleşmeler ve yalnız bu yayınla gelen
// göçler. Kurumdaki kişi elle adımı (`not`) ve göç sayısını kesinti öncesi buradan okur.
export function surumNotu(g: SurumNotuGirdisi): string {
  const birlesmeler = birlesmeleriAyikla(g.gunluk);
  const satirlar = [
    `# Yayın ${g.surum}`,
    '',
    `- Commit: ${g.commit}`,
    `- Tarih: ${g.tarih}`,
    `- Önceki yayın: ${g.oncekiYayin ?? 'yok (son 50 birleşme)'}`,
    '',
    '## Elle adım',
    '',
    g.not ?? 'Yok.',
    '',
    `## Göçler (${String(g.yeniGocler.length)})`,
    '',
    ...(g.yeniGocler.length === 0 ? ['Yok.'] : g.yeniGocler.map((ad) => `- ${ad}`)),
    '',
    `## Değişiklikler (${String(birlesmeler.length)})`,
    '',
    ...(birlesmeler.length === 0 ? ['Yok.'] : birlesmeler.map((b) => `- ${birlesmeSatiri(b)}`)),
  ];
  const kartsiz = birlesmeler.filter((b) => !kartNoVarMi(b.baslik));
  if (kartsiz.length > 0) satirlar.push('', `Kart numarası olmayan başlık: ${kartsiz.map((b) => `#${String(b.no)}`).join(', ')}`);
  return `${satirlar.join('\n')}\n`;
}

// İmza bildirim metninin baytları üzerindedir; doğrulayan aynı metni ayrıştırmadan önce denetler.
export function paketKur(girdi: PaketGirdisi, yuk: Buffer, gizliAnahtar: KeyObject): Buffer {
  const bildirim = JSON.stringify({
    bicim: 1, ...girdi, yukBoyut: yuk.length, yukSha256: createHash('sha256').update(yuk).digest('hex'),
  });
  const imza = sign(null, Buffer.from(bildirim, 'utf8'), gizliAnahtar).toString('base64');
  return Buffer.concat([Buffer.from(PAKET_IMLECI, 'utf8'), Buffer.from(`${JSON.stringify({ bildirim, imza })}\n`, 'utf8'), yuk]);
}

// Sunucunun TMIV2_GUNCELLEME_ANAHTARI değeri: ham 32 bayt ed25519 ortak anahtarı, base64.
export function ortakAnahtarMetni(ortak: KeyObject): string {
  const { x } = ortak.export({ format: 'jwk' });
  if (x === undefined) throw new Error('Anahtar ed25519 değil.');
  return Buffer.from(x, 'base64url').toString('base64');
}

// Paket, lock dosyasındaki npm paketlerini bu klasörde npm önbelleği olarak taşır (kart #1562): fabrika ağında internet yok.
export const NPM_ONBELLEGI = '.npm-onbellek';
// Yalnız ekran testlerinin kullandığı paketler sunucuya kurulmaz; paketteki package.json ve lock dosyasından çıkarılır.
export const SUNUCUDA_KURULMAYAN: readonly string[] = ['@playwright/test'];
export const NPM_KAYIT_ADRESI = 'https://registry.npmjs.org/';

interface KilitGirdisi {
  resolved?: string;
  integrity?: string;
  os?: string[];
  cpu?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [alan: string]: unknown;
}
export interface Kilit { packages: Record<string, KilitGirdisi>; [alan: string]: unknown }
export interface PaketJson { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; [alan: string]: unknown }

const BAG_ALANLARI = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

// npm'in yerleşimiyle çözüm: paketin kendi node_modules'ü, sonra üst klasörlerinki. Bulunamayan (kurulmamış isteğe bağlı eş) atlanır.
function cozumle(kilit: Kilit, yol: string, ad: string): string | null {
  let taban = yol;
  for (;;) {
    const aday = taban === '' ? `node_modules/${ad}` : `${taban}/node_modules/${ad}`;
    if (kilit.packages[aday] !== undefined) return aday;
    if (taban === '') return null;
    const kes = taban.lastIndexOf('/node_modules/');
    taban = kes < 0 ? '' : taban.slice(0, kes);
  }
}

function ulasilanlar(kilit: Kilit): Set<string> {
  const goruldu = new Set<string>(['']);
  const sira = [''];
  for (let yol = sira.pop(); yol !== undefined; yol = sira.pop()) {
    const girdi = kilit.packages[yol];
    // Kökün geliştirme bağımlılıkları kurulur; alt paketlerinki kurulmaz.
    const alanlar = yol === '' ? BAG_ALANLARI : BAG_ALANLARI.filter((a) => a !== 'devDependencies');
    for (const alan of alanlar) {
      for (const ad of Object.keys(girdi?.[alan] ?? {})) {
        const hedef = cozumle(kilit, yol, ad);
        if (hedef !== null && !goruldu.has(hedef)) { goruldu.add(hedef); sira.push(hedef); }
      }
    }
  }
  return goruldu;
}

// Sunucuya giden package.json ve lock: çıkarılan paketlerle yalnız onların getirdikleri düşer. Önce de ulaşılmayan girdi elle
// silinmez; npm'in kendi kararı korunur.
export function sunucuKurulumu(paket: PaketJson, kilit: Kilit, cikarilan: readonly string[]): { paketJson: PaketJson; kilit: Kilit; cikan: string[] } {
  const yeniPaket = structuredClone(paket);
  const yeniKilit = structuredClone(kilit);
  const kok = yeniKilit.packages[''];
  if (kok === undefined) throw new Error('package-lock.json kök girdisi yok.');
  for (const ad of cikarilan) {
    if (paket.dependencies?.[ad] === undefined && paket.devDependencies?.[ad] === undefined) throw new Error(`${ad} package.json'da yok.`);
    for (const alan of ['dependencies', 'devDependencies'] as const) {
      delete yeniPaket[alan]?.[ad];
      delete kok[alan]?.[ad];
    }
  }
  const once = ulasilanlar(kilit);
  const sonra = ulasilanlar(yeniKilit);
  const cikan = [...once].filter((y) => !sonra.has(y));
  for (const y of cikan) delete yeniKilit.packages[y];
  return { paketJson: yeniPaket, kilit: yeniKilit, cikan };
}

export interface Platform { os: string; cpu: string }

// Biçim: `win32-x64` ya da virgülle birkaç tane (Node'un process.platform ve process.arch adları).
export function platformlariOku(metin: string): Platform[] {
  return metin.split(',').map((p) => p.trim()).map((p) => {
    const e = /^([a-z0-9]+)-([a-z0-9]+)$/.exec(p);
    if (e === null) throw new Error(`Platform "${p}" okunamadı; ör. win32-x64.`);
    return { os: e[1] ?? '', cpu: e[2] ?? '' };
  });
}

// npm'in os/cpu kuralı: liste boşsa uyar; `!ad` dışlar; olumlu ad varsa biri eşleşmeli.
function uyar(liste: readonly string[] | undefined, deger: string): boolean {
  if (liste === undefined || liste.length === 0) return true;
  if (liste.includes(`!${deger}`)) return false;
  const olumlu = liste.filter((d) => !d.startsWith('!'));
  return olumlu.length === 0 || olumlu.includes(deger);
}

export interface Tarball { yol: string; adres: string; butunluk: string }

// Hedef platformlardan birinde kurulabilecek her paketin tarball'ı. Başka platformun ikilisi taşınmaz; npm onu kurmaz.
export function onbellekListesi(kilit: { packages: Record<string, KilitGirdisi> }, platformlar: readonly Platform[]): Tarball[] {
  const liste: Tarball[] = [];
  for (const [yol, g] of Object.entries(kilit.packages)) {
    if (yol === '' || g['link'] === true) continue;
    if (!platformlar.some((p) => uyar(g.os, p.os) && uyar(g.cpu, p.cpu))) continue;
    if (g.resolved === undefined || !g.resolved.startsWith(NPM_KAYIT_ADRESI)) throw new Error(`${yol} npm kayıt adresinden değil: ${String(g.resolved)}`);
    if (g.integrity === undefined) throw new Error(`${yol} bütünlük değeri (integrity) taşımıyor.`);
    liste.push({ yol, adres: g.resolved, butunluk: g.integrity });
  }
  return liste;
}
