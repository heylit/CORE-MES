import { describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import type { MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 481 a: motor yerleşiminde emrin teslime kalan bolluğu vardiya kapasitesi günüyle (eski Reçete ve Rota R.slack): bitiş, o gün başlayan
// vardiyanın dolan payıyla gün kesri olur; takvim saatiyle değil. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): tampon bolluğu vardiya kapasitesiyle (481 a)', () => {
  const { c, vt, istek, tamam, yeniAdim, isEmirleriAc, yururlugeAlinmisRota, planOku, durum } = planTestOrtami();
  const GUN_MS = 24 * 3600_000;
  const gunEkle = (gun: string, n: number) => new Date(Date.parse(`${gun}T00:00:00Z`) + n * GUN_MS).toISOString().slice(0, 10);

  test('PL-481: 08:00-12:00 vardiyasında 09:50 biten emir günün 110/240 kesrinde biter; teslimsiz emirde bolluk yok', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM481', ad: 'Bolluk merkezi', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-481', ad: 'Deneme 481', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-M481', ad: 'Deneme 481', istasyonId: ist })).id;
    const ikinci = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-M481B', ad: 'Deneme 481 B', istasyonId: ist })).id;
    const v = await tamam<{ vardiyalar: { id: number; ad: string }[] }>(c.yonetici, 'POST', '/vardiyalar', { ad: 'RT 481 sabah', baslangic: '08:00', bitis: '12:00', molalar: [], aktif: true });
    const vardiya = v.vardiyalar.find((x) => x.ad === 'RT 481 sabah')!.id;
    for (let gun = 1; gun <= 7; gun++) await tamam(c.yonetici, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkez.id, gun, vardiyaId: vardiya, acik: true });
    const bugun = tesisGunu(Date.now());
    const teslim = gunEkle(bugun, 2);
    const [teslimli] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })], 10, teslim);
    const [teslimsiz] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: ikinci } })]);
    // Ayar 30 + 10 x 2 = 50 dk: tesisin 09:00'ında başlar, 09:50'de biter.
    mock.timers.enable({ apis: ['Date'], now: tesisGunBasi(bugun) + 9 * 3600_000 });
    try {
      const r = await tamam<MotorYerlesimiCevabi>(c.planlama, 'GET', '/plan/motor-yerlesimi');
      const y = r.yerlesimler.find((x) => x.isEmriId === teslimli)!;
      assert.equal(Date.parse(y.bitis), tesisGunBasi(bugun) + (9 * 60 + 50) * 60_000);
      const e = r.emirler.find((x) => x.uretimEmriId === y.uretimEmriId)!;
      assert.equal(e.teslim, teslim);
      assert.equal(e.bitis, y.bitis);
      // Teslim günü sonu: bugün + 3; bitiş bugün + 110/240. Takvim saatiyle 2 + 14:10/24 = 2,59 olurdu.
      assert.ok(Math.abs(e.bollukGun! - (3 - 110 / 240)) < 1e-9, String(e.bollukGun));
      const ts = r.yerlesimler.find((x) => x.isEmriId === teslimsiz)!;
      assert.deepEqual(r.emirler.find((x) => x.uretimEmriId === ts.uretimEmriId), {
        uretimEmriId: ts.uretimEmriId, emirNo: ts.emirNo, teslim: null, bitis: ts.bitis, bollukGun: null, rotaEski: false, bolmeYazilamaz: [],
      });
    } finally {
      mock.timers.reset();
    }
  });

  test('PL-493: parçanın yazılacak adedi kayıtlı bölmeden; parçası bir adetten az kalan bölme yazılamaz; rotası değişen emir açıldığı rotada kalır', async () => {
    const { istasyonB } = durum();
    const makine = async (kod: string) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod, ad: `Deneme ${kod}`, istasyonId: istasyonB })).id;
    const [c1, c2] = [await makine('RT-M493A'), await makine('RT-M493B')];
    const [op10] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c1 } })], 10);
    const canli = await planOku();
    const bul = canli.yerlesimler.find((x) => x.isEmriId === op10) ?? canli.yerlesmemis.find((x) => x.isEmriId === op10)!;
    const isi = (parca: { no: number; adet: number }) => ({ emirNo: bul.emirNo, opNo: bul.opNo, dondurulmus: false, elle: false, parca });
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yazildi = await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [
      { kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi({ no: 1, adet: 4 })] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic, isler: [isi({ no: 2, adet: 6 })] },
    ] });
    assert.equal(yazildi.statusCode, 200, yazildi.body);
    const taslak = yazildi.json<{ taslak: number }>().taslak;
    const oku = () => tamam<MotorYerlesimiCevabi>(c.planlama, 'GET', `/plan/motor-yerlesimi?taslak=${String(taslak)}`);
    let r = await oku();
    const parcalar = () => r.yerlesimler.find((x) => x.isEmriId === op10)!.parcalar!.map((p) => [p.no, p.adet]);
    const emir = () => r.emirler.find((x) => x.uretimEmriId === bul.uretimEmriId)!;
    assert.deepEqual(parcalar(), [[1, 4], [2, 6]]);
    assert.deepEqual([emir().rotaEski, emir().bolmeYazilamaz], [false, []]);
    // Kayıtlı oran 1 / 999: adım adedine (10) dağıtınca ilk parça sıfır adet kalır.
    await vt().tx((db) => db.sorgu('UPDATE plan_senaryo_yerlesim_parcasi SET adet = CASE parca_no WHEN 1 THEN 1 ELSE 999 END WHERE senaryo_id = $1 AND is_emri_id = $2', [taslak, op10]));
    r = await oku();
    assert.deepEqual(parcalar(), [[1, null], [2, null]]);
    assert.deepEqual(emir().bolmeYazilamaz, [bul.opNo]);
    // Ürünün rotası yeni revizyonla yürürlüğe girer: emir eski revizyonda kalır.
    const urun = (await vt().tx((db) => db.tek<{ m: number }>('SELECT e.malzeme_no::int AS m FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = $1', [op10])))!.m;
    await yururlugeAlinmisRota(urun, [yeniAdim({ kaynak: { tur: 'makine', id: c1 } })]);
    r = await oku();
    assert.equal(emir().rotaEski, true);
  });
});
