import { before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { PAROLA, planTestOrtami } from './plan-ortak.test.ts';

describe('plan (gerçek PostgreSQL): personel, vardiya ve takvim', () => {
  const { c, vt, istek, tamam, yeniAdim, isEmirleriAc, isEmriMakinesi, planOku, yer, tg, taslaktaOner, isEmriKomutu, taslagaYaz, tamGunMerkezi, durum } = planTestOrtami();
  // PL-ONAY: canlıya yalnız onaydaki taslak alınır; sahibi (varsayılan planlamacı) gönderir, onaydaki sürüm döner. Zaten onaydaysa yeniden
  // gönderilmez.
  const gonder = async (id: number, surum: number, sahip = c.planlama) => {
    const s = (await tamam<SenaryolarCevabi>(sahip, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  let makineA = 0;
  let makineB = 0;
  before(() => { ({ makineA, makineB } = durum()); });

  test('282 a (ADR 0018): planın personel kısıtı ayarı taslağa yazılır; ortak motor onu kullanmaz, iki makine yine aynı gün (fark Motor A listesinde)', async () => {
    const merkez = { id: await tamGunMerkezi('RT-IM282', 'Personel merkezi') };
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-282', ad: 'Deneme 282', isMerkeziId: merkez.id })).id;
    const m1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-M282A', ad: 'Deneme 282 A', istasyonId: ist })).id;
    const m2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-M282B', ad: 'Deneme 282 B', istasyonId: ist })).id;
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme personelci', kullaniciAdi: 'personelci', parola: PAROLA }));
    // Kişi %10 atanır: günde 144 kişi-dakikası; ilk iş (30 + 10 × 2 = 50 dk, operatör 3) 150 ister ve günü doldurur.
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/kisiler/ata`, { kisiId: kisi, yuzde: '10.00' });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/plan-ayari`, { verimYuzde: 100, operatorIhtiyaci: 3, surum: 0 });
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m1 } })]);
    const [i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m2 } })]);
    // Gün sonuna yakın koşuda ilk iş günün kalanına sığmaz ve iki iş de aynı güne düşerdi: an tesisin 09:00'ına sabitlenir.
    mock.timers.enable({ apis: ['Date'], now: tesisGunBasi(tesisGunu(Date.now())) + 9 * 3600_000 });
    try {
      let p = await taslaktaOner();
      const gun = (x: PlanCevabi, id: number) => tesisGunu(Date.parse(yer(x, id).baslangic));
      assert.equal(gun(p, i2!), gun(p, i1!), 'kısıt kapalıyken iki makine aynı gün');
      p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, personelKisiti: true } });
      p = await taslaktaOner(c.planlama, p);
      assert.equal(p.ayar.personelKisiti, true, 'ayar taslakta');
      // Motor A kişi-dakikası dolan günü atlıyordu; ortak motorun personel kısıtı planlama çalışmasının Kısıtlar ayarındadır (FARK.md).
      assert.equal(gun(p, i2!), gun(p, i1!), `ortak motor: ${gun(p, i1!)} / ${gun(p, i2!)}`);
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    } finally {
      mock.timers.reset();
    }
  });

  test('PL-03, PL-04, PL-09: vardiyalı makine yalnız çalışma aralığında çalışır; kişi kısıtı yükü; kapalı gün canlıya vardiya yetkisiyle yazılır', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM2', ad: 'Vardiyalı merkez', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-C', ad: 'Deneme C', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MC', ad: 'Deneme makine C', istasyonId: ist })).id;
    const v = await tamam<{ vardiyalar: { id: number; ad: string }[] }>(c.yonetici, 'POST', '/vardiyalar', { ad: 'RT sabah', baslangic: '08:00', bitis: '12:00', molalar: [], aktif: true });
    const vardiya = v.vardiyalar.find((x) => x.ad === 'RT sabah')!.id;
    for (let gun = 1; gun <= 7; gun++) await tamam(c.yonetici, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkez.id, gun, vardiyaId: vardiya, acik: true });
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme vardiyaci', kullaniciAdi: 'vardiyaci', parola: PAROLA }));
    // Kart #1324: kişi iş merkezinde istasyon atamasının yüzdesi kadar sayılır.
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/kisiler/ata`, { kisiId: kisi, yuzde: '50.00' });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist}/plan-ayari`, { verimYuzde: 100, operatorIhtiyaci: 10, surum: 0 });

    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })]);
    let p = await taslaktaOner();
    const y = yer(p, i1!);
    const bugun = tesisGunu(Date.now());
    const bitis = tesisGunu(Date.now() + 30 * 24 * 3600_000);
    const t = (await tamam<{ takvim: { araliklar: { baslangic: string; bitis: string }[] } }>(c.planlama, 'GET',
      `/calisma-takvimi?tur=makine&id=${makine}&baslangic=${bugun}&bitis=${bitis}`)).takvim.araliklar.map((a) => [Date.parse(a.baslangic), Date.parse(a.bitis)]);
    const [a, z] = [Date.parse(y.baslangic), Date.parse(y.bitis)];
    assert.ok(t.some(([x, w]) => x! <= a && a < w!), 'başlangıç vardiya içinde');
    const calisan = t.reduce((top, [x, w]) => top + Math.max(0, Math.min(w!, z) - Math.max(x!, a)), 0) / 60_000;
    assert.equal(Math.round(calisan), 30 + 10 * 2, 'süre yalnız çalışma aralıklarında geçer');
    // Z4: vardiya bitimine on dakika kala elle taşınan iş gece çalışmaz; kalan süresi ertesi vardiyada sürer.
    const [x0, w0] = t.find(([x]) => x! > Date.now() + 3600_000)!;
    const tasindi = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${i1!}/tasi`, {
      taslak: tg(p), kaynak: { tur: 'makine', id: makine }, baslangic: new Date(w0! - 10 * 60_000).toISOString(),
    });
    const [ta, tz] = [Date.parse(yer(tasindi, i1!).baslangic), Date.parse(yer(tasindi, i1!).bitis)];
    assert.equal(ta, w0! - 10 * 60_000);
    assert.ok(x0! < ta && tz > w0!, 'vardiya sonunu aşar');
    assert.equal(Math.round(t.reduce((top, [x, w]) => top + Math.max(0, Math.min(w!, tz) - Math.max(x!, ta)), 0) / 60_000), 50, 'yalnız çalışma aralığında 50 dakika');
    p = tasindi;

    // PL-09: iş merkezinde %50 atanmış bir kişi (240 dakikanın yarısı), istasyon on operatör ister: ihtiyaç kapasiteyi aşar; kısıt
    // kapalıyken sınırlı gün sayılmaz.
    const py = p.personelYuku.find((x) => x.isMerkeziId === merkez.id)!;
    assert.equal(Math.max(...py.kapasite), 120);
    assert.equal(py.ihtiyac.reduce((x, w) => x + w, 0), 500);
    assert.equal(p.gostergeler.personelGun, 0);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, personelKisiti: true } });
    assert.ok(p.gostergeler.personelGun! >= 1);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });


    // Tek tanım: makine ataması da kişi payıdır; %25 makineye atanan kişi kapasiteye 240 dakikanın çeyreğini ekler.
    const makineci = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme makineci', kullaniciAdi: 'makineci', parola: PAROLA }));
    await tamam(c.yonetici, 'POST', `/makineler/${makine}/kisiler/ata`, { kisiId: makineci, yuzde: '25.00' });
    p = await taslaktaOner();
    assert.equal(Math.max(...p.personelYuku.find((x) => x.isMerkeziId === merkez.id)!.kapasite), 180);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    // Kapalı gün denemesi: vardiya yazması olmayan kalite canlıya alamaz, müdür alır ve gün vardiya takvimine yazılır.
    let s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Kapalı gün', aciklama: null })).senaryolar.find((x) => x.ad === 'Kapalı gün')!;
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'gun', surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
    const tarih = s.degisiklikler.find((d) => d.tur === 'gun_kapat')!.ozet.slice(0, 10);
    {
      const r = await istek(c.kalite, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: await gonder(s.id, s.surum), cakismalariKabul: true });
      assert.equal(r.statusCode, 403);
      assert.match(r.body, /vardiya yazma yetkisi/);
    }
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: await gonder(s.id, s.surum), cakismalariKabul: true });
    const gunu = async (t: string) => (await tamam<{ gunler: { tarih: string; tur: string; ad: string | null }[] }>(c.planlama, 'GET', '/vardiya-takvimi')).gunler.find((g) => g.tarih === t);
    assert.deepEqual(await gunu(tarih), { tarih, tur: 'kapali', ad: 'Plan stüdyosu' });
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${tarih}/kaldir`);
    // O gün takvimde zaten tatilse üstüne yazılmaz.
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Tatilli gün', aciklama: null })).senaryolar.find((x) => x.ad === 'Tatilli gün')!;
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'gun', surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
    const tatil = s.degisiklikler.find((d) => d.tur === 'gun_kapat')!.ozet.slice(0, 10);
    await tamam(c.yonetici, 'POST', '/takvim-gunleri', { tarih: tatil, tur: 'kapali', ad: 'Deneme bayram' });
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: await gonder(s.id, s.surum), cakismalariKabul: true });
    assert.deepEqual(await gunu(tatil), { tarih: tatil, tur: 'kapali', ad: 'Deneme bayram' });
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${tatil}/kaldir`);
  });

  test('PL-04 (168 b, 650 a): vardiyası tanımlanmamış merkezin işi yerleşmez, nedeni ve uyarısı görünür; tam gün merkezde tatil günü çalışma vermez', async () => {
    const vardiyasiz = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM3', ad: 'Vardiyasız merkez', aciklama: null });
    const istV = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-D', ad: 'Deneme D', isMerkeziId: vardiyasiz.id })).id;
    const makineV = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MD', ad: 'Deneme makine D', istasyonId: istV })).id;
    const merkez = { id: await tamGunMerkezi('RT-IM3T', 'Tam gün merkezi') };
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-DT', ad: 'Deneme DT', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MDT', ad: 'Deneme makine DT', istasyonId: ist })).id;
    const yarin = tesisGunu(tesisGunBasi(tesisGunu(Date.now())) + 36 * 3600_000);
    await tamam(c.yonetici, 'POST', '/takvim-gunleri', { tarih: yarin, tur: 'kapali', ad: 'Deneme tatil' });
    const [i0] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineV } })]);
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })], 1000);
    const p = await taslaktaOner();
    assert.equal(p.yerlesimler.find((x) => x.isEmriId === i0), undefined, 'vardiyasız merkezin işi yerleşmez');
    assert.equal(p.yerlesmemis.find((x) => x.isEmriId === i0)?.neden, 'Tezgâhın vardiyası tanımsız.');
    assert.ok(p.uyarilar.some((u) => /vardiya takvimi yok; işleri yerleşmedi/.test(u)), JSON.stringify(p.uyarilar));
    const y = yer(p, i1!);
    assert.ok(Date.parse(y.baslangic) < tesisGunBasi(yarin), 'bugün başlar');
    assert.equal(Math.round((Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000), 30 + 1000 * 2 + 24 * 60, 'tatil günü atlanır');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${yarin}/kaldir`);
  });

  test('P-B24: tesiste gece yarısı geçmiş, UTC\'de dünkü günken plan günü tesis günüdür; tam gün merkezin kapalı günü tesisin 00:00\'ında başlar', async () => {
    const merkez = { id: await tamGunMerkezi('RT-IM4', 'Gece merkezi') };
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-E', ad: 'Deneme E', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-ME', ad: 'Deneme makine E', istasyonId: ist })).id;
    // Tesisin yarınki 00:30'u: bugünün gecesi geçmişte kalabilir; motor da tesiste başlangıç gününün 07:00'ından önce başlatmaz.
    const gece = tesisGunBasi(tesisGunu(Date.now())) + 24.5 * 3600_000;
    const gun = tesisGunu(gece);
    assert.notEqual(gun, new Date(gece).toISOString().slice(0, 10), 'an UTC\'de bir gün geride');
    const yarin = tesisGunu(tesisGunBasi(gun) + 36 * 3600_000);
    await tamam(c.yonetici, 'POST', '/takvim-gunleri', { tarih: yarin, tur: 'kapali', ad: 'Deneme tatil' });
    // 30 + 720 * 2 = 1470 dk: tesiste 00:30'da başlayan iş gün bitince 60 dk artar; artan dakika tatilden sonra işler.
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })], 720);
    mock.timers.enable({ apis: ['Date'], now: gece });
    try {
      const p = await taslaktaOner();
      assert.equal(p.gunler[0], gun);
      const y = yer(p, i1!);
      assert.equal(Date.parse(y.baslangic), gece);
      assert.equal(Math.round((Date.parse(y.bitis) - gece) / 60_000), 1470 + 24 * 60, 'tatil tesisin 00:00\'ından 24 saat');
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    } finally {
      mock.timers.reset();
    }
    await tamam(c.yonetici, 'POST', `/takvim-gunleri/${yarin}/kaldir`);
  });

  test('P-B15 karar a: yalnız plan.canliya-al olan müdür planlamacının taslağını canlıya alır; kaynak iş emrine yazılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i1!).baslangic) + 200 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    assert.equal(await isEmriMakinesi(i1!), makineA, 'taslak iş emrini değiştirmez');
    assert.equal((await taslagaYaz(c.mudur, tg(p), i1!)).statusCode, 403, 'müdür taslağa yazamaz');
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    assert.deepEqual(yer(await planOku(), i1!).kaynak, { tur: 'makine', id: makineB });
    assert.equal(await isEmriMakinesi(i1!), makineB);
  });
});
