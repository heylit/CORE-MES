import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { isMalzemeleri, istasyonSepetleri, malKabulYap, teslimAl, teslimGonder, uretimHazirligi } from './servis.ts';

// 1868: Teslim al'daki iş malzemeleri ve iki sepet, istasyondaki her adım ve girdi için ayrı sorgu atıyordu (terminal dakikada bir
// çağırır; yük testinde istek başına 236 ve 208 sorgu). Sorgu sayısı emir ve girdi sayısıyla büyümemeli; cevap aynı kalmalı. Veriler uydurmadır.
describe('teslim kutusu sorgu sayısı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let k: Kullanici;
  let alan: Kullanici;
  let projeId = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return ortam; };

  const sorguSay = <T>(f: (db: Db) => Promise<T>): Promise<[T, number]> => o().vt.tx(async (db) => {
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

  async function kart(tur: 'hammadde' | 'yarimamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['TKS-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'TKS-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`tks-dnm-${sira}`, tur, sira, JSON.stringify({ id: `tks-dnm-${sira}`, com: { ad: `Kutu deneme ${sira}`, birim: 'kg' } }), k.id]))!.no;
  }
  async function istasyon(): Promise<number> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KIM${sira}`, 'Deneme Merkezi']);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`KIS${sira}`, `Deneme istasyon ${sira}`, im!.id]))!.id;
  }
  const revizyon = async (malzemeNo: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
    `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
     VALUES ($1, 'yarimamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [malzemeNo, k.id]))!.id;
  const tx = <T>(f: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(f);
  const kabul = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const malKabul = (malzemeId: number, miktar: string) => tx((db) => malKabulYap(db, k, { tur: 'diger', irsaliyeNo: null, satirlar: [{ malzemeId, miktar }] }, () => undefined));
  const teslimEt = async (malzemeId: number, miktar: string, kaynak: { konumId: number } | { istasyonId: number }, hedefIstasyonId: number, statuId: number | null = null) => {
    const g = await tx((db) => teslimGonder(db, k, { malzemeId, miktar, statuId, kaynak, hedef: { istasyonId: hedefIstasyonId }, not: null, kaynakKimligi: randomUUID(), kartOnayi: true }));
    await tx((db) => teslimAl(db, alan, g.teslim.id, { surum: g.teslim.surum, alinan: miktar }));
  };

  let tip = 0;
  let [a, x, c] = [0, 0, 0];
  const hm: number[] = [];
  // ilkAdim: X emrin ilk adımıdır (OP 10 X'te iki girdiyle, OP 20 C'de). Değilse üç adım: OP 10 A'da, OP 20 X'te (iki girdi), OP 30 C'de;
  // X'in kutusu OP 20'nin girdilerini ve önceki adımın parçasını (taşınan) da gösterir.
  async function emirAc(ilkAdim: boolean): Promise<number> {
    const ym = await kart('yarimamul');
    const makine = async (istasyonId: number): Promise<number> =>
      (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) ON CONFLICT (kod) DO UPDATE SET ad = EXCLUDED.ad RETURNING id', [`KM-${istasyonId}`, 'Tezgah', istasyonId]))!.id;
    const adim = async (s: number, istasyonId: number, bilesenler: { malzemeNo: number; miktar: string }[]): Promise<IsEmriGirdisi> => ({
      sira: s, opNo: s * 10, ad: `Adım ${s}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: await makine(istasyonId) }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    const xGirdileri = [{ malzemeNo: hm[1]!, miktar: '1' }, { malzemeNo: hm[2]!, miktar: '0.5' }];
    const isEmirleri = ilkAdim
      ? [await adim(1, x, xGirdileri), await adim(2, c, [{ malzemeNo: hm[3]!, miktar: '0.25' }])]
      : [await adim(1, a, [{ malzemeNo: hm[0]!, miktar: '2.5' }]), await adim(2, x, xGirdileri), await adim(3, c, [{ malzemeNo: hm[3]!, miktar: '0.25' }])];
    const rev = await revizyon(ym);
    const { uretimEmriId } = await tx((db) => uretimEmriAc(db, k, { projeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri }));
    // Girdinin bir kısmı istasyonda, birine istek açık, depoda da var: her dal (istasyonda, yerler, istek) dolu okunur.
    await teslimEt(hm[1]!, '3', { konumId: await kabul() }, x);
    if (ilkAdim) await tx((db) => uretimHazirligi(db, k, { uretimEmriId, istasyonId: x }));
    return uretimEmriId;
  }

  before(async () => {
    ortam = await testVeritabaniKur('stok_kutu_sorgu');
    const id = await tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    k = { id, ad: 'Deneme Yönetici', islemler: [...ISLEMLER] };
    const alanId = await tx((db) => yoneticiOlustur(db, { ad: 'Deneme Alan', kullaniciAdi: 'alan', parola: 'dogru-parola-1' }));
    alan = { id: alanId, ad: 'Deneme Alan', islemler: [...ISLEMLER] };
    projeId = (await o().sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.KUTU', 'Deneme proje', $1) RETURNING id", [id]))!.id;
    tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('TKS-1', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    [a, x, c] = [await istasyon(), await istasyon(), await istasyon()];
    for (let i = 0; i < 4; i += 1) { hm.push(await kart('hammadde')); await malKabul(hm[i]!, '500'); }
    await teslimEt(hm[3]!, '4', { konumId: await kabul() }, a);
  });
  after(async () => { await ortam?.kaldir(); });

  const olc = async (emir: number) => {
    const [m, n] = await sorguSay((db) => isMalzemeleri(db, k, x));
    const [sp, ns] = await sorguSay((db) => istasyonSepetleri(db, k, x, emir));
    return { m, n, sp, ns };
  };

  test('X emirlerin ilk adımıyken: emir eklenince iş malzemeleri ve iki sepetin sorgu sayısı değişmez', async () => {
    const e1 = await emirAc(true);
    const once = await olc(e1);
    assert.deepEqual(once.m.isler.map((i) => [i.uretimEmriId, i.opNo, i.malzemeler.length]), [[e1, 10, 2]]);
    assert.ok(once.m.isler[0]!.malzemeler.some((m) => m.istek !== null), 'açık istek okundu');
    for (let i = 0; i < 4; i += 1) await emirAc(true);
    const sonra = await olc(e1);
    assert.equal(sonra.m.isler.length, 5);
    assert.equal(sonra.n, once.n, `1 emirde ${String(once.n)}, 5 emirde ${String(sonra.n)} sorgu (iş malzemeleri)`);
    assert.equal(sonra.ns, once.ns, `1 emirde ${String(once.ns)}, 5 emirde ${String(sonra.ns)} sorgu (iki sepet)`);
  });

  // Taşınan girdinin statüsü ve çıktısı Reçete ve Rota çözücüsündendir ve emir başına okunur (toplu çözücü ayrı kart). Stok ve üretim
  // emirleri okumaları emirle büyümez; kalan artış çözücünün sorgularıdır (ölçüm: emir başına 13; eski kodda 54).
  test('X ara adımken: iki sepet emirle büyümez, iş malzemelerinde emir başına artış yalnız çözücü kadardır', async () => {
    const e1 = await emirAc(false);
    const once = await olc(e1);
    assert.ok(once.m.isler.some((i) => i.uretimEmriId === e1 && i.opNo === 20 && i.malzemeler.length === 3), 'iki girdi ve önceki adımın parçası');
    for (let i = 0; i < 3; i += 1) await emirAc(false);
    const sonra = await olc(e1);
    assert.equal(sonra.ns, once.ns, `iki sepet: ${String(once.ns)} -> ${String(sonra.ns)}`);
    assert.ok(sonra.n - once.n <= 3 * 15, `iş malzemeleri: ${String(once.n)} -> ${String(sonra.n)} (3 emir eklendi)`);
  });
});
