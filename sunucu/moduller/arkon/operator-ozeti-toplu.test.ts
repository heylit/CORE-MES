import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { operatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { Db } from '#cekirdek/db.ts';
import { operatorOzeti } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const SAAT = 3_600_000;

interface Cevap<T = unknown> { durum: number; govde: T }

describe('arkon operatör özeti toplu okuma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let yonetici = '';
  let sayac = 0;
  let gunBasi = 0;
  let simdi = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { ...(cerez ? { cookie: cerez } : {}), ...(yontem === 'POST' && (yol === '/uretim-emirleri' || yol.endsWith('/sayim')) ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  async function kisiKur(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    if (!yoneticiRolu || !gecici) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  interface Ortam { merkezId: number; istasyonId: number; makineler: number[] }

  // Tüm hafta, tüm gün açık tek vardiya: net aktif süre gün başından şimdiye kadar geçen süredir.
  async function ortamKur(makineSayisi: number, aralik: { vardiya: boolean } = { vardiya: true }): Promise<Ortam> {
    const merkez = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: `AM${(sayac += 1)}`, ad: 'Anomali merkezi' });
    const ist = await istek<{ id: number }>(yonetici, 'POST', '/istasyonlar', { kod: `AI${(sayac += 1)}`, ad: 'Anomali istasyonu', isMerkeziId: merkez.govde.id, tip: 'talasli' });
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    const makineler: number[] = [];
    for (let i = 0; i < makineSayisi; i += 1) {
      makineler.push((await sahip().tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`AK${(sayac += 1)}`, 'Tezgah', ist.govde.id]))!.id);
    }
    if (aralik.vardiya) {
      const vardiya = (await sahip().tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ($1, '00:00', '23:59') RETURNING id", [`Gün ${(sayac += 1)}`]))!.id;
      await sahip().sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, $2 FROM generate_series(1, 7) g', [merkez.govde.id, vardiya]);
    }
    return { merkezId: merkez.govde.id, istasyonId: ist.govde.id, makineler };
  }

  // Tek adımlı rotalı emir (adım makinede) ve canlı planda `bas`-`bit` saatleri arasına yerleşimi.
  async function isEmriKur(makineId: number, secenek: { adet?: number; birimSureDk: string; bas: number; bit: number }): Promise<{ emirId: number; isEmriId: number }> {
    sayac += 1;
    const tip = (await sahip().tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`AT${sayac}`, 'Deneme tipi', 'TAL']))!.id;
    await sahip().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ANM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await sahip().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'ANM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`anm-${sayac}`, sayac, JSON.stringify({ id: `anm-${sayac}`, com: { ad: `Anomali ${sayac}` } }), yoneticiId],
    ))!.no;
    await sahip().sorgu("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2)", [kart, yoneticiId]);
    const revizyon = (await sahip().tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!.id;
    const { uretimEmriId } = await vt().tx(async (db) => uretimEmriAc(db, (await kullaniciYukle(db, yoneticiId))!, {
      projeId: denemeProjeId, malzemeNo: kart, adet: secenek.adet ?? 500, teslim: null, kaynakRotaRevizyonId: revizyon,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makineId }, ayarSuresiDk: '0', birimSureDk: secenek.birimSureDk,
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      }],
    }));
    const isEmriId = (await sahip().tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [uretimEmriId]))!.id;
    await sahip().sorgu(
      `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id)
       VALUES ($1, $2, NULL, to_timestamp($3::double precision / 1000), to_timestamp($4::double precision / 1000), $5)`,
      [isEmriId, makineId, gunBasi + secenek.bas * SAAT, gunBasi + secenek.bit * SAAT, yoneticiId],
    );
    return { emirId: uretimEmriId, isEmriId };
  }

  const kisiAta = (makineId: number, kisiId: number): Promise<unknown> => sahip().sorgu(
    "INSERT INTO makine_kisi (makine_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', 50)", [makineId, kisiId]);

  // Sayım defteri yalnız eklenir; testte zamanı seçmek için sahip bağlantısıyla doğrudan yazılır (gün başından `saat` saat sonra).
  const sayimYaz = (emirId: number, kisiId: number, istasyonId: number, saat: number, adet: number): Promise<unknown> => sahip().sorgu(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, zaman)
     VALUES ($1, $2, $3, 'saglam', $4, to_timestamp($5::double precision / 1000))`, [emirId, kisiId, istasyonId, adet, gunBasi + saat * SAAT]);

  const ozet = async (cerez: string | null, sorgu = ''): Promise<Cevap<OperatorOzetiCevabi>> => istek<OperatorOzetiCevabi>(cerez, 'GET', `/arkon/operator-ozeti${sorgu}`);
  const hesapla = (kisiId: number, sorgu: Parameters<typeof operatorOzeti>[2] = { donem: 'gun' }): Promise<OperatorOzetiCevabi> =>
    vt().tx(async (db) => operatorOzeti(db, (await kullaniciYukle(db, kisiId))!, sorgu, simdi));
  const isMerkeziKisitla = (kisiId: number, merkezId: number): Promise<unknown> =>
    sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiId, merkezId]);

  before(async () => {
    ortam = await testVeritabaniKur('arkonozettoplu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.OOT', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
    gunBasi = tesisGunBasi(tesisGunu(Date.now()));
    simdi = gunBasi + 10 * SAAT;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  interface Senaryo { ben: number; benMakine: number; benIstasyon: number; istasyonlar: number[]; isEmirleri: number[]; kisiler: number[]; makineler: number[] }

  // Geçmiş gün işi: `gun` (negatif) günü 08:00-12:00 planlı, aynı saatlerde katılımlı ve o gün sağlam sayımlı.
  async function gecmisIsEkle(s: Senaryo, gun: number, tamam = false): Promise<void> {
    const gecmis = await isEmriKur(s.benMakine, { birimSureDk: '2', bas: gun * 24 + 8, bit: gun * 24 + 12 });
    s.isEmirleri.push(gecmis.isEmriId);
    // Tamamlanan iş canlı plandan düşer; gün sayısı sınaması bugünün plan hesabını iş sayısıyla büyütmesin diye tamamlanmış iş kullanır.
    if (tamam) await sahip().sorgu(
      `UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = to_timestamp($2::double precision / 1000), bitis = to_timestamp($3::double precision / 1000), saglam_adet = 1 WHERE id = $1`,
      [gecmis.isEmriId, gunBasi + (gun * 24 + 8) * SAAT, gunBasi + (gun * 24 + 12) * SAAT]);
    await sahip().sorgu(
      `INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman) VALUES ($1, $2, $3, $4, 'saglam', $5, to_timestamp($6::double precision / 1000))`,
      [gecmis.emirId, gecmis.isEmriId, s.ben, s.benIstasyon, 40 + gun, gunBasi + (gun * 24 + 9) * SAAT]);
    await sahip().sorgu(
      `INSERT INTO uretim_emirleri_katilim (emir_id, is_emri_id, kisi_id, istasyon_id, giris, cikis, kapanis) VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000), to_timestamp($6::double precision / 1000), 'ayril')`,
      [gecmis.emirId, gecmis.isEmriId, s.ben, s.benIstasyon, gunBasi + (gun * 24 + 8) * SAAT, gunBasi + (gun * 24 + 12) * SAAT]);
  }

  // Her istasyonda iki tezgah; ilk istasyonda üç, ötekilerde bir operatör. `ben` ilk istasyondadır ve geçmiş günlerde iş taşır (öteki günlerde kayıt yok).
  async function senaryoKur(istasyonSayisi: number, gecmisGunler: readonly number[] = [-1, -2, -4]): Promise<Senaryo> {
    const s: Senaryo = { ben: 0, benMakine: 0, benIstasyon: 0, istasyonlar: [], isEmirleri: [], kisiler: [], makineler: [] };
    for (let k = 0; k < istasyonSayisi; k += 1) {
      const o = await ortamKur(2);
      s.istasyonlar.push(o.istasyonId); s.makineler.push(...o.makineler);
      for (let i = 0; i < (k === 0 ? 3 : 1); i += 1) {
        const kisi = await kisiKur(`ozt${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
        s.kisiler.push(kisi.id);
        if (k === 0 && i === 0) { s.ben = kisi.id; s.benMakine = o.makineler[0]!; s.benIstasyon = o.istasyonId; }
        await kisiAta(o.makineler[i % 2]!, kisi.id);
        const ie = await isEmriKur(o.makineler[i % 2]!, { birimSureDk: '2', bas: 8, bit: 12 });
        s.isEmirleri.push(ie.isEmriId);
        await sayimYaz(ie.emirId, kisi.id, o.istasyonId, 9, 20 + 10 * i + k);
      }
      if (k === 0) for (const gun of gecmisGunler) await gecmisIsEkle(s, gun);
    }
    return s;
  }

  const sorguSayisi = (kisiId: number): Promise<number> => vt().tx(async (db) => {
    let adet = 0;
    const sayan: Db = {
      sorgu: (sql, p) => { adet += 1; return db.sorgu(sql, p); },
      tek: (sql, p) => { adet += 1; return db.tek(sql, p); },
    };
    await operatorOzeti(sayan, (await kullaniciYukle(db, kisiId))!, { donem: 'gun' }, simdi);
    return adet;
  });

  // Kimlikler, tarihler ve sıra numaraları çalıştırmadan çalıştırmaya değişir; cevap bunlardan arındırılıp sabit bir biçime getirilir.
  const gunFarki = (tarih: string): number => Math.round((tesisGunBasi(tarih) - gunBasi) / (24 * SAAT));
  function normalle(deger: unknown, s: Senaryo, anahtar = ''): unknown {
    if (Array.isArray(deger)) return deger.map((d) => normalle(d, s, anahtar));
    if (deger !== null && typeof deger === 'object') return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, normalle(v, s, k)]));
    if (typeof deger === 'number' && (anahtar === 'id' || anahtar === 'isEmriId')) {
      const sira = anahtar === 'isEmriId' ? s.isEmirleri.indexOf(deger) : (s.kisiler.includes(deger) ? s.kisiler.indexOf(deger) : s.makineler.indexOf(deger));
      return `${anahtar}#${sira}`;
    }
    if (typeof deger !== 'string') return deger;
    if (/^\d{4}-\d{2}-\d{2}$/.test(deger)) return `gun${gunFarki(deger)}`;
    if (/^\d{4}-\d{2}-\d{2}T/.test(deger)) return `an${(Date.parse(deger) - gunBasi) / SAAT}`;
    return deger.replace(/ARKON\.OOT-/g, '').replace(/ANM-\d+(-\d+)*/g, 'ANM').replace(/Anomali \d+/g, 'Anomali').replace(/ozt\d+/g, 'ozt').replace(/\b(AK|AI)\d+/g, '$1');
  }

  test('cevap sabit: bugünün planı, ekip ortalaması, son 7 gün (kayıtsız gün boş), mesai, yetkiler birebir aynı kalır', async () => {
    const s = await senaryoKur(3);
    const { rozetler, ...cevap } = await hesapla(s.ben, { donem: 'gun' });
    assert.deepEqual(operatorOzetiCevabi.safeParse({ ...cevap, rozetler }).error?.issues, undefined);
    assert.ok(rozetler.some((r) => r.kod === 'sifir-hurda'), 'dört gün üst üste hurdasız');
    assert.deepEqual(normalle(cevap, s), BEKLENEN);
  });

  test('sorgu sayısı istasyon sayısıyla büyümez', async () => {
    const s = await senaryoKur(2);
    const once = await sorguSayisi(s.ben);
    await senaryoKur(4);
    const sonra = await sorguSayisi(s.ben);
    // Kalan artış Vardiya'nın kaynak başına takvim okumasıdır (gün sınırı bütün canlı plandaki kaynaklara göre bulunur); eskiden istasyon başına ~30'du.
    assert.ok(sonra - once <= 4 * 3, `2 istasyonda ${once}, 6 istasyonda ${sonra} sorgu`);
  });

  test('sorgu sayısı işi olan gün sayısıyla büyümez', async () => {
    const s = await senaryoKur(1, []);
    await gecmisIsEkle(s, -1, true);
    const once = await sorguSayisi(s.ben);
    for (const gun of [-2, -3, -4, -5, -6]) await gecmisIsEkle(s, gun, true);
    const sonra = await sorguSayisi(s.ben);
    assert.ok(sonra - once <= 2, `1 günde ${once}, 6 günde ${sonra} sorgu`);
  });
});

// Hesap eski (döngü içi sorgulu) kodda alındı; değişiklikten sonra da aynı kalmalıdır.
const BEKLENEN = {
  "kisi": {
    "id": "id#0",
    "ad": "Deneme ozt"
  },
  "donem": "gun",
  "baslangic": "gun0",
  "bitis": "gun0",
  "hesaplama": "an10",
  "saglam": 20,
  "hurda": 0,
  "calismaSn": null,
  "kalite": 1,
  "saatlikSaglam": null,
  "basari": {
    "uretilen": 20,
    "beklenen": 60,
    "oran": 0.33,
    "eksikGun": 0,
    "standartla": 0
  },
  "verim": null,
  "isler": [
    {
      "isEmriId": null,
      "emirNo": "ANM",
      "parca": "ANM · Anomali",
      "opNo": null,
      "adimAdi": null,
      "durum": "bekliyor",
      "saglam": 20,
      "hurda": null,
      "saniye": null
    }
  ],
  "hurdaNedenleri": [],
  "ekipOrtalamasi": 0.5,
  "gunler": [
    {
      "tarih": "gun-6",
      "saglam": null,
      "hurda": null,
      "beklenen": null
    },
    {
      "tarih": "gun-5",
      "saglam": null,
      "hurda": null,
      "beklenen": null
    },
    {
      "tarih": "gun-4",
      "saglam": 36,
      "hurda": 0,
      "beklenen": 120
    },
    {
      "tarih": "gun-3",
      "saglam": null,
      "hurda": null,
      "beklenen": null
    },
    {
      "tarih": "gun-2",
      "saglam": 38,
      "hurda": 0,
      "beklenen": 120
    },
    {
      "tarih": "gun-1",
      "saglam": 39,
      "hurda": 0,
      "beklenen": 120
    },
    {
      "tarih": "gun0",
      "saglam": 20,
      "hurda": 0,
      "beklenen": 60
    }
  ],
  "emekVerimi": {
    "oran": 0,
    "standartSn": 0,
    "mesaiSn": 36000
  },
  "yetkiler": {
    "istasyonlar": [],
    "makineler": [
      {
        "id": "id#0",
        "kod": "AK",
        "ad": "Tezgah",
        "istasyonKodu": "AI"
      }
    ]
  },
  "mesailer": [
    {
      "tarih": "gun0",
      "dakika": 1439,
      "kapali": null,
      "baslangic": "an0",
      "bitis": "an23.983333333333334"
    },
    {
      "tarih": "gun1",
      "dakika": 1439,
      "kapali": null,
      "baslangic": "an24",
      "bitis": "an47.983333333333334"
    },
    {
      "tarih": "gun2",
      "dakika": 1439,
      "kapali": null,
      "baslangic": "an48",
      "bitis": "an71.98333333333333"
    },
    {
      "tarih": "gun3",
      "dakika": 1439,
      "kapali": null,
      "baslangic": "an72",
      "bitis": "an95.98333333333333"
    },
    {
      "tarih": "gun4",
      "dakika": 1439,
      "kapali": null,
      "baslangic": "an96",
      "bitis": "an119.98333333333333"
    },
    {
      "tarih": "gun5",
      "dakika": 1439,
      "kapali": null,
      "baslangic": "an120",
      "bitis": "an143.98333333333332"
    },
    {
      "tarih": "gun6",
      "dakika": 1439,
      "kapali": null,
      "baslangic": "an144",
      "bitis": "an167.98333333333332"
    }
  ],
  "fazlaMesai": null,
  "izinler": null,
  "ekip": []
};
