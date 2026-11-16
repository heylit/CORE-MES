import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { bayatSatinAlmaTerminiYansit } from '../disari.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';

// 3256-1: satın alma termini dinleyicisi sunucu/kablolama.ts'teki bağla kurulur. Olayı satın almanın gerçek tedarik termini ucu verir;
// işaret yalnız bağ kuruluysa yazılır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): satın alma termini bağı kablolamadan', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner, hammaddeAc } = planTestOrtami();
  const emriOf = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.id;
  const say = (emirId: number) => vt().tx((db) => db.tek<{ n: number }>(
    "SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'satin-alma-termini' AND uretim_emri_id = $1", [emirId]));
  const termin = (malzemeNo: number, gun: string) =>
    tamam(c.yonetici, 'POST', '/satin-alma-tedarik-terminleri/kaydet', { malzemeNo, termin: gun, aciklama: '', surum: null });

  test('BK-K4: canlıdaki emrin malzemesine termin girilince satın alma termini işaretlenir; başka malzeme işaretlemez', async () => {
    const [kullanilan, baska] = [await hammaddeAc(), await hammaddeAc()];
    const [i1] = await isEmirleriAc([yeniAdim({ bilesenler: [{ malzemeId: kullanilan, miktar: 1, fireYuzde: 0 }] })]);
    const e1 = await emriOf(i1!);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    await termin(baska, '2099-01-05');
    assert.equal((await say(e1))?.n, 0, 'emrin kullanmadığı malzeme');
    await termin(kullanilan, '2099-01-05');
    assert.equal((await say(e1))?.n, 1, 'emrin malzemesi');
    const b = await tamam<{ bayat?: { bayat: boolean; sayilar?: Record<string, number> } }>(c.planlama, 'GET', '/plan/surum');
    assert.equal(b.bayat?.bayat, true);
    assert.equal(b.bayat?.sayilar?.['satin-alma-termini'], 1);
  });
  // 3349: fason hizmet siparişindeki firma tarihi planın dönüş günüdür (3330). Tarih girilince, değişince ya da kalkınca emir işaretlenir;
  // plan kendiliğinden değişmez. Sipariş doğrudan tabloya yazılır (talep akışı bu testin konusu değil), olayı gerçek "kalanı kapat" ucu verir.
  test('3349: canlıdaki emrin fason iş emrine bağlı siparişin firma tarihi kalkınca fason-termini işaretlenir; canlıda olmayan emir işaretlenmez', async () => {
    const fasonSay = (emirId: number) => vt().tx((db) => db.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'fason-termini' AND uretim_emri_id = $1", [emirId]));
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const e1 = await emriOf(i1!);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true, dortSaatGerekcesi: 'Deneme gerekcesi: test sirasi' });
    // Canlıya alındıktan sonra açılan emir canlıda değildir.
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const e2 = await emriOf(i2!);

    const siparisAc = async (isEmriId: number, sira: number): Promise<{ t: string; tk: string }> => {
      const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
      await vt().tx(async (db) => {
        await db.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum)
                        SELECT $1, 2099, $2, 'Deneme fason talebi', olusturan_id, olusturan_id, 'siparis_verildi' FROM projeler_proje LIMIT 1`, [t, sira]);
        await db.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar, birim, is_emri_id) VALUES ($1, $2, 1, 'Deneme fason hizmeti', 10, 'adet', $3)", [t, kl, isEmriId]);
        await db.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
        await db.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
        await db.sorgu(`INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, beklenen_teslim, logo_kayit_no, logo_gonderim_durumu, logo_gonderim_zamani)
                        VALUES ($1, $2, $3, '2099-03-01', $4, 'gonderildi', now())`, [t, tk, `SP-2099-F${String(sira)}`, String(sira)]);
        await db.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet')", [t, tk, kl]);
      });
      return { t, tk };
    };
    const kapat = ({ t, tk }: { t: string; tk: string }) => tamam(c.yonetici, 'POST', `/satin-alma-talepleri/${t}/siparis-kapat`, { teklifId: tk, gerekce: 'Deneme kapatma', surum: 1 });

    // Dinleyici: yalnız fason iş emri taşıyan olay da işaretler (malzeme listesi boş); bilinmeyen iş emri sessizce geçer.
    await vt().tx((db) => bayatSatinAlmaTerminiYansit(db, { malzemeNolar: [], isEmriIdler: [2_000_000_000] }));
    assert.equal((await fasonSay(e1))?.n, 0, 'bilinmeyen iş emri');
    await vt().tx((db) => bayatSatinAlmaTerminiYansit(db, { malzemeNolar: [], isEmriIdler: [i2!] }));
    assert.equal((await fasonSay(e2))?.n, 0, 'canlıda olmayan emir');

    // Gerçek komut: sipariş kapatılınca firma tarihi kalkar, olay fason iş emrini taşır.
    await kapat(await siparisAc(i2!, 82002));
    assert.equal((await fasonSay(e2))?.n, 0, 'canlıda olmayan emrin siparişi');
    await kapat(await siparisAc(i1!, 82001));
    assert.equal((await fasonSay(e1))?.n, 1, 'canlıdaki emrin fason siparişi');
    assert.equal((await say(e1))?.n, 0, 'malzeme olayı yazılmaz');
    const b = await tamam<{ bayat?: { bayat: boolean; sayilar?: Record<string, number>; olaylar?: { neden: string; uretimEmriId: number | null }[] } }>(c.planlama, 'GET', '/plan/surum');
    assert.equal(b.bayat?.sayilar?.['fason-termini'], 1);
    assert.ok(b.bayat?.olaylar?.some((x) => x.neden === 'fason-termini' && x.uretimEmriId === e1));
  });
});
