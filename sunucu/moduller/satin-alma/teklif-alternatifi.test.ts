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
import { alternatifKartiAc, zarfDegerlendir } from '../malzemeler/disari.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { ILETILER, VARSAYILAN_KABUL, alternatifIzniReddi, alternatifKararReddi, alternatifOlcuReddi, alternatifSonucuHesapla, kalemAyrintisiniKoru } from './kurallar.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

// 3437-3a: teklif satırı istenenin yerine alternatif teklif eder; sonuç kalemin daraltılmış kabul zarfından sunucuda hesaplanır.
const zarf = (ek: Partial<AlternatifZarfi> = {}): AlternatifZarfi => ({
  kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
  kalite: { istenen: '6082', acik: true, kaynak: null, secenekler: [{ deger: '6061', tur: 'tam', notu: null }, { deger: '7075', tur: 'ust', notu: null }, { deger: '6060', tur: 'sartli', notu: null }], sinir: false },
  durum: { istenen: 'T6', acik: true, kaynak: null, secenekler: [{ deger: 'T651', tur: 'ust', notu: null }], sinir: false },
  form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }], pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: null },
  boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null, enAz: null, enCok: null, sinirKaynak: null },
  yuzey: { istenen: 'Ham', serbest: false, kaynak: null, secenekler: [], sinir: false }, ...ek,
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

describe('3437-3b-1: talep edenin sonradan şartlı izni (saf)', () => {
  const hesap = (a: ReturnType<typeof alt>, onceki: Parameters<typeof alternatifSonucuHesapla>[4]) => alternatifSonucuHesapla(zarf(), null, a, zarfDegerlendir, onceki);
  const izinli = (izin: 'soru' | 'ret', a = alt({ kalite: '6060', olcu: { d: 51 } })) => ({
    alternatif: a, alternatifSonucu: { sonuc: 'sartli' as const, nedenler: [], izin, izinKisiId: 7, izinZaman: '2026-11-19T10:00:00Z', izinNotu: 'Deneme' },
  });

  test('aynı alternatif yeniden kaydedilince izin korunur (anahtar sırası önemsiz); alternatif değişince ya da sonuç şartlı değilse düşer', () => {
    const a = alt({ kalite: '6060', olcu: { d: 51 } });
    assert.deepEqual(hesap({ olcu: { d: 51 }, yuzey: null, durum: null, kalite: '6060' }, izinli('soru', a)), { sonuc: 'sartli', nedenler: hesap(a, null).nedenler, izin: 'soru', izinKisiId: 7, izinZaman: '2026-11-19T10:00:00Z', izinNotu: 'Deneme' });
    assert.equal(hesap(a, izinli('ret', a)).izin, 'ret');
    assert.equal(hesap(alt({ kalite: '6060', olcu: { d: 52 } }), izinli('soru', a)).izin, null);
    assert.equal(hesap(alt({ kalite: '6061' }), izinli('soru', alt({ kalite: '6061' }))).izin, null);
  });

  test('3b-2: açılan kartın numarası aynı alternatifte korunur; alternatif değişince ya da sonuç aynı/dışı olunca düşer', () => {
    const a = alt({ olcu: { d: 52 } });
    const kartli = (x = a) => ({ alternatif: x, alternatifSonucu: { sonuc: 'icinde' as const, nedenler: [], izin: null, kartNo: 9 } });
    assert.equal(hesap({ yuzey: null, olcu: { d: 52 }, kalite: null, durum: null }, kartli()).kartNo, 9);
    assert.equal(hesap(alt({ olcu: { d: 53 } }), kartli()).kartNo, undefined);
    assert.equal(hesap(alt({ olcu: { d: 56 } }), kartli(alt({ olcu: { d: 56 } }))).kartNo, undefined);
    const s0 = izinli('soru');
    assert.deepEqual([hesap(s0.alternatif, { ...s0, alternatifSonucu: { ...s0.alternatifSonucu, kartNo: 9 } }).kartNo, hesap(s0.alternatif, s0).kartNo], [9, undefined]);
  });

  test('izin yalnız teklif toplanırken, onaysız kararda, gördüğü alternatife ve kararda seçili olmayan satıra verilir', () => {
    const a = alt({ kalite: '6060' });
    const t = (ek: Record<string, unknown> = {}, s: Record<string, unknown> = {}) => ({
      durum: 'degerlendirme', onaylar: [], karar: null,
      teklifler: [{ id: 'q', fiyatlar: [{ kalemId: 'k', birimFiyat: '1', alternatif: a, alternatifSonucu: { sonuc: 'sartli', nedenler: [], izin: null, ...s } }] }], ...ek,
    }) as unknown as Parameters<typeof alternatifIzniReddi>[0];
    const g = { teklifId: 'q', kalemId: 'k', alternatif: a };
    assert.equal(alternatifIzniReddi(t(), g), null);
    assert.equal(alternatifIzniReddi(t({ durum: 'taslak' }), g), ILETILER.alternatifIzniAsamasi);
    assert.equal(alternatifIzniReddi(t({ durum: 'onayda', onaylar: [{ sonuc: 'onay' }] }), g), ILETILER.alternatifIzniAsamasi);
    assert.equal(alternatifIzniReddi(t(), { ...g, alternatif: alt({ kalite: '6061' }) }), ILETILER.alternatifIzniYok);
    assert.equal(alternatifIzniReddi(t({}, { izin: 'talep' }), g), ILETILER.alternatifIzniYok);
    assert.equal(alternatifIzniReddi(t({}, { sonuc: 'icinde' }), g), ILETILER.alternatifIzniYok);
    assert.equal(alternatifIzniReddi(t({ karar: { mod: 'tek', teklifId: 'q', bolunme: [] } }), g), ILETILER.alternatifIzniKararda);
  });
});

describe('3437-3a: teklifte alternatif (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '', operator: '', sa: '', mudur: '' };
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
    c.mudur = await rolluKisi('mudur', 'mudur');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-ALT-', 100) ON CONFLICT (onek) DO NOTHING");
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
    assert.deepEqual(l.map((x) => [x.kalemId, x.malzemeNo, x.kabul?.payMm, x.zarf.olcu]), [[t.kalemler[0]!.id, kart, 3, [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 53, sinirKaynak: null }]]]);
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

  // 3437-3b-1: talepte şartlı kabul işaretli değilse talep eden şartlı alternatifi Taleplerim'den onaylar ya da reddeder.
  const izinIste = (cerez: string, id: string, g: Record<string, unknown>) => post(cerez, `/satin-alma-talepleri/${id}/alternatif-izni`, g);
  const benim = async (id: string) => ((await get(c.talep, '/satin-alma-taleplerim')).json() as { talepler: Talebim[] }).talepler.find((x) => x.id === id)!;
  async function sartliTeklifli(): Promise<{ t: Talep; q: ReturnType<typeof teklif>; k0: string }> {
    const t = await tekliflik();
    const k0 = t.kalemler[0]!.id;
    const q = teklif([{ kalemId: k0, birimFiyat: '11', alternatif: alt({ kalite: '6262' }) }]);
    const d = (await kaydet({ ...govde(t), teklifler: [q] })).json() as Talep;
    return { t: d, q, k0 };
  }

  test('uç tanımı: alternatif izni talep açma işlemiyle, tekrar korumalı', () => {
    const u = uclar.find((x) => x.yol === '/satin-alma-talepleri/:id/alternatif-izni')!;
    assert.deepEqual([u.yetki, u.tekrarKorumali], ['satin-alma.talep-ac', true]);
  });

  test('izinli: talep eden şartlı alternatifi fiyatsız görür, onaylar; kim, ne zaman, not ve geçmiş yazılır; karar onaya gider', async () => {
    const { t, q, k0 } = await sartliTeklifli();
    const once = (await benim(t.id)).kalemler[0]!;
    assert.deepEqual(once.sartliAlternatifler?.map((x) => [x.teklifId, x.alternatif.kalite, x.izin]), [[q.id, '6262', null]]);
    assert.equal(JSON.stringify(once).includes('Deneme Tedarik'), false);
    assert.equal(JSON.stringify(once).includes('"birimFiyat"'), false);
    const eskiSa = await satinAlmaGorur(t.id);
    const r = await izinIste(c.talep, t.id, { teklifId: q.id, kalemId: k0, karar: 'onay', notu: 'Deneme izin', alternatif: alt({ kalite: '6262' }) });
    assert.equal(r.statusCode, 200, r.body);
    // Risk D1: izin sürümü artırır; eski sürümle kayıt izni sessizce silemez.
    const eskiKayit = await kaydet({ ...govde(eskiSa), durum: 'onayda', karar: karar(q.id) });
    assert.equal(eskiKayit.statusCode, 409, eskiKayit.body);
    assert.deepEqual((r.json() as Talebim).kalemler[0]!.sartliAlternatifler?.map((x) => [x.izin, x.izinNotu]), [['soru', 'Deneme izin']]);
    const satir = (await ortam!.sahip.tek<{ izin: string; kisi: number; zaman: string | null }>(
      'SELECT alternatif_izin AS izin, alternatif_izin_kisi_id AS kisi, alternatif_izin_zaman::text AS zaman FROM satin_alma_teklif_satiri WHERE talep_id = $1', [t.id]))!;
    const kisi = (await ortam!.sahip.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'cam'"))!.id;
    assert.deepEqual([satir.izin, satir.kisi, satir.zaman !== null], ['soru', kisi, true]);
    const sa = await satinAlmaGorur(t.id);
    assert.ok(sa.hareketler.some((h) => h.metin.includes('şartlı alternatif onaylandı (Deneme izin)')));
    // Satın alma aynı alternatifle yeniden kaydedince izin korunur; karar onaya gider.
    const r2 = await kaydet({ ...govde(sa), durum: 'onayda', karar: karar(q.id) });
    assert.equal(r2.statusCode, 200, r2.body);
    assert.equal((r2.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.izin, 'soru');
    // Kararda seçili satırın izni değişmez.
    const r3 = await izinIste(c.talep, t.id, { teklifId: q.id, kalemId: k0, karar: 'ret', alternatif: alt({ kalite: '6262' }) });
    assert.deepEqual([r3.statusCode, (r3.json() as { mesaj: string }).mesaj], [422, ILETILER.alternatifIzniKararda]);
    // 3b-2: karar onaylanınca alternatifin kartı ONAYDA açılır (açan onaylayan), ana kartın alternatif alt kartı olur.
    const onaylaR = await post(c.mudur, `/satin-alma-talepleri/${t.id}/kaydet`, { ...govde(r2.json() as Talep), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] });
    assert.equal(onaylaR.statusCode, 200, onaylaR.body);
    const o = onaylaR.json() as Talep;
    const kartNo = o.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.kartNo;
    assert.equal(typeof kartNo, 'number');
    const yeniKart = (await ortam!.sahip.tek<{ durum: string; acan: number; ana: number | null; alt: string | null; grade: string; d: number }>(
      `SELECT onay_durumu AS durum, acan_kisi_id AS acan, ana_kart_no AS ana, alt_tur AS alt, kayit->>'grade' AS grade, (kayit->'dims'->>'d')::int AS d
         FROM malzeme_katalog_karti WHERE no = $1`, [kartNo]))!;
    const mudurId = (await ortam!.sahip.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'mudur'"))!.id;
    assert.deepEqual(yeniKart, { durum: 'onayda', acan: mudurId, ana: kart, alt: 'alternatif', grade: '6262', d: 50 });
    assert.ok(o.hareketler.some((h) => /alternatif malzeme kartı açıldı, malzeme onayı bekliyor: HM-ALT-/.test(h.metin)));
    // Test T1: onaylı talep aynı alternatifle yeniden kaydedilince kart no korunur, ikinci kart açılmaz.
    const yeniden = await kaydet({ ...govde(o) });
    assert.equal(yeniden.statusCode, 200, yeniden.body);
    assert.equal((yeniden.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.kartNo, kartNo);
    assert.equal((await ortam!.sahip.tek<{ kn: number }>('SELECT alternatif_kart_no AS kn FROM satin_alma_teklif_satiri WHERE talep_id = $1', [t.id]))!.kn, kartNo);
    const ad = (await ortam!.sahip.tek<{ ad: string }>("SELECT kayit->'com'->>'ad' AS ad FROM malzeme_katalog_karti WHERE no = $1", [kartNo]))!.ad;
    assert.equal(ad, 'Örnek alt-1 (alternatif 6262)');
    const sip = await kaydet({ ...govde(yeniden.json() as Talep), durum: 'siparis_verildi', karar: { ...o.karar!, siparisler: [{ teklifId: q.id, siparisNo: 'ALT-1', siparisTarihi: '2026-11-19', beklenenTeslim: '2026-11-26' }] } });
    // 3b-3b: alternatif yalnız emre bağlı kalemde sipariş edilir (ikame ve kart kuralları alternatif-ikame.test.ts).
    assert.deepEqual([sip.statusCode, (sip.json() as { mesaj: string }).mesaj], [422, ILETILER.alternatifEmirsiz('Örnek alt-1')]);
    // Onaylı karardan sonra izin aşaması kapalı (Test bakışı): 422, satır değişmez.
    const gec = await izinIste(c.talep, t.id, { teklifId: q.id, kalemId: k0, karar: 'ret', alternatif: alt({ kalite: '6262' }) });
    assert.deepEqual([gec.statusCode, (gec.json() as { mesaj: string }).mesaj], [422, ILETILER.alternatifIzniAsamasi]);
    assert.equal((await ortam!.sahip.tek<{ izin: string }>('SELECT alternatif_izin AS izin FROM satin_alma_teklif_satiri WHERE talep_id = $1', [t.id]))!.izin, 'soru');
  });

  test('yasak: sınır dışı alternatif için kart açılmaz (malzemeler yeniden denetler); kart sayısı değişmez', async () => {
    const k: Kullanici = { id: yoneticiId, ad: 'Deneme Yönetici', islemler: [] };
    const say = async () => (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM malzeme_katalog_karti'))!.n;
    const once = await say();
    await assert.rejects(ortam!.vt.tx((db) => alternatifKartiAc(db, k, kart, { kalite: null, durum: null, yuzey: null, olcu: { d: 56 } })), /kabul sınırı dışında; kart açılmaz/);
    assert.equal(await say(), once);
  });

  // 3b-2: aynı nitelikli alternatif başka talepte onaylanınca yeni kart açılmaz, ilk açılan kart kullanılır; kod ana kartın önekinden.
  test('izinli: aynı nitelikli alternatif ikinci talepte kart bulur, yeni kart açmaz', async () => {
    const onayla = async (): Promise<number> => {
      const t = await tekliflik();
      const q = teklif([{ kalemId: t.kalemler[0]!.id, birimFiyat: '12', alternatif: alt({ olcu: { d: 52, l: 3200 } }) }]);
      const d = (await kaydet({ ...govde(t), teklifler: [q] })).json() as Talep;
      const g = await kaydet({ ...govde(d), durum: 'onayda', karar: karar(q.id) });
      assert.equal(g.statusCode, 200, g.body);
      const o = await post(c.mudur, `/satin-alma-talepleri/${t.id}/kaydet`, { ...govde(g.json() as Talep), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] });
      assert.equal(o.statusCode, 200, o.body);
      return (o.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu!.kartNo!;
    };
    const n1 = await onayla();
    const n2 = await onayla();
    assert.equal(n2, n1);
    const kartlar = await ortam!.sahip.sorgu<{ onek: string }>(`SELECT onek FROM malzeme_katalog_karti WHERE ana_kart_no = $1 AND kayit->'dims'->>'l' = '3200'`, [kart]);
    assert.deepEqual(kartlar.map((x) => x.onek), ['HM-ALT-']);
  });

  test('yasak: reddedilen şartlı alternatif seçilemez; başkası 403; değişmiş alternatife izin yazılmaz ve değişince izin düşer', async () => {
    const { t, q, k0 } = await sartliTeklifli();
    assert.equal((await izinIste(c.operator, t.id, { teklifId: q.id, kalemId: k0, karar: 'onay', alternatif: alt({ kalite: '6262' }) })).statusCode, 403);
    assert.equal((await izinIste(c.sa, t.id, { teklifId: q.id, kalemId: k0, karar: 'onay', alternatif: alt({ kalite: '6262' }) })).statusCode, 403);
    const eskiGorulen = await izinIste(c.talep, t.id, { teklifId: q.id, kalemId: k0, karar: 'onay', alternatif: alt({ kalite: '6262', olcu: { d: 51 } }) });
    assert.deepEqual([eskiGorulen.statusCode, (eskiGorulen.json() as { mesaj: string }).mesaj], [422, ILETILER.alternatifIzniYok]);
    assert.equal((await izinIste(c.talep, t.id, { teklifId: q.id, kalemId: k0, karar: 'ret', alternatif: alt({ kalite: '6262' }) })).statusCode, 200);
    const sa = await satinAlmaGorur(t.id);
    const r = await kaydet({ ...govde(sa), durum: 'onayda', karar: karar(q.id) });
    assert.deepEqual([r.statusCode, (r.json() as { mesaj: string }).mesaj], [422, ILETILER.alternatifReddedildi('Örnek alt-1')]);
    // Satın alma alternatifi değiştirince ret düşer, yeniden sorulur.
    const yeni = (await kaydet({ ...govde(sa), teklifler: [{ ...q, fiyatlar: [{ kalemId: k0, birimFiyat: '11', alternatif: alt({ kalite: '6262', olcu: { d: 51 } }) }] }] })).json() as Talep;
    assert.deepEqual([yeni.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.sonuc, yeni.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.izin], ['sartli', null]);
    assert.equal((await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_teklif_satiri WHERE talep_id = $1 AND alternatif_izin_kisi_id IS NOT NULL', [t.id]))!.n, 0);
  });
});
