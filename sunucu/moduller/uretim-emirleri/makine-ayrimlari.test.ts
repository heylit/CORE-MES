import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirDevam, emirDuraklat, makineAyrimlari, planAyrimiCozucusu, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { EMIR_YOK } from './kurallar.ts';

// Arkon makine seçicisi 409 ile aynı kuraldan okur: seçicinin gösterdiği makinede başlatma reddedilir, göstermediğinde reddedilmez.
// Canlı plan bu modülün değil; çözücü testte elle kurulur, ufuk süzmesi planındır (plan-dogrulama.test.ts).
describe('uretim-emirleri makine ayrımları (393 d, gerçek PostgreSQL)', () => {
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
  let canli: { makineId: number; isEmriId: number; baslangic: string }[] = [];

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
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`MAY${sayac}`, 'Tezgah', istasyonId]))!.id;
  }
  const adim = (sira: number, makineId: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = (...makineler: number[]) => o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
    malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: makineler.map((m, i) => adim(i + 1, m)),
  }));
  const dk = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
  const oku = (emirId: number, makineler: number[]) => o().vt.tx((db) => makineAyrimlari(db, emirId, makineler));
  const ayrildi = (h: unknown): boolean => h instanceof UygulamaHatasi && h.kod === 'CAKISMA' && /başka işe ayrılmış/.test(h.message);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_makine_ayrimi');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.AYRIM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlamaci = await kisiEkle('planlama_proje', 'planlama_proje');
    operator = await kisiEkle('operator', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('MAY-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MAY-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('may-dnm-1', 'mamul', 'MAY-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'may-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('MAYM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('MAYI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    await ortam.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [istasyonId]);
    planAyrimiCozucusu(async (_db, makineIdleri) => canli.filter((x) => makineIdleri.includes(x.makineId)));
  });
  beforeEach(() => { canli = []; });
  after(async () => {
    planAyrimiCozucusu(null);
    await ortam?.kaldir();
  });

  test('makine başına ilk ayrım, başlangıç sırasıyla; atanan, aynı emir ve başlamış iş yok; seçicinin gösterdiği reddedilir, ötekiler reddedilmez', async () => {
    const planlanan = await makineKur(), ayrilmis = await makineKur(), ikinci = await makineKur(), bos = await makineKur(), calisan = await makineKur();
    const { uretimEmriId: emir, isEmriIdleri: [, i2] } = await ac(planlanan, bos);
    const { uretimEmriId: baska, isEmriIdleri: [j1, j2] } = await ac(ayrilmis, ayrilmis);
    const { isEmriIdleri: [k1] } = await ac(planlanan);
    const { isEmriIdleri: [l1] } = await ac(ikinci);
    const { isEmriIdleri: [n1] } = await ac(calisan);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() WHERE id = $1", [n1]);
    canli = [
      { makineId: ayrilmis, isEmriId: j2!, baslangic: dk(90) }, { makineId: ayrilmis, isEmriId: j1!, baslangic: dk(30) },
      { makineId: bos, isEmriId: i2!, baslangic: dk(10) }, { makineId: planlanan, isEmriId: k1!, baslangic: dk(15) },
      { makineId: ikinci, isEmriId: l1!, baslangic: dk(20) }, { makineId: calisan, isEmriId: n1!, baslangic: dk(5) },
    ];
    const baskaNo = (await o().sahip.tek<{ emir_no: string }>('SELECT emir_no FROM uretim_emri WHERE id = $1', [baska]))!.emir_no;
    const a = await oku(emir, [planlanan, ayrilmis, bos, ikinci, calisan, ayrilmis]);
    assert.equal(a.atanan, planlanan, 'planlı emirde atanan sıradaki iş emrinin makinesidir');
    assert.deepEqual(a.ayrimlar.map((x) => [x.makineId, x.baslangic]), [[ikinci, canli[4]!.baslangic], [ayrilmis, canli[1]!.baslangic]],
      'makine bir kez, ilk ayrımıyla; atanan, aynı emrin adımı ve başlamış iş yok');
    assert.deepEqual(a.ayrimlar[1], { makineId: ayrilmis, emirNo: baskaNo, opNo: 10, baslangic: canli[1]!.baslangic });
    assert.deepEqual(await oku(emir, []), { atanan: planlanan, ayrimlar: [] });
    for (const m of [ayrilmis, ikinci]) await assert.rejects(o().vt.tx((db) => emirBaslat(db, operator, emir, [m])), ayrildi, `seçicinin gösterdiği makine ${m}`);
    await o().vt.tx((db) => emirBaslat(db, operator, emir, [planlanan, bos, calisan]));
    await o().vt.tx((db) => emirDuraklat(db, operator, emir));
    const d = await oku(emir, [planlanan, ayrilmis]);
    assert.equal(d.atanan, planlanan, 'devamda atanan çalışan iş emrinin makinesidir');
    assert.deepEqual(d.ayrimlar.map((x) => x.makineId), [ayrilmis]);
    await assert.rejects(o().vt.tx((db) => emirDevam(db, operator, emir, [ayrilmis])), ayrildi);
    await o().vt.tx((db) => emirDevam(db, operator, emir, [bos]));
  });

  test('çözücü kayıtsızken ayrım yok; olmayan emir bulunamadı', async () => {
    const m = await makineKur(), d = await makineKur();
    const { uretimEmriId: emir } = await ac(m);
    const { isEmriIdleri: [j1] } = await ac(d);
    canli = [{ makineId: d, isEmriId: j1!, baslangic: dk(10) }];
    assert.equal((await oku(emir, [d])).ayrimlar.length, 1);
    planAyrimiCozucusu(null);
    try {
      assert.deepEqual(await oku(emir, [d]), { atanan: m, ayrimlar: [] });
    } finally {
      planAyrimiCozucusu(async (_db, makineIdleri) => canli.filter((x) => makineIdleri.includes(x.makineId)));
    }
    await assert.rejects(oku(2_000_000_000, [d]), (h: unknown) => h instanceof UygulamaHatasi && h.message === EMIR_YOK);
  });
});
