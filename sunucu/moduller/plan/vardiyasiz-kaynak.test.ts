import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { calismaTakvimleri } from '../vardiya/disari.ts';
import { vardiyasiTanimsiz } from './kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// B-2483-5, B-2483-6 (168 b): vardiyası tanımlanmamış makine sürekli çalışır sayılmaz; tanımlı ama ufukta 0 dakikalı kaynak tanımsız
// sayılmaz, kapasitesi 0'dır. Veriler uydurmadır.
describe('vardiyası tanımsız ve sıfır kapasiteli kaynak', () => {
  test('vardiyasiTanimsiz: takvim yok, matris boş tanımsız; tanımlı 0 dakika tanımlı; eski cevapta bütün günleri 0 olan tanımsız', () => {
    const gun = (dakika: number) => ({ dakika });
    assert.equal(vardiyasiTanimsiz(null), true);
    assert.equal(vardiyasiTanimsiz({ vardiyaTanimli: false, gunler: [gun(0)] }), true);
    assert.equal(vardiyasiTanimsiz({ vardiyaTanimli: true, gunler: [gun(0), gun(0)] }), false, 'izinli ya da ayrılmış kişi');
    assert.equal(vardiyasiTanimsiz({ gunler: [gun(0)] }), true);
    assert.equal(vardiyasiTanimsiz({ gunler: [gun(0), gun(480)] }), false);
  });

  describe('gerçek PostgreSQL', () => {
    const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, planOku, durum } = planTestOrtami();

    let vardiyasiz: { istasyonId: number; makineId: number } | null = null;
    async function vardiyasizMakine(): Promise<{ istasyonId: number; makineId: number }> {
      if (vardiyasiz) return vardiyasiz;
      const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'VS-IM', ad: 'Vardiyasiz merkez', aciklama: null });
      const istasyonId = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'VS-A', ad: 'Vardiyasiz istasyon', isMerkeziId: merkez.id })).id;
      const makineId = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'VS-MA', ad: 'Vardiyasiz makine', istasyonId })).id;
      vardiyasiz = { istasyonId, makineId };
      return vardiyasiz;
    }

    test('vardiya takvimi matrisi boş merkezi tanımsız, dolu merkezi tanımlı bildirir', async () => {
      const { makineId } = await vardiyasizMakine();
      const { makineA } = durum();
      const bugun = tesisGunu(Date.now());
      const t = await vt().tx((db) => calismaTakvimleri(db, [{ tur: 'makine', id: makineId }, { tur: 'makine', id: makineA }],
        { baslangic: bugun, bitis: tesisGunu(Date.now() + 3 * 86_400_000) }));
      assert.equal(t.get(`makine:${String(makineId)}`)?.vardiyaTanimli, false);
      assert.equal(t.get(`makine:${String(makineA)}`)?.vardiyaTanimli, true);
    });

    test('vardiyasız makinenin istasyon kapasitesi 0; elle yerleştirme oraya iş koymaz', async () => {
      const v = await vardiyasizMakine();
      const m = { id: v.makineId, istasyon_id: v.istasyonId };
      const [is] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: m.id } })]);
      const p: PlanCevabi = await planOku();
      const yuk = p.istasyonYuku.find((x) => x.istasyonId === m.istasyon_id);
      assert.ok(yuk, 'istasyon yükte görünür');
      assert.ok(yuk.kapasite.every((k) => k === 0), JSON.stringify(yuk.kapasite));
      const bas = new Date(tesisGunBasi(tesisGunu(Date.now())) + 2 * 86_400_000 + 10 * 3_600_000).toISOString();
      const r = await istek(c.planlama, 'POST', '/plan/yerlestir', { taslak: null, isEmriId: is, kaynak: { tur: 'makine', id: m.id }, baslangic: bas, planSurumu: p.surum });
      assert.equal(r.statusCode, 409, r.body);
    });
  });
});
