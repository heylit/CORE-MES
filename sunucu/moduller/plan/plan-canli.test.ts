import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import type { CanliYerlesimCevabi, PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { AdimGirdisi } from '#paylasilan/sozlesme/rota.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { canliOzeti, canliSira, kuyruguSirala } from './disari.ts';
import { menuSayaclari } from './servis.ts';
import type { FastifyInstance } from 'fastify';
import { planTestOrtami } from './plan-ortak.test.ts';

describe('plan (gerçek PostgreSQL): canlı sıra ve kuyruk yazımı', () => {
  const { c, vt, istek, tamam, yeniAdim, ayrinti, isEmirleriAc, planOku, yer, tg, taslaktaOner, isEmriKomutu, durum } = planTestOrtami();
  // PL-ONAY: canlıya yalnız onaydaki taslak alınır; sahibi (varsayılan planlamacı) gönderir, onaydaki sürüm döner. Zaten onaydaysa yeniden
  // gönderilmez.
  const gonder = async (id: number, surum: number, sahip = c.planlama) => {
    const s = (await tamam<SenaryolarCevabi>(sahip, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  let app: FastifyInstance;
  let makineA = 0;
  let makineB = 0;
  before(() => { ({ app, makineA, makineB } = durum()); });

  test('A4: canlı sıra iş emri kimliğiyle okunur; başlangıç sırasıyla, taslaktaki değişiklik ve yerleşmemiş iş görünmez', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const canli = await planOku();
    const okunan = await vt().tx((db) => canliSira(db, [i2!, i1!, 999_999]));
    assert.equal(okunan.planSurumu, canli.surum);
    assert.deepEqual(okunan.yerlesimler.map((y) => y.isEmriId), [i1, i2], 'başlangıç sırasıyla; yerleşmemiş iş yok');
    const y1 = okunan.yerlesimler[0]!;
    assert.deepEqual(y1.kaynak, yer(canli, i1!).kaynak);
    assert.equal(y1.baslangic.toISOString(), new Date(yer(canli, i1!).baslangic).toISOString());
    assert.equal(y1.elleSira, null);
    // Taslaktaki taşıma canlı sırayı değiştirmez (P6).
    p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i1!).baslangic) + 200 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    assert.deepEqual((await vt().tx((db) => canliSira(db, [i1!]))).yerlesimler[0]!.kaynak, y1.kaynak);
    assert.deepEqual(await vt().tx((db) => canliSira(db, [])), { planSurumu: canli.surum, yerlesimler: [] });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('280 a: planı, canlı yerleşimi ve senaryoları yalnız planı gören ya da yazan okur; sürüm oturumlu; sayaç göremeyene boş', async () => {
    for (const yol of ['/plan', '/plan/canli-yerlesim?isEmirleri=', '/plan/senaryolar']) {
      assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403, `${yol} operatöre kapalı`);
      for (const kim of [c.cam, c.kalite, c.planlama]) assert.equal((await istek(kim, 'GET', yol)).statusCode, 200, yol);
    }
    assert.equal((await istek(c.operator, 'GET', '/plan/surum')).statusCode, 200, 'açık ekranların sürüm sorusu oturumlu');
    const k = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!;
    const gormez = { ...k, islemler: k.islemler.filter((i) => i !== 'plan.oku' && i !== 'plan.yaz') };
    const say = await vt().tx(async (db) => [await menuSayaclari(db, k), await menuSayaclari(db, gormez)]);
    assert.equal(typeof say[0]!.plan, 'number');
    assert.deepEqual([say[1]!.plan, say[1]!.studyo], [null, null], 'planı göremeyen plan ve stüdyo sayacı almaz');
  });

  test('#522: GET /plan/canli-yerlesim planı görenle canlı yerleşimi okur, taslağı göstermez; oturumsuz 401, bozuk liste 400', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const canli = await planOku();
    const oku = () => tamam<CanliYerlesimCevabi>(c.cam, 'GET', `/plan/canli-yerlesim?isEmirleri=${i1},999999`);
    const once = await oku();
    assert.equal(once.planSurumu, canli.surum);
    assert.equal(once.yerlesimler.length, 1, 'yerleşmemiş iş listede yok');
    assert.deepEqual(once.yerlesimler[0]!.kaynak, yer(canli, i1!).kaynak);
    assert.equal(Date.parse(once.yerlesimler[0]!.baslangic), Date.parse(yer(canli, i1!).baslangic));
    assert.equal(Date.parse(once.yerlesimler[0]!.bitis), Date.parse(yer(canli, i1!).bitis));
    p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i1!).baslangic) + 200 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    assert.deepEqual(await oku(), once, 'taslaktaki taşıma görünmez (P6)');
    assert.deepEqual(await tamam<CanliYerlesimCevabi>(c.cam, 'GET', '/plan/canli-yerlesim?isEmirleri='), { planSurumu: canli.surum, yerlesimler: [] });
    assert.equal((await app.inject({ method: 'GET', url: `/api/plan/canli-yerlesim?isEmirleri=${i1}` })).statusCode, 401);
    assert.equal((await istek(c.cam, 'GET', '/plan/canli-yerlesim?isEmirleri=1,x')).statusCode, 400);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('A4: başka ekrandan sıralama kişinin taslağına yazılır, canlı müdür alınca değişir; yetkisiz, eski sürüm, kilitli ve boş reddedilir', async () => {
    const kullanici = async (cerez: string) => (await kimlikCozucu(vt())({ headers: { cookie: cerez } } as never))!;
    const planlamaci = await kullanici(c.planlama);
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const once = await vt().tx((db) => canliSira(db, [i1!, i2!]));
    assert.deepEqual(once.yerlesimler.map((y) => y.isEmriId), [i1, i2]);
    const kaynak = once.yerlesimler[0]!.kaynak;
    assert.deepEqual(once.yerlesimler[1]!.kaynak, kaynak, 'iki iş aynı kuyrukta');
    const yaz = (k: Awaited<ReturnType<typeof kullanici>>, idler: number[], planSurumu = once.planSurumu) =>
      vt().tx((db) => kuyruguSirala(db, k, { kaynak, isEmriIdleri: idler, planSurumu }));

    const ilk = await yaz(planlamaci, [i2!, i1!]);
    assert.equal(ilk.taslakAcildi, true);
    assert.deepEqual((await vt().tx((db) => canliSira(db, [i1!, i2!]))).yerlesimler.map((y) => y.isEmriId), [i1, i2], 'canlı değişmez (P6)');
    const taslak = await planOku(ilk.taslakId);
    assert.ok(Date.parse(yer(taslak, i2!).baslangic) < Date.parse(yer(taslak, i1!).baslangic), 'taslakta yeni sıra');
    assert.equal(yer(taslak, i2!).elleSira, 1);
    const ikinci = await yaz(planlamaci, [i2!, i1!]);
    assert.deepEqual(ikinci, { taslakId: ilk.taslakId, taslakAcildi: false }, 'açık taslak yeniden kullanılır');

    // Ret: plan yazma yetkisi yok, okunan canlı plan eski, boş ya da yinelenen liste, kilitli iş.
    await assert.rejects(yaz(await kullanici(c.kalite), [i2!, i1!]), { kod: 'YETKI_YOK' });
    await assert.rejects(yaz(planlamaci, [i2!, i1!], once.planSurumu - 1), { kod: 'CAKISMA', ayrinti: { neden: ESKI_SURUM_NEDENI } });
    await assert.rejects(yaz(planlamaci, []), { kod: 'DOGRULAMA' });
    await assert.rejects(yaz(planlamaci, [i1!, i1!]), { kod: 'DOGRULAMA' });
    const t = await planOku(ilk.taslakId);
    assert.equal((await isEmriKomutu(t, i1!, 'kilitle')).statusCode, 200);
    await assert.rejects(yaz(planlamaci, [i1!, i2!]), { kod: 'CAKISMA' });

    const s = await planOku(ilk.taslakId);
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.taslak!.id}/canliya-al`, { surum: await gonder(s.taslak!.id, s.taslak!.surum), cakismalariKabul: true });
    assert.deepEqual((await vt().tx((db) => canliSira(db, [i1!, i2!]))).yerlesimler.map((y) => y.isEmriId), [i2, i1], 'canlıya alınınca yeni sıra');
  });

  test('Reçete ve Rota kuyrukları (#1186): sıra ve atama taslağa yazılır, taslak canlıya alınınca canliSira aynı sırayı verir; yetki, sabit iş ve ret', async () => {
    // Kuyruğun makinesi rotadaki istasyonda: elle seçilen makine yalnız rota istasyonunda tutulur (276 a, yazımdan sonra motor önerir).
    const b = (): AdimGirdisi => yeniAdim({ kaynak: { tur: 'makine', id: makineB } });
    const [i1] = await isEmirleriAc([b()]);
    const [i2] = await isEmirleriAc([b()]);
    const [i3] = await isEmirleriAc([b()]);
    const hepsi = [i1!, i2!, i3!];
    const ilk = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${ilk.taslak!.id}/canliya-al`, { surum: await gonder(ilk.taslak!.id, ilk.taslak!.surum), cakismalariKabul: true });
    const canli = await planOku();
    const kaynak = { tur: 'makine' as const, id: makineB };
    const ad = (id: number) => ({ emirNo: yer(canli, id).emirNo, opNo: yer(canli, id).opNo });
    const isler = (idler: number[], dondurulmus = false) => idler.map((id) => ({ ...ad(id), dondurulmus }));
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/plan/kuyruklari-yaz', govde);
    // Yayın yalnız taslağın canlıya alınmasıyla olur (Y2): önce kuyruk taslağa, sonra taslak canlıya.
    const canliyaYaz = async (cerez: string, govde: Record<string, unknown>) => {
      const yazma = await yaz(cerez, govde);
      if (yazma.statusCode !== 200) return { yazma, canliya: yazma };
      const id = yazma.json<{ taslak: number }>().taslak;
      // PL-ONAY: yazan önce onaya gönderir; gönderemeyen (stüdyo yetkisi yok) canlıya da alamaz.
      const gonderme = await istek(cerez, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum: (await planOku(id, cerez)).taslak!.surum });
      if (gonderme.statusCode !== 200) return { yazma, canliya: gonderme };
      const surum = gonderme.json<SenaryolarCevabi>().senaryolar.find((x) => x.id === id)!.surum;
      return { yazma, canliya: await istek(cerez, 'POST', `/plan/senaryolar/${id}/canliya-al`, { surum, cakismalariKabul: false }) };
    };
    const sira = async () => (await vt().tx((db) => canliSira(db, hepsi))).yerlesimler;

    // Taslağa yazma: canlı değişmez; planlamacı kendi taslağını görür.
    const taslagaYazildi = await yaz(c.cam, { kuyruklar: [{ kaynak, baslangic, isler: isler([i3!, i1!, i2!]) }] });
    assert.equal(taslagaYazildi.statusCode, 200, taslagaYazildi.body);
    assert.deepEqual(taslagaYazildi.json(), { taslak: taslagaYazildi.json<{ taslak: number }>().taslak, canli: false, yazilan: 3, atlanan: 0, motorFarki: [] });
    const onceki = (await sira()).map((y) => y.isEmriId);
    const taslak = await planOku(taslagaYazildi.json<{ taslak: number }>().taslak, c.cam);
    assert.deepEqual([i3!, i1!, i2!].map((id) => yer(taslak, id).elleSira), [1, 2, 3]);
    assert.deepEqual([i3!, i1!, i2!].every((id) => yer(taslak, id).kaynak.id === makineB), true);

    // Eski köprünün ayar ve canlıya alma alanları yok sayılır: kuyruk yalnız taslağa yazılır, canlı ve ayar değişmez.
    const ilkAyar = (await planOku()).ayar;
    const eskiKopru = await yaz(c.planlama, { ayar: { ...ilkAyar, kural: 'fifo' }, canliyaAl: true, kuyruklar: [{ kaynak, baslangic, isler: isler([i2!, i3!, i1!]) }] });
    assert.equal(eskiKopru.statusCode, 200, eskiKopru.body);
    assert.equal(eskiKopru.json<{ canli: boolean }>().canli, false);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), onceki, 'canlı değişmez');
    assert.deepEqual((await planOku()).ayar, ilkAyar, 'canlı ayar değişmez');
    assert.deepEqual((await planOku(eskiKopru.json<{ taslak: number }>().taslak)).ayar, ilkAyar, 'taslağın ayarı değişmez');

    // Taslak canlıya alınınca terminal sırayı canliSira'dan aynı sırayla okur.
    const canliya = await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i2!, i3!, i1!]) }] });
    assert.equal(canliya.canliya.statusCode, 200, canliya.canliya.body);
    assert.equal(canliya.yazma.json<{ yazilan: number }>().yazilan, 3);
    const yeni = await sira();
    assert.deepEqual(yeni.map((y) => y.isEmriId), [i2, i3, i1]);
    assert.deepEqual(yeni.map((y) => y.elleSira), [1, 2, 3]);
    assert.deepEqual(yeni.every((y) => y.kaynak.tur === 'makine' && y.kaynak.id === makineB), true);
    assert.notDeepEqual(onceki, yeni.map((y) => y.isEmriId), 'sıra gerçekten değişti');
    for (let n = 1; n < yeni.length; n += 1) assert.ok(yeni[n]!.baslangic.getTime() >= yeni[n - 1]!.bitis.getTime(), 'kaynak aynı anda tek iş');
    // Reçete ve Rota plan şeridi: canlı özet aynı sırayı emir no ve op no ile verir; son canlıya almanın zamanı ve yapanı gelir.
    const ozet = await vt().tx((db) => canliOzeti(db));
    const anahtarlar = new Set([i1!, i2!, i3!].map((id) => `${ad(id).emirNo}|${ad(id).opNo}`));
    assert.deepEqual(ozet.kuyruklar.find((q) => q.makineId === makineB)?.isler.filter((x) => anahtarlar.has(x.anahtar)).map((x) => x.anahtar),
      [i2!, i3!, i1!].map((id) => `${ad(id).emirNo}|${ad(id).opNo}`));
    // K1: canlı planın saatini sunucu kurar; özet her işin canlı başlangıç ve bitişini verir, ekran çubukları bunlarla çizer.
    const ozetIsleri = ozet.kuyruklar.find((q) => q.makineId === makineB)!.isler;
    for (const y of yeni) {
      const x = ozetIsleri.find((i) => i.anahtar === `${ad(y.isEmriId).emirNo}|${ad(y.isEmriId).opNo}`)!;
      assert.deepEqual([x.baslangic, x.bitis, x.elle], [y.baslangic.toISOString(), y.bitis.toISOString(), y.elleSira !== null]);
    }
    assert.ok(ozet.sonCanliyaAlma !== null && Date.now() - Date.parse(ozet.sonCanliyaAlma.zaman) < 600_000, 'son canlıya alma az önce');
    assert.ok(ozet.sonCanliyaAlma?.kisi, 'canlıya alanın adı');
    assert.ok([...anahtarlar].every((a) => ozet.planlanacak.includes(a)), 'planlanacak iş emirleri');

    // Çoklu planlamacı: açık ekranlar hafif uçtan canlı plan sürümünü sorar. Ekran okuduğu sürümü gönderirse ve plan arada canlıya
    // alındıysa yazma eski sürüm diye reddedilir (taşı, yerleştir, kuyruk yazımı); güncel sürümle ya da sürümsüz (eski ekran) geçer.
    const surumCevabi = await istek(c.operator, 'GET', '/plan/surum');
    assert.equal(surumCevabi.statusCode, 200, surumCevabi.body);
    const okunan = surumCevabi.json<{ planSurumu: number; sonCanliyaAlma: { kisi: string | null } | null }>();
    assert.equal(okunan.planSurumu, ozet.planSurumu);
    assert.equal(okunan.sonCanliyaAlma?.kisi, ozet.sonCanliyaAlma?.kisi);
    const eskiOkunan = okunan.planSurumu - 1;
    const eskiYazma = await yaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i2!, i3!]) }], planSurumu: eskiOkunan });
    assert.equal(eskiYazma.statusCode, 409, eskiYazma.body);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), [i2, i3, i1], 'eski sürümle yazılan sıra canlıya geçmez');
    assert.equal((await istek(c.planlama, 'POST', `/plan/is-emirleri/${i1!}/tasi`, { taslak: null, kaynak, baslangic, planSurumu: eskiOkunan })).statusCode, 409);
    assert.equal((await istek(c.planlama, 'POST', '/plan/yerlestir', { taslak: null, isEmriId: i1!, kaynak, baslangic, planSurumu: eskiOkunan })).statusCode, 409);
    const guncelYazma = await yaz(c.cam, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i2!, i3!]) }], planSurumu: okunan.planSurumu });
    assert.equal(guncelYazma.statusCode, 200, guncelYazma.body);
    assert.equal((await istek(c.planlama, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu, okunan.planSurumu, 'taslağa yazma sürümü artırmaz');
    // İki planlamacı aynı sürümü okuyup aynı kuyruğu canlıya yazar: önce gelen geçer, ikincisi ezmez (409), canlı sıra öncekinin kalır.
    // Taslağa yazma kişiye özeldir (öteki taslağa dokunmaz); canlı plan yalnız canlıya almada değişir ve sürüm orada artar.
    const ilkYazan = (await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i3!, i2!, i1!]) }], planSurumu: okunan.planSurumu })).canliya;
    assert.equal(ilkYazan.statusCode, 200, ilkYazan.body);
    const ikinciYazan = (await canliyaYaz(c.yonetici, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i2!, i3!]) }], planSurumu: okunan.planSurumu })).canliya;
    assert.equal(ikinciYazan.statusCode, 409, ikinciYazan.body);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), [i3, i2, i1], 'ikinci yazan birincinin sırasını ezmez');
    assert.equal((await istek(c.planlama, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu, okunan.planSurumu + 1);
    assert.equal((await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i2!, i3!, i1!]) }] })).canliya.statusCode, 200);

    // Dondurulmuş iş yerinde kalır (atlanır), geri kalanı onun etrafından yeni sırayı alır.
    const dondur = (await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!], true) }] })).canliya;
    assert.equal(dondur.statusCode, 200, dondur.body);
    const donukYer = (await sira()).find((y) => y.isEmriId === i1)!;
    assert.equal(donukYer.dondurulmus, true);
    const yine = (await canliyaYaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: isler([i1!, i3!, i2!]) }] })).yazma;
    assert.deepEqual(yine.json<{ yazilan: number; atlanan: number }>(), { ...yine.json(), yazilan: 2, atlanan: 1 });
    const sonra = await sira();
    assert.equal(sonra.find((y) => y.isEmriId === i1)!.baslangic.getTime(), donukYer.baslangic.getTime(), 'dondurulmuş iş yerinde');
    assert.deepEqual(sonra.filter((y) => y.isEmriId !== i1).map((y) => y.isEmriId), [i3, i2]);
    const donukBitis = donukYer.bitis.getTime();
    for (const y of sonra.filter((x) => x.isEmriId !== i1)) assert.ok(y.bitis.getTime() <= donukYer.baslangic.getTime() || y.baslangic.getTime() >= donukBitis, 'dondurulmuş işle çakışmaz');

    // Ret: yetki (yazma, canlıya alma, dondurma), bilinmeyen iş, yinelenen iş, boş istek, bir kaynak iki kez.
    const kuyruk = (idler: number[], kaynakEki = kaynak) => ({ kaynak: kaynakEki, baslangic, isler: isler(idler) });
    assert.equal((await yaz(c.operator, { kuyruklar: [kuyruk([i1!])] })).statusCode, 403);
    assert.equal((await canliyaYaz(c.cam, { kuyruklar: [kuyruk([i1!])] })).canliya.statusCode, 403, 'canlıya alma yetkisi ayrı');
    assert.equal((await yaz(c.cam, { kuyruklar: [{ ...kuyruk([i2!]), isler: isler([i2!], true) }] })).statusCode, 403, 'dondurma yetkisi ayrı');
    assert.equal((await yaz(c.planlama, { kuyruklar: [{ kaynak, baslangic, isler: [{ emirNo: 'YOK-1', opNo: 10, dondurulmus: false }] }] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [kuyruk([i2!, i2!])] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [kuyruk([i2!]), kuyruk([i3!])] })).statusCode, 400);
    assert.equal((await yaz(c.planlama, { kuyruklar: [kuyruk([i2!], { tur: 'makine', id: 2_000_000_000 })] })).statusCode, 400);
    assert.deepEqual((await sira()).map((y) => y.isEmriId), sonra.map((y) => y.isEmriId), 'reddedilen istek planı değiştirmez');
  });

  test('kuyruk yazımı verilen taslağa: stüdyo aynı taslakta kalır; eski sürüm ve başkasının taslağı reddedilir', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const canli = await planOku();
    const isi = (id: number) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false };
    };
    const kaynak = { tur: 'makine' as const, id: makineB };
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const ilk = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak, baslangic, isler: [isi(i1!), isi(i2!)] }],
    });
    // Stüdyo taslağın sürümünü plan okumasından alır.
    const ilkSurum = (await planOku(ilk.taslak)).taslak!.surum;
    const ikinci = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      taslak: { id: ilk.taslak, surum: ilkSurum }, kuyruklar: [{ kaynak, baslangic, isler: [isi(i2!), isi(i1!)] }],
    });
    assert.equal(ikinci.taslak, ilk.taslak, 'yeni taslak açılmaz');
    const p = await planOku(ikinci.taslak);
    assert.ok(p.taslak!.surum > ilkSurum);
    assert.ok(Date.parse(yer(p, i2!).baslangic) < Date.parse(yer(p, i1!).baslangic), 'ikinci yazımın sırası taslakta');

    const govde = (surum: number) => ({ taslak: { id: ilk.taslak, surum }, kuyruklar: [{ kaynak, baslangic, isler: [isi(i1!)] }] });
    assert.equal((await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', govde(ilkSurum))).statusCode, 409, 'eski sürüm');
    assert.notEqual((await istek(c.mudur, 'POST', '/plan/kuyruklari-yaz', govde(p.taslak!.surum))).statusCode, 200, 'başkasının taslağı');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${ikinci.taslak}/vazgec`, { surum: p.taslak!.surum });
  });

  test('Z6 (679 b): ortak motor süreyi rotadan okur; iş emrinin süresi silinse de iş yerleşir; elle süreyle yerleştirilen iş Planı kurdan sonra plandadır', async () => {
    // Rota onayı süre ister; süresi bilinmeyen iş emri testte süresi silinerek kurulur. Motor A bu işi önermiyordu; ortak motor rotanın süresini kullanır.
    const [i1] = await isEmirleriAc([yeniAdim()]);
    await vt().tx((db) => db.sorgu('UPDATE uretim_emirleri_is_emri SET ayar_suresi_dk = NULL, birim_sure_dk = NULL WHERE id = $1', [i1]));
    let p = await taslaktaOner();
    assert.ok(p.yerlesimler.some((x) => x.isEmriId === i1), 'rotanın süresiyle yerleşir');
    // Planlamacı kaldırıp süresini elle vererek yerleştirebilir.
    p = (await isEmriKomutu(p, i1!, 'kaldir')).json<PlanCevabi>();
    const baslangic = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: i1!, kaynak: { tur: 'makine', id: makineB }, baslangic, sureDk: 45 });
    assert.equal((Date.parse(yer(p, i1!).bitis) - Date.parse(yer(p, i1!).baslangic)) / 60_000, 45, 'elle süre taslakta');
    p = await taslaktaOner(c.planlama, p);
    assert.ok(p.yerlesimler.some((x) => x.isEmriId === i1), 'Planı kur\'dan sonra plandadır');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('Z1 rota sırası: kuyruk yazımında sonraki adım, başka makinedeki önceki adımı bitmeden başlamaz', async () => {
    const [dolgu] = await isEmirleriAc([yeniAdim({ birimSureDk: 30 })]);
    const [op10, op20] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const canli = await planOku();
    const isi = (id: number) => {
      const y = canli.yerlesimler.find((x) => x.isEmriId === id) ?? canli.yerlesmemis.find((x) => x.isEmriId === id)!;
      return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false };
    };
    const baslangic = new Date(Date.now() + 3600_000).toISOString();
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [
        { kaynak: { tur: 'makine', id: makineA }, baslangic, isler: [isi(dolgu!), isi(op10!)] },
        { kaynak: { tur: 'makine', id: makineB }, baslangic, isler: [isi(op20!)] },
      ],
    });
    const p = await planOku(yazildi.taslak);
    assert.ok(Date.parse(yer(p, op10!).baslangic) >= Date.parse(yer(p, dolgu!).bitis), 'OP10 dolgu işinden sonra');
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= Date.parse(yer(p, op10!).bitis), 'OP20, OP10 bitmeden başlamaz');
  });
});
