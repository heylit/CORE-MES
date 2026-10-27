import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tesisGunBasi } from '#paylasilan/zaman.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { anSabit, gunduzde } from './plan-saat.test.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

describe('plan (gerçek PostgreSQL): öner, taşıma, kilit, stüdyo', () => {
  const { c, vt, istek, tamam, mamulAc, tip, yeniAdim, yururlugeAlinmisRota, isEmirleriAc, isEmriDurumu, isEmriMakinesi, planOku, yer, tg, taslaktaOner, isEmriKomutu, taslagaYaz, durum } = planTestOrtami();
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
  let denemeProjeId = 0;
  let istasyonB = 0;
  let makineA = 0;
  let makineB = 0;
  let operatorId = 0;
  before(() => { ({ ortam, denemeProjeId, istasyonB, makineA, makineB, operatorId } = durum()); });

  test('P1, PL-01, P6 (ADR 0018): Planı kur yeni taslağa yazar, canlı değişmez; aynı kaynakta üst üste binmez; kişi kaynaklı adım ortak motora gitmez', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'kisi', id: operatorId } })]);
    const [b1] = await isEmirleriAc([yeniAdim()]);
    const canliOnce = await planOku();
    const isi = (id: number) => { const y = canliOnce.yerlesmemis.find((x) => x.isEmriId === id)!; return { emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false }; };
    const govde = (taslak?: { id: number; surum: number }) => ({ planSurumu: canliOnce.surum, ...(taslak ? { taslak } : {}),
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: [isi(a1!), isi(b1!)] }] });
    const k = await tamam<{ taslak: number; canli: boolean }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', govde());
    assert.equal(k.canli, false);
    const p = await planOku(k.taslak);
    assert.deepEqual([p.personelYuku, p.gostergeler.personelGun], [[], null], 'kişisi bağlı iş merkezi yokken personel verisi uydurulmaz');
    assert.ok(p.taslak && p.taslak.benim);
    const y1 = yer(p, a1!), y3 = yer(p, b1!);
    assert.deepEqual([y1.kaynak, y3.kaynak], [{ tur: 'makine', id: makineA }, { tur: 'makine', id: makineA }]);
    assert.ok(Date.parse(y3.baslangic) >= Date.parse(y1.bitis), 'aynı kaynakta üst üste binmez');
    // Kişi kaynaklı adım (PL-02) ortak motorun girdisinde yoktur; Motor A onu öncülünden sonra yerleştiriyordu (FARK.md).
    assert.equal(p.yerlesimler.some((y) => y.isEmriId === a2), false);
    const canli = await planOku();
    assert.equal(canli.taslak, null);
    assert.equal(canli.yerlesimler.some((y) => y.isEmriId === a1), false, 'canlı değişmez');
    // Aynı taslağa yazma: sürüm denetlenir; başkasının taslağına yazılamaz (yetki katmanı değil, taslak sahipliği).
    assert.equal((await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', govde({ id: p.taslak!.id, surum: p.taslak!.surum + 3 }))).statusCode, 409);
    assert.equal((await istek(c.mudur, 'POST', '/plan/kuyruklari-yaz', govde(tg(p)))).statusCode, 403);
    assert.equal((await istek(c.planlama2, 'POST', '/plan/kuyruklari-yaz', govde(tg(p)))).statusCode, 403);
    const k2 = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', govde(tg(p)));
    assert.equal(k2.taslak, p.taslak!.id);
  });

  // Planı kur ilk işi dakikaya yuvarlanmış şimdiden başlatır; çakışma denemesi o ana taşır. Dakika sınırı geçerse an geçmişte kalır ve geçmiş
  // denetimi (400) çakışmadan (409) önce döner: saat sabitlenir.
  test('P5 ret: çakışma, yetkisiz rol, pasif makine; izinli taşıma geçer, canlıya alınca makine iş emrine yazılır (P3)', async () => anSabit(async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const y = yer(p, i1!);
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: y.baslangic }, c.operator)).statusCode, 403);
    const baska = p.yerlesimler.find((x) => x.isEmriId !== i1 && x.kaynak.tur === 'makine' && x.kaynak.id === makineA)!;
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: baska.baslangic })).statusCode, 409);
    const pasif = await tamam<{ id: number; surum: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-MP', ad: 'Deneme pasif', istasyonId: istasyonB });
    await tamam(c.yonetici, 'POST', `/makineler/${pasif.id}/guncelle`, { kod: 'PL-MP', ad: 'Deneme pasif', istasyonId: istasyonB, aktif: false, surum: pasif.surum });
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: pasif.id }, baslangic: y.baslangic })).statusCode, 422);
    const ileri = new Date(Date.parse(y.baslangic) + 30 * 24 * 3600_000).toISOString();
    const r = await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri });
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json<PlanCevabi>();
    assert.deepEqual(yer(t, i1!).kaynak, { tur: 'makine', id: makineB });
    assert.ok(yer(t, i1!).uyarilar.some((u) => /rotadaki/.test(u)), 'aday dışı kaynak uyarısı');
    assert.equal(await isEmriMakinesi(i1!), makineA, 'taslak iş emrine yazmaz');
    const s = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${t.taslak!.id}/canliya-al`, { surum: await gonder(t.taslak!.id, t.taslak!.surum), cakismalariKabul: true });
    assert.equal(s.senaryolar.find((x) => x.id === t.taslak!.id)?.durum, 'canliya_alindi');
    assert.deepEqual(yer(await planOku(), i1!).kaynak, { tur: 'makine', id: makineB });
    assert.equal(await isEmriMakinesi(i1!), makineB);
  }));

  test('demo 2.16: emrin ilk adımı bitince ya da çalışırken bekleyen adımı başlamış sayılmaz, taşınır ve sıralanır; çalışan adım taşınmaz', async () => {
    const [i1, i2] = await isEmirleriAc([yeniAdim(), yeniAdim()]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    await isEmriDurumu(i1!, 'calisiyor');
    p = await planOku();
    assert.equal(yer(p, i1!).durum, 'basladi', 'çalışan adım');
    assert.equal(yer(p, i2!).durum, 'planli', 'aynı emrin bekleyen adımı');
    p = await taslaktaOner();
    const ileri = new Date(Date.parse(yer(p, i2!).baslangic) + 30 * 24 * 3600_000).toISOString();
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: yer(p, i1!).kaynak, baslangic: ileri })).statusCode, 409);
    const r = await isEmriKomutu(p, i2!, 'tasi', { kaynak: yer(p, i2!).kaynak, baslangic: ileri });
    assert.equal(r.statusCode, 200, r.body);
    await vt().tx((db) => db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', bitis = now(), saglam_adet = 10 WHERE id = $1", [i1]));
    p = r.json<PlanCevabi>();
    assert.equal(yer(await planOku(p.taslak!.id), i2!).durum, 'planli', 'ilk adım bitince de');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('A4 (3b): çalışan işin önüne iş konur ve canlıya alınınca canlıda arkaya kayar; dondurulmuş çalışan işin önüne konamaz', async () => {
    const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-M3B', ad: 'Deneme 3b', istasyonId: istasyonB });
    const kaynak = { tur: 'makine' as const, id: m.id };
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const [j1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    let p = await taslaktaOner();
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const [once, sonra] = [i1!, j1!].sort((x, y) => Date.parse(yer(p, x).baslangic) - Date.parse(yer(p, y).baslangic)) as [number, number];
    await isEmriDurumu(once, 'calisiyor');
    p = await taslaktaOner();
    assert.equal(yer(p, once).durum, 'basladi');
    assert.equal((await isEmriKomutu(p, once, 'tasi', { kaynak, baslangic: yer(p, sonra).bitis })).statusCode, 409, 'çalışan iş başka yere taşınmaz');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak, isEmriIdleri: [sonra, once] });
    assert.ok(Date.parse(yer(p, once).baslangic) >= Date.parse(yer(p, sonra).bitis), 'taslakta çalışan iş arkaya kaydı');
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    const canli = await planOku();
    assert.ok(Date.parse(yer(canli, once).baslangic) >= Date.parse(yer(canli, sonra).bitis), 'canlıda çalışan iş arkaya kaydı');
    assert.deepEqual([yer(canli, sonra).elleSira, yer(canli, once).elleSira], [1, 2]);
    assert.equal(await isEmriMakinesi(once), m.id, 'çalışan işin makinesi değişmez');

    // Dondurulmuş çalışan iş: önüne iş konamaz. Dondurma canlıya alınmaz; eşzamanlı test dosyaları aynı canlı planı okur.
    await isEmriDurumu(once, 'bekliyor');
    p = await taslaktaOner();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondur', { taslak: tg(p) });
    const ilk = [once, sonra].sort((x, y) => Date.parse(yer(p, x).baslangic) - Date.parse(yer(p, y).baslangic)) as [number, number];
    assert.equal(yer(p, ilk[0]).dondurulmus, true, 'yakın iş donduruldu');
    await isEmriDurumu(ilk[0], 'calisiyor');
    assert.equal((await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak, isEmriIdleri: [ilk[1], ilk[0]] })).statusCode, 409);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    await isEmriDurumu(ilk[0], 'bekliyor');
  });

  test('denetim #23: çalışan iş gerçek başlangıcından şimdi + kalan adedin süresine uzanır (ayar düşülür)', async () => {
    await gunduzde(async () => {
      const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-M23', ad: 'Deneme 23', istasyonId: istasyonB });
      const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m.id } })]);
      const p = await taslaktaOner();
      await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
      await vt().tx(async (db) => {
        await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = $2 WHERE id = $1", [i1, new Date(Date.now() - 2 * 3600_000)]);
        await db.sorgu(
          `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
           SELECT uretim_emri_id, id, $2, $3, 'saglam', t.adet, $4 FROM uretim_emirleri_is_emri, (VALUES (4), (2)) AS t(adet) WHERE id = $1`,
          [i1, operatorId, istasyonB, new Date()]);
      });
      const simdi = Date.now();
      const y = yer(await planOku(), i1!);
      assert.equal(y.durum, 'basladi');
      const dakika = (t: string) => (Date.parse(t) - simdi) / 60_000;
      assert.ok(Math.abs(dakika(y.baslangic) + 120) < 2, `başlangıç gerçek: ${y.baslangic}`);
      // Kalan 10 - 6 = 4 adet x 2 dk; ayar (30 dk) düşülür.
      assert.ok(Math.abs(dakika(y.bitis) - 8) < 2, `bitiş şimdi + kalan: ${y.bitis}`);
      await isEmriDurumu(i1!, 'bekliyor');
    });
  });

  test('denetim #23: tahmini bitişi geçmişte kalan çalışan işten sonra o makinedeki iş geçmişe yerleşmez', async () => {
    await gunduzde(async () => {
      const m = await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'PL-M23G', ad: 'Deneme 23 geç', istasyonId: istasyonB });
      const kaynak = { tur: 'makine' as const, id: m.id };
      const [i1] = await isEmirleriAc([yeniAdim({ kaynak })]);
      const [j1] = await isEmirleriAc([yeniAdim({ kaynak })]);
      let p = await taslaktaOner();
      await tamam(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
      const calisan = Date.parse(yer(p, i1!).baslangic) <= Date.parse(yer(p, j1!).baslangic) ? i1! : j1!;
      const sonraki = calisan === i1 ? j1! : i1!;
      // Son sayım 4 saat önce: kalan 9 x 2 dk o andan sayılınca tahmini bitiş geçmişte kalır.
      await vt().tx(async (db) => {
        await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = $2 WHERE id = $1", [calisan, new Date(Date.now() - 5 * 3600_000)]);
        await db.sorgu(
          `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman)
           SELECT uretim_emri_id, id, $2, $3, 'saglam', 1, $4 FROM uretim_emirleri_is_emri WHERE id = $1`,
          [calisan, operatorId, istasyonB, new Date(Date.now() - 4 * 3600_000)]);
      });
      const simdi = Date.now();
      p = await taslaktaOner();
      assert.ok(Date.parse(yer(p, calisan).bitis) < simdi, `çalışan işin tahmini bitişi geçmişte: ${yer(p, calisan).bitis}`);
      assert.ok(Date.parse(yer(p, sonraki).baslangic) >= simdi - 60_000, `sonraki iş geçmişe yerleşmedi: ${yer(p, sonraki).baslangic}`);
      assert.ok(Date.parse(yer(await planOku(p.taslak!.id), sonraki).baslangic) >= simdi - 60_000, 'okumada da');
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
      await isEmriDurumu(calisan, 'bekliyor');
    });
  });

  test('P5 ret: kilitli ve başlamış iş taşınmaz ve kaldırılamaz; kilit yalnız plan.kilitle ile, kilit açılınca kaldırılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    assert.equal((await isEmriKomutu(p, i1!, 'kilitle', {}, c.operator)).statusCode, 403);
    p = (await isEmriKomutu(p, i1!, 'kilitle')).json<PlanCevabi>();
    let y = yer(p, i1!);
    assert.equal(y.kilitli, true);
    const ileri = new Date(Date.parse(y.baslangic) + 60 * 24 * 3600_000).toISOString();
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: ileri })).statusCode, 409);
    assert.equal((await isEmriKomutu(p, i1!, 'kaldir')).statusCode, 409);
    // PL-08: motor kilitliyi yerinde bırakır.
    p = await taslaktaOner(c.planlama, p);
    assert.equal(yer(p, i1!).baslangic, y.baslangic);
    p = (await isEmriKomutu(p, i1!, 'kilidi-ac')).json<PlanCevabi>();
    y = yer(p, i1!);
    await isEmriDurumu(i1!, 'calisiyor');
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: ileri })).statusCode, 409);
    assert.equal((await isEmriKomutu(p, i1!, 'kaldir')).statusCode, 409);
    await isEmriDurumu(i1!, 'bekliyor');
    const r = await isEmriKomutu(p, i1!, 'kaldir');
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(r.json<PlanCevabi>().yerlesmemis.some((x) => x.isEmriId === i1));
  });

  test('dondurulmuş bölge ve ayar (PL-07): dondur yakın işleri sabitler, tek tek ya da toptan çözülür; ayar taslağa yazılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const ilkAyar = (await planOku()).ayar;
    let p = await taslaktaOner();
    assert.equal(p.ayar.dondurmaGun, 2);
    assert.equal((await istek(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, tamponGun: 1.25 } })).statusCode, 400);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, kural: 'edd', tamponGun: 1.5 } });
    assert.equal(p.ayar.kural, 'edd');
    assert.equal((await planOku()).ayar.kural, 'oncelik', 'canlı ayar değişmez');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondur', { taslak: tg(p) });
    const y = yer(p, i1!);
    assert.equal(y.dondurulmus, true);
    assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: new Date(Date.parse(y.baslangic) + 86_400_000).toISOString() })).statusCode, 409);
    p = (await isEmriKomutu(p, i1!, 'dondurmayi-kaldir')).json<PlanCevabi>();
    assert.equal(yer(p, i1!).dondurulmus, false);
    assert.equal((await isEmriKomutu(p, i1!, 'dondurmayi-kaldir')).statusCode, 409);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondurmayi-kaldir', { taslak: tg(p) });
    assert.equal(p.yerlesimler.some((x) => x.dondurulmus), false);
    // Taslağın ayarı canlıya almayla canlıya geçer; sonraki testler için ilk ayar yeni taslakla geri alınır.
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
    assert.deepEqual((await planOku()).ayar, { ...ilkAyar, kural: 'edd', tamponGun: 1.5 });
    const geri = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: null, ayar: ilkAyar });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${geri.taslak!.id}/canliya-al`, { surum: await gonder(geri.taslak!.id, geri.taslak!.surum), cakismalariKabul: true });
    assert.deepEqual((await planOku()).ayar, ilkAyar);
  });

  test('P5 ret: kapsam dışı istasyonun kaynağı yazılamaz ve listede görünmez; uyarı: teslim gecikmesi', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()], 10, '2020-01-01');
    const p = await taslaktaOner();
    const y = yer(p, i1!);
    assert.ok(y.uyarilar.some((u) => /Teslim/.test(u)));
    assert.ok(p.gostergeler.geciken >= 1);
    const baska = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'PL-K', ad: 'Deneme kapsam', aciklama: null });
    const planlamaId = (await vt().tx((db) => db.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme planlama'")))!.id;
    await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${planlamaId}/belirle`, { isMerkeziIdleri: [baska.id] });
    try {
      assert.equal((await isEmriKomutu(p, i1!, 'tasi', { kaynak: y.kaynak, baslangic: y.baslangic })).statusCode, 403);
      assert.equal((await planOku(p.taslak!.id)).yerlesimler.length, 0);
    } finally {
      await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${planlamaId}/belirle`, { isMerkeziIdleri: [] });
    }
  });

  test('kuyruk sırası (KY-03): aynı kaynaktaki işler verilen sırayla arka arkaya dizilir ve elle sıra alır; yanlış kaynak reddedilir', async () => {
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const [i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineB } })]);
    const [a1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    const [a2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    let p = await taslaktaOner();
    const kuyruk = p.yerlesimler.filter((x) => x.isEmriId === i1 || x.isEmriId === i2);
    const ters = [...kuyruk].sort((a, b) => Date.parse(b.baslangic) - Date.parse(a.baslangic)).map((x) => x.isEmriId);
    assert.equal((await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineA }, isEmriIdleri: ters })).statusCode, 400);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, isEmriIdleri: ters });
    const yeni = ters.map((id) => yer(p, id));
    assert.ok(Date.parse(yeni[1]!.baslangic) >= Date.parse(yeni[0]!.bitis));
    assert.deepEqual(yeni.map((x) => x.elleSira), [1, 2]);
    // Motor elle sırayı korur; "Elle sıraları sil" sonra kural sırası.
    p = await taslaktaOner(c.planlama, p);
    assert.ok(Date.parse(yer(p, ters[0]!).baslangic) < Date.parse(yer(p, ters[1]!).baslangic));
    // Plan sırasına dön (tek kuyruk): yalnız o makinenin elle sırası kalkar; elle sırası olmayan kuyrukta 409.
    const kuyrukDon = (pp: PlanCevabi, id: number) => istek(c.planlama, 'POST', '/plan/kuyruk/plan-sirasina-don', { taslak: tg(pp), kaynak: { tur: 'makine', id } });
    assert.equal((await kuyrukDon(p, makineA)).statusCode, 409);
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineA }, isEmriIdleri: [a2!, a1!] });
    p = (await kuyrukDon(p, makineB)).json<PlanCevabi>();
    assert.deepEqual(ters.map((id) => yer(p, id).elleSira), [null, null]);
    assert.deepEqual([a2!, a1!].map((id) => yer(p, id).elleSira), [1, 2], 'başka kuyruğun elle sırası kalır');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, isEmriIdleri: ters });
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/elle-siralari-sil', { taslak: tg(p) });
    assert.equal(p.yerlesimler.some((x) => x.elleSira !== null), false);
    // ADR 0018: Motor A'nın kural karşılaştırması kalktı (sıralamayı planlama sayfası verir).
    assert.equal((await istek(c.planlama, 'GET', `/plan/karsilastir?taslak=${p.taslak!.id}`)).statusCode, 404);
  });

  test('FIFO kuralı: ayar taslağa yazılır, tanımsız kural reddedilir, canlı ayar satırı değişmez; kısıt beş değeri kabul eder', async () => {
    const ilkAyar = (await planOku()).ayar;
    const p = await taslaktaOner();
    const f = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, kural: 'fifo' } });
    assert.equal(f.ayar.kural, 'fifo');
    assert.equal((await istek(c.planlama, 'POST', '/plan/ayar', { taslak: tg(f), ayar: { ...f.ayar, kural: 'lifo' } })).statusCode, 400);
    assert.deepEqual((await planOku()).ayar, ilkAyar, 'canlı ayar değişmez');
    const kural = (tablo: string) => ortam!.vt.tx((db) => db.sorgu<{ kural: string }>(`SELECT kural FROM ${tablo}`));
    assert.deepEqual((await kural('plan_ayari')).map((x) => x.kural), [ilkAyar.kural], 'göçten sonra mevcut satır aynı');
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu(`UPDATE plan_ayari SET kural = 'lifo'`)), /plan_ayari_kural/);
    await ortam!.sahip.tx((db) => db.sorgu(`UPDATE plan_ayari SET kural = 'fifo'`));
    await ortam!.sahip.tx((db) => db.sorgu(`UPDATE plan_ayari SET kural = $1`, [ilkAyar.kural]));
    assert.deepEqual((await planOku()).ayar, ilkAyar);
  });

  test('P4, P6 stüdyo: değişiklik defteri, tek değişikliği kaldırma, hızlı deneme canlıya alınmaz, canlı değişince onay, vazgeç', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    assert.equal((await istek(c.operator, 'POST', '/plan/senaryolar', { ad: 'Deneme' })).statusCode, 403);
    let l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Deneme senaryo', aciklama: 'not' });
    let s = l.senaryolar.find((x) => x.ad === 'Deneme senaryo')!;
    let p = await taslaktaOner(c.planlama, s.id);
    const y = yer(p, i1!);
    const ileri = new Date(Date.parse(y.baslangic) + 90 * 24 * 3600_000).toISOString();
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: ileri })).json<PlanCevabi>();
    l = await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar');
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.deepEqual(s.degisiklikler.map((d) => d.tur), ['sirala', 'tasi'], 'Planı kur defterde sıralamadır (ADR 0018)');
    assert.ok(s.etki && s.etki.tarihiDegisenEmirler.length > 0);
    // Taşımayı kaldır: iş emri canlıdaki hâline (yerleşmemiş) döner.
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/degisiklikler/${s.degisiklikler[1]!.id}/kaldir`, { surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.degisiklikler.length, 1);
    assert.equal(yer(await planOku(s.id), i1!), undefined);
    // Hızlı dene: kapalı gün benzetilir; canlıya alınabilir ama vardiya yazma yetkisi de ister (kalitede yok).
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'gun', surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.bekleyenler.length, 0);
    {
      const gonderilen = await gonder(s.id, s.surum);
      const r = await istek(c.kalite, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: gonderilen, cakismalariKabul: true });
      assert.equal(r.statusCode, 403);
      assert.match(r.body, /vardiya yazma yetkisi/);
      s = { ...s, surum: await cek(s.id, gonderilen) };
    }
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/degisiklikleri-at`, { surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.degisiklikler.length, 0);
    // Canlı değişir (başka taslak canlıya alınır): onaysız canlıya alma reddedilir, yetkisiz rol reddedilir.
    // Aynı tabandan açılmış taslak 502 a ile kapanır; burada 502'den önce eski tabandan açılıp açık kalmış taslak benzetilir.
    const baska = await taslaktaOner();
    await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_senaryosu SET taban_plan_surumu = taban_plan_surumu - 1 WHERE id = $1', [s.id]));
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${baska.taslak!.id}/canliya-al`, { surum: await gonder(baska.taslak!.id, baska.taslak!.surum), cakismalariKabul: true });
    l = await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar');
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.canliDegisti, true);
    {
      const gonderilen = await gonder(s.id, s.surum);
      assert.equal((await istek(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: gonderilen })).statusCode, 409);
      assert.equal((await istek(c.operator, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: gonderilen, cakismalariKabul: true })).statusCode, 403);
      s = { ...s, surum: await cek(s.id, gonderilen) };
    }
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/canliyi-al`, { surum: s.surum });
    s = l.senaryolar.find((x) => x.id === s.id)!;
    assert.equal(s.canliDegisti, false);
    const kopya = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/cogalt`)).senaryolar.find((x) => x.ad === 'Deneme senaryo (kopya)');
    assert.ok(kopya);
    assert.equal((await istek(c.planlama2, 'POST', `/plan/senaryolar/${s.id}/vazgec`, { surum: s.surum })).statusCode, 403, 'başkasının senaryosu');
    l = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/vazgec`, { surum: s.surum });
    assert.equal(l.senaryolar.find((x) => x.id === s.id)?.durum, 'vazgecildi');
    assert.equal((await taslagaYaz(c.planlama, { id: s.id, surum: s.surum + 1 }, i1!)).statusCode, 409);
  });

  test('#262: bölünmüş alt parti planda ayrı emirdir ve üst emrini taşır; bölünmemiş emirde üst boş', async () => {
    const [ilk, ikinci] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } })], 10);
    await vt().tx((db) => db.sorgu(
      "UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [ilk]));
    const ustId = (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [ikinci])))!.id;
    const ust = await tamam<{ emir: { surum: number } }>(c.planlama, 'GET', `/adimli-emirler/${ustId}`);
    const { altEmirId } = await tamam<{ altEmirId: number }>(c.planlama, 'POST', `/adimli-emirler/${ustId}/bol`, { adimSira: 2, adet: 4, surum: ust.emir.surum });
    // Üst emrin kalan adımı çalışıyor ve canlıda yeri yok: öneri onu yerleştirmez, yerleşmemiş satırından gelir.
    await isEmriDurumu(ikinci!, 'calisiyor');
    // Alt partinin adımı makinesiz açılır; Planı kur'da makineyi sayfa seçer (ADR 0018), burada istasyonun makinesi verilir.
    await vt().tx((db) => db.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $1 WHERE uretim_emri_id = $2', [makineB, altEmirId]));
    const p = await taslaktaOner();
    const emir = (id: number) => p.emirler.find((x) => x.uretimEmriId === id)!;
    assert.deepEqual([emir(ustId).ustEmirId, emir(altEmirId).ustEmirId, emir(altEmirId).adet], [null, ustId, 4]);
    // Yerleşim ve yerleşmemiş satırı ayrı yollardan gelir; ikisi de üst emri taşır.
    assert.equal(p.yerlesimler.find((y) => y.uretimEmriId === altEmirId)?.ustEmirId, ustId, 'yerleşim satırı');
    const ustIsi = p.yerlesmemis.find((y) => y.uretimEmriId === ustId);
    assert.ok(ustIsi, 'üst emrin adımı bu kurulumda yerleşmemiş gelir');
    assert.equal(ustIsi.ustEmirId, null);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('B7, 690 b, 686 a: kol üstün önceki adımını, üstün birleşme adımı kolun son adımını bekler; adım kolların adediyle sürer; ek adım kendi süresiyle yerleşir', async () => {
    const [a, b, son] = await isEmirleriAc([yeniAdim(), yeniAdim({ kaynak: { tur: 'makine', id: makineB } }), yeniAdim()], 10);
    const satir = (id: number) => vt().tx((db) => db.tek<{ emir: number; op: number }>(
      'SELECT uretim_emri_id AS emir, op_no AS op FROM uretim_emirleri_is_emri WHERE id = $1', [id]));
    const { emir: ustId } = (await satir(a!))!;
    const ust = await tamam<{ emir: { surum: number } }>(c.planlama, 'GET', `/adimli-emirler/${ustId}`);
    const opB = (await satir(b!))!.op;
    const rework = { oncekiOpNo: opB, opNo: opB + 1, tur: 'rework', ad: 'Deneme rework', operasyonTipiId: tip('TRN'), kaynak: { tur: 'makine', id: makineB },
      ayarSuresiDk: '10', birimSureDk: '1', terminGun: null };
    const { altEmirId } = await tamam<{ altEmirId: number }>(c.planlama, 'POST', `/adimli-emirler/${ustId}/bol`,
      { adimSira: 2, adet: 4, birlesmeOpNo: (await satir(son!))!.op, ekAdimlar: [rework], surum: ust.emir.surum });
    // Kolun rota adımı makinesiz açılır; Planı kur'da makineyi sayfa seçer (ADR 0018), burada üstün makinesi verilir.
    await vt().tx((db) => db.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $1 WHERE uretim_emri_id = $2 AND makine_id IS NULL', [makineB, altEmirId]));
    const p = await taslaktaOner();
    const kol = p.yerlesimler.filter((y) => y.uretimEmriId === altEmirId).sort((x, y) => x.opNo - y.opNo);
    assert.deepEqual(kol.map((y) => y.tur), ['rota', 'rework'], 'kol birleşme adımını taşımaz; ek adım türüyle gelir (686 a)');
    const dk = (y: { baslangic: string; bitis: string }) => (Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000;
    // Ayar + adet x birim: bölünmeden önceki ve birleşme adımı 10, üstün kalan adımı 6, kol 4 adet işler.
    assert.deepEqual([dk(yer(p, a!)), dk(yer(p, b!)), dk(kol[0]!), dk(kol[1]!), dk(yer(p, son!))], [50, 42, 38, 14, 50]);
    assert.ok(Date.parse(kol[0]!.baslangic) >= Date.parse(yer(p, a!).bitis), 'kol üstün önceki adımını bekler');
    assert.ok(Date.parse(kol[1]!.baslangic) >= Date.parse(kol[0]!.bitis), 'ek adım kolun önceki adımını bekler');
    assert.ok(Date.parse(yer(p, son!).baslangic) >= Date.parse(kol[1]!.bitis), 'birleşme adımı kolun son adımını bekler');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('#1372: kural gelmeden onaylanmış, ilk adımı girensiz rotadan açılan emir plana alınmaz, uyarıyla nedeni gösterilir', async () => {
    const urun = await mamulAc();
    const rev = await yururlugeAlinmisRota(urun, [yeniAdim(), yeniAdim()]);
    const [ilk] = (await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    // Eski onaylı rota: yürürlükteki içerik tetikleyiciyle korunur; tetikleyici yalnız bu silmede kapatılır.
    await ortam!.sahip.tx(async (db) => {
      await db.sorgu('ALTER TABLE rota_bileseni DISABLE TRIGGER USER');
      await db.sorgu('DELETE FROM rota_bileseni WHERE adim_id IN (SELECT id FROM rota_adimi WHERE revizyon_id = $1)', [rev]);
      await db.sorgu('ALTER TABLE rota_bileseni ENABLE TRIGGER USER');
    });
    const p = await taslaktaOner();
    assert.equal(yer(p, ilk!), undefined);
    assert.ok(p.uyarilar.some((u) => /plana alınmadı\. Rotada girdi eksik \(OP 10: giren \(hammadde ya da yarı mamul\) seçilmeli\)\.$/.test(u)), p.uyarilar.join(' | '));
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('emir önceliği ve başlangıcı plana gelir; taslak emir yalnız "taslak emirleri de planla" ayarıyla, uyarıyla yerleşir', async () => {
    const [acil] = await isEmirleriAc([yeniAdim()], 10, null, { oncelik: 1, baslangic: '2026-11-02' });
    const [tas] = await isEmirleriAc([yeniAdim()], 10, null, { taslak: true });
    let p = await taslaktaOner();
    const e = p.emirler.find((x) => x.uretimEmriId === yer(p, acil!).uretimEmriId)!;
    assert.equal(e.oncelik, 1);
    assert.ok(Date.parse(yer(p, acil!).baslangic) >= tesisGunBasi('2026-11-02'), 'emir başlangıcının tesis 00:00\'ından önce başlamaz');
    assert.equal(yer(p, tas!), undefined, 'taslak emir varsayılan olarak plana girmez');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: tg(p), ayar: { ...p.ayar, taslakEmirler: true } });
    p = await taslaktaOner(c.planlama, p);
    assert.ok(yer(p, tas!).uyarilar.some((u) => /Taslak emir/.test(u)));
    assert.equal(yer(await planOku(), tas!), undefined, 'canlı değişmez');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });
});
