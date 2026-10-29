import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { islemMi } from '#paylasilan/islemler.ts';
import {
  GENEL_ARAMA_EN_COK_SONUC, GENEL_ARAMA_HAM_EN_UZUN, KAYIT_TURLERI, KAYIT_TURU_SIRASI, aramaSorgusuGecerliMi, aramaSorgusunuAyir,
  aramaSade, basDeseni, eslesmePuani, icindeDeseni, kayitTuruMu, turBasinaSinir,
  type GenelAramaCevabi, type GenelAramaSonucu, type KayitAramaKaynagi, type KayitTuru,
} from '#paylasilan/kayit-aramasi.ts';
import { kayitYoluMu, type KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import type { Db, Veritabani } from './db.ts';
import { uc, type Uc } from './uc.ts';

export interface ModulKaynagi {
  modul: string;
  kaynak: KayitAramaKaynagi<Db>;
}

// Boş dizi: modülün bildirdiği kaynaklar geçerli. Hata metni modülü ve düzeltilecek alanı söyler.
export function kaynakHatalari(modul: string, deger: unknown): string[] {
  if (!Array.isArray(deger)) return [`${modul}: kayitAramaKaynaklari dizi değil`];
  const hatalar: string[] = [];
  for (const [sira, k] of (deger as unknown[]).entries()) {
    const yer = `${modul}: kaynak ${sira}`;
    if (k === null || typeof k !== 'object') { hatalar.push(`${yer} nesne değil`); continue; }
    const { tur, yetki, ara } = k as Record<string, unknown>;
    if (!kayitTuruMu(tur)) hatalar.push(`${yer} türü listede yok: ${String(tur)}`);
    else if (KAYIT_TURLERI[tur].modul !== modul) hatalar.push(`${yer} türü ${tur} ${KAYIT_TURLERI[tur].modul} modülünündür`);
    if (!Array.isArray(yetki) || yetki.length === 0) hatalar.push(`${yer} yetki listesi boş`);
    else for (const i of yetki as unknown[]) if (typeof i !== 'string' || !islemMi(i)) hatalar.push(`${yer} işlemi kayıtlı değil: ${String(i)}`);
    if (typeof ara !== 'function') hatalar.push(`${yer} ara işlevi yok`);
  }
  return hatalar;
}

// Kaynaklar kayıt satırı olmadan, modülün `disari.ts` dosyasındaki `kayitAramaKaynaklari` ihracından bulunur (uç keşfi gibi).
// Geçersiz ya da iki modülün aynı türü vermesi sunucuyu açmaz: yanlış modülün kaydı başka modülün verisini gösterirdi.
export async function kaynaklariKesfet(klasor: string, kapali: readonly string[] = []): Promise<ModulKaynagi[]> {
  if (!existsSync(klasor)) return [];
  const adlar = (await readdir(klasor, { withFileTypes: true })).filter((g) => g.isDirectory()).map((g) => g.name).sort();
  const sonuc: ModulKaynagi[] = [];
  const hatalar: string[] = [];
  for (const modul of adlar) {
    if (kapali.includes(modul)) continue;
    const dosya = join(klasor, modul, 'disari.ts');
    if (!existsSync(dosya)) continue;
    const ihrac = (await import(pathToFileURL(dosya).href)) as { kayitAramaKaynaklari?: unknown };
    if (ihrac.kayitAramaKaynaklari === undefined) continue;
    const modulHatalari = kaynakHatalari(modul, ihrac.kayitAramaKaynaklari);
    hatalar.push(...modulHatalari);
    if (modulHatalari.length === 0) {
      for (const kaynak of ihrac.kayitAramaKaynaklari as KayitAramaKaynagi<Db>[]) sonuc.push({ modul, kaynak });
    }
  }
  const turler = sonuc.map((k) => k.kaynak.tur);
  for (const tur of new Set(turler)) if (turler.filter((t) => t === tur).length > 1) hatalar.push(`${tur} türü iki kez verilmiş`);
  if (hatalar.length > 0) throw new Error(`Kayıt arama kaynağı geçersiz: ${hatalar.join('; ')}`);
  return sonuc;
}

// Kaynağın satırı sözleşmeye uymuyorsa (uygulama dışı adres, boş başlık) düşer; kaynak sınırdan fazlasını verse de kesilir.
function satirlariSuz(tur: KayitTuru, satirlar: readonly KayitAramaSonucu[], sinir: number): GenelAramaSonucu[] {
  const sonuc: GenelAramaSonucu[] = [];
  for (const s of satirlar) {
    if (typeof s.anahtar !== 'string' || s.anahtar === '' || typeof s.baslik !== 'string' || s.baslik.trim() === '') continue;
    if (!kayitYoluMu(s.yol)) continue;
    const aciklama = typeof s.aciklama === 'string' && s.aciklama.trim() !== '' ? s.aciklama : null;
    sonuc.push({ tur, anahtar: `${tur}#${s.anahtar}`, baslik: s.baslik, aciklama, yol: s.yol });
    if (sonuc.length >= sinir) break;
  }
  return sonuc;
}

// Türler en iyi başlık eşleşmesine göre dizilir (tam kod en üstte), eşitlikte sözleşmedeki sırayla; tür içi sıra kaynağındır.
export function sonuclariDiz(q: string, gruplar: ReadonlyMap<KayitTuru, readonly GenelAramaSonucu[]>): GenelAramaSonucu[] {
  const puan = (liste: readonly GenelAramaSonucu[]): number => Math.max(0, ...liste.map((s) => eslesmePuani(q, s.baslik)));
  const sirali = [...gruplar.entries()]
    .filter(([, liste]) => liste.length > 0)
    .sort(([ta, a], [tb, b]) => puan(b) - puan(a) || KAYIT_TURU_SIRASI.indexOf(ta) - KAYIT_TURU_SIRASI.indexOf(tb));
  return sirali.flatMap(([, liste]) => liste).slice(0, GENEL_ARAMA_EN_COK_SONUC);
}

// Bir istekte aynı anda bu kadar kaynak koşar: on altı kaynağın hepsi birden havuzdaki bağlantıları başka isteklerden almasın.
export const ESZAMANLI_KAYNAK = 4;

export const genelAramaSorguSemasi = z.object({ q: z.string().trim().min(1).max(GENEL_ARAMA_HAM_EN_UZUN) });

const turSemasi = z.custom<KayitTuru>(kayitTuruMu, 'kayıt türü değil');
export const genelAramaCevapSemasi: z.ZodType<GenelAramaCevabi> = z.object({
  sonuclar: z.array(z.object({
    tur: turSemasi,
    anahtar: z.string().min(1),
    baslik: z.string().min(1),
    aciklama: z.string().nullable(),
    yol: z.custom<`/${string}`>(kayitYoluMu, 'uygulama içi adres değil'),
  })).max(GENEL_ARAMA_EN_COK_SONUC),
  eksik: z.array(turSemasi),
});

export const GENEL_ARAMA_YOLU = '/arama';

// Üst çubuktaki genel aramanın tek ucu (kart 1233). Oturum yeter; kişi yalnız `yetki` listesinden birini taşıdığı kaynakların
// sonucunu alır, kaynak daha dar görmesi gerekeni kendisi daraltır. Her kaynak kendi salt okuma transaction'ında koşar: hata ya
// da süre aşımı yalnız o türü "eksik" bırakır, ötekiler gelir. Önek ("e:1234") tek türü seçer.
export function genelAramaUcu(vt: Veritabani, kaynaklar: readonly ModulKaynagi[]): Uc {
  return uc({
    yontem: 'GET',
    yol: GENEL_ARAMA_YOLU,
    yetki: 'oturum',
    txDisi: true,
    sorgu: genelAramaSorguSemasi,
    cevap: genelAramaCevapSemasi,
    isle: async ({ sorgu, kullanici, gunluk }) => {
      const { tur, q } = aramaSorgusunuAyir(sorgu.q);
      if (!aramaSorgusuGecerliMi(q)) return { sonuclar: [], eksik: [] };
      const sinir = turBasinaSinir(tur !== null);
      const istek = { q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: kullanici.id, islemler: kullanici.islemler } };
      const sorulacak = kaynaklar.filter(({ kaynak }) => (tur === null || kaynak.tur === tur)
        && kaynak.yetki.some((i) => kullanici.islemler.includes(i)));
      const gruplar = new Map<KayitTuru, GenelAramaSonucu[]>();
      const eksik: KayitTuru[] = [];
      let sira = 0;
      const isci = async (): Promise<void> => {
        for (let i = sira++; i < sorulacak.length; i = sira++) {
          const { modul, kaynak } = sorulacak[i]!;
          try {
            gruplar.set(kaynak.tur, satirlariSuz(kaynak.tur, await vt.okumaTx((db) => kaynak.ara(db, istek)), sinir));
          } catch (hata) {
            eksik.push(kaynak.tur);
            gunluk.uyar(`Kayıt arama kaynağı cevap vermedi: ${modul} ${kaynak.tur}`, hata);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(ESZAMANLI_KAYNAK, sorulacak.length) }, isci));
      return { sonuclar: sonuclariDiz(q, gruplar), eksik: KAYIT_TURU_SIRASI.filter((t) => eksik.includes(t)) };
    },
  });
}
