import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirBitir, emirSayim, planlanacakIsEmirleri, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';

// İlk parça kararı bekleyen parça, bitmiş adımın kaybı sayılmaz: sonraki adımın işleyeceği adede girer. Adlar uydurmadır.
describe('uretim-emirleri karar bekleyen adet ve sonraki adım (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  let planlama: Kullanici;
  let operator: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    return k;
  }

  async function makine(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KBA${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KBAI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KBAM${sayac}`, 'Tezgah', ist]))!.id;
  }

  // OP20, OP10'u bekler (öncül listesiyle): OP10'un kaybı OP20'ye geçer.
  const adim = (sira: number, makineId: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    onculler: sira === 1 ? [] : [{ opNo: (sira - 1) * 10, tur: 'bekleyen', devirAdedi: null }],
  });

  before(async () => {
    ortam = await testVeritabaniKur('ue_karar_bekleyen_adet');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.KBA', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlama = await kisi('planlama_proje', 'planlama_proje');
    operator = await kisi('operator', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KBA-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KBA-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kba-dnm-1', 'mamul', 'KBA-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kba-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  // Varsayılan ilk parça kapısında (her kurulum) karar verilmeden yazılan sağlam sayım da karar bekler; adımın onaylı sağlamı 0 kalır.
  test('OP10 karar bekleyen parçalarla bitince OP20 onları işler; sayılmayan parça kayıp düşer', async () => {
    const kur = async (kararBekleyen: number) => {
      const r = await tx(async (db) => uretimEmriAc(db, planlama, {
        malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(1, await makine()), adim(2, await makine())], projeId,
      }));
      const [ie1, ie2] = r.isEmriIdleri as [number, number];
      const id = r.uretimEmriId;
      await tx((db) => emirBaslat(db, operator, id, undefined, undefined, ie1));
      await tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: 7 }, { isEmriId: ie1 }));
      if (kararBekleyen > 0) await tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet: kararBekleyen }, { kararBekliyor: true, isEmriId: ie1 }));
      await tx((db) => emirBitir(db, operator, id, undefined, undefined, ie1));
      const plan = (await tx((db) => planlanacakIsEmirleri(db, { taslakDahil: true }))).filter((p) => p.uretimEmriId === id);
      return plan.find((p) => p.id === ie2)?.adimAdedi;
    };
    assert.equal(await kur(3), 10, '10 parçanın hepsi karar bekliyor, kayıp yok');
    assert.equal(await kur(0), 7, '7 parça karar bekliyor, sayılmayan 3 kayıp düşer');
  });
});
