import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { kisiGorevi, yoneticiOlustur } from '../kisiler/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { kaynakOku, planlamaCalismasi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// 1859: planlama çalışması kişi başına görev okuyordu (istek başına kişi sayısı kadar sorgu). Sorgu sayısı kişi sayısıyla büyümemeli,
// görevler kişi başına okumayla aynı kalmalı. Veriler uydurmadır.
describe('planlama çalışması sorgu sayısı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici: Kullanici;
  let sira = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return ortam.vt; };

  const kayit = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
  const calisma = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {} },
  };

  const sorguSay = <T>(f: (db: Db) => Promise<T>): Promise<[T, number]> => vt().tx(async (db) => {
    let n = 0;
    const sayan = new Proxy(db, {
      get: (h, ad, al) => {
        const d = Reflect.get(h, ad, al) as unknown;
        if (typeof d !== 'function') return d;
        return (...x: unknown[]) => { if (ad === 'sorgu' || ad === 'tek') n += 1; return (d as (...y: unknown[]) => unknown).apply(h, x); };
      },
    });
    return [await f(sayan), n];
  });

  // Kişi kartının görevi kişiler modülünündür; kurulum doğrudan yazar. Görevsiz kişi de (null) listede kalmalı.
  const kisiEkle = async (gorev: string | null): Promise<number> => {
    sira += 1;
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme kisi ${String(sira)}`, kullaniciAdi: `pcs${String(sira)}`, parola: 'dogru-parola-1' }));
    await ortam!.sahip.sorgu('UPDATE kisi SET gorev = $2 WHERE id = $1', [id, gorev]);
    return id;
  };

  before(async () => {
    ortam = await testVeritabaniKur('plan_calisma_sorgu');
    const id = await kisiEkle('Planlamaci');
    yonetici = { id, ad: 'Deneme kisi 1', islemler: [...ISLEMLER] };
    await vt().sorgu(
      `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
      [DURUM_ANAHTARI, JSON.stringify(kayit), id]);
    await vt().tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: id }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('kişi eklenince sorgu sayısı değişmez; görevler kişi başına okumayla aynıdır', async () => {
    const simdi = Date.now();
    const [ilk, once] = await sorguSay((db) => planlamaCalismasi(db, yonetici, simdi));
    assert.notEqual(ilk.calisma, null);
    const eklenen = [await kisiEkle('Operator'), await kisiEkle(null), await kisiEkle('Ayarci'), await kisiEkle('Operator')];
    const [, sonra] = await sorguSay((db) => planlamaCalismasi(db, yonetici, simdi));
    assert.equal(sonra, once, `1 kişide ${String(once)}, 5 kişide ${String(sonra)} sorgu`);

    const gorev = (await vt().tx((db) => kaynakOku(db, yonetici))).ek as { kisiGorevi: Record<string, string | null> | null };
    const tek = await vt().tx(async (db) => {
      const l: Record<string, string | null> = {};
      for (const id of Object.keys(gorev.kisiGorevi ?? {})) l[id] = await kisiGorevi(db, Number(id));
      return l;
    });
    assert.deepEqual(gorev.kisiGorevi, tek);
    assert.deepEqual(eklenen.map((id) => gorev.kisiGorevi?.[String(id)]), ['Operator', null, 'Ayarci', 'Operator']);
  });
});
