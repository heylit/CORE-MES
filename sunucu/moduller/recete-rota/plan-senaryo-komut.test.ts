import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planSenaryoKomutlari } from '../../../istemci/src/moduller/recete-rota/plan-senaryo-komutlari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Ekranın stüdyosu plan modülünün taslağıdır (plan-ekran-verisi-yeri.md 4.2). Köprünün kurduğu istekler plan modülünün gerçek uçlarına
// gider: taslak açılır, plan ayarı taslağa ayar ucundan yazılır, onaya gönderilir ve canlıya alınır (H0: canlıya yalnız onaydaki taslak); ikinci taslak silinince kapanır. Köprü taslağın sürümünü yazmadan önce
// plan okumasından alır; bu testte okuma aynı uygulamaya gider. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('plan stüdyosu komutları plan modülünün uçlarına (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let sayac = 0;

  const getir = async <T>(yol: string): Promise<T> => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return c.json();
  };
  const komutlar = planSenaryoKomutlari((yol) => getir(yol));
  const komut = async <T>(ad: string, girdi: Record<string, unknown>): Promise<{ durum: number; govde: T }> => {
    const istek = await komutlar[ad]!.hazirla(girdi);
    sayac += 1;
    const c = await app.inject({ method: 'POST', url: `/api${istek.yol}`, payload: istek.govde,
      headers: { cookie: cerez, ...(istek.tekrarKorumali === true ? { [ISTEK_KIMLIGI_BASLIGI]: `00000000-0000-4000-8000-${String(sayac).padStart(12, '0')}` } : {}) } });
    return { durum: c.statusCode, govde: c.json() };
  };

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_plan_senaryo');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  test('aç, ayarı taslağa yaz, onaya gönder, canlıya al; taslağa yazım canlıyı değiştirmez; sil taslağı kapatır', async () => {
    const ac = await komut<SenaryolarCevabi>('plan-senaryo-ac', { ad: 'Senaryo 1', sinsi: 'gecmemeli' });
    assert.equal(ac.durum, 200, JSON.stringify(ac.govde));
    const taslak = ac.govde.senaryolar.find((x) => x.benim && x.durum === 'acik' && x.ad === 'Senaryo 1')!.id;

    const canliAyar = (await getir<PlanCevabi>('/plan')).ayar;
    const ayar = { ...canliAyar, kural: canliAyar.kural === 'fifo' ? 'teslim' : 'fifo' };
    // Ayar yalnız ayar ucundan yazılır: kuyruk yazımı ayar taşımaz, kuyruksuz yazım reddedilir.
    assert.equal((await komut('plan-senaryo-yaz', { taslak, ayar, kuyruklar: [] })).durum, 400);
    for (let i = 0; i < 2; i++) {
      const yaz = await komut<PlanCevabi>('plan-senaryo-ayar', { taslak, ayar, sinsi: 'gecmemeli' });
      assert.equal(yaz.durum, 200, JSON.stringify(yaz.govde));
      assert.equal(yaz.govde.taslak?.id, taslak, 'aynı taslağa yazılır (sürüm her yazımdan önce okunur)');
    }
    assert.equal((await getir<PlanCevabi>(`/plan?taslak=${String(taslak)}`)).ayar.kural, ayar.kural);
    assert.equal((await getir<PlanCevabi>('/plan')).ayar.kural, canliAyar.kural, 'canlı değişmedi');

    // Açık taslak canlıya alınmaz: önce onaya gider.
    assert.notEqual((await komut('plan-senaryo-canliya-al', { taslak })).durum, 200);
    assert.equal((await getir<PlanCevabi>('/plan')).ayar.kural, canliAyar.kural, 'onaysız canlıya alınmadı');
    const gonder = await komut<SenaryolarCevabi>('plan-senaryo-onaya-gonder', { taslak, not: 'Deneme notu' });
    assert.equal(gonder.durum, 200, JSON.stringify(gonder.govde));
    assert.equal(gonder.govde.senaryolar.find((x) => x.id === taslak)!.durum, 'onayda');
    const al = await komut<SenaryolarCevabi>('plan-senaryo-canliya-al', { taslak });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.equal(al.govde.senaryolar.find((x) => x.id === taslak)!.durum, 'canliya_alindi');
    assert.equal((await getir<PlanCevabi>('/plan')).ayar.kural, ayar.kural);

    const ikinci = (await komut<SenaryolarCevabi>('plan-senaryo-ac', { ad: 'Senaryo 2' })).govde.senaryolar.find((x) => x.ad === 'Senaryo 2')!.id;
    // Geri gönderilen taslak açığa döner; onaydan çekilen de. Açık taslaktan vazgeçilir.
    assert.equal((await komut('plan-senaryo-onaya-gonder', { taslak: ikinci })).durum, 200);
    const geri = await komut<SenaryolarCevabi>('plan-senaryo-geri-gonder', { taslak: ikinci, neden: 'Teslim kayıyor' });
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.equal(geri.govde.senaryolar.find((x) => x.id === ikinci)!.durum, 'acik');
    assert.equal((await komut('plan-senaryo-onaya-gonder', { taslak: ikinci })).durum, 200);
    assert.equal((await komut('plan-senaryo-onaydan-cek', { taslak: ikinci })).durum, 200);
    const sil = await komut<SenaryolarCevabi>('plan-senaryo-vazgec', { taslak: ikinci });
    assert.equal(sil.durum, 200, JSON.stringify(sil.govde));
    assert.equal(sil.govde.senaryolar.find((x) => x.id === ikinci)!.durum, 'vazgecildi');
  });

  test('bozuk girdi istek kurulmadan reddedilir', async () => {
    await assert.rejects(komutlar['plan-senaryo-yaz']!.hazirla({ taslak: '3', kuyruklar: [] }), /Geçersiz taslak/);
    await assert.rejects(komutlar['plan-senaryo-yaz']!.hazirla({ taslak: 3 }), /Geçersiz kuyruk/);
    await assert.rejects(komutlar['plan-senaryo-ac']!.hazirla({ ad: ' ' }), /Geçersiz senaryo adı/);
    await assert.rejects(komutlar['plan-senaryo-geri-gonder']!.hazirla({ taslak: 3, neden: ' ' }), /Geçersiz neden/);
    await assert.rejects(komutlar['plan-senaryo-ayar']!.hazirla({ taslak: 3, ayar: [] }), /Geçersiz ayar/);
    await assert.rejects(komutlar['plan-canliya-al']!.hazirla({ taslak: 0 }), /Geçersiz taslak/);
    await assert.rejects(komutlar['plan-dondur']!.hazirla({ taslak: 'yeni' }), /Geçersiz taslak/);
    await assert.rejects(komutlar['plan-is-dondurmayi-kaldir']!.hazirla({ anahtar: 'UE-1' }), /Geçersiz iş/);
  });
});
