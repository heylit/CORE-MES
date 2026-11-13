import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirBitir, emirDevam, emirDuraklat, makinelerdekiIsler, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { izlemeListesi } from './servis.ts';

// Fabrika Haritası çalışan işi `canli.isEmri.makineId` makinesinde gösterir: makine terminalde başlatılan makinedir, planlı makine yedektir.
describe('uretim-emirleri haritadaki çalışan makine (1997, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let istasyonId = 0;
  let sayac = 0;
  let planlamaci: Kullanici;
  let operator: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    return k;
  }
  async function makineKur(): Promise<number> {
    sayac += 1;
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`HRM${sayac}`, 'Tezgah', istasyonId]))!.id;
  }
  const adim = (sira: number, makineId: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (makineId: number): Promise<number> => (await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
    malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: [adim(1, makineId)],
  }))).uretimEmriId;
  const haritaMakinesi = async (emirId: number): Promise<number | null | undefined> => {
    const { emirler } = await o().vt.tx((db) => izlemeListesi(db, 'basladi', false));
    return emirler.find((e) => e.id === emirId)?.canli?.isEmri?.makineId;
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_harita_makinesi');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HRM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlamaci = await kisiEkle('planlama_proje', 'planlama_proje');
    operator = await kisiEkle('operator', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HRM-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HRM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hrm-dnm-1', 'mamul', 'HRM-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'hrm-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('HRMM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HRMI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    await ortam.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [istasyonId]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: planlı makineden başka makinede başlatılan iş, başlatıldığı makinede görünür', async () => {
    const planli = await makineKur(), baslatilan = await makineKur();
    const emir = await ac(planli);
    await o().vt.tx((db) => emirBaslat(db, operator, emir, [baslatilan]));
    assert.equal(await haritaMakinesi(emir), baslatilan);
  });

  test('izinli: makine seçilmeden başlatılan iş planlı makinededir; planlı makine seçilenlerdeyse o seçilir', async () => {
    const a = await makineKur(), b = await makineKur(), c = await makineKur();
    const secimsiz = await ac(a);
    await o().vt.tx((db) => emirBaslat(db, operator, secimsiz, undefined));
    assert.equal(await haritaMakinesi(secimsiz), a);
    const coklu = await ac(c);
    await o().vt.tx((db) => emirBaslat(db, operator, coklu, [b, c]));
    assert.equal(await haritaMakinesi(coklu), c);
  });

  test('ret: duraklatılan iş planlı makineye kaymaz, başlatıldığı makinede kalır; biten iş çalışanlarda yoktur', async () => {
    const planli = await makineKur(), baslatilan = await makineKur();
    const emir = await ac(planli);
    await o().vt.tx((db) => emirBaslat(db, operator, emir, [baslatilan]));
    await o().vt.tx((db) => emirDuraklat(db, operator, emir));
    assert.equal(await haritaMakinesi(emir), baslatilan);
    await o().vt.tx((db) => emirDevam(db, operator, emir, [baslatilan]));
    await o().vt.tx((db) => emirBitir(db, operator, emir));
    assert.equal(await haritaMakinesi(emir), undefined);
  });

  test('izinli/ret: makinedeki açık iş emir ve adımıyla okunur; işi olmayan, duraklatılan ve biten makine haritada yoktur (3176)', async () => {
    const dolu = await makineKur(), bos = await makineKur();
    const emir = await ac(dolu);
    await o().vt.tx((db) => emirBaslat(db, operator, emir, [dolu]));
    const isler = await o().vt.tx((db) => makinelerdekiIsler(db, [dolu, bos, dolu]));
    assert.deepEqual([...isler.keys()], [dolu]);
    const is = isler.get(dolu);
    assert.equal(is?.emirId, emir);
    assert.equal(is?.opNo, 10);
    assert.equal(is?.opAdi, 'Adım 1');
    assert.match(is?.emirNo ?? '', /\S/);
    assert.equal((await o().vt.tx((db) => makinelerdekiIsler(db, []))).size, 0);
    await o().vt.tx((db) => emirDuraklat(db, operator, emir));
    assert.equal((await o().vt.tx((db) => makinelerdekiIsler(db, [dolu]))).size, 0);
    await o().vt.tx((db) => emirDevam(db, operator, emir, [dolu]));
    assert.equal((await o().vt.tx((db) => makinelerdekiIsler(db, [dolu]))).size, 1);
    await o().vt.tx((db) => emirBitir(db, operator, emir));
    assert.equal((await o().vt.tx((db) => makinelerdekiIsler(db, [dolu]))).size, 0);
  });
});
