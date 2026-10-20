import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirDuraklat, emirSayim, katilimDuraklat } from './disari.ts';
import { KAYIT_ANI_ESKI, KAYIT_ANI_ILERI } from './kurallar.ts';
import { emirAc } from './servis.ts';

// Denetim #25: Arkon çevrimdışı kuyruğundan gelen kayıt sunucu saatiyle yazılıyordu (vardiya, OEE ve süre yanlış).
describe('uretim-emirleri kayıt anı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operator: Kullanici;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function kisiEkle(kullaniciAdi: string): Promise<Kullanici> {
    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const kullanici = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (kullanici === null) throw new Error('kullanıcı yüklenemedi');
    return kullanici;
  }

  async function istasyonKur(): Promise<{ istasyonId: number; isMerkeziId: number }> {
    sayac += 1;
    const im = await ortam!.sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KAN${sayac}`, 'Deneme Merkezi']);
    const ist = await ortam!.sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KAS${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    if (!im || !ist) throw new Error('istasyon kurulamadı');
    await ortam!.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist.id]);
    return { istasyonId: ist.id, isMerkeziId: im.id };
  }

  async function planliEmir(): Promise<number> {
    const { istasyonId } = await istasyonKur();
    const { emir } = await vt().tx((db) => emirAc(db, yoneticiId, { parcaNo: 'P-1', parcaAd: 'Deneme Parçası', adet: 100, istasyonId }));
    return emir.id;
  }

  const once = (dk: number): string => new Date(Date.now() - dk * 60_000).toISOString();
  const ms = (an: string | Date | null): number => (an === null ? Number.NaN : new Date(an).getTime());

  const reddi = async (is: Promise<unknown>): Promise<UygulamaHatasi> => {
    const hata: unknown = await is.then(() => null, (h: unknown) => h);
    assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
    return hata;
  };

  before(async () => {
    ortam = await testVeritabaniKur('ue_kayit_ani');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    operator = await kisiEkle('operator');
  });
  after(async () => { await ortam?.kaldir(); });

  test('verilen an başlatma, sayım ve katılım satırlarına yazılır; verilmezse sunucu saati', async () => {
    const emir = await planliEmir();
    const baslama = once(30);
    const sayim = once(20);
    await vt().tx((db) => emirBaslat(db, operator, emir, undefined, baslama));
    await vt().tx((db) => emirSayim(db, operator, emir, { tur: 'saglam', adet: 4 }, { an: sayim }));
    const e = await vt().tek<{ baslama: Date }>('SELECT baslama FROM uretim_emri WHERE id = $1', [emir]);
    assert.equal(ms(e!.baslama), ms(baslama));
    const k = await vt().tek<{ zaman: Date }>("SELECT zaman FROM uretim_kaydi WHERE emir_id = $1 AND olay = 'baslat'", [emir]);
    assert.equal(ms(k!.zaman), ms(baslama));
    const c = await vt().tek<{ giris: Date }>('SELECT giris FROM uretim_emirleri_katilim WHERE emir_id = $1', [emir]);
    assert.equal(ms(c!.giris), ms(baslama));
    const s = await vt().tek<{ zaman: Date }>('SELECT zaman FROM uretim_sayimi WHERE emir_id = $1', [emir]);
    assert.equal(ms(s!.zaman), ms(sayim));
    const oncesi = Date.now();
    await vt().tx((db) => emirDuraklat(db, operator, emir));
    const o = await vt().tek<{ zaman: Date }>('SELECT zaman FROM uretim_olayi WHERE emir_id = $1', [emir]);
    assert.ok(ms(o!.zaman) >= oncesi - 1000, 'an verilmeyen komut sunucu saatini yazar');
  });

  test('an emrin son olayından önce ya da ileride olamaz; reddedilen komut yazmaz', async () => {
    const emir = await planliEmir();
    await vt().tx((db) => emirBaslat(db, operator, emir, undefined, once(30)));
    await vt().tx((db) => emirSayim(db, operator, emir, { tur: 'saglam', adet: 2 }, { an: once(10) }));
    const eski = await reddi(vt().tx((db) => emirDuraklat(db, operator, emir, once(15))));
    assert.equal(eski.message, KAYIT_ANI_ESKI);
    assert.equal(eski.kod, 'DOGRULAMA');
    const ileri = await reddi(vt().tx((db) => emirSayim(db, operator, emir, { tur: 'saglam', adet: 1 }, { an: new Date(Date.now() + 3_600_000).toISOString() })));
    assert.equal(ileri.message, KAYIT_ANI_ILERI);
    assert.equal(
      (await reddi(vt().tx((db) => katilimDuraklat(db, operator, emir, once(25))))).message, KAYIT_ANI_ESKI, 'katılım komutu da denetlenir',
    );
    const olay = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_olayi WHERE emir_id = $1', [emir]);
    assert.equal(olay!.n, 0);
    const sayim = await vt().tek<{ toplam: number }>('SELECT sum(adet)::int AS toplam FROM uretim_sayimi WHERE emir_id = $1', [emir]);
    assert.equal(sayim!.toplam, 2);
    // Son olayla aynı an kabul edilir (aynı saniyede iki kayıt).
    const ayni = await vt().tek<{ zaman: Date }>('SELECT max(zaman) AS zaman FROM uretim_sayimi WHERE emir_id = $1', [emir]);
    await vt().tx((db) => emirDuraklat(db, operator, emir, new Date(ayni!.zaman).toISOString()));
  });
});
