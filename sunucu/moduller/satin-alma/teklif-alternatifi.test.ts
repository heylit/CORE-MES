import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AlternatifZarfi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { AcilisCevabi, KalemZarflariCevabi, Talebim, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { zarfDegerlendir } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { ILETILER, VARSAYILAN_KABUL, alternatifKararReddi, alternatifOlcuReddi, alternatifSonucuHesapla, kalemAyrintisiniKoru } from './kurallar.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

// 3437-3a: teklif satırı istenenin yerine alternatif teklif eder; sonuç kalemin daraltılmış kabul zarfından sunucuda hesaplanır.
const zarf = (ek: Partial<AlternatifZarfi> = {}): AlternatifZarfi => ({
  kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
  kalite: { istenen: '6082', acik: true, kaynak: null, secenekler: [{ deger: '6061', tur: 'tam', notu: null }, { deger: '7075', tur: 'ust', notu: null }, { deger: '6060', tur: 'sartli', notu: null }] },
  durum: { istenen: 'T6', acik: true, kaynak: null, secenekler: [{ deger: 'T651', tur: 'ust', notu: null }] },
  form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enCok: 55 }], pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: null },
  boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null }, yuzey: { istenen: 'Ham', serbest: false, kaynak: null }, ...ek,
});
const alt = (ek: Partial<{ kalite: string; durum: string; yuzey: string; olcu: Record<string, number> }> = {}) => ({ kalite: null, durum: null, yuzey: null, olcu: {}, ...ek });

describe('3437-3a: teklifteki alternatifin sonucu (saf)', () => {
  const hesap = (k: Parameters<typeof alternatifSonucuHesapla>[1], a: ReturnType<typeof alt>) => alternatifSonucuHesapla(zarf(), k, a, zarfDegerlendir);

  test('izinli: boş alternatif aynı; zarftaki muadil, büyük ölçü pay içinde ve uzun boy sınır içinde', () => {
    assert.equal(hesap(null, alt()).sonuc, 'ayni');
    assert.deepEqual([hesap(null, alt({ kalite: '6061' })).sonuc, hesap(null, alt({ olcu: { d: 54 } })).sonuc, hesap(null, alt({ olcu: { l: 3500 } })).sonuc],
      ['icinde', 'icinde', 'icinde']);
  });

  test('yasak: zarfta olmayan kalite, payı aşan ölçü, kısa boy ve talep edenin daralttığı muadil sınır dışı', () => {
    assert.equal(hesap(null, alt({ kalite: '5083' })).sonuc, 'disi');
    assert.equal(hesap(null, alt({ olcu: { d: 56 } })).sonuc, 'disi');
    assert.equal(hesap(null, alt({ olcu: { l: 2500 } })).sonuc, 'disi');
    assert.equal(hesap({ ...VARSAYILAN_KABUL, kaliteler: ['6061'] }, alt({ kalite: '7075' })).sonuc, 'disi');
    assert.equal(hesap({ ...VARSAYILAN_KABUL, payMm: 2 }, alt({ olcu: { d: 53 } })).sonuc, 'disi');
    assert.equal(hesap({ ...VARSAYILAN_KABUL, yalnizAyni: true }, alt({ kalite: '6061' })).sonuc, 'disi');
    assert.equal(alternatifOlcuReddi(zarf(), alt({ olcu: { x: 3 } }), 'Deneme'), ILETILER.alternatifOlcu('Deneme', 'x'));
  });

  test('şartlı: talepte işaret yoksa izin boş, işaret varsa "talep" izniyle yazılır (iznin nereden geldiği ayrılır)', () => {
    assert.deepEqual([hesap(null, alt({ kalite: '6060' })).sonuc, hesap(null, alt({ kalite: '6060' })).izin], ['sartli', null]);
    assert.deepEqual([hesap({ ...VARSAYILAN_KABUL, sartliKabul: true }, alt({ kalite: '6060' })).sonuc, hesap({ ...VARSAYILAN_KABUL, sartliKabul: true }, alt({ kalite: '6060' })).izin],
      ['sartli', 'talep']);
  });

  test('karar: sınır dışı ve izinsiz şartlı seçilemez; alternatifli satırın siparişi alternatif kartı bekler; seçilmeyen satır engellemez', () => {
    const K = 'k1', Q1 = 'q1', Q2 = 'q2';
    const sonuc = (s: 'icinde' | 'sartli' | 'disi', izin: 'talep' | null = null) => ({ kalemId: K, birimFiyat: '1', alternatif: alt({ kalite: '6061' }), alternatifSonucu: { sonuc: s, nedenler: ['Kalite 6061'], izin } });
    const t = (f: ReturnType<typeof sonuc>, teklifId = Q1, durum: 'onayda' | 'siparis_verildi' = 'onayda') => ({
      kalemler: [{ id: K, ad: 'Deneme çubuk' }], durum,
      teklifler: [{ id: Q1, fiyatlar: [f] }, { id: Q2, fiyatlar: [{ kalemId: K, birimFiyat: '2' }] }],
      karar: { mod: 'tek', teklifId, bolunme: [] },
    }) as unknown as Parameters<typeof alternatifKararReddi>[0];
    assert.equal(alternatifKararReddi(t(sonuc('disi'))), ILETILER.alternatifDisi('Deneme çubuk', 'Kalite 6061'));
    assert.equal(alternatifKararReddi(t(sonuc('sartli'))), ILETILER.alternatifSartli('Deneme çubuk'));
    assert.equal(alternatifKararReddi(t(sonuc('sartli', 'talep'))), null);
    assert.equal(alternatifKararReddi(t(sonuc('icinde'))), null);
    assert.equal(alternatifKararReddi(t(sonuc('icinde'), Q1, 'siparis_verildi')), ILETILER.alternatifSiparis('Deneme çubuk'));
    assert.equal(alternatifKararReddi(t(sonuc('disi'), Q2)), null);
  });

  test('gönderilmeyen alternatif korunur, null siler; sonuç ekrandan alınmaz', () => {
    const eski = { teklifler: [{ id: 'q', fiyatlar: [{ kalemId: 'k', birimFiyat: '1', alternatif: alt({ kalite: '6061' }), alternatifSonucu: { sonuc: 'icinde' as const, nedenler: [], izin: null } }] }] };
    const yeni = (f: Record<string, unknown>) => ({ teklifler: [{ id: 'q', fiyatlar: [{ kalemId: 'k', birimFiyat: '1', ...f }] }] }) as unknown as typeof eski;
    const al = (f: Record<string, unknown>) => (kalemAyrintisiniKoru(eski as never, yeni(f) as never) as unknown as typeof eski).teklifler[0]!.fiyatlar[0]! as { alternatif: unknown; alternatifSonucu: unknown };
    assert.deepEqual(al({}).alternatif, alt({ kalite: '6061' }));
    assert.equal(al({ alternatif: null }).alternatif, null);
    assert.deepEqual(al({ alternatifSonucu: { sonuc: 'ayni', nedenler: [], izin: 'talep' } }).alternatifSonucu, eski.teklifler[0]!.fiyatlar[0]!.alternatifSonucu);
  });
});

describe('3437-3a: teklifte alternatif (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '', operator: '', sa: '' };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const get = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await ortam!.vt.tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    await ortam!.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return giris(kullaniciAdi);
  }
  let sira = 0;
  const kartAc = async (kayit: Record<string, unknown>, tur = 'hammadde'): Promise<number> => {
    sira += 1;
    const kimlik = `alt-${String(sira)}`;
    return (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'HM-ALT-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [kimlik, tur, sira, JSON.stringify({ id: kimlik, com: { ad: `Örnek ${kimlik}`, birim: 'adet' }, fam: 'metal', cls: 'aluminyum', ...kayit }), yoneticiId]))!.no;
  };
  let kart = 0;
  let sarf = 0;

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_teklif_alternatifi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.talep = await rolluKisi('cam', 'cam');
    c.operator = await rolluKisi('operator', 'operator');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-ALT-', 0) ON CONFLICT (onek) DO NOTHING");
    kart = await kartAc({ grade: '6082', form: 'cubuk', dims: { d: 50, l: 3000 }, opts: { durum: 'T6', yuzey: 'Ham' } });
    sarf = await kartAc({ com: { ad: 'Örnek eldiven', birim: 'çift' } }, 'sarf');
    const kural = await post(c.yonetici, '/malzeme-alternatifleri/kurallar/kaydet', {
      kapsamTuru: 'sinif', kapsam: 'metal/aluminyum', kaliteAcik: null, durumAcik: null, sartliAcik: null, boyUzunKesilir: null, yuzeySerbest: null,
      payTuru: 'mm', payDeger: 5, payEnAzMm: null, kapali: null, gerekce: null,
    });
    assert.equal(kural.statusCode, 200, kural.body);
    const muadil = await post(c.yonetici, '/malzeme-alternatifleri/kalite-muadilleri/kaydet', { kalite: '6082', muadil: '6262', tur: 'sartli', notu: 'Deneme not' });
    assert.equal(muadil.statusCode, 200, muadil.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const ac = (kalemler: unknown[]) => post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler });
  const govde = (t: Talep) => {
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = t;
    return g;
  };
  const satinAlmaGorur = async (id: string) => ((await get(c.sa, '/satin-alma-acilis')).json() as AcilisCevabi).talepler.find((x) => x.id === id)!;
  const kaydet = (t: Record<string, unknown> & { id: string }) => post(c.sa, `/satin-alma-talepleri/${t.id}/kaydet`, t);
  const teklif = (fiyatlar: Record<string, unknown>[]) => ({
    id: randomUUID(), firmaId: null, tedarikciAdi: 'Deneme Tedarik', teklifTarihi: '2026-11-19', gecerlilik: null,
    paraBirimi: 'TRY' as const, kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7,
    vadeGun: 30, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar,
  });
  const karar = (teklifId: string) => ({ mod: 'tek', teklifId, bolunme: [], gerekce: '', kararVerenKisiId: 1, kararTarihi: '2026-11-19', ogrenilenler: '', sabitKurlar: [], siparisler: [] });
  // Kalem 0: talepte daraltılmış (ölçü payı en çok 3 mm, şartlı kabul yok); kalem 1: sarf kartı (zarf yok).
  async function tekliflik(): Promise<Talep> {
    const t = (await ac([{ malzemeNo: kart, miktar: '6', kabul: { yalnizAyni: false, payMm: 3 } }, { malzemeNo: sarf, miktar: '2' }])).json() as Talebim;
    const sa = await satinAlmaGorur(t.id);
    assert.ok(sa, 'talep satın almada görünmeli');
    const r = await kaydet({ ...govde(sa), durum: 'degerlendirme' });
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as Talep;
  }

  test('uç tanımı: kalem zarfları satın almanın okuma ya da yazma işlemiyle; yeni işlem yok', () => {
    assert.deepEqual(uclar.find((x) => x.yol === '/satin-alma-talepleri/:id/kalem-zarflari')!.yetki, { biri: ['satin-alma.oku', 'satin-alma.yaz'] });
  });

  test('izinli: satın alma kalemin daraltılmış zarfını okur; sarf kalemi listede yok. Yasak: talep eden 403, kimliksiz 401', async () => {
    const t = await tekliflik();
    const r = await get(c.sa, `/satin-alma-talepleri/${t.id}/kalem-zarflari`);
    assert.equal(r.statusCode, 200, r.body);
    const l = (r.json() as KalemZarflariCevabi).kalemler;
    assert.deepEqual(l.map((x) => [x.kalemId, x.malzemeNo, x.kabul?.payMm, x.zarf.olcu]), [[t.kalemler[0]!.id, kart, 3, [{ anahtar: 'd', istenen: 50, enCok: 53 }]]]);
    assert.equal((await get(c.talep, `/satin-alma-talepleri/${t.id}/kalem-zarflari`)).statusCode, 403);
    assert.equal((await get('', `/satin-alma-talepleri/${t.id}/kalem-zarflari`)).statusCode, 401);
  });

  test('izinli: teklif alternatifle kaydedilir, sonuç sunucuda yazılır (gelen sonuç yok sayılır); gönderilmeyen korunur, null siler', async () => {
    const t = await tekliflik();
    const [k0, k1] = [t.kalemler[0]!.id, t.kalemler[1]!.id];
    const q = teklif([
      { kalemId: k0, birimFiyat: '10', alternatif: alt({ kalite: '6061', olcu: { d: 52 } }), alternatifSonucu: { sonuc: 'ayni', nedenler: [], izin: 'talep' } },
      { kalemId: k1, birimFiyat: '3' },
    ]);
    const r = await kaydet({ ...govde(t), teklifler: [q] });
    assert.equal(r.statusCode, 200, r.body);
    const s = r.json() as Talep;
    const f0 = s.teklifler[0]!.fiyatlar.find((f) => f.kalemId === k0)!;
    assert.deepEqual([f0.alternatif, f0.alternatifSonucu?.sonuc, f0.alternatifSonucu?.izin], [alt({ kalite: '6061', olcu: { d: 52 } }), 'icinde', null]);
    assert.equal(s.teklifler[0]!.fiyatlar.find((f) => f.kalemId === k1)!.alternatif, null);
    // Alternatifi bilmeyen ekran (alan yok) kaydedince korunur; null siler.
    const korunan = (await kaydet({ ...govde(s), teklifler: [{ ...q, fiyatlar: [{ kalemId: k0, birimFiyat: '11' }, { kalemId: k1, birimFiyat: '3' }] }] })).json() as Talep;
    assert.equal(korunan.teklifler[0]!.fiyatlar.find((f) => f.kalemId === k0)!.alternatifSonucu?.sonuc, 'icinde');
    const silinen = (await kaydet({ ...govde(korunan), teklifler: [{ ...q, fiyatlar: [{ kalemId: k0, birimFiyat: '11', alternatif: null }, { kalemId: k1, birimFiyat: '3' }] }] })).json() as Talep;
    const satir = await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_teklif_satiri WHERE talep_id = $1 AND alternatif IS NOT NULL', [t.id]);
    assert.deepEqual([silinen.teklifler[0]!.fiyatlar.find((f) => f.kalemId === k0)!.alternatif, satir!.n], [null, 0]);
  });

  test('yasak: zarfsız kalemde ve kartın ölçüsü olmayan anahtarla alternatif reddedilir; teklif yazılmaz', async () => {
    const t = await tekliflik();
    const [k0, k1] = [t.kalemler[0]!.id, t.kalemler[1]!.id];
    const r1 = await kaydet({ ...govde(t), teklifler: [teklif([{ kalemId: k1, birimFiyat: '3', alternatif: alt({ kalite: '6061' }) }])] });
    assert.deepEqual([r1.statusCode, (r1.json() as { alan?: string }).alan], [400, 'teklifler.0.fiyatlar.0.alternatif']);
    const r2 = await kaydet({ ...govde(t), teklifler: [teklif([{ kalemId: k0, birimFiyat: '3', alternatif: alt({ olcu: { x: 4 } }) }])] });
    assert.equal(r2.statusCode, 400, r2.body);
    assert.equal((await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_teklif WHERE talep_id = $1', [t.id]))!.n, 0);
  });

  test('karar: sınır dışı alternatif ve talepte izni olmayan şartlı alternatif onaya gönderilemez; sınır içindeki gider', async () => {
    const t = await tekliflik();
    const k0 = t.kalemler[0]!.id;
    const disi = teklif([{ kalemId: k0, birimFiyat: '10', alternatif: alt({ olcu: { d: 54 } }) }]);
    const sartli = teklif([{ kalemId: k0, birimFiyat: '11', alternatif: alt({ kalite: '6262' }) }]);
    const icinde = teklif([{ kalemId: k0, birimFiyat: '12', alternatif: alt({ olcu: { d: 52, l: 3200 } }) }]);
    const d = (await kaydet({ ...govde(t), teklifler: [disi, sartli, icinde] })).json() as Talep;
    assert.deepEqual(d.teklifler.map((q) => q.fiyatlar[0]!.alternatifSonucu?.sonuc), ['disi', 'sartli', 'icinde']);
    const r1 = await kaydet({ ...govde(d), durum: 'onayda', karar: karar(disi.id) });
    assert.equal(r1.statusCode, 422, r1.body);
    assert.match((r1.json() as { mesaj: string }).mesaj, /kabul sınırı dışında \(d \+4 mm pay dışı\)/);
    const r2 = await kaydet({ ...govde(d), durum: 'onayda', karar: karar(sartli.id) });
    assert.deepEqual([r2.statusCode, (r2.json() as { mesaj: string }).mesaj], [422, ILETILER.alternatifSartli('Örnek alt-1')]);
    const r3 = await kaydet({ ...govde(d), durum: 'onayda', karar: karar(icinde.id) });
    assert.equal(r3.statusCode, 200, r3.body);
  });

  test('şartlı kabul talepte işaretliyse şartlı alternatif "talep" izniyle onaya gider', async () => {
    const t0 = (await ac([{ malzemeNo: kart, miktar: '1', kabul: { yalnizAyni: false, sartliKabul: true } }])).json() as Talebim;
    const t = (await kaydet({ ...govde(await satinAlmaGorur(t0.id)), durum: 'degerlendirme' })).json() as Talep;
    const q = teklif([{ kalemId: t.kalemler[0]!.id, birimFiyat: '10', alternatif: alt({ kalite: '6262' }) }]);
    const d = (await kaydet({ ...govde(t), teklifler: [q] })).json() as Talep;
    assert.deepEqual([d.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.sonuc, d.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.izin], ['sartli', 'talep']);
    const r = await kaydet({ ...govde(d), durum: 'onayda', karar: karar(q.id) });
    assert.equal(r.statusCode, 200, r.body);
  });
});
