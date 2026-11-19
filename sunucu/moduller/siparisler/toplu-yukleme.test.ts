import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { topluSiparisDenetleCevabi, topluSiparisYukleCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import type { TopluSiparisSatiri } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { TOPLU_GRUP_FARKI, TOPLU_SIPARIS_VAR, TOPLU_TERMIN_ONCE, TOPLU_ZORUNLU } from './toplu-kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('3455-3 toplu satış siparişi yükleme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let satis = '';
  let sayac = 0;
  let firmaKodu = '';
  let firma2Kodu = '';
  let tedarikciKodu = '';
  let mamulKodu = '';
  let mamul2Kodu = '';
  let sarfKodu = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function girisYap(rolKodu: string | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `toplu-sip-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  async function kartAc(tur: string): Promise<string> {
    sayac += 1;
    const kimlik = `toplu-sip-${sayac}`;
    const no = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'TSP-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [kimlik, tur, sayac, JSON.stringify({ id: kimlik, com: { ad: `Deneme ${tur} ${sayac}` } }), yoneticiId],
    ))!.no;
    return (await o().sahip.tek<{ kod: string }>('SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE no = $1', [no]))!.kod;
  }
  async function firmaAc(tur: string): Promise<string> {
    const c = await gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${(sayac += 1)}`, tur });
    assert.equal(c.statusCode, 200, c.body);
    const id = c.json<{ firma: { id: number } }>().firma.id;
    return (await o().sahip.tek<{ kod: string }>('SELECT kod FROM musteri_tedarikci_firma WHERE id = $1', [id]))!.kod;
  }
  let siraNo = 0;
  const satir = (ek: Partial<TopluSiparisSatiri> = {}): TopluSiparisSatiri => ({
    sira: (siraNo += 1), siparisNo: 'ORN-MSN-1', firma: firmaKodu, siparisTarihi: '2026-03-02', termin: '2026-04-15', malzeme: mamulKodu, miktar: '120',
    birimFiyat: '14.5', karsilama: null, paraBirimi: null, kdvOrani: null, logo: false, ...ek,
  });
  const denetle = (satirlar: TopluSiparisSatiri[], cerez = yonetici) => gonder(cerez, '/siparisler/toplu-yukleme/denetle', { satirlar });
  const yukle = (satirlar: TopluSiparisSatiri[], cerez = yonetici) => gonder(cerez, '/siparisler/toplu-yukleme', { dosyaAdi: 'orn-siparisler.xlsx', satirlar });
  const siparisSayisi = async (): Promise<number> => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM siparisler_siparis'))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_toplu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    satis = (await girisYap('satis')).cerez;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TSP-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    firmaKodu = await firmaAc('musteri');
    firma2Kodu = await firmaAc('musteri');
    tedarikciKodu = await firmaAc('tedarikci');
    mamulKodu = await kartAc('mamul');
    mamul2Kodu = await kartAc('mamul');
    sarfKodu = await kartAc('sarf');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yetki: satış rolü (siparisler.yaz) 403 alır, yönetici denetler', async () => {
    const ret = await denetle([satir()], satis);
    assert.equal(ret.statusCode, 403, ret.body);
    const ret2 = await yukle([satir()], satis);
    assert.equal(ret2.statusCode, 403, ret2.body);
    const c = await denetle([satir()]);
    assert.equal(c.statusCode, 200, c.body);
  });

  test('denetle: geçerli satırlar firma ve sipariş no ile birleşir, kart ve firma adı döner; hiçbir şey yazılmaz', async () => {
    const once = await siparisSayisi();
    const c = await denetle([
      satir(), satir({ malzeme: mamul2Kodu, miktar: '40', birimFiyat: null, karsilama: 'Stoktan' }),
      satir({ siparisNo: 'ORN-MSN-2', firma: firma2Kodu, termin: '2026-05-20', karsilama: 'Satın al' }),
    ]);
    assert.equal(c.statusCode, 200, c.body);
    const d = topluSiparisDenetleCevabi.parse(c.json());
    assert.equal(d.siparisSayisi, 2);
    assert.equal(d.hataliSatir, 0);
    assert.deepEqual(d.satirlar.map((s) => s.hatalar), [[], [], []]);
    assert.equal(d.satirlar[0]?.firma?.kod, firmaKodu);
    assert.equal(d.satirlar[1]?.malzeme?.kod, mamul2Kodu);
    assert.equal(await siparisSayisi(), once);
  });

  test('denetle: hatalar satıra ve sütuna yazılır', async () => {
    const c = await denetle([
      satir({ firma: 'ORN-YOK-FIRMA' }),
      satir({ firma: tedarikciKodu, siparisNo: 'ORN-MSN-T' }),
      satir({ malzeme: 'ORN-YOK-KART' }),
      satir({ malzeme: sarfKodu }),
      satir({ siparisNo: null }),
      satir({ siparisTarihi: '02.03.2026' }),
      satir({ termin: '2026-01-01' }),
      satir({ miktar: 'on iki' }),
      satir({ miktar: '0' }),
      satir({ karsilama: 'Bilinmez' }),
      satir({ birimFiyat: 'on beş' }),
      satir({ siparisNo: 'ORN-MSN-F', siparisTarihi: '2026-03-02' }), satir({ siparisNo: 'ORN-MSN-F', siparisTarihi: '2026-03-05' }),
      satir({ siparisTarihi: '2020-01-01', termin: '2020-02-01', siparisNo: 'ORN-MSN-E' }),
    ]);
    assert.equal(c.statusCode, 200, c.body);
    const d = topluSiparisDenetleCevabi.parse(c.json());
    const alanlar = d.satirlar.map((s) => s.hatalar.map((h) => h.alan));
    assert.deepEqual(alanlar, [
      ['firma'], ['firma'], ['malzeme'], ['malzeme'], ['siparisNo'], ['siparisTarihi'], ['termin'], ['miktar'], ['miktar'], ['karsilama'], ['birimFiyat'],
      [], ['siparisTarihi'], ['siparisTarihi'],
    ]);
    assert.equal(d.satirlar[4]?.hatalar[0]?.ileti, TOPLU_ZORUNLU);
    assert.equal(d.satirlar[6]?.hatalar[0]?.ileti, TOPLU_TERMIN_ONCE);
    assert.equal(d.satirlar[12]?.hatalar[0]?.ileti, TOPLU_GRUP_FARKI);
    assert.equal(d.hataliSatir, 13);
  });

  test('yükle: hatalı satır varken hiçbir sipariş yazılmaz; denetim satırlarla döner', async () => {
    const once = await siparisSayisi();
    const c = await yukle([satir({ siparisNo: 'ORN-MSN-H1' }), satir({ siparisNo: 'ORN-MSN-H2', malzeme: 'ORN-YOK-KART' })]);
    assert.equal(c.statusCode, 200, c.body);
    const r = topluSiparisYukleCevabi.parse(c.json());
    assert.equal(r.siparisler, null);
    assert.equal(r.denetim?.hataliSatir, 1);
    assert.equal(await siparisSayisi(), once);
  });

  test('yükle: siparişler taslak açılır, toplu yüklemeye bağlanır, Logo işareti siparişe geçer, onay bildirimi gitmez; aynı dosya ikinci kez girmez', async () => {
    // Bildirim yükleyeni hariç tutar: alıcı olacak ikinci yönetici yüklemeden önce açılır, yoksa atlama ölçülmez.
    await girisYap(null);
    const bildirimOnce = (await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kaydi WHERE tur = 'siparisler.onay-bekliyor'"))?.n ?? 0;
    const satirlar = [
      satir({ siparisNo: 'ORN-MSN-Y1' }), satir({ siparisNo: 'ORN-MSN-Y1', malzeme: mamul2Kodu, miktar: '40', termin: '2026-06-01', logo: true }),
      satir({ siparisNo: 'ORN-MSN-Y2', firma: firma2Kodu, birimFiyat: null }),
    ];
    const c = await yukle(satirlar);
    assert.equal(c.statusCode, 200, c.body);
    const r = topluSiparisYukleCevabi.parse(c.json());
    assert.deepEqual(r.siparisler?.map((s) => s.musteriSiparisNo), ['ORN-MSN-Y1', 'ORN-MSN-Y2']);
    const kayit = await o().sahip.sorgu<{ musteri_siparis_no: string; durum: string; logo_baglanacak: boolean; toplu: boolean; termin: string; kalem: number; siparis_tarihi: string }>(
      `SELECT s.musteri_siparis_no, s.durum, s.logo_baglanacak, s.toplu_yukleme_id IS NOT NULL AS toplu, s.termin::text AS termin, s.siparis_tarihi::text AS siparis_tarihi,
              (SELECT count(*)::int FROM siparisler_siparis_satiri k WHERE k.siparis_id = s.id) AS kalem
         FROM siparisler_siparis s WHERE s.id = ANY($1::int[]) ORDER BY s.musteri_siparis_no`, [r.siparisler?.map((s) => s.id)]);
    assert.deepEqual(kayit, [
      { musteri_siparis_no: 'ORN-MSN-Y1', durum: 'taslak', logo_baglanacak: true, toplu: true, termin: '2026-06-01', siparis_tarihi: '2026-03-02', kalem: 2 },
      { musteri_siparis_no: 'ORN-MSN-Y2', durum: 'taslak', logo_baglanacak: false, toplu: true, termin: '2026-04-15', siparis_tarihi: '2026-03-02', kalem: 1 },
    ]);
    const yukleme = await o().sahip.tek<{ siparis_sayisi: number; satir_sayisi: number; dosya_adi: string }>(
      'SELECT siparis_sayisi, satir_sayisi, dosya_adi FROM siparisler_toplu_yukleme ORDER BY id DESC LIMIT 1');
    assert.deepEqual(yukleme, { siparis_sayisi: 2, satir_sayisi: 3, dosya_adi: 'orn-siparisler.xlsx' });
    const bildirim = async (): Promise<number> => (await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kaydi WHERE tur = 'siparisler.onay-bekliyor'"))?.n ?? 0;
    assert.equal(await bildirim(), bildirimOnce);
    // Ölçü gerçek: elle açılan sipariş aynı bildirimi yazar (öteki yöneticiye).
    const elle = await gonder(yonetici, '/siparisler/ekle', {
      firmaId: r.siparisler?.[0] === undefined ? 0 : (await o().sahip.tek<{ f: number }>('SELECT firma_id AS f FROM siparisler_siparis WHERE id = $1', [r.siparisler[0].id]))!.f,
      musteriSiparisNo: null, siparisTarihi: '2026-03-02', termin: '2026-04-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: (await o().sahip.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE stok_kodu = $1', [mamulKodu]))!.no, miktar: '1', birimFiyat: null, termin: null, aciklama: null }],
    });
    assert.equal(elle.statusCode, 200, elle.body);
    assert.ok((await bildirim()) > bildirimOnce, 'elle açılış bildirim yazar');

    const once = await siparisSayisi();
    const tekrar = await yukle(satirlar.map((s) => ({ ...s, sira: s.sira + 1000 })));
    const t = topluSiparisYukleCevabi.parse(tekrar.json());
    assert.equal(t.siparisler, null);
    assert.ok(t.denetim?.satirlar.every((s) => s.hatalar.some((h) => h.ileti === TOPLU_SIPARIS_VAR)));
    assert.equal(await siparisSayisi(), once);
  });

  test('eşzamanlı iki aynı yükleme: siparişler bir kez açılır', async () => {
    const satirlar = [satir({ siparisNo: 'ORN-MSN-E1' }), satir({ siparisNo: 'ORN-MSN-E2', firma: firma2Kodu })];
    const once = await siparisSayisi();
    const [a, b] = await Promise.all([yukle(satirlar), yukle(satirlar)]);
    const acilan = [a, b].filter((c) => c.statusCode === 200 && topluSiparisYukleCevabi.parse(c.json()).siparisler !== null);
    assert.equal(acilan.length, 1, JSON.stringify([a.statusCode, a.body, b.statusCode, b.body]));
    const oteki = acilan[0] === a ? b : a;
    assert.ok(oteki.statusCode === 409 || (oteki.statusCode === 200 && topluSiparisYukleCevabi.parse(oteki.json()).siparisler === null), oteki.body);
    assert.equal(await siparisSayisi(), once + 2);
  });

  test('göç: toplu yüklenen sipariş müşteri sipariş no taşır; yükleme defteri değişmez', async () => {
    const y = (await o().sahip.tek<{ id: number }>('SELECT id FROM siparisler_toplu_yukleme LIMIT 1'))!.id;
    await assert.rejects(o().sahip.sorgu("UPDATE siparisler_toplu_yukleme SET dosya_adi = 'x' WHERE id = $1", [y]));
    await assert.rejects(
      o().sahip.sorgu('UPDATE siparisler_siparis SET musteri_siparis_no = NULL WHERE toplu_yukleme_id = $1', [y]),
      /siparisler_siparis_toplu_musteri_no/,
    );
  });
});
