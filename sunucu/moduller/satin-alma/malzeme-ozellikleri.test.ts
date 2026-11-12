import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { kopyaOzelligi } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('3121, 3133 (1105 a): sipariş satırının sütunları ve kart ayrıntısı kart kopyasından (saf)', () => {
  test('izinli: yeni kopya dört alanı, açıklamayı ve föy sırasıyla ayrıntıyı taşır; boş alan ayrıntıya yazılmaz', () => {
    assert.deepEqual(kopyaOzelligi({
      kaliteAdi: 'ORN-K1', formAdi: 'Yuvarlak çubuk', durum: 'Tavlı', islem: 'Kumlama', olcu: 'Ø50×3000 mm', aciklamalar: ['ORN açıklama'],
      standartlar: ['ORN-STD'], tolerans: null, yuzey: '', sertifikalar: [], ureticiUrunKodu: null, mensei: null, gtip: null, enAzSiparis: '10', tercihTedarikci: 'ORN-F', not: 'iç not',
    }), {
      kalite: 'ORN-K1', durum: 'Tavlı', islem: 'Kumlama', olcu: 'Ø50×3000 mm', aciklama: 'ORN açıklama', kayitsiz: false,
      ayrinti: [
        { ad: 'Kalite', deger: 'ORN-K1' }, { ad: 'Form', deger: 'Yuvarlak çubuk' }, { ad: 'Ölçü', deger: 'Ø50×3000 mm' }, { ad: 'Açıklama', deger: 'ORN açıklama' },
        { ad: 'Standart', deger: 'ORN-STD' }, { ad: 'Durum', deger: 'Tavlı' }, { ad: 'İşlem', deger: 'Kumlama' },
      ],
    });
  });
  test('yasak: eski kopyada işlem ve ölçü yoksa doldurulmaz, satır kayıtsız döner; iç alanlar (en az sipariş, tercih tedarikçi, not) ayrıntıda yok', () => {
    const o = kopyaOzelligi({ kaliteAdi: 'ORN-K1', durum: 'Tavlı', aciklamalar: [], enAzSiparis: '10', tercihTedarikci: 'ORN-F', not: 'iç not' });
    assert.deepEqual(o, { kalite: 'ORN-K1', durum: 'Tavlı', islem: null, olcu: null, aciklama: null, kayitsiz: true, ayrinti: [{ ad: 'Kalite', deger: 'ORN-K1' }, { ad: 'Durum', deger: 'Tavlı' }] });
  });
});

describe('3121: Taleplerim ve satın alma merkezinde kalite, durum, işlem, ölçü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '' };
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
  async function kartAc(sira: number, opts: Record<string, unknown>): Promise<number> {
    const kimlik = `mo-kart-${sira}`;
    const r = await post(c.yonetici, `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 50, l: 3000 + sira }, opts, com: { kod: `HM-MOZ-0000${sira}`, ad: `Deneme çubuk ${sira}`, birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: `hammadde|malzeme-ozellikleri|${kimlik}`, mukerrer_gerekcesi: null, birim_agirlik_kg: null }, surum: null,
    });
    assert.equal(r.statusCode, 200, r.body);
    return (await ortam!.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kayit->'com'->>'kod' = $1", [`HM-MOZ-0000${sira}`]))!.no;
  }

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_malzeme_ozellikleri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.talep = await rolluKisi('cam', 'cam');
    assert.equal((await post(c.yonetici, '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })).statusCode, 200);
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: kartlı kalem dört alanla gelir (Taleplerim ve merkez); kartsız kalemde null; işlemler virgülle', async () => {
    const kart = await kartAc(1, { durum: 'Tavlı', islem: ['Kumlama', 'Yağlama'] });
    const acilan = await post(c.talep, '/satin-alma-talepleri/hizli-ac', {
      id: randomUUID(), kalemler: [{ malzemeNo: kart, miktar: '4' }, { ad: 'Deneme kartsız', birim: 'adet', miktar: '2' }],
    });
    assert.equal(acilan.statusCode, 200, acilan.body);
    const talep = acilan.json() as TaleplerimCevabi['talepler'][number];
    const beklenen = {
      kalite: 'S235', durum: 'Tavlı', islem: 'Kumlama, Yağlama', olcu: 'Ø50×3001 mm', aciklama: null,
      ayrinti: [{ ad: 'Kalite', deger: 'S235' }, { ad: 'Ölçü', deger: 'Ø50×3001 mm' }, { ad: 'Durum', deger: 'Tavlı' }, { ad: 'İşlem', deger: 'Kumlama, Yağlama' }],
    };
    assert.deepEqual(talep.kalemler.map((k) => k.malzeme), [beklenen, null]);
    const liste = (await get(c.talep, '/satin-alma-taleplerim')).json() as TaleplerimCevabi;
    assert.deepEqual(liste.talepler.find((t) => t.id === talep.id)?.kalemler.map((k) => k.malzeme), [beklenen, null]);
    const acilis = await get(c.yonetici, '/satin-alma-acilis');
    assert.equal(acilis.statusCode, 200, acilis.body);
    const merkez = (acilis.json() as { talepler: { id: string; kalemOzellikleri?: object[] }[] }).talepler.find((t) => t.id === talep.id);
    assert.equal(merkez?.kalemOzellikleri?.length, 1);
    assert.deepEqual(merkez?.kalemOzellikleri?.[0], { kalemId: (merkez?.kalemOzellikleri?.[0] as { kalemId: string }).kalemId, ...beklenen });
  });

  test('yasak: kartta durum ve işlem yoksa uydurulmaz; Taleplerim fiyat ve teklif taşımaz', async () => {
    const kart = await kartAc(2, {});
    const acilan = await post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ malzemeNo: kart, miktar: '1' }] });
    assert.equal(acilan.statusCode, 200, acilan.body);
    assert.deepEqual((acilan.json() as TaleplerimCevabi['talepler'][number]).kalemler.map((k) => k.malzeme), [{ kalite: 'S235', durum: null, islem: null, olcu: 'Ø50×3002 mm', aciklama: null, ayrinti: [{ ad: 'Kalite', deger: 'S235' }, { ad: 'Ölçü', deger: 'Ø50×3002 mm' }] }]);
    assert.doesNotMatch(JSON.stringify((await get(c.talep, '/satin-alma-taleplerim')).json()), /"birimFiyat"|"teklifler"|"karar"/);
  });
});
