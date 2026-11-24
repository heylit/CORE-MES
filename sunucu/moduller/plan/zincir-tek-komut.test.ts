import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CanliyaAlOnizlemesiCevabi, PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaGonderCevabi, DegerlendirmeDurumuCevabi, DegisiklikDefteriCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { randomUUID } from 'node:crypto';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat, emirDurdur } from '../uretim-emirleri/disari.ts';
import { canliyaAlSecenekleri } from './calisma-plani.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3308-5 a: çalışma planı tek komutla onaya gider ya da canlıya alınır. Plan taslağı, onay ve canlıya alma aynı işlemdedir; canlıya alma
// reddedilirse onaya gitmiş ya da açık kalmış taslak geride kalmaz. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): çalışma planı tek komutla onaya ve canlıya', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, isEmriDurumu, durum } = planTestOrtami();

  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, { m: string; S: number; C: number }> }) | null; locks: Record<string, unknown> };
  const calismaOku = async () => {
    const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi');
    assert.ok(r.calisma, 'çalışma okunur');
    return { calisma: r.calisma as unknown as Calisma, surum: r.surum };
  };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  // Ekranın iki adımı (463 a): başlatma iş kimliği verir, sonuç kimlikle beklenir.
  const planKur = async (surum: number) => {
    const { is } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum, istek: { tur: 'plan-kur' } });
    for (let i = 0; i < 600; i++) {
      const d = await tamam<DegerlendirmeDurumuCevabi>(c.planlama, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
      if (d.durum === 'bitti') return d.cevap;
      assert.notEqual(d.durum, 'hata', JSON.stringify(d));
      await new Promise((t) => { setTimeout(t, 100); });
    }
    return assert.fail('plan kurma sonucu gelmedi');
  };

  // Emir açılır, plan sunucuda kurulur ve çalışmaya alınır; dönen sürüm kayıtlı çalışmanınkidir.
  const planliCalisma = async (ikinciMakine = false): Promise<{ surum: number; isler: [number, number] }> => {
    const isler = await isEmirleriAc([yeniAdim(), yeniAdim(ikinciMakine ? { kaynak: { tur: 'makine', id: durum().makineB } } : {})], 10) as [number, number];
    const ilk = await calismaOku();
    const s0 = await calismaKaydet(ilk.calisma, ilk.surum);
    const cevap = await planKur(s0);
    assert.equal(cevap.sonuc.tur, 'plan-kur');
    if (cevap.sonuc.tur !== 'plan-kur') return assert.fail('plan kurulmadı');
    const { calisma: c1, surum: s1 } = await calismaOku();
    const dataVer = c1.dataVer + 1;
    return { surum: await calismaKaydet({ ...c1, dataVer, plan: { ...cevap.sonuc.plan, dataVer, kaynak: 'sifir' } as unknown as Calisma['plan'] }, s1), isler };
  };
  const senaryolar = () => tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar');
  const dortGoz = (deger: boolean) => tamam(c.yonetici, 'POST', '/ayarlar/plan.dort-goz/degistir', { deger });
  // Planın defterdeki satırları, eskiden yeniye (3308-9 a).
  const defter = async (taslak: number) => (await tamam<DegisiklikDefteriCevabi>(c.planlama, 'GET', '/plan/degisiklik-defteri')).satirlar
    .filter((x) => x.bekleyenId === `plan:${String(taslak)}`).reverse();
  const defterSayisi = async () => (await tamam<DegisiklikDefteriCevabi>(c.planlama, 'GET', '/plan/degisiklik-defteri')).satirlar.filter((x) => x.bekleyenId.startsWith('plan:')).length;
  const yerli = async (id: number) => (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler.some((x) => x.isEmriId === id);

  test('TK-01: tek komut çalışma planını canlıya alır; taslak canlıya alınmış kapanır (izinli)', async () => {
    const { surum, isler } = await planliCalisma();
    const once = await senaryolar();
    const r = await tamam<CalismaGonderCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Tek komut canlı', calismaSurumu: surum, dortSaatGerekcesi: null });
    assert.ok(r.yazilan >= 2, JSON.stringify({ yazilan: r.yazilan, yazilamaz: r.yazilamaz }));
    assert.equal(r.senaryolar.canliSurum, once.canliSurum + 1, 'canlı sürüm bir arttı');
    const kapanan = r.senaryolar.senaryolar.find((x) => x.id === r.taslak.id);
    assert.ok(kapanan === undefined || kapanan.durum === 'canliya_alindi', `taslak canlıya alınmış kapandı: ${String(kapanan?.durum)}`);
    for (const i of isler) assert.equal(await yerli(i), true, 'iş canlıda yerleşti');
    assert.equal((await senaryolar()).senaryolar.filter((x) => x.durum === 'onayda').length, once.senaryolar.filter((x) => x.durum === 'onayda').length);
    const d = await defter(r.taslak.id);
    assert.deepEqual(d.map((x) => [x.olay, x.ne, x.isler, x.gerekce]), [['onaya-gonderildi', 'Tek komut canlı', ['*'], null], ['canliya-alindi', 'Tek komut canlı', ['*'], null]]);
    assert.equal(d[1]!.ayrinti, `Sürüm ${String(r.senaryolar.canliSurum)}`, 'canlıya alma satırı yeni canlı sürümü söyler');
    assert.ok(d[1]!.kisi, 'kişi sunucudan yazılır');
  });

  test('TK-02: canlıya alma reddedilirse hiçbir şey yazılmaz; tek komutla onaya gönderme planı onayda bırakır (reddedilen ve izinli)', async () => {
    const { surum, isler } = await planliCalisma();
    await dortGoz(true);
    try {
      const once = await senaryolar();
      const defterOnce = await defterSayisi();
      const red = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Tek komut ret', calismaSurumu: surum, dortSaatGerekcesi: null });
      assert.ok(red.statusCode === 403 || red.statusCode === 409, `dört göz açıkken gönderen canlıya alamaz: ${String(red.statusCode)} ${red.body}`);
      const sonra = await senaryolar();
      assert.equal(sonra.canliSurum, once.canliSurum, 'canlı değişmedi');
      assert.deepEqual(sonra.senaryolar.map((x) => x.id), once.senaryolar.map((x) => x.id), 'reddedilen komut taslak bırakmadı');
      for (const i of isler) assert.equal(await yerli(i), false, 'iş canlıya geçmedi');
      assert.equal(await defterSayisi(), defterOnce, 'reddedilen komut deftere satır bırakmadı');

      const r = await tamam<CalismaGonderCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', { ad: 'Tek komut onay', calismaSurumu: surum, not: 'Bakar mısınız' });
      const t = r.senaryolar.senaryolar.find((x) => x.id === r.taslak.id);
      assert.equal(t?.durum, 'onayda');
      assert.equal(t?.surum, r.taslak.surum, 'dönen sürüm onaydaki taslağın sürümüdür');
      assert.equal(t?.onay?.not, 'Bakar mısınız', 'gönderenin notu onaydaki taslakta okunur');
      assert.equal(r.senaryolar.canliSurum, once.canliSurum, 'onaya gönderme canlıyı değiştirmez');
      assert.deepEqual((await defter(r.taslak.id)).map((x) => [x.olay, x.ayrinti]), [['onaya-gonderildi', 'Bakar mısınız']]);
      // Onaylayan geri gönderir: neden defterin gerekçe sütununda durur. Sahip yeniden gönderip çeker.
      const geri = await tamam<SenaryolarCevabi>(c.yonetici, 'POST', `/plan/senaryolar/${String(r.taslak.id)}/geri-gonder`, { surum: r.taslak.surum, neden: 'Termin sıkışık' });
      let v = geri.senaryolar.find((x) => x.id === r.taslak.id)!.surum;
      v = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(r.taslak.id)}/onaya-gonder`, { surum: v, not: null })).senaryolar.find((x) => x.id === r.taslak.id)!.surum;
      await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(r.taslak.id)}/onaydan-cek`, { surum: v });
      assert.deepEqual((await defter(r.taslak.id)).map((x) => [x.olay, x.gerekce]),
        [['onaya-gonderildi', null], ['geri-gonderildi', 'Termin sıkışık'], ['onaya-gonderildi', null], ['onaydan-cekildi', null]]);
    } finally {
      await dortGoz(false);
    }
  });

  test('TK-04: aynı istek kimliğiyle ikinci gönderim yeni taslak açmaz, ilk cevabı döner', async () => {
    const { surum } = await planliCalisma();
    const once = (await senaryolar()).senaryolar.length;
    const kimlik = randomUUID();
    const govde = { ad: 'Tek komut tekrar', calismaSurumu: surum };
    const ilk = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', govde, kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    const ikinci = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', govde, kimlik);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal(ikinci.json<CalismaGonderCevabi>().taslak.id, ilk.json<CalismaGonderCevabi>().taslak.id);
    assert.equal((await senaryolar()).senaryolar.length, once + 1, 'tek taslak açıldı');
  });

  test('TK-07 (3669): gönderme önizlemesi sıra denetimini söyler, taslak, onay ve defter bırakmaz; eski sürüm 409, yetkisiz 403', async () => {
    const { surum } = await planliCalisma();
    const once = await senaryolar();
    const defterOnce = await defterSayisi();
    const oz = await tamam<CanliyaAlOnizlemesiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/gonderme-onizlemesi', { ad: 'Önizleme', calismaSurumu: surum });
    assert.deepEqual([oz.ihlaller, oz.oneri, oz.kilitYetkisi], [[], null, true]);
    assert.ok(Array.isArray(oz.kapali));
    const sonra = await senaryolar();
    assert.deepEqual(sonra.senaryolar.map((x) => x.id), once.senaryolar.map((x) => x.id), 'önizleme taslak bırakmadı');
    assert.equal(await defterSayisi(), defterOnce, 'önizleme deftere satır bırakmadı');
    assert.equal(sonra.canliSurum, once.canliSurum);
    const eski = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/gonderme-onizlemesi', { ad: 'Eski', calismaSurumu: surum - 1 });
    assert.equal(eski.statusCode, 409, eski.body);
    const yetkisiz = await istek(c.operator, 'POST', '/plan/planlama-calismasi/gonderme-onizlemesi', { ad: 'Yetkisiz', calismaSurumu: surum });
    assert.equal(yetkisiz.statusCode, 403, yetkisiz.body);
  });

  test('TK-05: canlıya alma adımına 4 saat gerekçesi ve sabitleme aynen geçer; canlı değişti hiç kabul edilmez', () => {
    assert.deepEqual(canliyaAlSecenekleri(7, { dortSaatGerekcesi: 'acil sevkiyat', baslayanlar: 'sabitle' }), { surum: 7, cakismalariKabul: false, dortSaatGerekcesi: 'acil sevkiyat', baslayanlar: 'sabitle' });
    assert.deepEqual(canliyaAlSecenekleri(7, { dortSaatGerekcesi: null }), { surum: 7, cakismalariKabul: false, dortSaatGerekcesi: null });
  });

  test('TK-03: eski çalışma sürümüyle komut reddedilir ve taslak bırakmaz; canlıya alma yetkisi olmayan canlıya alamaz (reddedilen)', async () => {
    const { surum } = await planliCalisma();
    const once = await senaryolar();
    const eski = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/onaya-gonder', { ad: 'Eski', calismaSurumu: surum - 1 });
    assert.equal(eski.statusCode, 409, eski.body);
    const yetkisiz = await istek(c.operator, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Yetkisiz', calismaSurumu: surum });
    assert.equal(yetkisiz.statusCode, 403, yetkisiz.body);
    assert.deepEqual((await senaryolar()).senaryolar.map((x) => x.id), once.senaryolar.map((x) => x.id));
  });
  // 3365-5: çalışmada sabitlenen (Kokpit'te taşınan) iş çalışmadaki süresiyle yazılır. Motor sıraya bağlı ayarı (aynı aile, ayar matrisi)
  // kısa sayar; iş emrinin tam ayarıyla yazılsaydı sabit öncül geç biter, ona yapışık sabit ardıl canlıya alırken sıraya aykırı kalırdı.
  test('TK-06: sabit öncül çalışmadaki kısa süresiyle yazılır; ona yapışık sabit ardıl canlıya geçer (izinli)', async () => {
    const { surum, isler } = await planliCalisma(true);
    const { calisma } = await calismaOku();
    const plan = calisma.plan!;
    const ops = plan.ops as Record<string, { m: string; S: number; C: number; job?: string }>;
    const son = Object.values(ops).map((o) => String(o.job)).sort().at(-1);
    const [p, q] = Object.keys(ops).filter((x) => String(ops[x]!.job) === son).sort((a, b) => ops[a]!.S - ops[b]!.S) as [string, string];
    assert.notEqual(ops[p]!.m, ops[q]!.m, 'iki adım ayrı tezgâhta');
    // Öncülün çalışmadaki süresi iş emrinin tam süresinin yarısı (motorun kısalttığı ayar); ardıl tam bitişine yapışık, ikisi sabit.
    const bitis = ops[p]!.S + (ops[p]!.C - ops[p]!.S) / 2;
    const yeniOps = { ...ops, [p]: { ...ops[p]!, C: bitis }, [q]: { ...ops[q]!, S: bitis, C: bitis + ops[q]!.C - ops[q]!.S } };
    const locks = { [p]: { m: ops[p]!.m, S: ops[p]!.S }, [q]: { m: ops[q]!.m, S: bitis } };
    const s1 = await calismaKaydet({ ...calisma, plan: { ...plan, ops: yeniOps } as Calisma['plan'], locks }, surum);
    const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Sabit yapışık', calismaSurumu: s1, dortSaatGerekcesi: null });
    assert.equal(r.statusCode, 200, r.body);
    const yerler = (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler;
    const [y1, y2] = isler.map((i) => yerler.find((x) => x.isEmriId === i)!);
    assert.ok(y1 && y2, 'iki adım canlıda');
    assert.equal(Date.parse(y1.bitis), Date.parse(y2.baslangic), 'öncül çalışmadaki bitişinde biter, ardıl ona yapışık başlar');
  });
  // 3414-6 a, 3414-7 a: süren iş çalışmada durdurulup kalanı taşınır; canlıya geçmesi operatörün işi terminalde durdurmasına bağlıdır.
  test('TK-08: durdurulup taşınan iş sahada sürerken canlıda eski yerinde kalır ve adıyla söylenir; durunca yeni yerine geçer (izinli)', async () => {
    const { surum, isler } = await planliCalisma(true);
    await tamam<CalismaGonderCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Durdurma ilk', calismaSurumu: surum, dortSaatGerekcesi: null });
    const { istasyonA, operatorId } = durum();
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyonA]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emir = (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [isler[0]])))!.u;
    await vt().tx((db) => emirBaslat(db, op, emir));
    const yerOf = async (id: number) => (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler.find((x) => x.isEmriId === id)!;
    const once = await yerOf(isler[0]);

    const { calisma, surum: s1 } = await calismaOku();
    const plan = calisma.plan!;
    const ops = plan.ops as Record<string, { m: string; S: number; C: number; job?: string }>;
    const son = Object.values(ops).map((o) => String(o.job)).sort().at(-1);
    const [p, q] = Object.keys(ops).filter((x) => String(ops[x]!.job) === son).sort((a, b) => ops[a]!.S - ops[b]!.S) as [string, string];
    // İlk adım bir gün sonraya taşınır (durdurulmuş sayılır), ardılı arkasına kilitlenir.
    const yeniS = Math.ceil(ops[q]!.C) + 24, pBitis = yeniS + (ops[p]!.C - ops[p]!.S);
    const yeniOps = { ...ops, [p]: { ...ops[p]!, S: yeniS, C: pBitis }, [q]: { ...ops[q]!, S: pBitis, C: pBitis + ops[q]!.C - ops[q]!.S } };
    const locks = { [p]: { m: ops[p]!.m, S: yeniS }, [q]: { m: ops[q]!.m, S: pBitis } };
    const w = { ...(calisma['w'] as Record<string, unknown>), durdurulan: { [p]: 1 } };
    const s2 = await calismaKaydet({ ...calisma, plan: { ...plan, ops: yeniOps } as Calisma['plan'], locks, w }, s1);
    const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Durdurma bekler', calismaSurumu: s2, dortSaatGerekcesi: 'Deneme gerekçesi: süren iş taşındı' });
    assert.equal(r.statusCode, 200, r.body);
    const cevap = r.json<CalismaGonderCevabi>();
    assert.equal(cevap.uyarilar?.length, 1, JSON.stringify(cevap.uyarilar));
    assert.match(cevap.uyarilar![0]!, / OP \d+ terminalde durdurulmayı bekliyor: canlıda eski yerinde kaldı/);
    assert.equal((await yerOf(isler[0])).baslangic, once.baslangic, 'süren iş canlıda yerinden oynamaz');

    // Operatör işi durdurur: aynı çalışma yeniden canlıya alınınca kalan yeni yerine geçer, uyarı kalmaz.
    await isEmriDurumu(isler[0], 'bekliyor');
    const { surum: s3 } = await calismaOku();
    const r2 = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Durdurma sonrası', calismaSurumu: s3, dortSaatGerekcesi: 'Deneme gerekçesi: süren iş taşındı' });
    assert.equal(r2.statusCode, 200, r2.body);
    assert.equal(r2.json<CalismaGonderCevabi>().uyarilar, undefined);
    const sonra = await yerOf(isler[0]);
    assert.ok(Date.parse(sonra.baslangic) > Date.parse(once.baslangic) + 20 * 3_600_000, `durdurulan iş yeni yerinde: ${once.baslangic} -> ${sonra.baslangic}`);
  });

  // 3600 (R3, R4): baştan kurda başlamış işin kalanı dizilir ama iş terminalde hâlâ sürüyor. Ardılı kilitsizdir; süren işin canlıdaki yerinde kalır,
  // ardıl onun bitişinden önceye yazılmaz (308 b), canlıya alma 200 olur ve iş adıyla söylenir. `kalan`: kalanın çalışmadaki yeni süresi (kısalır ya da gün sonraya gider).
  const surenBastanKur = async (ayri: boolean, kalan: 'yarim' | 'gun' | 'motor') => {
    const { surum, isler } = await planliCalisma(ayri);
    // Önceki testlerin emirleri planda kalır; yeni emrin adımı onların önüne düşerse 4 saat kuralı sorar. Bu test o kuralı ölçmez: gerekçe
    // yazılır, test tek başına da sırayla da aynı sonucu verir.
    await tamam<CalismaGonderCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Süren ilk', calismaSurumu: surum, dortSaatGerekcesi: 'Deneme gerekçesi: ilk plan' });
    const { istasyonA, operatorId } = durum();
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyonA]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emir = (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [isler[0]])))!.u;
    // Önceki testlerin terminalde açık bıraktığı iş makineyi tutmasın.
    for (const a of await vt().tx((db) => db.sorgu<{ id: number }>("SELECT id FROM uretim_emri WHERE durum = 'basladi'", []))) await vt().tx((db) => emirDurdur(db, op, a.id, durusNedeniId)).catch(() => undefined);
    await vt().tx((db) => emirBaslat(db, op, emir));
    try {
      const yerOf = async (id: number) => (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler.find((x) => x.isEmriId === id)!;
      const once = await yerOf(isler[0]);
      const { calisma, surum: s1 } = await calismaOku();
      const plan = calisma.plan!;
      const ops = plan.ops as Record<string, { m: string; S: number; C: number; job?: string }>;
      const son = Object.values(ops).map((o) => String(o.job)).sort().at(-1);
      const [p, q] = Object.keys(ops).filter((x) => String(ops[x]!.job) === son).sort((a, b) => ops[a]!.S - ops[b]!.S) as [string, string];
      if (kalan === 'motor') {
        // Gerçek akış: çalışmaya süren iş (gercek) ve durdurulan işareti yazılır, motor planı yeniden dizer (plan-uygula), sonuç canlıya alınır.
        const w0 = { ...(calisma['w'] as Record<string, unknown>), durdurulan: { [p]: 1 } };
        const bekleyen = [{ id: 'ORN-b', ne: 'Yeniden planlama istendi', ayrinti: '', kim: '', t: 1, isler: ['*'], geri: [], kilitsiz: true }];
        const sM = await calismaKaydet({ ...calisma, plan: { ...plan, ops: { ...ops, [p]: { ...ops[p]!, act: 1, pin: 1 } } } as Calisma['plan'], locks: {}, w: w0, gercek: { [p]: { m: ops[p]!.m, S: ops[p]!.S } }, bekleyen } as Calisma, s1);
        const { is } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum: sM, istek: { tur: 'plan-uygula', isler: ['*'] } });
        let yeniPlan: Calisma['plan'] = null;
        for (let i = 0; i < 600 && yeniPlan === null; i++) {
          const d = await tamam<DegerlendirmeDurumuCevabi>(c.planlama, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
          if (d.durum === 'bitti') { assert.equal(d.cevap.sonuc.tur, 'plan-uygula'); yeniPlan = (d.cevap.sonuc as unknown as { plan: Calisma['plan'] }).plan; }
          else { assert.notEqual(d.durum, 'hata', JSON.stringify(d)); await new Promise((t) => { setTimeout(t, 100); }); }
        }
        const { calisma: c2, surum: s3 } = await calismaOku();
        const s4 = await calismaKaydet({ ...c2, plan: { ...yeniPlan, dataVer: c2.dataVer } as Calisma['plan'], locks: {}, w: w0, gercek: { [p]: { m: ops[p]!.m, S: ops[p]!.S } }, bekleyen: [] } as Calisma, s3);
        const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Süren baştan kur motor', calismaSurumu: s4, dortSaatGerekcesi: 'Deneme gerekçesi: süren iş taşındı' });
        assert.equal(r.statusCode, 200, r.body);
        const y1 = await yerOf(isler[0]), y2 = await yerOf(isler[1]);
        assert.equal(y1.baslangic, once.baslangic, 'süren iş canlıda yerinden oynamaz');
        assert.ok(Date.parse(y2.baslangic) >= Date.parse(y1.bitis) - 1000, `ardıl süren işin bitişinden önce başlamaz: ${y1.bitis} / ${y2.baslangic}`);
        return;
      }
      const yeniS = kalan === 'gun' ? Math.ceil(ops[q]!.C) + 24 : ops[p]!.S;
      const pBitis = yeniS + (ops[p]!.C - ops[p]!.S) / (kalan === 'gun' ? 1 : 2);
      const yeniOps = { ...ops, [p]: { ...ops[p]!, S: yeniS, C: pBitis }, [q]: { ...ops[q]!, S: pBitis, C: pBitis + ops[q]!.C - ops[q]!.S } };
      const w = { ...(calisma['w'] as Record<string, unknown>), durdurulan: { [p]: 1 } };
      const s2 = await calismaKaydet({ ...calisma, plan: { ...plan, ops: yeniOps } as Calisma['plan'], locks: {}, w }, s1);
      const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Süren baştan kur', calismaSurumu: s2, dortSaatGerekcesi: 'Deneme gerekçesi: süren iş taşındı' });
      assert.equal(r.statusCode, 200, r.body);
      assert.match(r.json<CalismaGonderCevabi>().uyarilar?.join(' ') ?? '', / OP \d+ terminalde durdurulmayı bekliyor: canlıda eski yerinde kaldı/);
      const y1 = await yerOf(isler[0]), y2 = await yerOf(isler[1]);
      assert.equal(y1.baslangic, once.baslangic, 'süren iş canlıda yerinden oynamaz');
      assert.ok(Date.parse(y2.baslangic) >= Date.parse(y1.bitis) - 1000, `ardıl süren işin bitişinden önce başlamaz: ${y1.bitis} / ${y2.baslangic}`);
    } finally {
      await vt().tx((db) => emirDurdur(db, op, emir, durusNedeniId)).catch(() => undefined);
    }
  };
  let durusNedeniId = 0;
  for (const ayri of [false, true]) {
    for (const kalan of ['gun', 'yarim', 'motor'] as const) {
      test(`TK-09 (3600): süren işin kalanı baştan kurda dizilince (${kalan === 'gun' ? 'gün sonraya' : kalan === 'yarim' ? 'kısalarak' : 'motor plan-uygula'}) kilitsiz ardıl süren işten önce başlamaz; canlıya alma 200, uyarı çıkar (${ayri ? 'ayrı' : 'aynı'} tezgâh)`, async () => {
        durusNedeniId = (await vt().tek<{ id: number }>("INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ($1, 'Deneme duruşu', 'plansiz', 901) ON CONFLICT (kod) DO UPDATE SET ad = excluded.ad RETURNING id", [`TK9${ayri ? 'A' : 'B'}${kalan === 'gun' ? 'G' : kalan === 'yarim' ? 'Y' : 'M'}`]))!.id;
        await surenBastanKur(ayri, kalan);
      });
    }
  }

  // Risk K1: çalışma belgesi sayfadan yazılır; ayarsız işlemden kısa süre kabul edilmez, sabit iş tam süreyle yazılır.
  test('TK-07: sabit işin çalışmadaki süresi ayarsız işlemden kısaysa tam süreyle yazılır (reddedilen süre)', async () => {
    const { surum, isler } = await planliCalisma(true);
    const { calisma } = await calismaOku();
    const plan = calisma.plan!;
    const ops = plan.ops as Record<string, { m: string; S: number; C: number; job?: string }>;
    const son = Object.values(ops).map((o) => String(o.job)).sort().at(-1);
    const [p] = Object.keys(ops).filter((x) => String(ops[x]!.job) === son).sort((a, b) => ops[a]!.S - ops[b]!.S) as [string];
    const tamDk = Math.round((ops[p]!.C - ops[p]!.S) * 60);
    const s1 = await calismaKaydet({ ...calisma, plan: { ...plan, ops: { ...ops, [p]: { ...ops[p]!, C: ops[p]!.S + 1 / 60 } } } as Calisma['plan'], locks: { [p]: { m: ops[p]!.m, S: ops[p]!.S } } }, surum);
    const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Sabit bir dakika', calismaSurumu: s1, dortSaatGerekcesi: null });
    assert.equal(r.statusCode, 200, r.body);
    const y1 = (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler.find((x) => x.isEmriId === isler[0])!;
    assert.ok((Date.parse(y1.bitis) - Date.parse(y1.baslangic)) / 60_000 >= tamDk, `bir dakikalık önizleme kabul edilmedi: ${y1.baslangic} - ${y1.bitis}, tam ${String(tamDk)} dk`);
  });
});
