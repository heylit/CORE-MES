import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import vm from 'node:vm';
import { testVeritabaniKur, type TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { ekMesaiButcesi, PLANLAMA_ANAHTARI } from './disari.ts';
import { motorKodu } from './plan-motoru.ts';

// 525 3 a: haftalık ek mesai bütçesi 0 her yerde sınırsızdır; HiGHS çerçevesi ve motorun olay önerisi 0'da ek mesaiyi kapatmaz.
// Veriler uydurmadır: tek tezgâh, gündüz vardiyası, tanımlı ama çalışılmayan gece vardiyası.
interface Model { lp: string; nv: Record<string, string> }
interface Oneri { list: { id: string }[]; best: number }
interface Ic {
  W0: Record<string, unknown>;
  stHazirla: (st: unknown) => unknown;
  compile: (st: unknown) => unknown;
  schedule: (st: unknown, kip: string, taban: unknown) => unknown;
  cerceveModel: (st: unknown, cx: unknown, plan: unknown) => Model;
  propose: (st: unknown, taban: unknown, olay: unknown, secenek: Record<string, unknown>) => Oneri;
}
function motor(): Ic {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(motorKodu(), b);
  return vm.runInContext('({ W0, stHazirla, compile, schedule, cerceveModel, propose })', b) as Ic;
}
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const durum = (m: Ic, mesaiHafta: number) => m.stHazirla({
  D: {
    meta: { baslangic: '2026-01-05' }, ayarlar: {},
    vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }, { id: 'V3', bas: '00:00', bit: '08:00' }],
    calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])),
    tezgahlar: [{ id: 'T1', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G'], ayar: true }],
    urunler: [{ id: 'U', rota: [{ k: 10, ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
    siparisler: [{ id: 'S1', urun: 'U', adet: 16, termin: '2026-01-06 17:00', oncelik: 1 }],
  },
  now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {},
  w: { ...m.W0, tampon: false, mesaiHafta },
});

describe('ek mesai bütçesi 0 sınırsız (525 3 a)', () => {
  test('HiGHS çerçevesi bütçe 0da ek vardiya değişkeni kurar, haftalık satır yazmaz; bütçe 8de haftalık satır 8 saat', () => {
    const m = motor();
    const model = (b: number) => { const st = durum(m, b); const cx = m.compile(st); return m.cerceveModel(st, cx, m.schedule(st, 'yeni', null)); };
    const sifir = model(0);
    assert.ok(Object.keys(sifir.nv).length > 0, 'bütçe 0: ek vardiya adayı modelde');
    assert.doesNotMatch(sifir.lp, /^ b\d+:/m, 'bütçe 0: haftalık bütçe satırı yok');
    const sekiz = model(8);
    assert.ok(Object.keys(sekiz.nv).length > 0);
    assert.match(sekiz.lp, /^ b\d+: .* <= 8\.0000$/m, 'bütçe 8: haftalık satır');
  });

  test('olay önerisi bütçe 0da fazla mesaiyi önerebilir; bütçe 8de de', () => {
    const m = motor();
    for (const b of [0, 8]) {
      const st = durum(m, b);
      const o = m.propose(st, m.schedule(st, 'yeni', null), { tip: 'ariza', m: 'T1', saat: 8 }, { noButce: true, budget: 300 });
      const i = o.list.findIndex((x) => x.id === 'mesai');
      assert.ok(i >= 0, `bütçe ${String(b)}: fazla mesai seçeneği listede`);
      assert.equal(o.list[o.best]?.id, 'mesai', `bütçe ${String(b)}: gecikmeyi en çok azaltan fazla mesai önerilir`);
    }
  });
});

describe('ek mesai bütçesinin kaynağı planlama çalışması (525 2 b, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  let kisi = 0;
  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_ek_mesai_butce');
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });
  const yaz = (bicim: 'json' | 'metin', deger: unknown) => ortam!.sahip.sorgu(
    `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, $2, $3::jsonb, nextval('recete_rota_surum'), $4)
     ON CONFLICT (anahtar) DO UPDATE SET bicim = EXCLUDED.bicim, deger = EXCLUDED.deger`, [PLANLAMA_ANAHTARI, bicim, JSON.stringify(deger), kisi]);
  const oku = () => vt().tx((db) => ekMesaiButcesi(db));
  const calisma = (param: Record<string, unknown>) => ({ surum: 2, param, D: { meta: { baslangic: '2026-01-07' } } });

  test('çalışma yoksa null; bütçe girilmemişse 8; girilen değer; 0 ve sayı olmayan sınırsız (0); metin biçimli kayıt okunur', async () => {
    assert.equal(await oku(), null);
    await yaz('json', calisma({}));
    assert.deepEqual(await oku(), { saat: 8, haftaBasi: '2026-01-07' });
    await yaz('json', calisma({ mesaiHafta: 16 }));
    assert.deepEqual(await oku(), { saat: 16, haftaBasi: '2026-01-07' });
    await yaz('json', calisma({ mesaiHafta: 0 }));
    assert.deepEqual(await oku(), { saat: 0, haftaBasi: '2026-01-07' });
    await yaz('json', calisma({ mesaiHafta: 'x' }));
    assert.deepEqual(await oku(), { saat: 0, haftaBasi: '2026-01-07' });
    await yaz('metin', JSON.stringify(calisma({ mesaiHafta: 12 })));
    assert.deepEqual(await oku(), { saat: 12, haftaBasi: '2026-01-07' });
    await yaz('json', { surum: 2, param: { mesaiHafta: 4 }, D: {} });
    assert.equal(await oku(), null, 'başlangıç günü yoksa hafta kurulamaz');
  });
});
