import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { modelKoprusuKur } from './model.ts';
import { DOSYA, adimSatiriOku } from './sozlesme.ts';
import { altTohum, rastgeleUret } from './tohum.ts';
import { oturumDosyasi } from '../yollar.ts';
import type { RobotAyari } from './ayar.ts';
import type { KosuKaydi } from './kayit.ts';
import type { KopruBagimliliklari, ModelKoprusu } from './model.ts';
import type { AdimSatiri } from './sozlesme.ts';

// Keşif kipi (karar 179 c): model tarayıcı sürmez, robotun bulduğu ekran listesinden sırayı seçer; ekranı robotun Playwright kodu açar.
// Yalnız bağlantı izlenir (GET); düğmeye basılmaz, form doldurulmaz: keşif veri yazmaz. Model tekrarlanabilir değildir, bu yüzden
// her satır seçilen sırayı ve tohumu taşır; bulunan hata deterministik senaryoya çevrilir.
export const KESIF_SENARYOSU = 'kesif';
export const KESIF_ADIM_SINIRI = 4;
export const KESIF_SON_ADIM_SINIRI = 12;

export interface KesifEkrani {
  ad: string;
  yol: string;
}

export interface EkranSonucu {
  hatalar: string[];
  goruntu: Buffer | null;
}

// Tarayıcıya dokunan kısım; test sahtesini verir.
export interface KesifSurucusu {
  ac(rol: string): Promise<KesifOturumu>;
}

export interface KesifOturumu {
  ekranlar(): Promise<KesifEkrani[]>;
  git(ekran: KesifEkrani): Promise<EkranSonucu>;
  kapat(): Promise<void>;
}

type Kayit = Pick<KosuKaydi, 'adim' | 'ek' | 'klasor'>;

const YASAK_YOL = /cikis|giris/i;

// Menüden gelen bağlantılar süzülür: yalnız aynı kökenli göreli yol, çıkış ve giriş dışında, yol başına bir kez.
export function ekranlariSuz(baglantilar: readonly { ad: string | null; yol: string | null }[]): KesifEkrani[] {
  const gorulen = new Set<string>();
  const liste: KesifEkrani[] = [];
  for (const b of baglantilar) {
    const yol = b.yol?.trim() ?? '';
    const ad = b.ad?.replace(/\s+/g, ' ').trim() ?? '';
    if (!yol.startsWith('/') || yol.startsWith('//') || YASAK_YOL.test(yol) || ad === '' || gorulen.has(yol)) continue;
    gorulen.add(yol);
    liste.push({ ad, yol });
  }
  return liste;
}

export function kesifIstemi(rol: string, gun: number, ekranlar: readonly KesifEkrani[], sonAdimlar: readonly AdimSatiri[]): string {
  return [
    'Bir CNC atölyesi üretim sisteminin test robotunda keşif turu seçiyorsun. Veri tamamen sentetiktir.',
    `Rol ${rol}, gün ${String(gun)}. Robot aşağıdaki listeden seçtiğin ekranları sırayla açacak; yalnız açar, veri yazmaz.`,
    `En çok ${String(KESIF_ADIM_SINIRI)} ekran seç. Senaryonun hiç dokunmadığı, son adımlarda düşen işle ilgili ve bu rolün gündelik işine yakın ekranları öne al.`,
    'Cevabın son satırı yalnız şu biçimde olsun: SIRA: 3, 1, 7 (listedeki numaralar). Listede olmayan numara yazma.',
    '',
    'Ekranlar:',
    ...ekranlar.map((e, i) => `${String(i + 1)}. ${e.ad} (${e.yol})`),
    '',
    `Bu rolün son adımları (${String(sonAdimlar.length)}):`,
    ...(sonAdimlar.length === 0 ? ['- yok'] : sonAdimlar.map((a) =>
      `- gün ${String(a.gun)} | ${a.senaryo} / ${a.adim} | ${a.sonuc} | ${a.yontem ?? ''} ${a.yol ?? ''} | ${a.ileti ?? ''}`.slice(0, 300))),
  ].join('\n');
}

// Son "SIRA:" satırı okunur; geçersiz ve yinelenen numara atılır. Hiç geçerli numara yoksa null: robot tohumla seçer.
export function siraOku(metin: string, ekranlar: readonly KesifEkrani[]): KesifEkrani[] | null {
  const satir = [...metin.matchAll(/SIRA:\s*([0-9,\s]+)/gi)].at(-1)?.[1];
  if (satir === undefined) return null;
  const secilen: KesifEkrani[] = [];
  for (const parca of satir.split(',')) {
    const e = ekranlar[Number(parca.trim()) - 1];
    if (parca.trim() === '' || e === undefined || secilen.includes(e)) continue;
    secilen.push(e);
    if (secilen.length === KESIF_ADIM_SINIRI) break;
  }
  return secilen.length === 0 ? null : secilen;
}

export function tohumlaSec(tohum: number, gun: number, rol: string, ekranlar: readonly KesifEkrani[]): KesifEkrani[] {
  const r = rastgeleUret(altTohum(tohum, gun, `${KESIF_SENARYOSU}#${rol}`));
  const kalan = [...ekranlar];
  const secilen: KesifEkrani[] = [];
  while (kalan.length > 0 && secilen.length < KESIF_ADIM_SINIRI) secilen.push(...kalan.splice(r.aralik(0, kalan.length - 1), 1));
  return secilen;
}

function sonAdimlariOku(klasor: string, rol: string): AdimSatiri[] {
  let metin = '';
  try { metin = readFileSync(join(klasor, DOSYA.adimlar), 'utf8'); } catch { return []; }
  return metin.split('\n').filter((s) => s !== '').map(adimSatiriOku)
    .filter((a): a is AdimSatiri => typeof a !== 'string' && a.rol === rol).slice(-KESIF_SON_ADIM_SINIRI);
}

export interface KesifAcilisi {
  kayit: Kayit;
  model: ModelKoprusu;
  surucu: KesifSurucusu;
  roller: readonly string[];
  tohum: number;
  saat?: () => number;
  gunluk?: (ileti: string) => void;
}

export interface Kesif {
  tur(gun: number): Promise<void>;
}

// Rol başına günde bir tur, bir model çağrısı. Sıra güne göre döner: üst sınır dolduğunda hep aynı rol aç kalmaz.
export function kesifKur(a: KesifAcilisi): Kesif {
  const saat = a.saat ?? Date.now;
  const gunluk = a.gunluk ?? ((i: string) => { console.log(i); });
  let sinirDoldu = false;
  return {
    async tur(gun) {
      if (a.model.kip === 'kapali' || a.roller.length === 0) return;
      const bas = (gun - 1) % a.roller.length;
      const sira = [...a.roller.slice(bas), ...a.roller.slice(0, bas)];
      for (const rol of sira) {
        if (sinirDoldu) return;
        let oturum: KesifOturumu | null = null;
        try {
          oturum = await a.surucu.ac(rol);
          const ekranlar = await oturum.ekranlar();
          if (ekranlar.length === 0) {
            a.kayit.adim({
              gun, rol, senaryo: KESIF_SENARYOSU, adim: 'menüyü oku', tur: 'model', sonuc: 'dustu', sureMs: 0,
              yontem: null, yol: null, beklenen: 'en az bir ekran bağlantısı', gelen: '0', ileti: 'rolün menüsünde ekran bağlantısı yok', ek: [],
            });
            continue;
          }
          const cevap = await a.model.sor(kesifIstemi(rol, gun, ekranlar, sonAdimlariOku(a.kayit.klasor, rol)));
          if ('hata' in cevap && /üst sınırı/.test(cevap.hata)) {
            sinirDoldu = true;
            gunluk(`Keşif durdu: ${cevap.hata}`);
            return;
          }
          const modelSecimi = 'metin' in cevap ? siraOku(cevap.metin, ekranlar) : null;
          const secim = modelSecimi ?? tohumlaSec(a.tohum, gun, rol, ekranlar);
          const kaynak = modelSecimi !== null ? 'model' : `tohum (${'hata' in cevap ? cevap.hata : 'model sırası okunamadı'})`;
          const tekrar = `keşif tekrarı: TMIV2_ROBOT_TOHUM=${String(a.tohum)}, gün ${String(gun)}, rol ${rol}, seçen ${kaynak}, sıra ${secim.map((e) => e.yol).join(' > ')}`;
          for (const [i, e] of secim.entries()) {
            const t0 = saat();
            const s = await oturum.git(e);
            const ek = s.goruntu === null ? [] : [a.kayit.ek(`kesif-g${String(gun)}-${rol}-${String(i + 1)}.png`, s.goruntu)];
            a.kayit.adim({
              gun, rol, senaryo: KESIF_SENARYOSU, adim: `${String(i + 1)}. ${e.ad}`, tur: 'model', sonuc: s.hatalar.length === 0 ? 'gecti' : 'dustu',
              sureMs: Math.max(0, Math.round(saat() - t0)), yontem: 'GET', yol: e.yol, beklenen: 'hatasız açılır', gelen: s.hatalar.length === 0 ? 'hatasız' : `${String(s.hatalar.length)} hata`,
              ileti: s.hatalar.length === 0 ? tekrar : `${s.hatalar.slice(0, 8).join('; ').slice(0, 600)} | ${tekrar}`, ek,
            });
          }
        } catch (hata) {
          // Tur robotun kendi hatasıyla da kesilse koşu sürer; satır nedenini taşır.
          a.kayit.adim({
            gun, rol, senaryo: KESIF_SENARYOSU, adim: 'tur', tur: 'model', sonuc: 'dustu', sureMs: 0, yontem: null, yol: null,
            beklenen: null, gelen: null, ileti: (hata instanceof Error ? hata.message : String(hata)).slice(0, 600), ek: [],
          });
        } finally {
          await oturum?.kapat().catch(() => { /* kapanmayan bağlam koşuyu durdurmaz */ });
        }
      }
    },
  };
}

// Model kapalıyken keşif yoktur. Koşu sonu yorumuna bir çağrı ayrılır: keşif ve yorum birlikte üst sınırı aşmaz.
export function kesifModeli(ayar: RobotAyari['model'], kayit: Pick<KosuKaydi, 'modelCagrisi'>, b: Omit<KopruBagimliliklari, 'cagriSayildi'> = {}): ModelKoprusu {
  return modelKoprusuKur({ ...ayar, ustSinir: Math.max(0, ayar.ustSinir - 1) }, { ...b, cagriSayildi: () => { kayit.modelCagrisi(); } });
}

const BEKLEME_MS = 15_000;

// Ekran testlerinin oturum dosyaları kullanılır; karşılama ve tanıtım ekranı örtmesin diye ekran testleriyle (ortak.ts) aynı işaretler konur.
export function playwrightSurucusu(tarayici: Browser, baseURL: string): KesifSurucusu {
  return {
    async ac(rol) {
      const dosya = oturumDosyasi(rol);
      const { kisiId } = JSON.parse(readFileSync(dosya, 'utf8')) as { kisiId: number };
      const baglam = await tarayici.newContext({
        baseURL, storageState: dosya, viewport: { width: 1280, height: 800 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
      });
      await baglam.addInitScript((id: number) => {
        try {
          localStorage.setItem('tmi-performans', 'acik');
          localStorage.setItem(`tmi:tanitim:${String(id)}`, '1');
          sessionStorage.setItem('tmi.karsilama', String(id));
        } catch { /* depo kapalıysa örten pencere hata olarak görünür */ }
      }, kisiId);
      const sayfa = await baglam.newPage();
      const hatalar: string[] = [];
      sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push(`konsol: ${m.text().slice(0, 200)}`); });
      sayfa.on('pageerror', (h) => { hatalar.push(`sayfa: ${h.message.slice(0, 200)}`); });
      sayfa.on('response', (c) => {
        const yol = new URL(c.url()).pathname;
        if (yol.startsWith('/api/') && c.status() >= 400) hatalar.push(`${String(c.status())} ${c.request().method()} ${yol}`);
      });
      const yukle = async (yol: string): Promise<string[]> => {
        hatalar.length = 0;
        await sayfa.goto(yol, { waitUntil: 'domcontentloaded' });
        await sayfa.waitForLoadState('networkidle', { timeout: BEKLEME_MS }).catch(() => { /* uzun yoklama yapan ekran networkidle'a varmaz */ });
        const menu = await sayfa.getByRole('navigation', { name: 'Ana menü' }).count();
        return menu === 0 ? [...hatalar, `kabuk açılmadı (${new URL(sayfa.url()).pathname})`] : [...hatalar];
      };
      return {
        async ekranlar() {
          await yukle('/');
          // Ana menü ve açık ikinci menü bağlantıları; ekranlar arası gezinme bunlarla yapılır.
          return ekranlariSuz(await sayfa.locator('nav a[href]').evaluateAll((l) => l.map((a) => ({
            ad: a.getAttribute('aria-label') ?? a.textContent, yol: a.getAttribute('href'),
          }))));
        },
        async git(e) {
          let bulunan: string[];
          try {
            bulunan = await yukle(e.yol);
          } catch (h) {
            bulunan = [`açılamadı: ${h instanceof Error ? h.message.slice(0, 200) : String(h)}`];
          }
          const goruntu = await sayfa.screenshot({ type: 'png' }).catch(() => null);
          return { hatalar: bulunan, goruntu };
        },
        async kapat() {
          await baglam.close();
        },
      };
    },
  };
}
