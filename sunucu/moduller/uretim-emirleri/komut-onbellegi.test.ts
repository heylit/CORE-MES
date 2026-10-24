import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirSayim, kararliSayimiSonuclandir, komutOnbellegiyle } from './disari.ts';
import type { Emir } from './disari.ts';
import { KAPSAM_DISI } from './kurallar.ts';
import { emirAc } from './servis.ts';

// Arkon kayıt ekleme bir istekte satır başına bir komut koşar; kişi kapsamı ve ad tabloları satır başına yeniden okunuyordu (yük testi 2026-10-18).
describe('uretim-emirleri komut önbelleği (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operator: Kullanici;
  let kisitli: Kullanici;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function kisiEkle(kullaniciAdi: string): Promise<Kullanici> {
    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const kullanici = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (kullanici === null) throw new Error('kullanıcı yüklenemedi');
    return kullanici;
  }

  async function istasyonKur(): Promise<{ istasyonId: number; isMerkeziId: number }> {
    sayac += 1;
    const im = await ortam!.sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KOM${sayac}`, 'Deneme Merkezi']);
    const ist = await ortam!.sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KOS${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    if (!im || !ist) throw new Error('istasyon kurulamadı');
    // UE20: başlatan istasyonda yetkin olmalı; testin kişileri her yeni istasyonda yetkindir. 'kisitli' yetkin değildir: yetkinlik iş
    // merkezi kapsamını genişletir, kapsam reddi başka türlü sınanamaz.
    await ortam!.sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi IS DISTINCT FROM 'kisitli'", [ist.id]);
    return { istasyonId: ist.id, isMerkeziId: im.id };
  }

  async function baslamisEmir(istasyonId: number): Promise<number> {
    const { emir } = await vt().tx((db) => emirAc(db, yoneticiId, { parcaNo: 'P-1', parcaAd: 'Deneme Parçası', adet: 100, istasyonId }));
    await vt().tx((db) => emirBaslat(db, operator, emir.id));
    return emir.id;
  }

  // Sayan db aynı transaction'ın db'sidir: önbellek kapsamı db'ye bağlıdır, sarmalayan kopya kapsamı taşımaz.
  function sayan(db: Db): { sayi: () => number; db: Db } {
    let n = 0;
    const asil = { sorgu: db.sorgu.bind(db), tek: db.tek.bind(db) };
    const d = db as { sorgu: Db['sorgu']; tek: Db['tek'] };
    d.sorgu = (sql, p) => { n += 1; return asil.sorgu(sql, p); };
    d.tek = (sql, p) => { n += 1; return asil.tek(sql, p); };
    return { sayi: () => n, db };
  }

  const reddi = async (is: Promise<unknown>): Promise<UygulamaHatasi> => {
    const hata: unknown = await is.then(() => null, (h: unknown) => h);
    assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
    return hata;
  };

  before(async () => {
    ortam = await testVeritabaniKur('ue_onbellek');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    operator = await kisiEkle('operator');
    kisitli = await kisiEkle('kisitli');
  });
  after(async () => { await ortam?.kaldir(); });

  test('kapsam içinde cevap ve yazılan satırlar kapsam dışıyla aynıdır; sonraki komutlar kapsam ve ad okumasını tekrarlamaz', async () => {
    // Bir istasyonda tek emir çalışır: iki eş emir iki istasyonda.
    const a = await baslamisEmir((await istasyonKur()).istasyonId);
    const b = await baslamisEmir((await istasyonKur()).istasyonId);
    // 327 a: ilk sayım karar bekler; ölçülen sayımlar ilk parçası onaylanmış emirde aynı yoldan gider.
    for (const id of [a, b]) {
      await vt().tx(async (db) => {
        await emirSayim(db, operator, id, { tur: 'saglam', adet: 1 });
        await kararliSayimiSonuclandir(db, yoneticiId, id, 'onay');
      });
    }
    await vt().tx(async (db) => {
      const s = sayan(db);
      const disarida: number[] = [];
      const disCevaplar: Emir[] = [];
      for (const adet of [3, 2, -1]) {
        const once = s.sayi();
        disCevaplar.push((await emirSayim(s.db, operator, a, { tur: 'saglam', adet })).emir);
        disarida.push(s.sayi() - once);
      }
      const icerde: number[] = [];
      const icCevaplar = await komutOnbellegiyle(s.db, async () => {
        const cevaplar: Emir[] = [];
        for (const adet of [3, 2, -1]) {
          const once = s.sayi();
          cevaplar.push((await emirSayim(s.db, operator, b, { tur: 'saglam', adet })).emir);
          icerde.push(s.sayi() - once);
        }
        return cevaplar;
      });
      const kimliksiz = (e: Emir) => ({ ...e, id: 0, emirNo: '', istasyon: { id: 0, ad: '' }, acilma: '', baslama: '' });
      assert.deepEqual(icCevaplar.map(kimliksiz), disCevaplar.map(kimliksiz));
      assert.equal(disarida[0], icerde[0], 'ilk komut aynı okumaları yapar');
      assert.equal(disarida[0], disarida[1], 'kapsam dışında artı sayımlar aynı sayıda sorgu atar');
      // İstasyon, kişinin rol ve iş merkezi kısıtı, istasyon ve kişi ad listeleri: beş okuma bir kez.
      assert.equal(icerde[1], disarida[1]! - 5);
      // Eksi sayım kişinin işe katılımını da okur (185 a, 238 H4); bu okuma emre özgüdür, önbelleğe girmez.
      assert.equal(icerde[2]! - icerde[1]!, disarida[2]! - disarida[1]!);
      assert.ok(disarida[2]! > disarida[1]!, 'eksi sayımda katılım okunur');
    });
    const satirlar = await vt().sorgu<{ emir_id: number; adet: number }>(
      'SELECT emir_id, adet FROM uretim_sayimi WHERE emir_id = ANY($1::int[]) ORDER BY id', [[a, b]],
    );
    // İlk üç satır ilk parça sayımı ve onayıdır (karar bekliyor 1, -1; sağlam 1).
    assert.deepEqual(satirlar.filter((r) => r.emir_id === a).map((r) => r.adet), [1, -1, 1, 3, 2, -1]);
    assert.deepEqual(satirlar.filter((r) => r.emir_id === b).map((r) => r.adet), [1, -1, 1, 3, 2, -1]);
  });

  test('kapsam dışında kısıt her komutta tazedir; kapsam bitince önbellek düşer', async () => {
    const yer = await istasyonKur();
    const baska = await istasyonKur();
    const emir = await baslamisEmir(yer.istasyonId);
    try {
      await vt().tx(async (db) => {
        await emirSayim(db, kisitli, emir, { tur: 'saglam', adet: 1 });
        await ortam!.sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisitli.id, baska.isMerkeziId]);
        assert.equal((await reddi(emirSayim(db, kisitli, emir, { tur: 'saglam', adet: 1 }))).message, KAPSAM_DISI);
      });
      await ortam!.sahip.sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [kisitli.id]);
      await vt().tx(async (db) => {
        await komutOnbellegiyle(db, async () => {
          await emirSayim(db, kisitli, emir, { tur: 'saglam', adet: 1 });
          await ortam!.sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisitli.id, baska.isMerkeziId]);
          // Kapsam içinde kısıt yazılmaz (sözleşme); yazılırsa kapsam boyunca ilk okuma geçer.
          await emirSayim(db, kisitli, emir, { tur: 'saglam', adet: 1 });
        });
        assert.equal((await reddi(emirSayim(db, kisitli, emir, { tur: 'saglam', adet: 1 }))).message, KAPSAM_DISI);
      });
    } finally {
      await ortam!.sahip.sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [kisitli.id]);
    }
  });

  test('kapsam içindeki hata kapsamı kapatır; iç içe kapsam dıştakini kullanır', async () => {
    const yer = await istasyonKur();
    const emir = await baslamisEmir(yer.istasyonId);
    await vt().tx(async (db) => {
      await assert.rejects(komutOnbellegiyle(db, async () => {
        await emirSayim(db, operator, emir, { tur: 'saglam', adet: 1 });
        throw new Error('dış iş reddi');
      }), /dış iş reddi/);
      const s = sayan(db);
      const olc = async (): Promise<number> => {
        const once = s.sayi();
        await emirSayim(s.db, operator, emir, { tur: 'saglam', adet: 1 });
        return s.sayi() - once;
      };
      const tazeSayi = await olc();
      assert.equal(await olc(), tazeSayi, 'hatadan sonra önbellek kalmaz');
      await komutOnbellegiyle(db, async () => {
        await olc();
        assert.equal(await komutOnbellegiyle(db, olc), tazeSayi - 5);
        assert.equal(await olc(), tazeSayi - 5, 'iç kapsam bitince dıştaki sürer');
      });
    });
  });
});
