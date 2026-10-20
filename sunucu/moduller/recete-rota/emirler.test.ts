import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { emirleriCevir } from './kurallar.ts';
import type { EmirKaydi } from './kurallar.ts';

// Emir dilimi: uretim-emirleri kayıtları prototipin st.orders, opStatus ve opProg biçiminde (kart #1185). Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('recete-rota emir dilimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revizyonId = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    await giris(kullaniciAdi);
  }

  async function yalnizSayfaKisisi(kullaniciAdi: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    await o().vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.recete-rota')", [rol?.id]);
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    await giris(kullaniciAdi);
  }

  async function makineKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`REM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`REI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`REMK${sayac}`, 'Tezgah', ist?.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }

  async function mamulKur(): Promise<number> {
    sayac += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RE-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'RE-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`re-dnm-${sayac}`, sayac, JSON.stringify({ id: `re-dnm-${sayac}`, com: { ad: `Deneme mamul ${sayac}` } }), yoneticiId],
    );
    if (!r) throw new Error('kart kurulamadı');
    return r.no;
  }

  const adim = (sira: number, makine: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1.5',
    terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });

  async function emirAc(adetSayisi: number, ek: { taslak?: boolean } = {}): Promise<number> {
    const m = await makineKur();
    const kim = kullanicilar.get('planlama_proje');
    if (kim === undefined) throw new Error('planlama kişisi yok');
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, kim, {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: adetSayisi, baslangic: '2030-01-02', teslim: '2030-01-20', oncelik: 2, aciklama: 'Deneme notu', kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [adim(1, m), adim(2, m), adim(3, m)], ...(ek.taslak ? { taslak: true } : {}),
    }));
    return uretimEmriId;
  }

  const durum = async (ad: string): Promise<DurumCevabi> => {
    const c = await istek<DurumCevabi>(ad, 'GET', '/recete-rota/durum');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde;
  };
  const siparis = async (id: number) => {
    const d = await durum('yonetici');
    const emir = d.emirler?.orders.find((x) => x.id === String(id));
    assert.ok(emir, `emir dilimde yok: ${String(id)}`);
    return { emir, opStatus: d.emirler?.opStatus ?? {}, opProg: d.emirler?.opProg ?? {} };
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => (await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`)).govde.emir;

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_emir');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('RR.EMIR', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await giris('yonetici');
    await kisiEkle('planlama_proje', 'planlama_proje');
    await kisiEkle('operator', 'operator');
    await yalnizSayfaKisisi('sadece_sayfa');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RE-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    urunNo = await mamulKur();
    // Emrin kaynak revizyonu gerçek bir satırdır (emir -> revizyon yabancı anahtarı, karar 278 a).
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('EMR-1: açılan emir prototipin alan adlarıyla gelir; durum, öncelik, tarih, not ve kaynak revizyon eşlenir, bekleyen adım opStatus\'ta yoktur', async () => {
    const id = await emirAc(10);
    const { emir, opStatus, opProg } = await siparis(id);
    assert.deepEqual(
      { ...emir, no: 'x', created: 0 },
      { id: String(id), kayitNo: id, no: 'x', itemId: String(urunNo), qty: 10, start: '2030-01-02', due: '2030-01-20', priority: 2, note: 'Deneme notu', rev: String(revizyonId),
        status: 'serbest', created: 0, doneAt: null, tur: 'seri', parentId: null, kol: null, birlestigiId: null, surum: emir.surum },
    );
    assert.match(emir.no, /\S/);
    assert.ok(emir.created > Date.parse('2020-01-01'), 'açılma zamanı milisaniyedir');
    assert.deepEqual(Object.keys(opStatus).filter((k) => k.startsWith(`${String(id)}|`)), []);
    assert.deepEqual(Object.keys(opProg).filter((k) => k.startsWith(`${String(id)}|`)), []);
    const taslak = await emirAc(5, { taslak: true });
    assert.equal((await siparis(taslak)).emir.status, 'taslak');
  });

  test('EMR-2: terminalde başlatılan iş emri çalışıyor, sayılan adet ilerleme, bitirilen tamam görünür; emir üretimde, bitince tamam ve doneAt dolu (Faz 5)', async () => {
    const id = await emirAc(10);
    const adimAnahtari = (sira: number) => `${String(id)}|root|${String(sira)}`;
    const terminal = (yol: string, govde?: unknown) => istek('operator', 'POST', `/uretim-emirleri/${id}${yol}`, govde);

    assert.equal((await terminal('/baslat')).durum, 200);
    let s = await siparis(id);
    assert.equal(s.emir.status, 'uretimde');
    assert.equal(s.opStatus[adimAnahtari(1)], 'calisiyor');
    assert.equal(s.opProg[adimAnahtari(1)], undefined, 'sayım gelmeden ilerleme yok');

    assert.equal((await terminal('/sayim', { tur: 'saglam', adet: 4 })).durum, 200);
    await o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    s = await siparis(id);
    assert.equal(s.opProg[adimAnahtari(1)], 4);

    assert.equal((await terminal('/bitir', { saglamAdet: 9 })).durum, 200);
    s = await siparis(id);
    assert.equal(s.opStatus[adimAnahtari(1)], 'tamam');
    assert.equal(s.opProg[adimAnahtari(1)], undefined, 'biten adımın ilerlemesi durumdan okunur');
    assert.equal(s.opStatus[adimAnahtari(2)], undefined, 'sıradaki adım bekliyor');
    assert.equal(s.emir.status, 'uretimde');

    for (const sira of [2, 3]) {
      assert.equal((await terminal('/baslat')).durum, 200);
      assert.equal((await terminal('/bitir', { saglamAdet: 9 })).durum, 200);
      assert.equal((await ayrinti(id)).isEmirleri[sira - 1]?.durum, 'tamam');
    }
    s = await siparis(id);
    assert.equal(s.emir.status, 'tamam');
    assert.equal(typeof s.emir.doneAt, 'number');
    assert.deepEqual([1, 2, 3].map((n) => s.opStatus[adimAnahtari(n)]), ['tamam', 'tamam', 'tamam']);
  });

  test('EMR-3: iptal edilen emir iptal görünür; bölünen parti ana emre bağlı alt emir, adım aralıklı bölme kol olur', async () => {
    const iptal = await emirAc(3);
    const ip = await istek('planlama_proje', 'POST', `/adimli-emirler/${iptal}/iptal`, { surum: (await ayrinti(iptal)).surum });
    assert.equal(ip.durum, 200, JSON.stringify(ip.govde));
    assert.equal((await siparis(iptal)).emir.status, 'iptal');

    const ana = await emirAc(20);
    const parti = await istek<{ altEmirId: number }>('planlama_proje', 'POST', `/adimli-emirler/${ana}/bol`, { adimSira: 1, adet: 5, surum: (await ayrinti(ana)).surum });
    assert.equal(parti.durum, 200, JSON.stringify(parti.govde));
    const p = (await siparis(parti.govde.altEmirId)).emir;
    assert.deepEqual([p.parentId, p.kol, p.qty], [String(ana), null, 5], 'adımın başından bölünen parti kol değildir');

    const kolBol = await istek<{ altEmirId: number }>('planlama_proje', 'POST', `/adimli-emirler/${ana}/bol`, { adimSira: 2, adet: 3, birlesmeOpNo: 30, surum: (await ayrinti(ana)).surum });
    assert.equal(kolBol.durum, 200, JSON.stringify(kolBol.govde));
    const k = (await siparis(kolBol.govde.altEmirId)).emir;
    assert.deepEqual([k.parentId, k.kol, k.qty], [String(ana), { n: 1, m: 3 }, 3], '2. adımdan ayrılıp 3. adımda ana emre katılır');
  });

  test('EMR-4: emir dilimi her açık emri tek sorgu setiyle verir ve emir yetkisi olmayana null gelir; yetkili kişide dolu', async () => {
    const id = await emirAc(2);
    const sade = await durum('sadece_sayfa');
    assert.equal(sade.emirler, null, 'sayfa.recete-rota emir okumaz');
    assert.equal((await durum('planlama_proje')).emirler?.orders.some((x) => x.id === String(id)), true);
    assert.equal((await durum('yonetici')).emirler?.orders.some((x) => x.id === String(id)), true);
  });

  test('EMR-6: Reçete ve Rota\'nın açtığı emir salt okunur Üretim Emirleri listesinde, Arkon paket kuyruğunda (tmi-ie) ve terminalin okuduğu ayrıntıda görünür (kart #1185)', async () => {
    // emre-kopyala ucu üretim emrini bu işlevle açar (rota/servis.ts emreKopyala); köprünün emir-ac komutu o uca gider.
    const id = await emirAc(10);
    const liste = await istek<{ emirler: { id: number; emirNo: string; durum: string }[] }>('yonetici', 'GET', '/uretim-emirleri');
    assert.equal(liste.durum, 200);
    const satir = liste.govde.emirler.find((e) => e.id === id);
    assert.ok(satir, 'salt okunur liste emri göstermeli');
    assert.equal(satir.durum, 'planli');

    const ilk = (await ayrinti(id)).isEmirleri[0];
    assert.ok(ilk);
    const paketler = await istek<{ belgeler: { kimlik: string }[] }>('yonetici', 'GET', '/arkon/belgeler/pkgs');
    assert.equal(paketler.durum, 200, JSON.stringify(paketler.govde));
    assert.ok(paketler.govde.belgeler.some((b) => b.kimlik === `tmi-ie-${String(ilk.id)}`), 'Arkon paket kuyruğu iş emri paketini göstermeli');

    const terminal = await istek<{ emir: { id: number; emirNo: string } }>('operator', 'GET', `/uretim-emirleri/${id}`);
    assert.equal(terminal.durum, 200);
    assert.equal(terminal.govde.emir.emirNo, satir.emirNo);
  });

  test('EMR-5: çeviri kuralı saf: katılma adımı bulunamayan alt emir kol olmaz; ortadan ayrılıp katılmayan kol ana emrin sonuna kadar yürür', () => {
    const iseEmri = (sira: number) => ({
      sira, opNo: sira * 10, durum: 'bekliyor' as const, saglamAdet: null, canliAdet: null, ad: 'A', operasyonTipiId: 1, istasyonId: null, ayarSuresiDk: null, birimSureDk: null,
    });
    const temel = {
      malzemeNo: 1, adet: 5, baslangic: null, teslim: null, oncelik: 3, aciklama: null, kaynakRotaRevizyonId: null, durum: 'planli' as const,
      emirTuru: 'seri', acilma: '2030-01-01T00:00:00Z', bitis: null, birlestigiEmirId: null, surum: 0,
    };
    const ana: EmirKaydi = { ...temel, id: 1, emirNo: 'A', ustEmirId: null, bolunmeSira: null, birlesmeOpNo: null, isEmirleri: [1, 2, 3, 4].map(iseEmri) };
    const alt = (id: number, bolunmeSira: number, birlesmeOpNo: number | null): EmirKaydi => ({ ...temel, id, emirNo: `B${String(id)}`, ustEmirId: 1, bolunmeSira, birlesmeOpNo, isEmirleri: [] });
    const c = emirleriCevir([ana, alt(2, 2, 99), alt(3, 3, null), alt(4, 1, null)]).orders;
    assert.deepEqual(c.map((x) => x.kol), [null, null, { n: 2, m: 5 }, null]);
    assert.deepEqual(c.map((x) => x.start), [null, null, null, null], 'tarih yoksa null; uydurulmaz');
  });

  test('EMR-8: rotalı emrin bitmemiş adımları emirdeki iç ya da dış üretimiyle gider (UE-URY); biten adım ve rotasız emir gitmez', () => {
    const temel = {
      malzemeNo: 1, adet: 5, baslangic: null, teslim: null, oncelik: 3, aciklama: null, durum: 'planli' as const, emirTuru: 'seri', acilma: '2030-01-01T00:00:00Z',
      bitis: null, ustEmirId: null, bolunmeSira: null, birlestigiEmirId: null, birlesmeOpNo: null, surum: 1,
    };
    const isEmri = { sira: 1, opNo: 10, durum: 'bekliyor' as const, saglamAdet: null, canliAdet: null, ad: 'Torna', operasyonTipiId: 3, istasyonId: 4, ayarSuresiDk: '5', birimSureDk: '2', kaynak: null, terminGun: null };
    const fason = { ...isEmri, sira: 2, opNo: 20, istasyonId: null, ayarSuresiDk: null, birimSureDk: null, kaynak: { tur: 'fason', id: 41 }, terminGun: 6 };
    const { opYer } = emirleriCevir([
      { ...temel, id: 1, emirNo: 'A', kaynakRotaRevizyonId: 8, isEmirleri: [{ ...isEmri, durum: 'tamam' }, fason, { ...isEmri, sira: 3, opNo: 30 }] },
      { ...temel, id: 2, emirNo: 'R', kaynakRotaRevizyonId: null, isEmirleri: [isEmri] },
    ]);
    assert.deepEqual(opYer, {
      '1|root|2': { fasonId: '41', terminGun: 6, stationId: null, setup: null, cycle: null },
      '1|root|3': { fasonId: null, terminGun: null, stationId: '4', setup: 5, cycle: 2 },
    });
  });

  test('EMR-7: rotasız emir (revizyonsuz) kendi iş emirlerini adım olarak taşır; rotalı emirde alan yoktur', () => {
    const temel = {
      malzemeNo: 1, adet: 5, baslangic: null, teslim: null, oncelik: 3, aciklama: null, durum: 'planli' as const, emirTuru: 'seri', acilma: '2030-01-01T00:00:00Z',
      bitis: null, ustEmirId: null, bolunmeSira: null, birlestigiEmirId: null, birlesmeOpNo: null, surum: 1,
    };
    const isEmri = { sira: 1, opNo: 10, durum: 'bekliyor' as const, saglamAdet: null, canliAdet: null, ad: 'Kesim', operasyonTipiId: 3, istasyonId: null, ayarSuresiDk: '5', birimSureDk: null };
    const [rotasiz, rotali] = emirleriCevir([
      { ...temel, id: 1, emirNo: 'R', kaynakRotaRevizyonId: null, isEmirleri: [isEmri] },
      { ...temel, id: 2, emirNo: 'T', kaynakRotaRevizyonId: 8, isEmirleri: [isEmri] },
    ]).orders;
    assert.equal(rotasiz?.rotasiz, true);
    assert.deepEqual(rotasiz?.adimlar, [{ seq: 1, opNo: 10, ad: 'Kesim', opId: '3', stationId: null, setup: 5, cycle: null, durum: 'bekliyor' }]);
    assert.equal(rotali !== undefined && 'rotasiz' in rotali, false);
  });
});
