import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanliYerlesimCevabi, OnizlemeCevabi, PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { KomutCevabi } from '#paylasilan/sozlesme/rota.ts';
import { canliOzeti, canliSira } from './disari.ts';
import { gunduzde } from './plan-saat.test.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

describe('plan (gerçek PostgreSQL): elle sıra, elle makine ve bölme', () => {
  const { c, vt, istek, tamam, mamulAc, yeniAdim, govdeye, ayrinti, taslakAc, kaydet, komut, yururlugeAlinmisRota, isEmirleriAc, planOku, yer, tg, taslaktaOner, isEmriKomutu, tamGunMerkezi, durum } = planTestOrtami();
  // PL-ONAY: canlıya yalnız onaydaki taslak alınır; sahibi (varsayılan planlamacı) gönderir, onaydaki sürüm döner. Zaten onaydaysa yeniden
  // gönderilmez.
  const gonder = async (id: number, surum: number, sahip = c.planlama) => {
    const s = (await tamam<SenaryolarCevabi>(sahip, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  let denemeProjeId = 0;
  let istasyonA = 0;
  let makineA = 0;
  let makineB = 0;
  before(() => { ({ denemeProjeId, istasyonA, makineA, makineB } = durum()); });

  test('elle sıra yalnız elle işaretli işte (kullanıcı kararı): ekranın kuyruk yazımı ötekileri elle saymaz; Planı kurda elle sıra kalır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const [i3] = await isEmirleriAc([yeniAdim()]);
    const canli = await planOku();
    const kaynak = { tur: 'makine' as const, id: makineB };
    const isi = (id: number, elle?: boolean) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, ...(elle === undefined ? {} : { elle }) };
    };
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak, baslangic, isler: [isi(i1!, false), isi(i2!, true), isi(i3!, false)] }],
    });
    const taslak = await planOku(yazildi.taslak);
    assert.deepEqual([i1!, i2!, i3!].map((id) => yer(taslak, id).elleSira), [null, 2, null], 'yalnız elle işaretli iş elle sıra alır');

    // Planı kur (ADR 0018): elle iş elle sırasını, yani kuyruktaki yerini korur; ötekiler elle sayılmaz. Motor A elle işi kuyruğun başına alıyordu.
    const oner = await taslaktaOner(c.planlama, taslak);
    assert.deepEqual([i1!, i2!, i3!].map((id) => yer(oner, id).elleSira), [null, 2, null]);
    const kuyrugu = oner.yerlesimler.filter((y) => y.kaynak.tur === 'makine' && y.kaynak.id === yer(oner, i2!).kaynak.id).sort((a, b) => Date.parse(a.baslangic) - Date.parse(b.baslangic));
    assert.equal(kuyrugu[1]?.isEmriId, i2, 'elle iş kuyruğun ikinci sırasında');

    // `elle` göndermeyen eski ekran: bütün işler eskisi gibi elle sayılır.
    const eski = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak, baslangic, isler: [isi(i3!), isi(i1!), isi(i2!)] }],
    });
    const eskiTaslak = await planOku(eski.taslak);
    assert.deepEqual([i3!, i1!, i2!].map((id) => yer(eskiTaslak, id).elleSira), [1, 2, 3]);
  });

  test('elle seçilen makine (kullanıcı onayı): toptan hesap işi o makinede tutar, yalnız saatini ayarlar; seçilmeyen iş rotadaki makineye döner', async () => {
    const makineA3 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MA3', ad: 'Deneme makine A3', istasyonId: istasyonA })).id;
    const urun = await mamulAc();
    const rota = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim()]);
    const ac = await tamam<{ uretimEmriId: number; isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rota}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null });
    const [s1, s2] = ac.isEmriIdleri;
    const canli = await planOku();
    const isi = (id: number, elleKaynak: boolean) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, elleKaynak };
    };
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA3 }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [isi(s1!, true), isi(s2!, false)] }],
    });
    let p = await planOku(yazildi.taslak);
    // Elle seçilmeyen makine yazımda rotadakine döner.
    assert.deepEqual([s1!, s2!].map((id) => [yer(p, id).kaynak.id, yer(p, id).elleKaynak]), [[makineA3, true], [makineA, false]]);

    p = await taslaktaOner(c.planlama, p);
    assert.deepEqual([s1!, s2!].map((id) => [yer(p, id).kaynak.id, yer(p, id).elleKaynak]), [[makineA3, true], [makineA, false]]);

    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const ozet = await vt().tx((db) => canliOzeti(db));
    const ozetIsi = (id: number) => ozet.kuyruklar.flatMap((q) => q.isler.map((x) => ({ ...x, makineId: q.makineId })))
      .find((x) => x.anahtar === `${yer(p, id).emirNo}|${yer(p, id).opNo}`);
    assert.deepEqual([ozetIsi(s1!)?.makineId, ozetIsi(s1!)?.elleKaynak], [makineA3, true]);
    assert.equal(ozetIsi(s2!)?.elleKaynak, false);
  });

  test('elle bölme (kart #1572): parçalar ayrı makinede, her biri ayarı öder; sonraki adım hepsini bekler; öner parçaları korur; canlı ve Terminal parçaları görür', async () => {
    const merkez = { id: await tamGunMerkezi('RT-BOL', 'Deneme bölme merkezi') };
    const istC = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BL', ad: 'Deneme bölme C', isMerkeziId: merkez.id })).id;
    const istD = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BM', ad: 'Deneme bölme D', isMerkeziId: merkez.id })).id;
    const c1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BL1', ad: 'Deneme C1', istasyonId: istC })).id;
    const c2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BL2', ad: 'Deneme C2', istasyonId: istC })).id;
    const d1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BM1', ad: 'Deneme D1', istasyonId: istD })).id;
    // Adet 10, ayar 30 dk, birim 2 dk: bütün iş 50 dk; 4 + 6 bölününce parçalar 38 ve 42 dk (her parça ayarı tam öder).
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c1 } }), yeniAdim({ kaynak: { tur: 'makine', id: d1 } })], 10);
    const canli = await planOku();
    const bul = (id: number) => canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
    const isi = (id: number, ek: Record<string, unknown> = {}) => ({ emirNo: bul(id).emirNo, opNo: bul(id).opNo, dondurulmus: false, elle: false, ...ek });
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yaz = (kuyruklar: unknown[]) => istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar });
    // Sonraki adımın kuyruğu ikinci parçanınkinden önce gelir: sınır yine bütün parçaların bitişidir.
    const bolunmus = (a1: number, a2: number, ek2: Record<string, unknown> = {}) => [
      { kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: a1 } })] },
      { kaynak: { tur: 'makine', id: d1 }, baslangic, isler: [isi(op20!)] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic, isler: [isi(op10!, { parca: { no: 2, adet: a2 }, ...ek2 })] },
    ];

    // Ret: adet toplamı adım adedi değil, tek parça, aynı parça iki kez, hem bölünmüş hem bütün.
    assert.equal((await yaz(bolunmus(4, 5))).statusCode, 400);
    assert.equal((await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: 10 } })] }])).statusCode, 400);
    assert.equal((await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: 5 } }), isi(op10!, { parca: { no: 1, adet: 5 } })] }])).statusCode, 400);
    assert.equal((await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!, { parca: { no: 1, adet: 5 } }), isi(op10!)] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic, isler: [isi(op10!, { parca: { no: 2, adet: 5 } })] }])).statusCode, 400);

    const yazildi = await yaz(bolunmus(4, 6, { elleKaynak: true }));
    assert.equal(yazildi.statusCode, 200, yazildi.body);
    let p = await planOku(yazildi.json<{ taslak: number }>().taslak);
    const sure = (x: { baslangic: string; bitis: string }) => (Date.parse(x.bitis) - Date.parse(x.baslangic)) / 60_000;
    const parcalar = () => yer(p, op10!).parcalar!.map((x) => ({ no: x.no, adet: x.adet, makine: x.kaynak.id, sure: sure(x) }));
    assert.deepEqual(parcalar(), [{ no: 1, adet: 4, makine: c1, sure: 38 }, { no: 2, adet: 6, makine: c2, sure: 42 }]);
    const zarf = yer(p, op10!);
    assert.equal(zarf.kaynak.id, c1, 'zarfın kaynağı ilk parçanın');
    assert.equal(Date.parse(zarf.bitis), Math.max(...zarf.parcalar!.map((x) => Date.parse(x.bitis))));
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= Date.parse(zarf.bitis), 'sonraki adım iki parçayı da bekler');
    assert.equal(yer(p, op20!).parcalar, undefined, 'bölünmemiş işte parça alanı yok');

    // Öner: parçalar korunur; elle seçilen makinedeki parça orada kalır, öteki rotadaki makineye; sonraki adım yine hepsini bekler.
    p = await taslaktaOner(c.planlama, p);
    assert.deepEqual(parcalar(), [{ no: 1, adet: 4, makine: c1, sure: 38 }, { no: 2, adet: 6, makine: c2, sure: 42 }]);
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= Math.max(...yer(p, op10!).parcalar!.map((x) => Date.parse(x.bitis))));

    // Canlıya alınca: Reçete şeridinin özetinde her parça kendi makinesinin kuyruğunda; Terminal'in okuduğu canlı sırada parçalar.
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const ozet = await vt().tx((db) => canliOzeti(db));
    const anahtar = `${bul(op10!).emirNo}|${bul(op10!).opNo}`;
    const ozetParcalari = ozet.kuyruklar.flatMap((q) => q.isler.filter((x) => x.anahtar === anahtar).map((x) => ({ makineId: q.makineId, parca: x.parca, elleKaynak: x.elleKaynak })));
    assert.deepEqual(ozetParcalari.sort((x, y) => x.parca!.no - y.parca!.no), [
      { makineId: c1, parca: { no: 1, adet: 4 }, elleKaynak: false }, { makineId: c2, parca: { no: 2, adet: 6 }, elleKaynak: true },
    ]);
    const sira = await vt().tx((db) => canliSira(db, [op10!]));
    assert.deepEqual(sira.yerlesimler[0]!.parcalar!.map((x) => [x.no, x.adet, x.kaynak.id]), [[1, 4, c1], [2, 6, c2]]);
    const cy = await tamam<CanliYerlesimCevabi>(c.cam, 'GET', `/plan/canli-yerlesim?isEmirleri=${op10}`);
    assert.deepEqual(cy.yerlesimler[0]!.parcalar!.map((x) => x.kaynak.id), [c1, c2]);

    // Yeni taslak canlının parçalarını taşır; plan modülünün tek iş taşıma ucu bölünmüş işi reddeder; parçasız yazım birleştirir.
    const birlesik = await yaz([{ kaynak: { tur: 'makine', id: c1 }, baslangic, isler: [isi(op10!)] }]);
    assert.equal(birlesik.statusCode, 200, birlesik.body);
    const b2 = await planOku(birlesik.json<{ taslak: number }>().taslak);
    assert.equal(yer(b2, op10!).parcalar, undefined, 'parçasız yazılan iş birleşir');
    assert.equal(sure(yer(b2, op10!)), 50);
    const t2 = await taslaktaOner();
    assert.equal(yer(t2, op10!).parcalar?.length, 2, 'canlıdan açılan taslak parçaları taşır');
    assert.equal((await isEmriKomutu(t2, op10!, 'tasi', { kaynak: { tur: 'makine', id: c2 }, baslangic })).statusCode, 409);
    const sirala = await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(t2), kaynak: { tur: 'makine', id: c1 }, isEmriIdleri: [op10] });
    assert.equal(sirala.statusCode, 409, sirala.body);
    const parcaEkle = (adet: number) => vt().tx((db) => db.sorgu(
      "INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet, makine_id, baslangic, bitis) VALUES ($1, 3, $2, $3, now(), now() + interval '1 hour')", [op10, adet, c1]));
    await assert.rejects(parcaEkle(0), /plan_yerlesim_parcasi_adet/);
    await parcaEkle(1);
    await vt().tx((db) => db.sorgu('DELETE FROM plan_yerlesim_parcasi WHERE is_emri_id = $1 AND parca_no = 3', [op10]));
  });

  test('elle bölme kalıcıdır (kart #1572, 671 a): bölünmüş iş ortak motorda sabittir, makineleri kapansa da parçalarıyla yerinde kalır; yersiz bölme canlıda durur, parçalarıyla yeniden yazılır', async () => {
    const merkez = { id: await tamGunMerkezi('RT-BK', 'Deneme kalıcı bölme merkezi') };
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BK', ad: 'Deneme kalıcı bölme', isMerkeziId: merkez.id })).id;
    const makine = async (kod: string) => tamam<{ id: number; surum: number }>(c.yonetici, 'POST', '/makineler', { kod, ad: `Deneme ${kod}`, istasyonId: ist });
    const m = [await makine('RT-BK1'), await makine('RT-BK2')];
    const aktif = async (deger: boolean) => {
      for (const [n, x] of m.entries()) {
        const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/makineler/${x.id}/guncelle`, { kod: `RT-BK${n + 1}`, ad: `Deneme RT-BK${n + 1}`, istasyonId: ist, aktif: deger, surum: x.surum });
        x.surum = r.surum;
      }
    };
    const [op10] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m[0]!.id } })], 10);
    const canli = await planOku();
    const y0 = canli.yerlesimler.find((x) => x.isEmriId === op10) ?? canli.yerlesmemis.find((x) => x.isEmriId === op10)!;
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const parca = (n: number, adet: number) => ({ kaynak: { tur: 'makine', id: m[n - 1]!.id }, baslangic,
      isler: [{ emirNo: y0.emirNo, opNo: y0.opNo, dondurulmus: false, elle: false, parca: { no: n, adet } }] });
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [parca(1, 4), parca(2, 6)] });
    let p = await planOku(yazildi.taslak);
    const parcalar = (x: PlanCevabi) => yer(x, op10!).parcalar?.map((r) => [r.no, r.adet, r.baslangic, r.bitis]);
    const once = parcalar(p);
    assert.equal(once?.length, 2);

    // Makineler kapanır; aynı taslağa başka iş yazılır. Bölünmüş iş motora sabit gider (671 a, kural 2): parçaları yerinde kalır.
    await aktif(false);
    const [baska] = await isEmirleriAc([yeniAdim()]);
    const yb = p.yerlesmemis.find((x) => x.isEmriId === baska) ?? (await planOku(p.taslak!.id)).yerlesmemis.find((x) => x.isEmriId === baska)!;
    await tamam(c.planlama, 'POST', '/plan/kuyruklari-yaz', { taslak: tg(p),
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic, isler: [{ emirNo: yb.emirNo, opNo: yb.opNo, dondurulmus: false, elle: false }] }] });
    p = await planOku(p.taslak!.id);
    assert.deepEqual(parcalar(p), once, 'bölme yerinde');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    await aktif(true);

    // Yersiz bölme (Motor A'nın yerleştiremediği bölünmüş iş; eski veride kalabilir) canlıda bölmesiyle ve nedeniyle görünür.
    await vt().tx((db) => db.sorgu('INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet) VALUES ($1, 1, 4), ($1, 2, 6)', [op10]));
    const yersiz = (await planOku()).yerlesmemis.find((x) => x.isEmriId === op10);
    assert.deepEqual(yersiz?.bolme, [{ no: 1, adet: 4 }, { no: 2, adet: 6 }]);
    assert.equal(yersiz?.neden, 'Bölünmüş; parçalar yerleşmedi, bölme duruyor.');
    const ozet = await vt().tx((db) => canliOzeti(db));
    const anahtar = `${y0.emirNo}|${y0.opNo}`;
    assert.deepEqual(ozet.yersizBolmeler?.find((x) => x.anahtar === anahtar)?.parcalar, [{ no: 1, adet: 4 }, { no: 2, adet: 6 }], 'Reçete şeridi yersiz bölmeyi görür');
    assert.equal(ozet.adetler?.[anahtar], 10, 'parça adetlerinin toplanacağı adım adedi');

    // Parçalarıyla yeniden yazılır ve canlıya alınır.
    const yeniden = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [parca(1, 4), parca(2, 6)] });
    p = await planOku(yeniden.taslak);
    assert.deepEqual(yer(p, op10!).parcalar!.map((x) => [x.no, x.adet]), [[1, 4], [2, 6]]);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    assert.deepEqual(yer(await planOku(), op10!).parcalar!.map((x) => x.adet), [4, 6]);
  });

  test('elle bölme hurdalı adımda (kart #1572): parça adetleri adım adedine (önceki adımın sağlamı) eşit olur; emir adedi reddedilir; canlı özet adım adedini verir', async () => {
    const merkez = { id: await tamGunMerkezi('RT-BH', 'Deneme hurdalı bölme merkezi') };
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BH', ad: 'Deneme hurdalı bölme', isMerkeziId: merkez.id })).id;
    const h1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BH1', ad: 'Deneme RT-BH1', istasyonId: ist })).id;
    const h2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BH2', ad: 'Deneme RT-BH2', istasyonId: ist })).id;
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: h1 } }), yeniAdim({ kaynak: { tur: 'makine', id: h1 } })], 10);
    // OP10 10 adetten 8 sağlamla bitti: OP20'nin adedi 8.
    await vt().tx((db) => db.sorgu(
      "UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '1 hour', bitis = now(), saglam_adet = 8 WHERE id = $1", [op10]));
    const canli = await planOku();
    const y = canli.yerlesimler.find((x) => x.isEmriId === op20) ?? canli.yerlesmemis.find((x) => x.isEmriId === op20)!;
    const anahtar = `${y.emirNo}|${y.opNo}`;
    assert.equal((await vt().tx((db) => canliOzeti(db))).adetler?.[anahtar], 8, 'canlı özet adım adedini verir');
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yaz = (a1: number, a2: number) => istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [
      { kaynak: { tur: 'makine', id: h1 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 1, adet: a1 } }] },
      { kaynak: { tur: 'makine', id: h2 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 2, adet: a2 } }] },
    ] });
    const red = await yaz(5, 5);
    assert.equal(red.statusCode, 400, 'emir adedi (10) adım adedi değil');
    assert.match(red.body, /toplamı 8/);
    const kabul = await yaz(3, 5);
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.deepEqual(yer(await planOku(kabul.json<{ taslak: number }>().taslak), op20!).parcalar!.map((x) => x.adet), [3, 5]);
  });

  test('elle bölme sonra hurda (671 a): önceki adım daha az sağlamla bitince bölünmüş iş sabit kalır; parçaların süresi ve yazılı adetleri değişmez', async () => {
    await gunduzde(async () => {
      const merkez = { id: await tamGunMerkezi('RT-BU', 'Deneme bölme uzlaşma merkezi') };
      const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-BU', ad: 'Deneme bölme uzlaşma', isMerkeziId: merkez.id })).id;
      const u1 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BU1', ad: 'Deneme RT-BU1', istasyonId: ist })).id;
      const u2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-BU2', ad: 'Deneme RT-BU2', istasyonId: ist })).id;
      const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: u1 } }), yeniAdim({ kaynak: { tur: 'makine', id: u1 } })], 10);
      const canli = await planOku();
      const y = canli.yerlesimler.find((x) => x.isEmriId === op20) ?? canli.yerlesmemis.find((x) => x.isEmriId === op20)!;
      const baslangic = new Date(Date.now() + 3600_000).toISOString();
      // Saat sabit (kart 733): canlıya alma OP10'u motorla şimdiden yeniden dizer (motor dakikayı aşağı yuvarlar), bölünmüş OP20 sabit
      // kalır; yazım ile canlıya alma arasında dakika dönerse OP10 OP20'den sonra biter ve sıraya aykırı diye reddedilirdi.
      const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar: [
        { kaynak: { tur: 'makine', id: u1 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 1, adet: 4 } }] },
        { kaynak: { tur: 'makine', id: u2 }, baslangic, isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false, parca: { no: 2, adet: 6 } }] },
      ] });
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${yazildi.taslak}/canliya-al`, { surum: await gonder(yazildi.taslak, (await planOku(yazildi.taslak)).taslak!.surum), cakismalariKabul: false });
      // OP10 10 adetten 8 sağlamla bitti; bölme 10 adetle yazılmıştı.
      await vt().tx((db) => db.sorgu(
        "UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = $2, bitis = $3, saglam_adet = 8 WHERE id = $1",
        [op10, new Date(Date.now() - 3600_000), new Date()]));
      const p = await taslaktaOner();
      const sure = (x: { baslangic: string; bitis: string }) => (Date.parse(x.bitis) - Date.parse(x.baslangic)) / 60_000;
      // Ayar 30 + adet x 2 dk. Bölünmüş iş ortak motora sabit gider (671 a, kural 2): Planı kur parça süresini adım adedine (8/10) göre
      // kısaltmaz (Motor A 36,4 ve 39,6 dk verirdi); parçalar yazıldıkları süre ve adetle kalır (FARK.md).
      assert.deepEqual(yer(p, op20!).parcalar!.map((x) => [x.no, x.adet, Math.round(sure(x) * 10) / 10]), [[1, 4, 38], [2, 6, 42]]);
    });
  });

  test('elle sıra rota değişince (kullanıcı kararı): aynı istasyonda makine değişirse kalır; istasyon değişir ya da adım kalkarsa düşer ve uyarılır', async () => {
    const makineA2 = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MA2', ad: 'Deneme makine A2', istasyonId: istasyonA })).id;
    const urun = await mamulAc();
    const ilkRota = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim(), yeniAdim()]);
    const ac = await tamam<{ uretimEmriId: number; isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${ilkRota}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null });
    const [s1, s2, s3] = ac.isEmriIdleri;
    // 248 a: önceki testlerin canlı işleri 4 saatin dışına alınır; kuyruk onların önüne yazılır.
    await vt().tx(async (db) => {
      for (const t of ['plan_yerlesimi', 'plan_yerlesim_parcasi']) await db.sorgu(`UPDATE ${t} SET baslangic = baslangic + interval '1 day', bitis = bitis + interval '1 day'`);
    });
    const canli = await planOku();
    const isi = (id: number) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: true };
    };
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [isi(s1!), isi(s2!), isi(s3!)] }],
    });
    let p = await planOku(yazildi.taslak);
    assert.deepEqual([s1!, s2!, s3!].map((id) => yer(p, id).elleSira), [1, 2, 3]);
    assert.deepEqual(p.elleSiraDusenler, []);

    // Yeni rota: OP 10 aynı istasyonun öteki makinesine, OP 20 B istasyonuna geçer, OP 30 kalkar; emre uygulanır.
    const yeni = (await taslakAc(urun, { tur: 'revizyon', revizyonId: ilkRota })).json<KomutCevabi>().id;
    const adimlar = (await ayrinti(yeni)).adimlar.map(govdeye);
    const k = await kaydet(yeni, 1, [{ ...adimlar[0]!, kaynak: { tur: 'makine', id: makineA2 } }, { ...adimlar[1]!, kaynak: { tur: 'makine', id: makineB } }]);
    assert.equal(k.statusCode, 200, k.body);
    const g = await komut(yeni, 'onaya-gonder', { surum: k.json<KomutCevabi>().surum }, c.planlama);
    assert.equal((await komut(yeni, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur)).statusCode, 200);
    await tamam(c.planlama, 'POST', `/rota/emirler/${ac.uretimEmriId}/yururlukteki-rotayi-uygula`, {});
    p = await planOku(yazildi.taslak);
    const op = (id: number) => canli.yerlesimler.find((x) => x.isEmriId === id)?.opNo ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!.opNo;
    assert.equal(yer(p, s1!).elleSira, 1, 'aynı istasyonda makine değişince elle sıra kalır');
    assert.equal(yer(p, s2!).elleSira, null, 'istasyon değişince elle sıra düşer');
    assert.deepEqual(p.elleSiraDusenler, [
      { isEmriId: s2, emirNo: yer(p, s2!).emirNo, opNo: op(s2!), neden: 'istasyon', eskiIstasyon: 'RT-A', yeniIstasyon: 'RT-B' },
      { isEmriId: s3, emirNo: null, opNo: null, neden: 'rotadan-kalkti', eskiIstasyon: 'RT-A', yeniIstasyon: null },
    ]);
    assert.ok(p.uyarilar.includes(`Elle sıra düştü: ${yer(p, s2!).emirNo} OP ${op(s2!)}, istasyon RT-A -> RT-B.`), p.uyarilar.join('\n'));
    assert.ok(p.uyarilar.includes('Elle sıra düştü: RT-A kuyruğundaki bir adım rotadan kalktı.'));

    // Planı kur (ADR 0018) kuyrukları yeniden yazar, yani yeniden sıralar: yeni kuyruğuna yazılan işin (s2) düşme kaydı kapanır; rotadan
    // kalkan adımın kaydı (kuyrukta işi yok) planlamacı bakana dek kalır. Motor A'nın önerisi kuyruk yazmadığı için ikisi de kalıyordu.
    p = await taslaktaOner(c.planlama, p);
    assert.equal(yer(p, s1!).elleSira, 1);
    assert.equal(yer(p, s2!).elleSira, null);
    assert.deepEqual(p.elleSiraDusenler?.map((x) => [x.isEmriId, x.neden]), [[s3, 'rotadan-kalkti']]);

    // Canlı özet de düşen elle sırayı elle saymaz; ekran qorder'ını buradan kurar.
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const ozet = await vt().tx((db) => canliOzeti(db));
    const ozetIsi = (id: number) => ozet.kuyruklar.flatMap((q) => q.isler).find((x) => x.anahtar === `${yer(p, id).emirNo}|${op(id)}`);
    assert.equal(ozetIsi(s1!)?.elle, true);
    assert.equal(ozetIsi(s2!)?.elle, false);
  });

  test('emir önizlemesi: yeni emrin bitişi, önerilen teslim, etkilenen emirler; hiçbir şey yazılmaz; yetkisiz ve yürürlükte olmayan rota reddedilir', async () => {
    await isEmirleriAc([yeniAdim()]);
    const urun = await mamulAc();
    const rev = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const canli = await planOku();
    const emirSayisi = (await tamam<{ emirler: unknown[] }>(c.planlama, 'GET', '/adimli-emirler')).emirler.length;
    const sorgu = (r: number) => `/plan/onizle?${new URLSearchParams({ revizyonId: String(r), adet: '20', oncelik: '1', teslim: '2020-01-01' }).toString()}`;
    const o = await tamam<OnizlemeCevabi>(c.planlama, 'GET', sorgu(rev));
    assert.equal(o.odak.isSayisi, 2);
    assert.equal(o.odak.yerlesen, 2);
    assert.ok(o.odak.bitis && o.odak.onerilenTeslim && o.odak.onerilenTeslim >= o.odak.bitis.slice(0, 10));
    const yeni = o.etkilenenEmirler.find((e) => e.yeni)!;
    assert.equal(yeni.emirNo, 'Yeni emir');
    assert.equal(yeni.gecikiyor, true, 'geçmiş teslim gecikir');
    assert.ok(o.sonra.geciken >= o.once.geciken + 1);
    assert.ok(o.yeniUyarilar.some((u) => u.startsWith('Yeni emir')));
    assert.deepEqual((await planOku()).yerlesimler, canli.yerlesimler, 'canlı değişmez');
    assert.equal((await tamam<{ emirler: unknown[] }>(c.planlama, 'GET', '/adimli-emirler')).emirler.length, emirSayisi, 'emir açılmaz');
    assert.equal((await istek(c.operator, 'GET', sorgu(rev))).statusCode, 403);
    assert.equal((await istek(c.kalite, 'GET', sorgu(rev))).statusCode, 200, 'yalnız emre kopyalama yetkisi yeter');
    assert.equal((await istek(c.cam, 'GET', sorgu(rev))).statusCode, 200, 'yalnız plan yazma yetkisi yeter');
    const taslakRev = (await taslakAc(await mamulAc())).json<KomutCevabi>().id;
    assert.equal((await istek(c.planlama, 'GET', sorgu(taslakRev))).statusCode, 422);
  });
});
