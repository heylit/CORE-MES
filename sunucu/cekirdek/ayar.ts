import { isIP } from 'node:net';
import { ORTAMLAR } from '#paylasilan/ortam.ts';
import type { Ortam } from '#paylasilan/ortam.ts';

// Tabloların sahibi göç kullanıcısıdır; şemayı yalnız o değiştirir. Ayarın parçası değildir: yalnız göç
// koşusu ve test fikstürü okur, sunucu süreci taşımaz.
export interface PgGocKimligi {
  kullanici: string;
  parola: string;
}

export interface PgAyari {
  host: string;
  port: number;
  // Uygulama kullanıcısı: okur ve yazar; tablo düşüremez, değiştiremez, boşaltamaz.
  kullanici: string;
  parola: string;
  veritabani: string;
  // Cevap vermeyen sunucuda bağlantı kurma ve sorgu süresiz beklemez; ikisi de milisaniye.
  baglantiSureMs: number;
  sorguSureMs: number;
  // Okuma isteğinin sorgu süre sınırı (sorgu sınırından büyük olamaz): kilitli tabloyu okuyan istek bağlantıyı uzun tutup
  // ilgisiz ekranları havuz sırasında bekletmesin.
  okumaSureMs: number;
  // Aynı anda açık bağlantı üst sınırı; veritabanının bağlantı sınırının altında kalmalı.
  havuzBoyutu: number;
  // Göç bağlantısı kilidi en çok bu kadar bekler: kilit kuyruğunda duran DDL arkasındaki bütün sorguları da durdurur.
  kilitSureMs: number;
  // Transaction açıp susan oturumu sunucu bu süre sonunda keser; tuttuğu kilitler ve bağlantı geri döner.
  bosTxSureMs: number;
}

// Göç koşusunun istediği: bağlantı ayarı ve tabloların sahibinin kimliği.
export interface GocAyari {
  pg: PgAyari;
  goc: PgGocKimligi;
}

export interface Ayar {
  ortam: Ortam;
  port: number;
  pg: PgAyari;
  pgTestVeritabani: string | null;
  // Çalışan sürümün commit'i; dağıtım ortamı verir. Verilmediyse bilinmiyordur, uydurulmaz.
  commit: string | null;
  // Kurum ters vekili başka bilgisayardaysa onun IP'si: X-Forwarded-For başlığına o adresten de güvenilir (kart #175).
  vekilAdresi?: string;
}

type Ortamlar = Record<string, string | undefined>;

// Eski sistemin veritabanları (canlı ve önizleme); bu depo onlara hiçbir koşulda bağlanmaz.
const YASAK_VERITABANLARI: readonly string[] = ['tmi', 'tmi_onizleme'];

function zorunlu(env: Ortamlar, ad: string): string {
  const deger = env[ad]?.trim();
  if (!deger) throw new Error(`Ortam değişkeni eksik: ${ad}`);
  return deger;
}

function portOku(env: Ortamlar, ad: string): number {
  const deger = zorunlu(env, ad);
  const sayi = Number(deger);
  if (!/^\d+$/.test(deger) || sayi < 1 || sayi > 65535) {
    throw new Error(`Ortam değişkeni geçersiz: ${ad} (1-65535 arası tam sayı olmalı)`);
  }
  return sayi;
}

const AZAMI_SURE_MS = 3_600_000;

// Sıfır PostgreSQL'de "sınırsız" demektir; süresiz beklemeyi geri getireceği için kabul edilmez.
function sureOku(env: Ortamlar, ad: string): number {
  const deger = zorunlu(env, ad);
  const sayi = Number(deger);
  if (!/^\d+$/.test(deger) || sayi < 1 || sayi > AZAMI_SURE_MS) {
    throw new Error(`Ortam değişkeni geçersiz: ${ad} (1-${AZAMI_SURE_MS} arası tam sayı olmalı, milisaniye)`);
  }
  return sayi;
}

const AZAMI_HAVUZ = 500;

function havuzOku(env: Ortamlar, ad: string): number {
  const deger = zorunlu(env, ad);
  const sayi = Number(deger);
  if (!/^\d+$/.test(deger) || sayi < 1 || sayi > AZAMI_HAVUZ) {
    throw new Error(`Ortam değişkeni geçersiz: ${ad} (1-${AZAMI_HAVUZ} arası tam sayı olmalı)`);
  }
  return sayi;
}

function veritabaniAdi(ad: string, deger: string): string {
  if (YASAK_VERITABANLARI.includes(deger.toLowerCase())) {
    throw new Error(`Ortam değişkeni geçersiz: ${ad} ('${deger}' eski sistemin veritabanıdır, kullanılamaz)`);
  }
  return deger;
}

function ortamOku(env: Ortamlar): Ortam {
  const deger = zorunlu(env, 'TMIV2_ORTAM');
  const ortam = ORTAMLAR.find((o) => o === deger);
  if (!ortam) {
    throw new Error(`Ortam değişkeni geçersiz: TMIV2_ORTAM (${ORTAMLAR.join(' | ')} olmalı)`);
  }
  return ortam;
}

export const VEKIL_ADRESI_DEGISKENI = 'TMIV2_VEKIL_ADRESI';

function vekilAdresiOku(env: Ortamlar): { vekilAdresi?: string } {
  const deger = env[VEKIL_ADRESI_DEGISKENI]?.trim() ?? '';
  if (deger === '') return {};
  if (isIP(deger) === 0) throw new Error(`Ortam değişkeni geçersiz: ${VEKIL_ADRESI_DEGISKENI} (ters vekilin IP adresi olmalı)`);
  return { vekilAdresi: deger };
}

// Canlıda sunucu yalnız bu makinede dinler: HTTPS'i önündeki kurum ters vekili bitirir (kart #175, kullanıcı kararı 16.10.2026).
// Geliştirmede bugünkü gibi bütün arayüzlerde dinler; telefonlar yine 4101 üzerinden gelir.
export const dinlemeAdresi = (ortam: Ortam): string => (ortam === 'canli' ? '127.0.0.1' : '0.0.0.0');

// Aynı kullanıcı iki işi de görürse uygulama tabloların sahibi olur; ayrımın koruduğu her şey sessizce düşer.
export const GOC_DEGISKENLERI: readonly string[] = ['TMIV2_PG_GOC_USER', 'TMIV2_PG_GOC_PASSWORD'];

export function gocKimligiOku(env: Ortamlar = process.env): PgGocKimligi {
  const kullanici = zorunlu(env, 'TMIV2_PG_GOC_USER');
  if (kullanici === zorunlu(env, 'TMIV2_PG_USER')) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_PG_GOC_USER (TMIV2_PG_USER ile aynı olamaz; göç ve uygulama ayrı veritabanı kullanıcısıdır)');
  }
  return { kullanici, parola: zorunlu(env, 'TMIV2_PG_GOC_PASSWORD') };
}

export function ayarOku(env: Ortamlar = process.env): Ayar {
  const testVeritabani = env['TMIV2_PG_TEST_DATABASE']?.trim();
  const sorguSureMs = sureOku(env, 'TMIV2_PG_SORGU_SURE_MS');
  const okumaSureMs = sureOku(env, 'TMIV2_PG_OKUMA_SURE_MS');
  if (okumaSureMs > sorguSureMs) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_PG_OKUMA_SURE_MS (TMIV2_PG_SORGU_SURE_MS değerinden büyük olamaz)');
  }
  return {
    ortam: ortamOku(env),
    port: portOku(env, 'TMIV2_PORT'),
    pg: {
      host: zorunlu(env, 'TMIV2_PG_HOST'),
      port: portOku(env, 'TMIV2_PG_PORT'),
      kullanici: zorunlu(env, 'TMIV2_PG_USER'),
      parola: zorunlu(env, 'TMIV2_PG_PASSWORD'),
      veritabani: veritabaniAdi('TMIV2_PG_DATABASE', zorunlu(env, 'TMIV2_PG_DATABASE')),
      baglantiSureMs: sureOku(env, 'TMIV2_PG_BAGLANTI_SURE_MS'),
      sorguSureMs,
      okumaSureMs,
      havuzBoyutu: havuzOku(env, 'TMIV2_PG_HAVUZ'),
      kilitSureMs: sureOku(env, 'TMIV2_PG_KILIT_SURE_MS'),
      bosTxSureMs: sureOku(env, 'TMIV2_PG_BOS_TX_SURE_MS'),
    },
    pgTestVeritabani: testVeritabani ? veritabaniAdi('TMIV2_PG_TEST_DATABASE', testVeritabani) : null,
    commit: env['TMIV2_COMMIT']?.trim() || null,
    ...vekilAdresiOku(env),
  };
}

// PostgreSQL veri klasörü isteğe bağlıdır: uygulama kullanıcısı `data_directory`'yi okuyamaz, yetkisi genişletilmez. Verilmezse
// veritabanı diskinin boş yeri bilinmiyordur (sağlık ayrıntısında null).
export function pgVeriDiziniOku(env: Ortamlar = process.env): string | null {
  return env['TMIV2_PG_VERI_DIZINI']?.trim() || null;
}

// Sevkiyat harita paketinin dizini isteğe bağlıdır: verilmezse modül depodaki paketi okur. Sunucu ayarından ayrı okunur;
// modül yüklenirken çağrılır ve veritabanı değişkenleri olmayan araçlar da sevkiyatı yükleyebilir.
export function haritaDiziniOku(env: Ortamlar = process.env): string | null {
  return env['TMIV2_HARITA_DIZINI']?.trim() || null;
}

// Testler asıl veritabanına değil ayrı test veritabanına bağlanır; tanımsızsa sessizce asıl veritabanına düşmez.
export function testAyari(ayar: Ayar): Ayar {
  if (ayar.pgTestVeritabani === null) {
    throw new Error('Ortam değişkeni eksik: TMIV2_PG_TEST_DATABASE (veritabanı testleri için zorunlu)');
  }
  if (ayar.pgTestVeritabani === ayar.pg.veritabani) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_PG_TEST_DATABASE (TMIV2_PG_DATABASE ile aynı olamaz)');
  }
  return { ...ayar, ortam: 'test', pg: { ...ayar.pg, veritabani: ayar.pgTestVeritabani } };
}
