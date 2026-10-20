import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Ortam } from '#paylasilan/ortam.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { Db, Veritabani } from './db.ts';

const MODUL_KLASORU = join(import.meta.dirname, '..', 'moduller');
const MODUL_ADI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CANLI_RED = 'Örnek veri canlı ortama yüklenmez (TMIV2_ORTAM=canli)';

export interface OrnekVeriBaglami {
  // Örnek günün tarihi (tesis saatiyle) ve koşu anı: geçmiş ya da gelecek kayıtlar buna göre kurulur.
  readonly gun: string;
  readonly an: Date;
  // Örnek hesapların parolası koşuda üretilir; depoya ve koda girmez.
  parolaUret(): string;
  // Kullanıcıya bir kez gösterilecek satır (örnek hesap ve parolası). Transaction kalıcı olursa basılır.
  bildir(satir: string): void;
}

export interface OrnekVeriTanimi {
  // Klasör adıyla aynı olmalı: keşif bunu denetler.
  readonly modul: string;
  // Önce yüklenmesi gereken modüller (kayıtlarını disari.ts ile bulacağı).
  readonly gerekir: readonly string[];
  // Modülün örnek kaydı zaten varsa true: koşu hiçbir şey yazmadan durur.
  readonly yukluMu: (db: Db) => Promise<boolean>;
  // Yalnız ekler; var olan kayda dokunmaz. Başka modülün tablosuna yazmaz.
  readonly yukle: (db: Db, baglam: OrnekVeriBaglami) => Promise<void>;
}

// yuklendi: moduller yüklenenlerdir; yuklu alanı (yalnız boş değilse) önceden yüklü olduğu için atlananları sayar.
// yuklu: hiçbir şey yazılmadı, moduller hepsidir.
export type OrnekVeriSonucu =
  | { durum: 'yuklendi'; moduller: string[]; yuklu?: string[] }
  | { durum: 'yuklu'; moduller: string[] };

const tanimlar = new WeakSet<OrnekVeriTanimi>();

export function ornekVeriTanimi(tanim: OrnekVeriTanimi): OrnekVeriTanimi {
  if (!MODUL_ADI.test(tanim.modul)) throw new Error(`Örnek veri modül adı küçük harf, rakam ve tireden oluşur: "${tanim.modul}"`);
  if (!Array.isArray(tanim.gerekir) || tanim.gerekir.some((g) => typeof g !== 'string')) {
    throw new Error(`Örnek veri gerekir listesi metin dizisidir: ${tanim.modul}`);
  }
  if (tanim.gerekir.includes(tanim.modul)) throw new Error(`Örnek veri kendini gerektiremez: ${tanim.modul}`);
  if (typeof tanim.yukluMu !== 'function' || typeof tanim.yukle !== 'function') {
    throw new Error(`Örnek verinin yukluMu ve yukle işlevleri olmalı: ${tanim.modul}`);
  }
  const donmus = Object.freeze({
    modul: tanim.modul, gerekir: Object.freeze([...tanim.gerekir]), yukluMu: tanim.yukluMu, yukle: tanim.yukle,
  });
  tanimlar.add(donmus);
  return donmus;
}

// İş keşfiyle aynı kalıp: çekirdek modülü ithal etmez, klasörden bulur; toplayıcı dosya yoktur.
export async function modulOrnekVerileriniKesfet(klasor: string = MODUL_KLASORU): Promise<OrnekVeriTanimi[]> {
  if (!existsSync(klasor)) return [];
  const girdiler = await readdir(klasor, { withFileTypes: true });
  const adlar = girdiler.filter((g) => g.isDirectory()).map((g) => g.name).sort();
  const sonuc: OrnekVeriTanimi[] = [];
  for (const ad of adlar) {
    const dosya = join(klasor, ad, 'ornek-veri.ts');
    if (!existsSync(dosya)) continue;
    const modul = (await import(pathToFileURL(dosya).href)) as { ornekVeri?: unknown };
    const tanim = modul.ornekVeri as OrnekVeriTanimi | undefined;
    if (!tanim || !tanimlar.has(tanim)) {
      throw new Error(`Modül örnek veri vermiyor (export const ornekVeri = ornekVeriTanimi(...)): moduller/${ad}/ornek-veri.ts`);
    }
    if (tanim.modul !== ad) throw new Error(`Örnek veri modül adı klasörle aynı olmalı: moduller/${ad}/ornek-veri.ts "${tanim.modul}" diyor`);
    sonuc.push(tanim);
  }
  return sonuc;
}

// Gerekenler önce; aynı anda hazır olanlar ad sırasıyla (koşu her makinede aynı sırada).
export function ornekVeriSirala(liste: readonly OrnekVeriTanimi[]): OrnekVeriTanimi[] {
  const adla = new Map<string, OrnekVeriTanimi>();
  for (const t of liste) {
    if (!tanimlar.has(t)) throw new Error('Örnek veri ornekVeriTanimi ile tanımlanmalı');
    if (adla.has(t.modul)) throw new Error(`Örnek veri modülü yineleniyor: ${t.modul}`);
    adla.set(t.modul, t);
  }
  for (const t of liste) {
    const eksik = t.gerekir.filter((g) => !adla.has(g));
    if (eksik.length > 0) throw new Error(`Örnek veri ${t.modul}, örnek verisi olmayan modülü gerektiriyor: ${eksik.join(', ')}`);
  }
  const sirali: OrnekVeriTanimi[] = [];
  const yerlesen = new Set<string>();
  while (sirali.length < liste.length) {
    const hazir = [...adla.values()]
      .filter((t) => !yerlesen.has(t.modul) && t.gerekir.every((g) => yerlesen.has(g)))
      .sort((a, b) => a.modul.localeCompare(b.modul, 'en'));
    if (hazir.length === 0) {
      const kalan = [...adla.keys()].filter((ad) => !yerlesen.has(ad)).sort();
      throw new Error(`Örnek veri gerekir listesinde döngü: ${kalan.join(', ')}`);
    }
    sirali.push(hazir[0]!);
    yerlesen.add(hazir[0]!.modul);
  }
  return sirali;
}

export interface OrnekVeriSecenegi {
  ortam: Ortam;
  an?: Date;
  // Kalıcı olan koşunun satırları; geri alınan koşuda hiç çağrılmaz.
  bildir: (satir: string) => void;
  parolaUret?: () => string;
}

const varsayilanParola = (): string => randomBytes(12).toString('base64url');

// Hepsi tek transaction: bir modül hata verirse hiçbir modülün yazısı kalmaz. Önce bütün modüllere "yüklü mü"
// sorulur; yüklü olan atlanır, eksikler gerekir sırasıyla yüklenir (modüller dalga dalga eklendikçe koşu yalnız yeniyi yazar).
export async function ornekVeriYukle(
  vt: Veritabani, liste: readonly OrnekVeriTanimi[], secenek: OrnekVeriSecenegi,
): Promise<OrnekVeriSonucu> {
  if (secenek.ortam === 'canli') throw new Error(CANLI_RED);
  const sirali = ornekVeriSirala(liste);
  const an = secenek.an ?? new Date();
  const satirlar: string[] = [];
  const baglam: OrnekVeriBaglami = Object.freeze({
    gun: tesisGunu(an),
    an,
    parolaUret: secenek.parolaUret ?? varsayilanParola,
    bildir: (satir: string) => { satirlar.push(satir); },
  });
  const sonuc = await vt.tx(async (db): Promise<OrnekVeriSonucu> => {
    const yuklu = new Set<string>();
    for (const t of sirali) if (await t.yukluMu(db)) yuklu.add(t.modul);
    const eksik = sirali.filter((t) => !yuklu.has(t.modul));
    if (eksik.length === 0) return { durum: 'yuklu', moduller: sirali.map((t) => t.modul) };
    for (const t of eksik) await t.yukle(db, baglam);
    const moduller = eksik.map((t) => t.modul);
    return yuklu.size === 0 ? { durum: 'yuklendi', moduller } : { durum: 'yuklendi', moduller, yuklu: sirali.filter((t) => yuklu.has(t.modul)).map((t) => t.modul) };
  });
  for (const satir of satirlar) secenek.bildir(satir);
  return sonuc;
}
