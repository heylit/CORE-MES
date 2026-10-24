import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { ArkonKayitTuru, KayitEkleCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kararliSayimiSonuclandir } from '../uretim-emirleri/disari.ts';
import { kayitEkle } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const OPERATOR_ISLEMLERI: Islem[] = ['arkon.operator', 'sayfa.arkon', 'terminal.uret'];
const sessizGunluk: Gunluk = { uyar: () => undefined, hata: () => undefined };
// İlk satırdan sonraki her satır için izin verilen en çok sorgu (hem sayımda hem reddedilen başlatmada).
// Kalan sorgular uretim-emirleri komutunun kendi okumaları ve Arkon yazımlarıdır.
const SATIR_BASINA_SINIR = 28;

interface Olcum {
  sorgu: number;
  cidler: string[];
  cevap: KayitEkleCevabi;
  yansimalar: { sonuc: string; neden: string | null; adet: number }[];
}

describe('arkon kayıt ekleme satır başına sorgu sayısı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operatorId = 0;
  let calisanEmir = 0;
  let bekleyenEmir = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // İş emirsiz emrin açma ucu yok (238 H3): kurulum emri doğrudan yazar.
  const emirYaz = async (g: { parcaNo: string; parcaAd: string; adet: number; istasyonId: number; projeId: number }) => {
    const emir = (await ortam!.sahip.tek<{ id: number; emirNo: string }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, proje_id)
       VALUES ($1, $2, $3, $4, (SELECT min(id) FROM kisi), $5) RETURNING id, emir_no AS "emirNo"`,
      [g.parcaNo, g.parcaAd, g.adet, g.istasyonId, g.projeId]))!;
    return { durum: 200, govde: { emir } };
  };

  async function istek<T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { cookie: yonetici, ...(yontem === 'POST' && yol === '/uretim-emirleri' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json() as T;
  }

  // Sayım işlemin kendi db nesnesinin yöntemleri sarılarak yapılır: kayıt noktası nesneyi kimliğiyle tanır, sarmalayıcı nesne tanınmaz.
  async function olc(tur: ArkonKayitTuru, satirSayisi: number, satir: (cid: string) => Record<string, unknown>): Promise<Olcum> {
    const satirlar = Array.from({ length: satirSayisi }, () => satir(`sq-${(sayac += 1)}`));
    let sorgu = 0;
    const cevap = await vt().tx(async (db: Db) => {
      const sorguYontemi = db.sorgu.bind(db);
      const tekYontemi = db.tek.bind(db);
      db.sorgu = ((...a: Parameters<Db['sorgu']>) => { sorgu += 1; return sorguYontemi(...a); }) as Db['sorgu'];
      db.tek = ((...a: Parameters<Db['tek']>) => { sorgu += 1; return tekYontemi(...a); }) as Db['tek'];
      try {
        return await kayitEkle(db, { id: operatorId, ad: 'Sorgu Operatörü', islemler: OPERATOR_ISLEMLERI }, tur, satirlar, 'sq', sessizGunluk);
      } finally {
        db.sorgu = sorguYontemi;
        db.tek = tekYontemi;
      }
    });
    const yansimalar = await vt().sorgu<Olcum['yansimalar'][number]>(
      `SELECT y.sonuc, y.neden, count(*)::int AS adet FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id
       WHERE k.cid = ANY($1::text[]) GROUP BY y.sonuc, y.neden ORDER BY y.sonuc, y.neden`, [satirlar.map((s) => s['cid'])]);
    return { sorgu, cidler: satirlar.map((s) => String(s['cid'])), cevap, yansimalar };
  }

  const sayim = (cid: string) => ({ cid, pkgId: `tmi-ue-${calisanEmir}`, kind: 'good', delta: 1 });
  const baslat = (cid: string) => ({ cid, pkgId: `tmi-ue-${bekleyenEmir}`, state: 'running' });

  let projeId = 0;

  before(async () => {
    ortam = await testVeritabaniKur('arkonsorgu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Denetim #27: rotasız emir varsayılan kapalı ve projeyle açılır; kurulum ayarı açar, test projesi verir.
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TEST.PROJE', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [yoneticiId]);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    yonetici = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_sq', 'sq') RETURNING id");
    if (!yoneticiRolu || !gecici) throw new Error('rol kurulamadı');
    for (const islem of OPERATOR_ISLEMLERI) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    operatorId = await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Sorgu Operatörü', kullaniciAdi: 'opsq', parola: PAROLA });
      await rolAta(db, yoneticiId, id, gecici.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
    const merkez = await istek<{ id: number }>('POST', '/is-merkezleri', { kod: 'SQM', ad: 'Sorgu merkezi' });
    const ist = await istek<{ id: number }>('POST', '/istasyonlar', { kod: 'SQI', ad: 'Sorgu istasyonu', isMerkeziId: merkez.id, tip: 'talasli' });
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await vt().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist.id]);
    const emirAc = async (no: string) => (await emirYaz({ parcaNo: no, parcaAd: 'Sorgu', adet: 500, istasyonId: ist.id, projeId })).govde.emir.id;
    calisanEmir = await emirAc('SQ-1');
    bekleyenEmir = await emirAc('SQ-2');
    await istek('POST', '/arkon/kayitlar/events/ekle', { satirlar: [{ cid: 'sq-basla', pkgId: `tmi-ue-${calisanEmir}`, state: 'running' }], kaynak: 'sq' });
    // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; ölçüm onaylı emrin olağan sayımını ölçer.
    await istek('POST', '/arkon/kayitlar/counts/ekle', { satirlar: [sayim('sq-ilk')], kaynak: 'sq' });
    await ortam.vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, calisanEmir, 'onay'));
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('çalışan emre gelen sayımlar istek içinde okumaları paylaşır: satır başına sorgu belirgin düşer, sonuç aynı kalır', async () => {
    const bir = await olc('counts', 1, sayim);
    const yirmi = await olc('counts', 20, sayim);
    const satirBasina = (yirmi.sorgu - bir.sorgu) / 19;
    assert.deepEqual(bir.cevap, { eklenen: 1, reddedilen: [], uyarilar: [] });
    assert.deepEqual(yirmi.cevap, { eklenen: 20, reddedilen: [], uyarilar: [] });
    assert.deepEqual(yirmi.yansimalar, [{ sonuc: 'yazildi', neden: null, adet: 20 }]);
    const emir = (await istek<EmirAyrintiCevabi>('GET', `/uretim-emirleri/${calisanEmir}`)).emir;
    assert.equal(emir.canli?.saglam, 22, 'kurulumdaki onaylı ilk parça dahil');
    assert.ok(satirBasina <= SATIR_BASINA_SINIR, `ek satır başına ${satirBasina} sorgu (1 satır ${bir.sorgu}, 20 satır ${yirmi.sorgu})`);
  });

  test('istasyon doluyken gelen başlatmalar reddedilir: ret iletisi, sıra ve satır başına sorgu', async () => {
    const bir = await olc('events', 1, baslat);
    const yirmi = await olc('events', 20, baslat);
    const satirBasina = (yirmi.sorgu - bir.sorgu) / 19;
    const dolu = 'Bu istasyonda başka biri iş başlatmış; önce onun durdurulması gerek. Onaylarsanız o işi durdurup sizin için başlatabilirsiniz.';
    assert.equal(yirmi.cevap.eklenen, 20);
    assert.deepEqual(yirmi.cevap.uyarilar, []);
    assert.deepEqual(
      yirmi.cevap.reddedilen.map((r) => [r.cid, r.ileti, r.tmiDurum, r.makineDolu?.devralEmirId]),
      yirmi.cidler.map((cid) => [cid, dolu, 'queued', bekleyenEmir]),
      'ret iletisi, TMI hali ve devralma ayrıntısı her satırda aynı ve kayıt sırasındadır',
    );
    assert.deepEqual(yirmi.yansimalar, [{ sonuc: 'reddedildi', neden: dolu, adet: 20 }]);
    assert.ok(satirBasina <= SATIR_BASINA_SINIR, `ek satır başına ${satirBasina} sorgu (1 satır ${bir.sorgu}, 20 satır ${yirmi.sorgu})`);
  });
});
