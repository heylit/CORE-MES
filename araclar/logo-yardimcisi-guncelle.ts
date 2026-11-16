import { spawn } from 'node:child_process';
import { cp, rename, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { isAbsolute, join, sep } from 'node:path';
import { pakettekiOzet } from '../sunucu/moduller/logo/disari.ts';

// 3314 (Dilim 2 a): güncelleyici paketi uyguladıktan sonra Logo yardımcısını da yeniler. Aynı anda iki yardımcı olmaz (tek Logo
// oturumu, tek lisans): eskisi kendi ucundan kapanır, kapı boşalmadan yenisi açılmaz. Yardımcıyı açan, canlıdaki başlatma betiğidir;
// betik exe yolunu gösterge dosyasından okur (kurulum/logo-yardimcisi.md), yeniden açılışta da yeni exe gelir.
export const GOSTERGE_DOSYASI = 'logo-yardimcisi-guncel.txt';
export const KAPANMA_SURESI_MS = 30_000;
export const ACILMA_SURESI_MS = 60_000;

export interface YardimciGuncellemeAyari {
  kurulum: string;
  baslat: string;
  adres: string;
  anahtar: string;
}

type Ortamlar = Readonly<Record<string, string | undefined>>;

// Kurulum klasörü verilmemişse kapalıdır (null): güncelleyici yardımcıya dokunmaz, sürüm uyarısı (Dilim 1) kalır.
export function yardimciGuncellemeAyariOku(env: Ortamlar): YardimciGuncellemeAyari | { hata: string } | null {
  const kurulum = env['TMIV2_LOGO_YARDIMCI_KURULUM']?.trim() ?? '';
  if (kurulum === '') return null;
  const baslat = env['TMIV2_LOGO_YARDIMCI_BASLAT']?.trim() ?? '';
  const adres = env['TMIV2_LOGO_KOPRU_ADRESI']?.trim().replace(/\/+$/, '') ?? '';
  const anahtar = env['TMIV2_LOGO_KOPRU_ANAHTARI']?.trim() ?? '';
  if (!isAbsolute(kurulum)) return { hata: 'TMIV2_LOGO_YARDIMCI_KURULUM mutlak yol olmalı.' };
  if (baslat === '' || !isAbsolute(baslat)) return { hata: 'TMIV2_LOGO_YARDIMCI_BASLAT (yardımcıyı başlatan betiğin mutlak yolu) eksik.' };
  if (adres === '' || anahtar === '') return { hata: 'TMIV2_LOGO_KOPRU_ADRESI ve TMIV2_LOGO_KOPRU_ANAHTARI olmadan yardımcı kapatılamaz.' };
  return { kurulum, baslat, adres, anahtar };
}

// Klasör adı sürümden ve özetten: aynı sürüm adı farklı kaynakla yeniden uygulanırsa çalışan klasörün üstüne yazılmaz.
export function yardimciKlasorAdi(surum: string, ozet: string): string {
  return `logo-yardimcisi-${surum.replace(/[^0-9A-Za-z.-]/g, '-')}-${ozet.slice(0, 8)}`;
}

export type YardimciSurumOkumasi = { tur: 'ozet'; ozet: string | null } | { tur: 'ulasilamadi' };

export interface YardimciGuncellemeAdimlari {
  surumOku(): Promise<YardimciSurumOkumasi>;
  hazirla(): Promise<string>;
  gostergeYaz(exe: string): Promise<void>;
  kapat(): Promise<void>;
  kapiBosMu(): Promise<boolean>;
  baslat(): void;
  bekle(ms: number): Promise<void>;
}

export interface YardimciGuncellemeSonucu { sonuc: 'guncel' | 'guncellendi' | 'atlandi' | 'hata'; ileti: string }

async function kosulaKadar(kosul: () => Promise<boolean>, sureMs: number, bekle: (ms: number) => Promise<void>): Promise<boolean> {
  for (let gecen = 0; ; gecen += 1000) {
    if (await kosul()) return true;
    if (gecen >= sureMs) return false;
    await bekle(1000);
  }
}

// Sıra: derle ve test et (geçmezse eskisi çalışır), gösterge dosyası, eskisini kapat, kapı boşalınca yenisini aç, özeti doğrula.
export async function yardimciyiGuncelle(
  paketteki: string | null, a: YardimciGuncellemeAdimlari, sure = { kapanma: KAPANMA_SURESI_MS, acilma: ACILMA_SURESI_MS },
): Promise<YardimciGuncellemeSonucu> {
  if (paketteki === null) return { sonuc: 'atlandi', ileti: 'Paket Logo yardımcısının kaynağını taşımıyor.' };
  const once = await a.surumOku();
  if (once.tur === 'ozet' && once.ozet === paketteki) return { sonuc: 'guncel', ileti: 'Logo yardımcısı zaten bu paketin kaynağından.' };
  let exe: string;
  try {
    exe = await a.hazirla();
  } catch (hata) {
    return { sonuc: 'hata', ileti: `Logo yardımcısı derlenemedi ya da testi geçmedi; eski yardımcı çalışıyor: ${hata instanceof Error ? hata.message : String(hata)}` };
  }
  await a.gostergeYaz(exe);
  if (once.tur === 'ozet') {
    await a.kapat().catch(() => undefined);
    if (!(await kosulaKadar(() => a.kapiBosMu(), sure.kapanma, (ms) => a.bekle(ms)))) {
      return { sonuc: 'hata', ileti: `Eski Logo yardımcısı ${String(sure.kapanma / 1000)} sn'de kapanmadı; yenisi açılmadı (iki yardımcı olmaz). Yeni exe hazır, yardımcı yeniden başlayınca o açılır.` };
    }
  } else if (!(await a.kapiBosMu())) {
    return { sonuc: 'hata', ileti: 'Yardımcı kapısı dolu ama sürüm okunamadı; yenisi açılmadı. Yeni exe hazır, yardımcı yeniden başlayınca o açılır.' };
  }
  a.baslat();
  const dogru = await kosulaKadar(async () => {
    const s = await a.surumOku();
    return s.tur === 'ozet' && s.ozet === paketteki;
  }, sure.acilma, (ms) => a.bekle(ms));
  return dogru
    ? { sonuc: 'guncellendi', ileti: 'Logo yardımcısı yenilendi.' }
    : { sonuc: 'hata', ileti: `Yeni Logo yardımcısı ${String(sure.acilma / 1000)} sn'de bu paketin sürümünü bildirmedi; başlatma betiğini ve yardımcı günlüğünü kontrol edin.` };
}

function calistir(komut: string, argumanlar: readonly string[], cwd: string): Promise<void> {
  return new Promise((coz, red) => {
    const s = spawn(komut, argumanlar, { cwd, stdio: 'inherit', windowsHide: true });
    s.once('error', red);
    s.once('exit', (kod) => { if (kod === 0) coz(); else red(new Error(`${komut} ${argumanlar.join(' ')} çıkış kodu ${String(kod)}`)); });
  });
}

// Gerçek adımlar (Windows). Kaynak yeni sürüm klasöründeki araclar/logo-yardimcisi'dir; derleme kurulum klasöründe yapılır.
export function yardimciAdimlari(ayar: YardimciGuncellemeAyari, kaynak: string, klasorAdi: string): YardimciGuncellemeAdimlari {
  const url = new URL(ayar.adres);
  const kapi = { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || '80') };
  const basliklar = { 'X-Api-Key': ayar.anahtar };
  return {
    surumOku: async () => {
      const c = await fetch(`${ayar.adres}/api/version`, { headers: basliklar, signal: AbortSignal.timeout(5000) }).catch(() => null);
      if (c === null) return { tur: 'ulasilamadi' };
      const govde: unknown = c.ok ? await c.json().catch(() => null) : null;
      const ozet = govde !== null && typeof govde === 'object' && typeof (govde as Record<string, unknown>)['kaynakOzeti'] === 'string'
        ? (govde as Record<string, string>)['kaynakOzeti'] ?? null : null;
      return { tur: 'ozet', ozet };
    },
    hazirla: async () => {
      const hedef = join(ayar.kurulum, klasorAdi);
      const yarim = `${hedef}.yarim`;
      await rm(yarim, { recursive: true, force: true });
      const cikti = join(kaynak, 'cikti');
      await cp(kaynak, yarim, { recursive: true, filter: (y) => y !== cikti && !y.startsWith(`${cikti}${sep}`) });
      await calistir(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/c', 'derle.cmd', 'test'], yarim);
      await rm(hedef, { recursive: true, force: true });
      await rename(yarim, hedef);
      return join(hedef, 'cikti', 'logo-yardimcisi.exe');
    },
    gostergeYaz: async (exe) => {
      const yol = join(ayar.kurulum, GOSTERGE_DOSYASI);
      await writeFile(`${yol}.yeni`, `${exe}\r\n`, 'utf8');
      await rename(`${yol}.yeni`, yol);
    },
    kapat: async () => {
      await fetch(`${ayar.adres}/api/kapat`, { method: 'POST', headers: basliklar, signal: AbortSignal.timeout(5000) });
    },
    kapiBosMu: () => new Promise((coz) => {
      const s = connect(kapi);
      s.once('connect', () => { s.destroy(); coz(false); });
      s.once('error', () => { coz(true); });
    }),
    baslat: () => {
      // Ayrık ve kabuksuz değil: betik cmd ister. Güncelleyici kapansa da yardımcı yaşar (DOĞRULANMADI: Windows'ta denenmeli).
      const s = spawn(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/c', ayar.baslat], { detached: true, stdio: 'ignore', windowsHide: true });
      s.unref();
    },
    bekle: (ms) => new Promise((coz) => setTimeout(coz, ms)),
  };
}

// Güncelleyicinin çağırdığı tek giriş; hiçbir hata paket uygulamasını bozmaz, yalnız günlüğe yazılır.
export async function paketSonrasiYardimci(env: Ortamlar, surumKlasoru: string, surum: string): Promise<YardimciGuncellemeSonucu> {
  const ayar = yardimciGuncellemeAyariOku(env);
  if (ayar === null) return { sonuc: 'atlandi', ileti: 'TMIV2_LOGO_YARDIMCI_KURULUM tanımlı değil; Logo yardımcısı güncellenmedi.' };
  if ('hata' in ayar) return { sonuc: 'hata', ileti: ayar.hata };
  if (process.platform !== 'win32') return { sonuc: 'atlandi', ileti: 'Logo yardımcısı yalnız Windows\'ta derlenir.' };
  const kaynak = join(surumKlasoru, 'araclar', 'logo-yardimcisi');
  const ozet = await pakettekiOzet(`${kaynak}${sep}`);
  if (ozet === null) return { sonuc: 'atlandi', ileti: 'Paket Logo yardımcısının kaynağını taşımıyor.' };
  return yardimciyiGuncelle(ozet, yardimciAdimlari(ayar, kaynak, yardimciKlasorAdi(surum, ozet)));
}
