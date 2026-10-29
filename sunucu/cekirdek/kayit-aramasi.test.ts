import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { SADE_KAYNAK, aramaSade, icindeDeseni, type KayitAramaIstegi } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import type { Db, Veritabani } from './db.ts';
import { genelAramaUcu, kaynakHatalari, kaynaklariKesfet, type ModulKaynagi } from './kayit-aramasi.ts';
import { testVeritabaniKur } from './test-vt.ts';
import { uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
let acilanTx = 0;
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => { acilanTx += 1; return is(bos); }, kapat: async () => undefined };

const KISILER: Record<string, Kullanici> = {
  emirci: { id: 1, ad: 'emirci', islemler: ['sayfa.uretim-emirleri'] },
  hepsi: { id: 2, ad: 'hepsi', islemler: ['sayfa.uretim-emirleri', 'kisiler.oku', 'sayfa.istasyonlar'] },
  islemsiz: { id: 3, ad: 'islemsiz', islemler: [] },
};

const satir = (anahtar: string, baslik: string, yol = `/x/${anahtar}`): KayitAramaSonucu => ({ anahtar, baslik, aciklama: null, yol: yol as `/${string}` });

const sorulanlar: { tur: string; istek: KayitAramaIstegi }[] = [];
const KAYNAKLAR: ModulKaynagi[] = [
  {
    modul: 'uretim-emirleri',
    kaynak: {
      tur: 'emir', yetki: ['sayfa.uretim-emirleri'],
      ara: async (_db, istek) => {
        sorulanlar.push({ tur: 'emir', istek });
        return Array.from({ length: 30 }, (_, i) => satir(String(i), `UE-${i}`));
      },
    },
  },
  {
    modul: 'kisiler',
    kaynak: {
      tur: 'kisi', yetki: ['kisiler.oku'],
      ara: async (_db, istek) => {
        sorulanlar.push({ tur: 'kisi', istek });
        return [satir('7', istek.q), satir('8', 'Başka', '//dis.site'), satir('9', '  ')];
      },
    },
  },
  {
    modul: 'istasyonlar',
    kaynak: { tur: 'istasyon', yetki: ['sayfa.istasyonlar'], ara: async () => { throw new Error('vt düştü'); } },
  },
];

function kur(kaynaklar: readonly ModulKaynagi[] = KAYNAKLAR): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, [genelAramaUcu(vt, kaynaklar)], { vt, kimlik: async (istek) => KISILER[String(istek.headers['x-kullanici'])] ?? null });
  return app;
}

const ara = async (app: FastifyInstance, kisi: string | null, q: string) =>
  app.inject({ method: 'GET', url: `/api/arama?q=${encodeURIComponent(q)}`, headers: kisi === null ? {} : { 'x-kullanici': kisi } });

describe('genel arama ucu', () => {
  test('kimliksiz istek 401; işlemsiz kişide hiçbir kaynak çağrılmaz', async () => {
    const app = kur();
    assert.equal((await ara(app, null, 'UE-1')).statusCode, 401);
    sorulanlar.length = 0;
    acilanTx = 0;
    const cevap = await ara(app, 'islemsiz', 'UE-1');
    assert.equal(cevap.statusCode, 200);
    assert.deepEqual(cevap.json(), { sonuclar: [], eksik: [] });
    assert.equal(sorulanlar.length, 0);
    assert.equal(acilanTx, 0);
  });

  test('yalnız yetkili kaynak sorulur; tür eklenir, tür başına 5 sonuç, desenler kaçırılmış gelir', async () => {
    sorulanlar.length = 0;
    const cevap = (await ara(kur(), 'emirci', 'UE_1')).json() as { sonuclar: { tur: string; anahtar: string }[]; eksik: string[] };
    assert.deepEqual(sorulanlar.map((s) => s.tur), ['emir']);
    assert.deepEqual(sorulanlar[0]!.istek, {
      q: 'UE_1', sade: 'ue_1', icindeDeseni: '%ue\\_1%', basDeseni: 'ue\\_1%', sinir: 5, kullanici: { id: 1, islemler: ['sayfa.uretim-emirleri'] },
    });
    assert.equal(cevap.sonuclar.length, 5);
    assert.ok(cevap.sonuclar.every((s) => s.tur === 'emir' && s.anahtar.startsWith('emir#')));
    assert.deepEqual(cevap.eksik, []);
  });

  test('hata veren kaynak eksik sayılır, ötekiler gelir; uygulama dışı adres ve boş başlık düşer; tam eşleşen tür önde', async () => {
    const cevap = (await ara(kur(), 'hepsi', 'Ayşe')).json() as { sonuclar: { tur: string; baslik: string; yol: string }[]; eksik: string[] };
    assert.deepEqual(cevap.eksik, ['istasyon']);
    assert.deepEqual(cevap.sonuclar.filter((s) => s.tur === 'kisi').map((s) => s.yol), ['/x/7']);
    assert.equal(cevap.sonuclar[0]!.tur, 'kisi');
    assert.equal(cevap.sonuclar.length, 6);
  });

  test('önek tek türü seçer ve toplam sınırı o türe verir; yetkisiz türün öneki boş döner', async () => {
    sorulanlar.length = 0;
    const cevap = (await ara(kur(), 'hepsi', 'e: UE')).json() as { sonuclar: { tur: string }[] };
    assert.deepEqual(sorulanlar.map((s) => [s.tur, s.istek.sinir, s.istek.q]), [['emir', 25, 'UE']]);
    assert.equal(cevap.sonuclar.length, 25);
    sorulanlar.length = 0;
    assert.deepEqual((await ara(kur(), 'emirci', 'k:Ayşe')).json(), { sonuclar: [], eksik: [] });
    assert.equal(sorulanlar.length, 0);
  });

  test('kısa sorgu ve yalnız önek boş döner; çok uzun sorgu 400', async () => {
    sorulanlar.length = 0;
    assert.deepEqual((await ara(kur(), 'hepsi', 'e:')).json(), { sonuclar: [], eksik: [] });
    assert.deepEqual((await ara(kur(), 'hepsi', 'a')).json(), { sonuclar: [], eksik: [] });
    assert.equal(sorulanlar.length, 0);
    assert.equal((await ara(kur(), 'hepsi', 'x'.repeat(70))).statusCode, 400);
  });
});

describe('kaynak denetimi', () => {
  const ara0 = async () => [];
  test('geçerli kaynak boş hata verir', () => {
    assert.deepEqual(kaynakHatalari('kisiler', [{ tur: 'kisi', yetki: ['kisiler.oku'], ara: ara0 }]), []);
  });
  test('başka modülün türü, bilinmeyen tür, boş ya da kayıtsız yetki, eksik işlev reddedilir', () => {
    const h = (deger: unknown): string => kaynakHatalari('kisiler', deger).join(' | ');
    assert.match(h({}), /dizi değil/);
    assert.match(h([{ tur: 'emir', yetki: ['kisiler.oku'], ara: ara0 }]), /uretim-emirleri modülünündür/);
    assert.match(h([{ tur: 'yok', yetki: ['kisiler.oku'], ara: ara0 }]), /türü listede yok/);
    assert.match(h([{ tur: 'kisi', yetki: [], ara: ara0 }]), /yetki listesi boş/);
    assert.match(h([{ tur: 'kisi', yetki: ['kisiler.uydurma'], ara: ara0 }]), /işlemi kayıtlı değil/);
    assert.match(h([{ tur: 'kisi', yetki: ['kisiler.oku'] }]), /ara işlevi yok/);
  });
});

describe('kaynak keşfi', () => {
  let klasor = '';
  const modulYaz = async (ad: string, icerik: string): Promise<void> => {
    await mkdir(join(klasor, ad), { recursive: true });
    await writeFile(join(klasor, ad, 'disari.ts'), icerik);
  };
  before(async () => { klasor = await mkdtemp(join(tmpdir(), 'kayit-aramasi-')); });
  after(async () => { await rm(klasor, { recursive: true, force: true }); });

  test('disari.ts ihracı bulunur; ihracı olmayan ve kapalı modül atlanır; aynı tür iki kez sunucuyu açmaz', async () => {
    await modulYaz('kisiler', "export const kayitAramaKaynaklari = [{ tur: 'kisi', yetki: ['kisiler.oku'], ara: async () => [] }];\n");
    await modulYaz('stok', 'export const baska = 1;\n');
    await modulYaz('istasyonlar', "export const kayitAramaKaynaklari = [{ tur: 'istasyon', yetki: ['sayfa.istasyonlar'], ara: async () => [] }];\n");
    assert.deepEqual((await kaynaklariKesfet(klasor)).map((k) => [k.modul, k.kaynak.tur]), [['istasyonlar', 'istasyon'], ['kisiler', 'kisi']]);
    assert.deepEqual((await kaynaklariKesfet(klasor, ['istasyonlar'])).map((k) => k.modul), ['kisiler']);
    await modulYaz('uretim-emirleri', "export const kayitAramaKaynaklari = [{ tur: 'kisi', yetki: ['kisiler.oku'], ara: async () => [] }];\n");
    await assert.rejects(kaynaklariKesfet(klasor), /kisiler modülünündür/);
  });

  test('depodaki modüllerin kaynakları geçerlidir', async () => {
    await kaynaklariKesfet(fileURLToPath(new URL('../moduller/', import.meta.url)));
  });
});

describe('arama_sade (gerçek PostgreSQL)', () => {
  let ortam: Awaited<ReturnType<typeof testVeritabaniKur>> | undefined;
  before(async () => { ortam = await testVeritabaniKur('kayit_aramasi'); });
  after(async () => { await ortam?.kaldir(); });
  const acik = () => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam; };

  test('SQL işlevi sözleşmedeki tabloyla aynı sadeleştirir; uygulama kullanıcısı çağırabilir', async () => {
    const ornekler = [SADE_KAYNAK, 'IŞIK ışık İstasyon ıspanak', 'Çek-Göz_Ünite %Âlet', 'Été MIL-0010 ß'];
    for (const metin of ornekler) {
      const satir = await acik().vt.tek<{ sade: string }>('SELECT public.arama_sade($1) AS sade', [metin]);
      assert.equal(satir?.sade, aramaSade(metin), metin);
    }
  });

  test('dil ayarından bağımsız eşleşir ve ifade indeksi LIKE aramasında kullanılır', async () => {
    const { sahip, vt: v } = acik();
    await sahip.sorgu('CREATE TABLE arama_deneme (id int PRIMARY KEY, ad text NOT NULL)');
    await sahip.sorgu('CREATE INDEX arama_deneme_ad_trgm ON arama_deneme USING gin (public.arama_sade(ad) public.gin_trgm_ops)');
    await sahip.sorgu("INSERT INTO arama_deneme VALUES (1, 'IŞIK MİLİ'), (2, 'ışık mili'), (3, 'Başka')");
    const bul = async (q: string): Promise<number[]> => (await v.sorgu<{ id: number }>(
      'SELECT id FROM arama_deneme WHERE public.arama_sade(ad) LIKE $1 ORDER BY id', [icindeDeseni(q)])).map((s) => s.id);
    assert.deepEqual(await bul('işık'), [1, 2]);
    assert.deepEqual(await bul('MILI'), [1, 2]);
    assert.deepEqual(await bul('baş'), [3]);
    const plan = await sahip.tx(async (db) => {
      await db.sorgu('SET LOCAL enable_seqscan = off');
      return db.sorgu<{ 'QUERY PLAN': string }>("EXPLAIN SELECT id FROM arama_deneme WHERE public.arama_sade(ad) LIKE '%isik%'");
    });
    assert.match(plan.map((p) => p['QUERY PLAN']).join('\n'), /arama_deneme_ad_trgm/);
  });
});
