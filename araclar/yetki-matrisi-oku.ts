import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku } from '#cekirdek/ayar.ts';
import { gocBaglantisiAc } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';

// Kullanım: npm run yetki-matrisi [-- --islem <işlem> | --kisi <kullanıcı adı> | --rol <rol kodu>]
// Bugünkü yetki matrisini çalışan veritabanından tek yerde gösterir: rol x işlem, kişinin rolleri ve kendisine verilen ek
// işlemler (kart #1233), bir işlemin kimde olduğu. Belge (`kurulum/yetki-matrisi.md`) yalnız rolleri taşır; kişiye verilen ek
// işlem yalnız veritabanındadır. Yalnız okur; bilgi makineden çıkmaz.

export interface RolYetkisi {
  kod: string;
  ad: string;
  yonetici: boolean;
  islemler: string[];
}

export interface KisiYetkisi {
  kullaniciAdi: string;
  ad: string;
  roller: string[];
  ekIslemler: string[];
}

export interface YetkiMatrisi {
  roller: RolYetkisi[];
  kisiler: KisiYetkisi[];
}

export type Secim = { tur: 'hepsi' } | { tur: 'islem'; deger: string } | { tur: 'kisi'; deger: string } | { tur: 'rol'; deger: string };

const KULLANIM = 'Kullanım: npm run yetki-matrisi [-- --islem <işlem> | --kisi <kullanıcı adı> | --rol <rol kodu>]';

// Kapsam oturumla aynıdır (kisiler/sorgular.ts yetkiKaydiBul): pasif ya da girişsiz kişi kullanıcı değildir.
export async function yetkiMatrisiOku(db: Db): Promise<YetkiMatrisi> {
  const roller = await db.sorgu<RolYetkisi>(
    `SELECT r.kod, r.ad, r.yonetici,
            COALESCE(array_agg(ri.islem ORDER BY ri.islem) FILTER (WHERE ri.islem IS NOT NULL), '{}') AS islemler
       FROM rol r LEFT JOIN rol_islemi ri ON ri.rol_id = r.id
      GROUP BY r.id ORDER BY r.yonetici DESC, r.kod`,
  );
  const kisiler = await db.sorgu<KisiYetkisi>(
    `SELECT k.kullanici_adi AS "kullaniciAdi", k.ad,
            COALESCE((SELECT array_agg(r.kod ORDER BY r.kod) FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = k.id), '{}') AS roller,
            COALESCE((SELECT array_agg(ki.islem ORDER BY ki.islem) FROM kisi_islemi ki WHERE ki.kisi_id = k.id), '{}') AS "ekIslemler"
       FROM kisi k
      WHERE k.aktif AND k.kullanici_adi IS NOT NULL
      ORDER BY k.kullanici_adi`,
  );
  return { roller, kisiler };
}

// Bayraklı yönetici rolü satır taşımaz, kayıtlı her işlemi alır.
const rolIslemleri = (rol: RolYetkisi): readonly string[] => (rol.yonetici ? ISLEMLER : rol.islemler);

export function kisininIslemleri(matris: YetkiMatrisi, kisi: KisiYetkisi): string[] {
  const roller = matris.roller.filter((r) => kisi.roller.includes(r.kod));
  return [...new Set([...roller.flatMap(rolIslemleri), ...kisi.ekIslemler])].sort();
}

export function secimOku(argumanlar: readonly string[]): Secim | null {
  if (argumanlar.length === 0) return { tur: 'hepsi' };
  const [bayrak, deger, ...fazla] = argumanlar;
  if (deger === undefined || deger === '' || fazla.length > 0) return null;
  if (bayrak === '--islem') return { tur: 'islem', deger };
  if (bayrak === '--kisi') return { tur: 'kisi', deger };
  if (bayrak === '--rol') return { tur: 'rol', deger };
  return null;
}

const liste = (ogeler: readonly string[]): string => (ogeler.length === 0 ? '-' : ogeler.join(' '));
const ayir = (islemler: readonly string[]): { sayfalar: string[]; islemler: string[] } => ({
  sayfalar: islemler.filter((i) => i.startsWith('sayfa.')),
  islemler: islemler.filter((i) => !i.startsWith('sayfa.')),
});

function rolMetni(rol: RolYetkisi): string {
  if (rol.yonetici) return `${rol.kod} (${rol.ad}): bütün sayfa ve işlemler (bayraklı rol)`;
  const { sayfalar, islemler } = ayir(rol.islemler);
  return `${rol.kod} (${rol.ad})\n  sayfalar: ${liste(sayfalar)}\n  işlemler: ${liste(islemler)}`;
}

function kisiMetni(matris: YetkiMatrisi, kisi: KisiYetkisi): string {
  const { sayfalar, islemler } = ayir(kisininIslemleri(matris, kisi));
  return [
    `${kisi.kullaniciAdi} (${kisi.ad})`,
    `  roller: ${liste(kisi.roller)}`,
    `  ek işlemler: ${liste(kisi.ekIslemler)}`,
    `  sayfalar: ${liste(sayfalar)}`,
    `  işlemler: ${liste(islemler)}`,
  ].join('\n');
}

function islemMetni(matris: YetkiMatrisi, islem: string): string {
  if (!(ISLEMLER as readonly string[]).includes(islem)) return `"${islem}" kayıtlı bir işlem değil (paylasilan/islemler.ts).`;
  const roller = matris.roller.filter((r) => rolIslemleri(r).includes(islem)).map((r) => r.kod);
  const kisiler = matris.kisiler.flatMap((k) => {
    const rolden = matris.roller.filter((r) => k.roller.includes(r.kod) && rolIslemleri(r).includes(islem)).map((r) => r.kod);
    if (rolden.length > 0) return [`  ${k.kullaniciAdi} (${k.ad}): rolden ${rolden.join(' ')}`];
    return k.ekIslemler.includes(islem) ? [`  ${k.kullaniciAdi} (${k.ad}): ek işlem`] : [];
  });
  return [`${islem}`, `roller: ${liste(roller)}`, `kişiler (${String(kisiler.length)}):`, ...(kisiler.length === 0 ? ['  -'] : kisiler)].join('\n');
}

export function matrisMetni(matris: YetkiMatrisi, secim: Secim): string {
  if (secim.tur === 'islem') return islemMetni(matris, secim.deger);
  if (secim.tur === 'rol') {
    const rol = matris.roller.find((r) => r.kod === secim.deger);
    return rol === undefined ? `"${secim.deger}" rolü yok. Roller: ${matris.roller.map((r) => r.kod).join(' ')}` : rolMetni(rol);
  }
  if (secim.tur === 'kisi') {
    const kisi = matris.kisiler.find((k) => k.kullaniciAdi === secim.deger);
    return kisi === undefined ? `"${secim.deger}" adlı etkin kullanıcı yok.` : kisiMetni(matris, kisi);
  }
  const verilen = new Set(matris.roller.filter((r) => !r.yonetici).flatMap((r) => r.islemler));
  const yalnizYonetici = ISLEMLER.filter((i) => !verilen.has(i));
  const ekli = matris.kisiler.filter((k) => k.ekIslemler.length > 0);
  return [
    '# Rol x işlem',
    ...matris.roller.map(rolMetni),
    '',
    `# Yalnız yöneticide: ${liste(yalnizYonetici)}`,
    '',
    `# Kişiler (${String(matris.kisiler.length)} etkin kullanıcı)`,
    ...matris.kisiler.map((k) => `${k.kullaniciAdi} (${k.ad}): ${liste(k.roller)}${k.ekIslemler.length > 0 ? ` + ek: ${k.ekIslemler.join(' ')}` : ''}`),
    '',
    `# Rolünün üstüne ek işlem verilmiş kişi: ${String(ekli.length)}`,
  ].join('\n');
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (dogrudanKosuyor) {
  const secim = secimOku(process.argv.slice(2));
  if (secim === null) {
    console.error(KULLANIM);
    process.exitCode = 1;
  } else {
    const vt = gocBaglantisiAc({ ...ayarOku(), goc: gocKimligiOku() });
    try {
      console.log(matrisMetni(await yetkiMatrisiOku(vt), secim));
    } catch (hata) {
      console.error(`Okunamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
      process.exitCode = 1;
    } finally {
      await vt.kapat();
    }
  }
}
