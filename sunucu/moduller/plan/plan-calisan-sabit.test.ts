import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { AdimGirdisi } from '#paylasilan/sozlesme/rota.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 482 a: plan satırı olmayan çalışan adım motorda sabit iştir (terminalin makinesinde, gerçekleşen süresiyle). Motor onu görmezse ardılının
// fason beklemesi şimdiden başlar (bitiş her okumada saatle kayar) ve makine boş sayılır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): plan satırı olmayan çalışan adım sabit iştir', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, isEmriDurumu, durum } = planTestOrtami();
  let istasyonB = 0;
  let fasoncu = 0;
  before(async () => {
    ({ istasyonB } = durum());
    fasoncu = (await tamam<{ firma: { id: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme fasoncu', tur: 'tedarikci', fason: true })).firma.id;
  });
  const fasonAdim = (terminGun: number): AdimGirdisi =>
    yeniAdim({ ad: 'Deneme kaplama', kaynak: { tur: 'fason', id: fasoncu }, ayarSuresiDk: null, birimSureDk: null, terminGun });
  const makine = async (kod: string) => ({ tur: 'makine' as const, id: (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod, ad: `Deneme ${kod}`, istasyonId: istasyonB })).id });
  const motor = () => tamam<MotorYerlesimiCevabi>(c.planlama, 'GET', '/plan/motor-yerlesimi');
  const GUN_MS = 24 * 3600_000;

  test('PL-482: çalışan adım makinesinde şimdiye uzanır; fasondan sonraki adım onun bitişinden termin kadar sonra başlar; makineye başka iş binmez', async () => {
    const m1 = await makine('PL-482A');
    const m2 = await makine('PL-482B');
    const [calisan, , ardil] = await isEmirleriAc([yeniAdim({ kaynak: m1 }), fasonAdim(5), yeniAdim({ kaynak: m2 })]);
    const [baska] = await isEmirleriAc([yeniAdim({ kaynak: m1 })]);
    // Plan hiç önerilmedi ya da canlıya alınmadı: çalışan adımın plan satırı yok.
    await isEmriDurumu(calisan!, 'calisiyor');
    await vt().tx((db) => db.sorgu("UPDATE uretim_emirleri_is_emri SET baslama = now() - interval '10 minutes' WHERE id = $1", [calisan]));
    const r = await motor();
    const y = (id: number) => r.yerlesimler.find((x) => x.isEmriId === id);
    const c1 = y(calisan!), a = y(ardil!), b = y(baska!);
    assert.ok(c1 && a && b, JSON.stringify(r.yerlesimler.map((x) => x.isEmriId)));
    assert.equal(c1.sabit, true);
    assert.deepEqual(c1.kaynak, m1);
    const simdi = Date.parse(r.hesaplanma);
    assert.ok(Date.parse(c1.baslangic) <= simdi - 9 * 60_000, 'gerçek başlangıcından');
    // Kalan (ayar 30 + 10 x 2 dk, verim ve takvimle) son sayımdan, sayım yoksa başladığı andan sayılır.
    assert.ok(Date.parse(c1.bitis) > simdi, 'kalan süre şimdiden ileri');
    assert.ok(Date.parse(a.baslangic) >= Date.parse(c1.bitis) + 5 * GUN_MS - 1000, 'fason beklemesi çalışan adımın bitişinden sayılır');
    assert.ok(Date.parse(b.baslangic) >= Date.parse(c1.bitis) || Date.parse(b.bitis) <= Date.parse(c1.baslangic), 'çalışan işin makinesi dolu');
    assert.ok(r.ekranYerlesimi[`${c1.emirNo}|${String(c1.opNo)}`]?.some((e) => e.makineId === m1.id), 'ekran yerleşiminde çalışan iş');
    // Aynı veri her okumada aynı planı verir (kalan son sayımdan sayılır); ardılın başlangıcı saatle kaymaz.
    const r2 = await motor();
    assert.equal(r2.yerlesimler.find((x) => x.isEmriId === ardil)?.baslangic, a.baslangic);
  });
});
