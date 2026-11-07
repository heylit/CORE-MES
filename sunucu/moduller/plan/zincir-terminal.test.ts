import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaTaslagiCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Zincirin terminal ucu (2186, 2169-5 a) kendi test veritabanında koşar: zincir.test.ts'teki atölye kilidi bu dosyanın planını etkilemez.
// Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): planlama zinciri, canlıdan Üretim Terminali\'ne', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, kisiEkle, girisCerezi, durum } = planTestOrtami();

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

  // 2186 (2169-5 a): ayar (arkon.yalniz-canli-plan) açılmadan önce zincirin terminal ucu. Planlamadan canlıya alınan iş Hazırlık paketinde
  // canlı ve eşleşen görünür; Hazırlık yayınlayınca operatör başlatır, emir başlar (2189-1 a: yayınlanmamış iş başlatılamaz); ayar açıkken
  // canlıya alınmamış iş başlatılamaz. Ayar yalnız bu testte açıktır.
  test('ZT-02: canlıya alınan iş Hazırlık yayınlayınca terminalde başlar; yayınlanmamış ve ayar açıkken plansız iş reddedilir', async (t) => {
    const { ortam } = durum();
    const ayar = async (acik: boolean) => {
      await ortam!.sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'arkon.yalniz-canli-plan'");
      if (acik) await ortam!.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('arkon.yalniz-canli-plan', 'true', $1)", [durum().yoneticiId]);
    };
    await ayar(true);
    t.after(() => ayar(false));
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_zincir_operator', 'test_zincir_operator') RETURNING id");
    for (const islem of ['arkon.operator', 'sayfa.arkon', 'terminal.uret']) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
    await kisiEkle('zincirop', rol!.id);
    const operator = await girisCerezi('zincirop');
    // Operatör istasyonda yetkin olmalı (Arkon başlatma kuralı); yetkinlik İstasyonlar modülünün kaydıdır, test kurulumu doğrudan yazar.
    await vt().sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'zincirop'", [durum().istasyonA]);
    const istasyonKodu = 'RT-A';
    const paket = async (isEmriId: number) => {
      const b = await tamam<{ belgeler: { kimlik: string; govde: Record<string, unknown> }[] }>(c.yonetici, 'GET', '/arkon/belgeler/pkgs');
      const p = b.belgeler.find((x) => x.kimlik === `tmi-ie-${String(isEmriId)}`);
      assert.ok(p, `iş emri ${String(isEmriId)} Hazırlık paketinde`);
      return p.govde;
    };
    const paketPlani = async (isEmriId: number) => ((await paket(isEmriId))['tmi'] as Record<string, unknown> | undefined)?.['plan'] as Record<string, unknown> | undefined;
    // Üretim Hazırlık'ın yayını (Hazirlik.tsx: taslak paket 'published' olur, adımı olmalı); terminal yalnız yayınlanmış paketi gösterir.
    const yayinla = async (isEmriId: number) => {
      const govde = { ...(await paket(isEmriId)), status: 'published', steps: [{ id: 's1' }] };
      const y = await istek(c.yonetici, 'POST', `/arkon/belgeler/pkgs/tmi-ie-${String(isEmriId)}/yaz`, { taban: null, govde, kaynak: 'zt' });
      assert.equal(y.statusCode, 200, y.body);
      assert.equal((await paket(isEmriId))['status'], 'published', 'yayınlanan paket listede yayında');
    };
    const kayitYok = async (cid: string) => assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_kayit WHERE cid = $1', [cid]))?.n, 0);
    let cidNo = 0;
    const baslat = (isEmriId: number) => {
      const satir = { cid: `zt-${String((cidNo += 1))}`, pkgId: `tmi-ie-${String(isEmriId)}`, state: 'running', machine: istasyonKodu };
      return { satir, cevap: istek(operator, 'POST', '/arkon/kayitlar/events/ekle', { satirlar: [satir], kaynak: 'zt' }) };
    };
    const emirDurumu = async (isEmriId: number) => {
      const e = await vt().tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]);
      return (await tamam<EmirAyrintiCevabi>(c.yonetici, 'GET', `/uretim-emirleri/${String(e!.id)}`)).emir.durum;
    };

    // Planlamadan canlıya: ZT-01'in ekran sırası (çalışma, Planı kur, taslak, onay, canlı).
    const [ie] = await isEmirleriAc([yeniAdim()], 5) as [number];
    const ilk = await calismaOku();
    const surum0 = await calismaKaydet(ilk.calisma, ilk.surum);
    const kur = await planKur(surum0);
    if (kur.sonuc.tur !== 'plan-kur') return assert.fail(kur.sonuc.tur);
    const { calisma: c1, surum: s1 } = await calismaOku();
    const dataVer = c1.dataVer + 1;
    const surum = await calismaKaydet({ ...c1, dataVer, plan: { ...kur.sonuc.plan, dataVer, kaynak: 'sifir' } as unknown as Calisma['plan'] }, s1);
    const y = await tamam<CalismaTaslagiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', { ad: 'Deneme zincir terminal', calismaSurumu: surum });
    const taslakSurumu = async () => (await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(y.taslak.id)}`)).taslak!.surum;
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(y.taslak.id)}/onaya-gonder`, { surum: await taslakSurumu(), not: null });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(y.taslak.id)}/canliya-al`, { surum: await taslakSurumu(), cakismalariKabul: true });
    const yer = (await tamam<PlanCevabi>(c.planlama, 'GET', '/plan')).yerlesimler.find((x) => x.isEmriId === ie);
    assert.ok(yer, 'iş canlıda yerleşti');

    // Hazırlık: paket canlı ve eşleşen, ayar zorunlu, ama taslak; yayınlanmadan başlatma reddedilir (2189-1 a), kayıt girmez.
    const plan = await paketPlani(ie);
    assert.deepEqual([plan?.['canli'], plan?.['eslesiyor'], plan?.['zorunlu']], [true, true, true], JSON.stringify(plan));
    assert.deepEqual(plan?.['kaynak'], yer.kaynak);
    assert.equal((await paket(ie))['status'], 'draft');
    const taslak = baslat(ie);
    const taslakRed = await taslak.cevap;
    assert.equal(taslakRed.statusCode, 400, taslakRed.body);
    assert.match(taslakRed.body, /Paket yayınlanmadı/);
    await kayitYok(taslak.satir.cid);
    assert.equal(await emirDurumu(ie), 'planli');

    // Hazırlık yayınlar; terminal: operatör başlatır, emir başlar.
    await yayinla(ie);
    assert.deepEqual(await paketPlani(ie), plan, 'yayın plan durumunu değiştirmez');
    const b = baslat(ie);
    const cevap = await b.cevap;
    assert.equal(cevap.statusCode, 200, cevap.body);
    const yansima = await vt().tek<{ sonuc: string }>('SELECT y.sonuc FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id WHERE k.cid = $1', [b.satir.cid]);
    assert.equal(yansima?.sonuc, 'yazildi');
    assert.equal(await emirDurumu(ie), 'basladi');

    // Canlıya alınmamış iş: paket plansız ve zorunlu; yayınlansa da başlatma reddedilir, kayıt girmez, emir planlı kalır.
    const [plansiz] = await isEmirleriAc([yeniAdim()], 5) as [number];
    assert.deepEqual(await paketPlani(plansiz), { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: true });
    await yayinla(plansiz);
    const r = baslat(plansiz);
    const red = await r.cevap;
    assert.equal(red.statusCode, 400, red.body);
    assert.match(red.body, /Plan canlıya alınmadı/);
    await kayitYok(r.satir.cid);
    assert.equal(await emirDurumu(plansiz), 'planli');
  });
});
