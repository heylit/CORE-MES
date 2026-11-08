import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ayarOku } from '#cekirdek/ayar.ts';
import { isBekliyor, type IsBekliyor } from '#cekirdek/zamanlayici.ts';
import {
  TABAN_ADI, TABAN_DOGRULANDI_DOSYASI, TABAN_YARIM_EKI, arsivDiskiUyarisi, budamaPlani, silinecekWallar, tabanAdi, tabanBaslangicDosyasi, tabanGerekliMi, tabanUyarisi, tabanZamani,
  type TabanKaydi,
} from './kurallar.ts';
import type { PgSurumu } from '#paylasilan/sozlesme/ayarlar.ts';
import { baglanarakOku, pgSurumunuDenetle, yedekOrtamiOku } from './yedek.ts';

// Haftalık taban yedek (2284-1 c, kart 2284a; ADR 0005 eki, ADR 0010). pg_basebackup kümenin fiziksel kopyasını alır ve REPLICATION
// ister; uygulama rolü bunu almaz. Bağlantı yalnız bu işe ayrılmış tmiv2_yedek rolüyle kurulur: parolası ayrı TMIV2_ değişkenindedir,
// havuza girmez, yalnız alt sürecin ortamından verilir. Ayarlar boşsa iş bekler (varsayılan kapalı); canlıda hata verir.
export interface TabanOrtami {
  dizin: string;
  wal: string;
  pg: { host: string; port: number; kullanici: string; parola: string };
  basebackup: string;
  verifybackup: string;
  // Windows'ta PostgreSQL bin klasörü bulunamadı (PATH'e düşülmez, 2305-1 b); taban alınmaz.
  aracHatasi?: string;
}

const KAPALI = 'Taban yedek kapalı: TMIV2_TABAN_DIZINI, TMIV2_WAL_ARSIV_DIZINI, TMIV2_PG_YEDEK_USER ya da TMIV2_PG_YEDEK_PASSWORD boş.';
// Canlıda taban yedek ve WAL arşivi şarttır (2294-1 b, K3): ayar boşsa iş beklemez, hata verir; uyarı sağlıkta görünür.
const CANLIDA_KAPALI = `Canlı ortamda taban yedek kurulmamış; gün içi kayıp 24 saate çıkar (kurulum/yedek.md A6-A7). ${KAPALI}`;

export function tabanOrtamiOku(env: NodeJS.ProcessEnv = process.env): TabanOrtami | null {
  const dizin = env['TMIV2_TABAN_DIZINI']?.trim() ?? '';
  const wal = env['TMIV2_WAL_ARSIV_DIZINI']?.trim() ?? '';
  const kullanici = env['TMIV2_PG_YEDEK_USER']?.trim() ?? '';
  const parola = env['TMIV2_PG_YEDEK_PASSWORD'] ?? '';
  if (dizin === '' || wal === '' || kullanici === '' || parola === '') return null;
  const { host, port } = ayarOku(env).pg;
  // pg_basebackup ve pg_verifybackup pg_dump'ın bulunduğu PostgreSQL kurulumundan alınır (TMIV2_PG_DUMP ya da Program Files araması).
  const yedek = yedekOrtamiOku(env);
  const pgDump = yedek.pgDump.dosya;
  const bin = /[\\/]/.test(pgDump) ? path.dirname(pgDump) : null;
  const ek = /\.exe$/i.test(pgDump) ? '.exe' : '';
  const arac = (ad: string): string => (bin === null ? ad : path.join(bin, `${ad}${ek}`));
  return {
    dizin, wal, pg: { host, port, kullanici, parola }, basebackup: arac('pg_basebackup'), verifybackup: arac('pg_verifybackup'),
    ...(yedek.pgDump.hata === undefined ? {} : { aracHatasi: yedek.pgDump.hata }),
  };
}

export type AltSurec = (dosya: string, argumanlar: string[], parola: string | null) => Promise<void>;

const EN_UZUN_MS = 6 * 60 * 60 * 1000;
const HATA_METNI_EN_UZUN = 300;

// Alt sürece sunucunun TMIV2_ değişkenleri (parolalar, anahtarlar) geçmez; parola yalnız PGPASSWORD ile.
const altSurec: AltSurec = (dosya, argumanlar, parola) => new Promise((coz, reddet) => {
  const ortam = Object.fromEntries(Object.entries(process.env).filter(([ad]) => !ad.toUpperCase().startsWith('TMIV2_')));
  const surec = spawn(dosya, argumanlar, {
    env: parola === null ? ortam : { ...ortam, PGPASSWORD: parola }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
  });
  let hataMetni = '';
  surec.stderr.setEncoding('utf8');
  surec.stderr.on('data', (parca: string) => { if (hataMetni.length < HATA_METNI_EN_UZUN) hataMetni += parca; });
  const sure = setTimeout(() => { surec.kill(); }, EN_UZUN_MS);
  const ad = path.basename(dosya);
  surec.on('error', (hata: NodeJS.ErrnoException) => {
    clearTimeout(sure);
    reddet(new Error(hata.code === 'ENOENT' ? `${ad} bulunamadı (${dosya}); PostgreSQL bin klasörünü TMIV2_PG_DUMP ile verin.` : `${ad} başlatılamadı: ${hata.message}`));
  });
  surec.on('close', (kod, sinyal) => {
    clearTimeout(sure);
    if (kod === 0) { coz(); return; }
    const ilk = hataMetni.trim().split(/\r?\n/)[0]?.slice(0, HATA_METNI_EN_UZUN) ?? '';
    reddet(new Error(sinyal !== null ? `${ad} durduruldu (${sinyal}).` : `${ad} hata verdi (çıkış ${String(kod)})${ilk === '' ? '' : `: ${ilk}`}`));
  });
});

export async function tabanlariOku(dizin: string): Promise<TabanKaydi[]> {
  const kayitlar: TabanKaydi[] = [];
  for (const g of await readdir(dizin, { withFileTypes: true })) {
    const zaman = g.isDirectory() ? tabanZamani(g.name) : null;
    if (zaman === null) continue;
    const yol = path.join(dizin, g.name);
    const etiket = await readFile(path.join(yol, 'backup_label'), 'utf8').catch(() => '');
    kayitlar.push({ ad: g.name, zaman, dogrulandi: existsSync(path.join(yol, TABAN_DOGRULANDI_DOSYASI)), baslangic: tabanBaslangicDosyasi(etiket) });
  }
  return kayitlar;
}

async function klasorMu(yol: string): Promise<boolean> {
  return path.isAbsolute(yol) && ((await stat(yol).catch(() => null))?.isDirectory() ?? false);
}

export interface TabanTuruSecenekleri {
  canli?: boolean;
  calistir?: AltSurec;
  bosYer?: (dizin: string) => Promise<{ bos: number; toplam: number } | null>;
  surumDenetle?: (ortam: TabanOrtami) => Promise<PgSurumu>;
}

// pg_basebackup da sunucuyla aynı ana sürümden olmalı (2306); sunucu sürümü uygulama kullanıcısıyla okunur, yedek rolü yalnız
// çoğaltma bağlantısı açabilir.
const tabanSurumDenetimi = (ortam: TabanOrtami): Promise<PgSurumu> => {
  const { host, port, kullanici, parola, veritabani } = ayarOku(process.env).pg;
  return pgSurumunuDenetle('pg_basebackup', ortam.basebackup, ortam.aracHatasi, baglanarakOku({ host, port, kullanici, parola, veritabani }));
};

const diskOku = async (dizin: string): Promise<{ bos: number; toplam: number } | null> => {
  const s = await statfs(dizin).catch(() => null);
  return s === null ? null : { bos: s.bavail * s.bsize, toplam: s.blocks * s.bsize };
};

// Tur: gerekiyorsa taban alır ve doğrular, sonra budar, en sonda uyarıları denetler. Uyarı varsa tur hata verir: iş durumu sağlık
// ayrıntısında uyarı olur, hata günlüğü Windows olay günlüğüne (olay 100) düşer.
export async function tabanTuru(ortam: TabanOrtami | null, simdi: Date, s: TabanTuruSecenekleri = {}): Promise<void | IsBekliyor> {
  if (ortam === null) {
    if (s.canli === true) throw new Error(CANLIDA_KAPALI);
    return isBekliyor(KAPALI);
  }
  if (!(await klasorMu(ortam.dizin))) throw new Error(`Taban yedek klasörü yok ya da mutlak yol değil: ${ortam.dizin}`);
  if (!(await klasorMu(ortam.wal))) throw new Error(`WAL arşivi klasörü yok ya da mutlak yol değil: ${ortam.wal}`);
  const calistir = s.calistir ?? altSurec;
  // Yarıda kalmış taban (sunucu kapandı) tamamlanamaz; iş tek kopya koştuğu için (iş kilidi) bulunan her yarım eskidir.
  for (const ad of await readdir(ortam.dizin)) {
    if (ad.endsWith(TABAN_YARIM_EKI) && TABAN_ADI.test(ad.slice(0, -TABAN_YARIM_EKI.length))) await rm(path.join(ortam.dizin, ad), { recursive: true, force: true });
  }
  let tabanlar = await tabanlariOku(ortam.dizin);
  let alimHatasi: string | null = null;
  if (tabanGerekliMi(tabanlar, simdi)) {
    const ad = tabanAdi(simdi);
    const yarim = path.join(ortam.dizin, ad + TABAN_YARIM_EKI);
    try {
      const surum = await (s.surumDenetle ?? tabanSurumDenetimi)(ortam);
      if (!surum.uyumlu) throw new Error(surum.ileti ?? 'PostgreSQL sürümü denetlenemedi.');
      await calistir(ortam.basebackup, [
        '-D', yarim, '-Fp', '-Xs', '--checkpoint=fast', '--no-password', '-h', ortam.pg.host, '-p', String(ortam.pg.port), '-U', ortam.pg.kullanici,
      ], ortam.pg.parola);
      await calistir(ortam.verifybackup, [yarim], null);
      await writeFile(path.join(yarim, TABAN_DOGRULANDI_DOSYASI), `${simdi.toISOString()}\n`);
      await rename(yarim, path.join(ortam.dizin, ad));
    } catch (hata) {
      await rm(yarim, { recursive: true, force: true });
      alimHatasi = `Taban yedek alınamadı: ${hata instanceof Error ? hata.message : String(hata)}`;
    }
    tabanlar = await tabanlariOku(ortam.dizin);
  }
  const plan = budamaPlani(tabanlar);
  for (const ad of plan.silinecekTabanlar) await rm(path.join(ortam.dizin, ad), { recursive: true, force: true });
  if (plan.walSiniri !== null) {
    for (const ad of silinecekWallar(await readdir(ortam.wal), plan.walSiniri)) await rm(path.join(ortam.wal, ad), { force: true });
  }
  const disk = await (s.bosYer ?? diskOku)(ortam.wal);
  const uyarilar = [alimHatasi, tabanUyarisi(tabanlar, simdi), disk === null ? null : arsivDiskiUyarisi(disk.bos, disk.toplam)]
    .filter((u): u is string => u !== null);
  if (uyarilar.length > 0) throw new Error(uyarilar.join(' '));
}
