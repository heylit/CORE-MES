import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { Db } from '#cekirdek/db.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { acilSiparisOnaylandi, menuSayaclari, plan as planServisi } from './servis.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

describe('plan (gerçek PostgreSQL): denemeler, sayaçlar ve sorgu sayısı', () => {
  const { c, vt, istek, tamam, mamulAc, yeniAdim, yururlugeAlinmisRota, isEmirleriAc, isEmriDurumu, planOku, yer, tg, taslaktaOner, isEmriKomutu, taslagaYaz, durum } = planTestOrtami();
  // PL-ONAY: canlıya yalnız onaydaki taslak alınır; sahibi (varsayılan planlamacı) gönderir, onaydaki sürüm döner. Zaten onaydaysa yeniden
  // gönderilmez.
  const gonder = async (id: number, surum: number, sahip = c.planlama) => {
    const s = (await tamam<SenaryolarCevabi>(sahip, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  const cek = async (id: number, surum: number, sahip = c.planlama) =>
    (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaydan-cek`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let istasyonA = 0;
  let istasyonB = 0;
  let makineA = 0;
  let makineB = 0;
  let operatorId = 0;
  before(() => { ({ ortam, yoneticiId, denemeProjeId, istasyonA, istasyonB, makineA, makineB, operatorId } = durum()); });

  test('istasyonlar eki (#439): verim işleme süresini böler; arızalı makine iş almaz; yetkinliği olmayan istasyonda kişi uyarısı', async () => {
    const merkezId = (await tamam<{ istasyonlar: { id: number; isMerkeziId: number }[] }>(c.yonetici, 'GET', '/istasyonlar')).istasyonlar.find((x) => x.id === istasyonA)!.isMerkeziId;
    const ist = await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-V', ad: 'Deneme verim', isMerkeziId: merkezId });
    const mak = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MV', ad: 'Deneme makine V', istasyonId: ist.id });
    await tamam(c.yonetici, 'POST', `/istasyonlar/${ist.id}/plan-ayari`, { verimYuzde: 200, operatorIhtiyaci: 1, surum: 0 });
    const [v1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: mak.id } })]);
    // Karşılaştırılan ayarsız istasyonun işi bu testte açılır; önceki testlerin bıraktığı işe dayanmaz.
    await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    const sure = (y: { baslangic: string; bitis: string }) => (Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000;
    assert.equal(sure(yer(p, v1!)), 30 + (2 * 10) / 2, 'verim %200 işlemeyi yarıya indirir, ayar aynı kalır');
    assert.equal(sure(p.yerlesimler.find((y) => y.kaynak.tur === 'makine' && y.kaynak.id === makineA)!), 30 + 2 * 10, 'ayarı olmayan istasyon %100');
    // Arıza: makine plana iş almaz; var olan yerleşim uyarı taşır.
    await tamam(c.yonetici, 'POST', `/makineler/${mak.id}/durum`, { durum: 'ariza', aciklama: null, surum: 0 });
    assert.ok(yer(await planOku(p.taslak!.id), v1!).uyarilar.some((u) => /kullanımda değil/.test(u)));
    // Planı kur arızalı makineye iş yazmaz (kuyruk yazımı reddeder); işin var olan yeri uyarıyla kalır. Motor A onu yerinden kaldırıyordu (FARK.md).
    p = await taslaktaOner(c.planlama, p);
    assert.ok(yer(p, v1!).uyarilar.some((u) => /kullanımda değil/.test(u)));
    p = (await isEmriKomutu(p, v1!, 'kaldir')).json<PlanCevabi>();
    assert.ok(p.yerlesmemis.some((y) => y.isEmriId === v1));
    // Elle yerleştirme ve taşıma rotadaki süreyi hedef kaynağın verimiyle alır.
    await tamam(c.yonetici, 'POST', `/makineler/${mak.id}/durum`, { durum: 'calisir', aciklama: null });
    const uzak = new Date(Date.parse(p.simdi) + 90 * 24 * 3600_000).toISOString();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: v1, kaynak: { tur: 'makine', id: mak.id }, baslangic: uzak });
    assert.equal(sure(yer(p, v1!)), 40);
    p = (await isEmriKomutu(p, v1!, 'tasi', { kaynak: { tur: 'makine', id: makineA }, baslangic: uzak })).json<PlanCevabi>();
    assert.equal(sure(yer(p, v1!)), 50);
    p = await taslaktaOner(c.planlama, p);
    // S3: kişi rotadaki makinenin istasyonunda yetkin değilse uyarı; yetkinliği tanımlanmamış kişide uyarı yok.
    const [k1] = await isEmirleriAc([yeniAdim({ adaylar: [{ kaynak: { tur: 'kisi', id: operatorId }, ayarSuresiDk: 30, birimSureDk: 2 }] })]);
    p = await taslaktaOner(c.planlama, p);
    const ileri = new Date(Date.parse(yer(p, k1!).baslangic) + 60 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, k1!, 'tasi', { kaynak: { tur: 'kisi', id: operatorId }, baslangic: ileri })).json<PlanCevabi>();
    const yetkinlikUyarisi = (pp: PlanCevabi) => yer(pp, k1!).uyarilar.includes('Kişinin bu istasyonda yetkinliği yok.');
    assert.equal(yetkinlikUyarisi(p), false);
    await tamam(c.yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [istasyonB] });
    try {
      assert.equal(yetkinlikUyarisi(await planOku(p.taslak!.id)), true);
      await tamam(c.yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [istasyonA] });
      assert.equal(yetkinlikUyarisi(await planOku(p.taslak!.id)), false);
    } finally {
      await tamam(c.yonetici, 'POST', `/kisi-yetkinlikleri/${operatorId}/belirle`, { istasyonIdleri: [] });
      await tamam(c.yonetici, 'POST', `/makineler/${mak.id}/durum`, { durum: 'calisir', aciklama: null });
    }
  });

  test('A7 ikinci menü sayaçları plan modülünde: açık revizyon, geciken emir, açık senaryo, düşük stok; emirler uydurulmaz', async () => {
    const say = await tamam<Record<string, number | null>>(c.yonetici, 'GET', '/plan/menu-sayaclari');
    const liste = await tamam<{ rotalar: { acik: unknown }[] }>(c.yonetici, 'GET', '/rota/urunler');
    const studyo = await tamam<SenaryolarCevabi>(c.yonetici, 'GET', '/plan/senaryolar');
    assert.equal(say.rotalar, liste.rotalar.filter((r) => r.acik !== null).length);
    assert.equal(say.plan, (await planOku(undefined, c.yonetici)).gostergeler.geciken);
    assert.equal(say.studyo, studyo.senaryolar.filter((x) => x.durum === 'acik').length);
    assert.equal(typeof say.stok, 'number');
    assert.equal(say.operasyonlar, (await tamam<SeceneklerCevabi>(c.yonetici, 'GET', '/rota/secenekler')).operasyonTipleri.length);
    assert.equal(say.emirler, undefined);
    // Rota sayfası yetkisi olmayan sayı görmez (Aşama 1'de sayfa yalnız yöneticide).
    assert.deepEqual(Object.values(await tamam<Record<string, number | null>>(c.operator, 'GET', '/plan/menu-sayaclari')).filter((n) => n !== null), []);
  });

  // Yük testi (2026-10-18): plan uçları istek başına yüzlerce sorgu atıyordu. Hız düzeltmesi davranışı değiştirmez; sorgu sayısı iş emri
  // sayısıyla büyümez.
  test('286 b: acil sipariş denemesi canlıya alınınca müşterili taslak sipariş açılır; onayda proje ve acil emir açılır, yetkisiz onay geri alınır', async () => {
    await isEmirleriAc([yeniAdim()]);
    const firma = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 286', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
    const secenek = await tamam<{ firmalar: { id: number }[] }>(c.planlama, 'GET', '/plan/musteri-secenekleri?ara=286');
    assert.deepEqual(secenek.firmalar.map((f) => f.id), [firma]);
    assert.equal((await istek(c.operator, 'GET', '/plan/musteri-secenekleri')).statusCode, 403);
    let s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Acil 286' })).senaryolar.find((x) => x.ad === 'Acil 286')!;
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'acil', surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
    const d = s.degisiklikler.find((x) => x.tur === 'acil_emir')!;
    assert.deepEqual(s.bekleyenler, [], 'acil sipariş artık canlıya geçer');
    {
      const r = await istek(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: await gonder(s.id, s.surum), cakismalariKabul: true });
      assert.equal(r.statusCode, 400);
      assert.match(r.body, /acilMusteriler/);
      const k = await istek(c.kalite, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: await gonder(s.id, s.surum), cakismalariKabul: true, acilMusteriler: [{ degisiklikId: d.id, firmaId: firma }] });
      assert.equal(k.statusCode, 403, 'kalitede sipariş yazma yok');
    }
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: await gonder(s.id, s.surum), cakismalariKabul: true, acilMusteriler: [{ degisiklikId: d.id, firmaId: firma }] });
    const sp = (await ortam!.sahip.tek<{ id: number; durum: string; firma_id: number; kdv_orani: string; miktar: string; birim_fiyat: string | null; satir: number }>(
      `SELECT s.id, s.durum, s.firma_id, s.kdv_orani::text, k.miktar::text, k.birim_fiyat::text, k.id AS satir FROM siparisler_siparis s
         JOIN siparisler_siparis_satiri k ON k.siparis_id = s.id WHERE s.firma_id = $1`, [firma]))!;
    assert.deepEqual([sp.durum, Number(sp.kdv_orani), Number(sp.miktar), sp.birim_fiyat], ['taslak', 20, 100, null]);
    const emirSayisi = async () => Number((await ortam!.sahip.tek<{ n: string }>('SELECT count(*) AS n FROM uretim_emri WHERE siparis_satiri_id = $1', [sp.satir]))!.n);
    assert.equal(await emirSayisi(), 0, 'onaya kadar emir açılmaz');
    const kim = async (cerez: string) => (await kimlikCozucu(vt())({ headers: { cookie: cerez } } as never))!;
    await assert.rejects(vt().tx(async (db) => acilSiparisOnaylandi(db, { siparisId: sp.id, kullanici: await kim(c.kalite) })), /proje ve üretim emri açma yetkisi/);
    assert.equal(await emirSayisi(), 0);
    // Fiyat Siparişler'de girilir; onay Siparişler'in ucundan verilir ve kablolama.ts'teki bağla emri açar.
    await ortam!.sahip.sorgu('UPDATE siparisler_siparis_satiri SET birim_fiyat = 10 WHERE id = $1', [sp.satir]);
    const surum = (await ortam!.sahip.tek<{ surum: number }>('SELECT surum FROM siparisler_siparis WHERE id = $1', [sp.id]))!.surum;
    await tamam(c.mudur, 'POST', `/siparisler/${sp.id}/onayla`, { surum });
    await vt().tx(async (db) => acilSiparisOnaylandi(db, { siparisId: sp.id, kullanici: await kim(c.mudur) }));
    const emir = (await ortam!.sahip.tek<{ oncelik: number; adet: number; proje: string }>(
      'SELECT e.oncelik, e.adet, p.kod AS proje FROM uretim_emri e JOIN projeler_proje p ON p.id = e.proje_id WHERE e.siparis_satiri_id = $1', [sp.satir]))!;
    assert.equal(await emirSayisi(), 1, 'ikinci bildirim yeni emir açmaz');
    assert.deepEqual([emir.oncelik, Number(emir.adet)], [1, 100]);
    assert.ok(/^[A-Z0-9._]+$/.test(emir.proje));
  });

  test('281 a: öncelik denemesi canlıya alınınca emrin önceliği, arıza denemesi makine durumu olur; yetkisi olmayan canlıya alamaz', async () => {
    await isEmirleriAc([yeniAdim()], 10, null, { oncelik: 3 });
    const veri = async (id: number) => (await ortam!.sahip.tek<{ veri: Record<string, number> }>('SELECT veri FROM plan_senaryo_degisikligi WHERE id = $1', [id]))!.veri;
    const dene = async (ad: string, tur: 'oncelik' | 'ariza') => {
      const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad })).senaryolar.find((x) => x.ad === ad)!;
      const l = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur, surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
      assert.deepEqual(l.bekleyenler, [], `${tur} denemesi artık canlıya geçer`);
      return { s: l, d: l.degisiklikler.find((x) => x.tur !== 'oner')! };
    };
    const canliyaAl = async (cerez: string, s: { id: number; surum: number }) =>
      istek(cerez, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: await gonder(s.id, s.surum), cakismalariKabul: true });

    const o = await dene('Öncelik 281', 'oncelik');
    const { emirId } = await veri(o.d.id);
    assert.equal((await canliyaAl(c.kalite, o.s)).statusCode, 403, 'kalitede emir yazma yok');
    const oncelik = async () => (await ortam!.sahip.tek<{ oncelik: number }>('SELECT oncelik FROM uretim_emri WHERE id = $1', [emirId]))!.oncelik;
    assert.notEqual(await oncelik(), 1);
    assert.equal((await canliyaAl(c.planlama, o.s)).statusCode, 200);
    assert.equal(await oncelik(), 1);

    const a = await dene('Arıza 281', 'ariza');
    const { makineId } = await veri(a.d.id);
    const durum = async () => (await ortam!.sahip.tek<{ durum: string } | null>(
      'SELECT durum FROM istasyonlar_makine_durumu WHERE makine_id = $1', [makineId]))?.durum ?? 'calisir';
    try {
      assert.equal((await canliyaAl(c.planlama, a.s)).statusCode, 403, 'planlamada makine durumu yazma yok');
      assert.equal(await durum(), 'calisir');
      assert.equal((await canliyaAl(c.mudur, a.s)).statusCode, 200);
      assert.equal(await durum(), 'ariza');
    } finally {
      await tamam(c.yonetici, 'POST', `/makineler/${makineId}/durum`, { durum: 'calisir', aciklama: null });
    }
  });

  test('H1 geçmiş, H7: elle taşıma ve yerleştirme geçmişe konamaz; başkasının taslağına yazmada ve kapatmada senaryo iletisi', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    const y = yer(p, i1!);
    const gecmis = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    const r = await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: gecmis });
    assert.equal(r.statusCode, 400, r.body);
    assert.match(r.body, /geçmişte olamaz/);
    p = (await isEmriKomutu(p, i1!, 'kaldir')).json<PlanCevabi>();
    const yz = await istek(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: i1!, kaynak: y.kaynak, baslangic: gecmis });
    assert.equal(yz.statusCode, 400, yz.body);
    assert.match(yz.body, /baslangic/);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/yerlestir', { taslak: tg(p), isEmriId: i1!, kaynak: y.kaynak, baslangic: y.baslangic });

    const baska = await taslagaYaz(c.planlama2, tg(p), i1!);
    assert.equal(baska.statusCode, 403);
    assert.match(baska.body, /başka bir planlamacının taslağı/);
    const kapat = await istek(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    assert.equal(kapat.statusCode, 403);
    assert.match(kapat.body, /başka bir planlamacının taslağı/);
  });

  test('308 b: sıraya aykırı taşıma ve canlıya alma reddedilir; rota dışı elle makine uyarıyla tutulur (H3)', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim()]);
    let p = await taslaktaOner();
    const once = new Date(Date.parse(yer(p, a1!).baslangic) - 3600_000);
    const r = await isEmriKomutu(p, a2!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: (once.getTime() > Date.now() ? once : new Date(Date.now() + 60_000)).toISOString() });
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.body, /sıraya aykırı/);
    // Eski kayıt ya da dışarıdan yazılmış aykırılık canlıya geçmez.
    await ortam!.sahip.sorgu(
      'UPDATE plan_senaryo_yerlesimi SET baslangic = $3, bitis = $3::timestamptz + interval \'10 minutes\' WHERE senaryo_id = $1 AND is_emri_id = $2',
      [p.taslak!.id, a2!, new Date(Date.parse(yer(p, a1!).baslangic) - 600_000).toISOString()]);
    p = await planOku(p.taslak!.id);
    const gonderilen = await gonder(p.taslak!.id, p.taslak!.surum);
    const al = await istek(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: gonderilen, cakismalariKabul: true });
    assert.equal(al.statusCode, 409, al.body);
    assert.match(al.body, /sıraya aykırı/);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: await cek(p.taslak!.id, gonderilen) });

    const [b1] = await isEmirleriAc([yeniAdim()]);
    const canli = await planOku();
    const b = canli.yerlesimler.find((x) => x.isEmriId === b1) ?? canli.yerlesmemis.find((x) => x.isEmriId === b1)!;
    const yazildi = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineB }, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [{ emirNo: b.emirNo, opNo: b.opNo, dondurulmus: false, elleKaynak: true }] }],
    });
    const yb = yer(await planOku(yazildi.taslak), b1!);
    assert.deepEqual(yb.kaynak, { tur: 'makine', id: makineB }, 'motor elle seçilen rota dışı makineyi geri almaz');
    assert.ok(yb.uyarilar.some((u) => /rotadaki/.test(u)), JSON.stringify(yb.uyarilar));
  });

  test('H2: fasona alınan adımın eski yerleşimi kuyruğu ve taşımayı tıkamaz', async () => {
    const [a] = await isEmirleriAc([yeniAdim()]);
    const [b] = await isEmirleriAc([yeniAdim()]);
    const [d] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const kaynak = yer(p, a!).kaynak;
    const sirali = [a!, b!, d!].sort((x, y) => Date.parse(yer(p, x).baslangic) - Date.parse(yer(p, y).baslangic));
    assert.ok(sirali.every((i) => JSON.stringify(yer(p, i).kaynak) === JSON.stringify(kaynak)), 'üç iş aynı makinede');
    const [ilk, orta, son] = sirali as [number, number, number];
    const firma = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Fasoncu H2', 'tedarikci', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam!.sahip.sorgu('UPDATE uretim_emirleri_is_emri SET fason_firma_id = $2, makine_id = NULL, kisi_id = NULL, istasyon_id = NULL, ayar_suresi_dk = NULL, birim_sure_dk = NULL, termin_gun = 3 WHERE id = $1', [orta, firma]);
    let q = await planOku(p.taslak!.id);
    assert.equal(q.yerlesimler.some((y) => y.isEmriId === orta), false, 'fason adım planda görünmez');
    q = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(q), kaynak, isEmriIdleri: [son, ilk] });
    // Sıralamadan sonra ilk iş fasondakinin eski yerinde; bir dakika kaydırmak yalnız o eski satırla çakışabilirdi.
    const t = await isEmriKomutu(q, ilk, 'tasi', { kaynak, baslangic: new Date(Date.parse(yer(q, ilk).baslangic) + 60_000).toISOString() });
    assert.equal(t.statusCode, 200, t.body);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${q.taslak!.id}/vazgec`, { surum: t.json<PlanCevabi>().taslak!.surum });
  });

  test('H5: hurdadan sonra sonraki adımın adedi süresiyle aynı kalandan gelir', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim()], 10);
    await ortam!.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '2 hours', bitis = now() - interval '1 hour', saglam_adet = 8 WHERE id = $1", [a1!]);
    const p = await planOku();
    const y = p.yerlesimler.find((x) => x.isEmriId === a2) ?? p.yerlesmemis.find((x) => x.isEmriId === a2)!;
    assert.equal(y.adet, 8);
  });

  describe('sorgu sayısı ve aynı cevap', () => {
    const planlamaci = async () => {
      const id = (await vt().tx((db) => db.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'planlama'")))!.id;
      return (await vt().tx((db) => kullaniciYukle(db, id)))!;
    };
    // Öneri her yerleşimi ayrı satır olarak yazar; yazma okumadan ayrı sayılır, okuma sayısı sabit kalmalı.
    async function sorguSay<T>(is: (db: Db) => Promise<T>): Promise<number> {
      let n = 0;
      const say = (sql: string) => { if (!/^\s*(DELETE FROM|INSERT INTO) plan_senaryo_yerlesim/.test(sql)) n += 1; };
      await vt().tx((db) => is({ sorgu: (sql, p) => { say(sql); return db.sorgu(sql, p); }, tek: (sql, p) => { say(sql); return db.tek(sql, p); } }));
      return n;
    }
    const zamansiz = (p: PlanCevabi) => { const { simdi, taslakAcildi, ...geri } = p; void simdi; void taslakAcildi; return geri; };

    test('Planı kurun yazdığı taslak, hemen ardından okunan planıyla aynıdır; ikinci kurulum aynı taslakta kalır', async () => {
      await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'istasyon', id: istasyonB } })], 4, '2099-01-01');
      const p = await taslaktaOner();
      assert.deepEqual(zamansiz(p), zamansiz(await planOku(p.taslak!.id)));
      const p2 = await taslaktaOner(c.planlama, p);
      assert.equal(p2.taslak!.id, p.taslak!.id);
      assert.deepEqual(zamansiz(p2), zamansiz(await planOku(p.taslak!.id)));
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p2.taslak!.surum });
    });

    test('menü sayacının geciken sayısı planın geciken göstergesiyle aynıdır', async () => {
      await isEmirleriAc([yeniAdim()], 3, '2000-01-01');
      const [calisan] = await isEmirleriAc([yeniAdim(), yeniAdim()], 3, '2000-01-02');
      await isEmriDurumu(calisan!, 'calisiyor');
      const say = await tamam<Record<string, number | null>>(c.planlama, 'GET', '/plan/menu-sayaclari');
      const p = await planOku();
      assert.ok(p.gostergeler.geciken > 0);
      assert.equal(say.plan, p.gostergeler.geciken);
      await isEmriDurumu(calisan!, 'bekliyor');
    });

    test('plan ve menü sayacı: sorgu sayısı açık iş emri sayısıyla büyümez', async () => {
      const urun = await mamulAc();
      const rev = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim({ kaynak: { tur: 'istasyon', id: istasyonB } })]);
      const emreKopyala = () => tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: '2099-01-01' });
      const ilk = (await emreKopyala()).isEmriIdleri;
      await isEmriDurumu(ilk[0]!, 'calisiyor');
      const k = await planlamaci();
      const olc = async () => [
        await sorguSay((db) => planServisi(db, k)), await sorguSay((db) => menuSayaclari(db, k)),
      ];
      const once = await olc();
      const ekler = [(await emreKopyala()).isEmriIdleri[0]!, (await emreKopyala()).isEmriIdleri[0]!];
      for (const ie of ekler) await isEmriDurumu(ie, 'calisiyor');
      assert.deepEqual(await olc(), once);
      for (const ie of [ilk[0]!, ...ekler]) await isEmriDurumu(ie, 'bekliyor');
    });
  });
});
