import { describe, expect, it } from 'vitest';
import type { OkutCozCevabi, OkutYeri } from '#paylasilan/sozlesme/stok.ts';
import {
  BOS_LISTE, buradanAl, hedefeGoreGrupla, isListesiOkut, kaynakSec, kayitPlani, miktarDegistir, satirCikar, satirHedefi, sonucuIsle, type IsListesi,
} from './is-listesi.ts';

// 2920 a: tek iş listesi. Okutma satır ekler ya da hedef seçer; plan bugünkü taşıma ve teslim gövdeleriyle çıkar.
const yer = (konumId: number, tur: OkutYeri['tur'], istasyonId: number | null = null): OkutYeri => ({ konumId, kod: `K${konumId}`, ad: null, tur, istasyonId });
const malzeme = (id: number, yerler: OkutYeri[], statuId: number | null = null): OkutCozCevabi => ({
  tur: 'malzeme', malzeme: { id, kod: `HM-${id}`, ad: `Deneme ${id}`, birim: 'adet' }, parti: null,
  yerler: yerler.map((y) => ({ ...y, partiId: null, partiEtiketi: null, statuId, miktar: '4.000' })),
});
const yerOkut = (y: OkutYeri, satirlar: { malzemeId: number }[] | null = []): OkutCozCevabi => ({
  tur: 'yer', yer: y,
  satirlar: satirlar === null ? null : satirlar.map((s) => ({ malzemeId: s.malzemeId, kod: null, ad: `Deneme ${s.malzemeId}`, partiId: null, partiEtiketi: null, statuId: null, miktar: '2.000' })),
} as OkutCozCevabi);
// Lot satırı: yerdeki stok partili gelir (Yerleştir kuralında tamamı alınır).
const lotlu = (c: OkutCozCevabi): OkutCozCevabi =>
  (c.tur === 'malzeme' ? { ...c, yerler: c.yerler.map((y) => ({ ...y, partiId: 30, partiEtiketi: 'L-30' })) } : c);
const KISI: OkutCozCevabi = { tur: 'kisi', kod: 'KSI-9-A-x', kisi: { id: 9, ad: 'Deneme Alıcı' }, istasyon: { id: 3, kod: 'T3', ad: 'Torna 3' } };

const KABUL = yer(5, 'kabul');
const GOZ = yer(6, 'raf_gozu');
const TORNA = yer(9, 'istasyon', 3);

function okut(l: IsListesi, ...c: OkutCozCevabi[]): IsListesi {
  return c.reduce((x, k) => isListesiOkut(x, k).liste, l);
}

describe('iş listesi (2920 a)', () => {
  it('malzeme önce, yer sonra: hedefsiz satırlar okutulan yere bağlanır ve hazır olur', () => {
    const l1 = okut(BOS_LISTE, malzeme(1, [KABUL]), malzeme(2, [KABUL]));
    expect(l1.satirlar.map((s) => s.durum.tur)).toEqual(['hedefsiz', 'hedefsiz']);
    const r = isListesiOkut(l1, yerOkut(GOZ));
    expect(r).toMatchObject({ tur: 'hedef', atanan: 2, buradakiler: [] });
    expect(r.liste.satirlar.map((s) => [s.durum.tur, s.hedef])).toEqual([['hazir', GOZ], ['hazir', GOZ]]);
  });

  it('ikinci yer okutulunca eski hedefler kalır; yeni yer yalnız hedefsizlere ve sonra okutulanlara gider', () => {
    const l = okut(BOS_LISTE, malzeme(1, [KABUL]), yerOkut(GOZ), malzeme(2, [GOZ]));
    expect(l.satirlar.map((s) => s.hedef)).toEqual([GOZ, null]);
    const r = isListesiOkut(l, yerOkut(TORNA, null));
    expect(r).toMatchObject({ tur: 'hedef', atanan: 1 });
    expect(r.liste.satirlar.map((s) => s.hedef)).toEqual([GOZ, TORNA]);
    expect(okut(r.liste, malzeme(3, [KABUL])).satirlar[2]!.hedef).toEqual(TORNA);
  });

  it('yer önce: sonra okutulan malzemeler o yere gider; boş listede okutulan yerdeki stok "buradan al" diye sunulur', () => {
    const r = isListesiOkut(BOS_LISTE, yerOkut(GOZ, [{ malzemeId: 7 }]));
    expect(r.tur === 'hedef' && r.buradakiler.map((k) => k.malzemeId)).toEqual([7]);
    const l = okut(r.liste, malzeme(1, [KABUL]));
    expect(l.satirlar[0]).toMatchObject({ hedef: GOZ, durum: { tur: 'hazir' } });
    const al = buradanAl(BOS_LISTE, r.tur === 'hedef' ? r.buradakiler : []);
    expect(al.satirlar[0]).toMatchObject({ kaynak: { malzemeId: 7, yer: GOZ }, hedef: null, durum: { tur: 'hedefsiz' } });
  });

  it('kişi kodu hedeftir: kişinin istasyonuna o kişiye teslim olarak planlanır', () => {
    const l = okut(BOS_LISTE, malzeme(1, [KABUL]), KISI);
    expect(kayitPlani(l, true, () => 'k1')).toEqual([{
      anahtar: l.satirlar[0]!.anahtar, tur: 'teslim',
      govde: expect.objectContaining({ malzemeId: 1, hedef: { istasyonId: 3 }, aliciKodu: 'KSI-9-A-x', kaynakKimligi: 'k1' }),
    }]);
  });

  it('hedef zaten satırın bulunduğu yerse satır hedefsiz kalır (reddedilen)', () => {
    const l = okut(BOS_LISTE, malzeme(1, [GOZ]), yerOkut(GOZ));
    expect(l.satirlar[0]!.durum.tur).toBe('hedefsiz');
    expect(kayitPlani(l, true, () => 'k')).toEqual([]);
  });

  it('hedef zaten satırın yeriyse yer önce okutulsa da satır hedefsiz kalır; kişi hedefinde kişinin istasyonu sayılır (reddedilen)', () => {
    const l = okut(BOS_LISTE, yerOkut(GOZ), malzeme(1, [GOZ]));
    expect(l.satirlar[0]).toMatchObject({ hedef: null, durum: { tur: 'hedefsiz' } });
    expect(kayitPlani(l, true, () => 'k')).toEqual([]);
    expect(okut(BOS_LISTE, yerOkut(TORNA, null), malzeme(3, [yer(10, 'istasyon', 3)])).satirlar[0]!.durum.tur).toBe('hedefsiz');
    const ist = okut(BOS_LISTE, KISI, malzeme(2, [TORNA]));
    expect(ist.satirlar[0]!.durum.tur).toBe('hedefsiz');
    expect(kayitPlani(ist, true, () => 'k')).toEqual([]);
  });

  it('partisiz ve kartsız malzeme tek tek sayılır: ilk okutma 1, aynı kaynağın her okutması bir artırır, satır çoğalmaz (1916)', () => {
    const l1 = okut(BOS_LISTE, malzeme(1, [KABUL]));
    expect(l1.satirlar.map((s) => s.miktar)).toEqual(['1']);
    const l3 = okut(l1, malzeme(1, [KABUL]), malzeme(1, [KABUL]));
    expect(l3.satirlar.map((s) => s.miktar)).toEqual(['3']);
  });

  it('lot satırı kaynaktaki miktarın tamamıyla gelir; yeniden okutma miktarı değiştirmez (1916)', () => {
    const l = okut(BOS_LISTE, lotlu(malzeme(1, [KABUL])), lotlu(malzeme(1, [KABUL])), yerOkut(GOZ));
    expect(l.satirlar.map((s) => s.miktar)).toEqual(['4.000']);
    expect(kayitPlani(l, true, () => 'k')[0]!.govde).toMatchObject({ partiId: 30, miktar: '4.000' });
  });

  it('birden çok yerdeki malzeme kaynak seçimi ister, planlanmaz; seçilince hedefle hazır olur', () => {
    const l = okut(BOS_LISTE, yerOkut(TORNA, null), malzeme(1, [KABUL, GOZ]));
    const s = l.satirlar[0]!;
    expect(s.durum.tur).toBe('kaynak-sec');
    expect(kayitPlani(l, true, () => 'k')).toEqual([]);
    const elle = satirHedefi(l, s.anahtar, GOZ);
    expect(elle.satirlar[0]!.durum.tur).toBe('kaynak-sec');
    expect(kayitPlani(elle, true, () => 'k')).toEqual([]);
    const secenek = s.durum.tur === 'kaynak-sec' ? s.durum.secenekler[1]! : s.kaynak;
    const l2 = kaynakSec(l, s.anahtar, secenek);
    expect(l2.satirlar[0]).toMatchObject({ kaynak: { yer: GOZ }, hedef: TORNA, durum: { tur: 'hazir' } });
  });

  it('plan yolu bugünkü kurala uyar: depocu göz-göz taşır; istasyon, statülü ya da depocu olmayan teslimdir', () => {
    const l = okut(BOS_LISTE, malzeme(1, [KABUL]), malzeme(2, [KABUL], 4), yerOkut(GOZ));
    const plan = kayitPlani(l, true, (a) => `k-${a}`);
    expect(plan.map((p) => p.tur)).toEqual(['tasima', 'teslim']);
    expect(plan[0]!.govde).toEqual({ malzemeId: 1, kaynakKonumId: 5, partiId: null, hedefKonumId: 6, miktar: '1', aciklama: 'QR okut' });
    expect(kayitPlani(l, false, () => 'k').map((p) => p.tur)).toEqual(['teslim', 'teslim']);
    const ist = okut(BOS_LISTE, malzeme(1, [KABUL]), yerOkut(TORNA, null));
    expect(kayitPlani(ist, true, () => 'k')[0]).toMatchObject({ tur: 'teslim', govde: { hedef: { istasyonId: 3 } } });
  });

  it('miktar, satır hedefi ve çıkarma kullanıcı düzeltmesidir; gruplar hedef başınadır', () => {
    let l = okut(BOS_LISTE, malzeme(1, [KABUL]), malzeme(2, [KABUL]), yerOkut(GOZ));
    l = miktarDegistir(l, l.satirlar[0]!.anahtar, '1');
    l = satirHedefi(l, l.satirlar[1]!.anahtar, TORNA);
    const { gruplar, bekleyenler } = hedefeGoreGrupla(l);
    expect(gruplar.map((g) => [g.hedef, g.satirlar.length])).toEqual([[GOZ, 1], [TORNA, 1]]);
    expect(bekleyenler).toEqual([]);
    expect(l.satirlar[0]!.miktar).toBe('1');
    expect(satirCikar(l, l.satirlar[0]!.anahtar).satirlar).toHaveLength(1);
  });

  it('elle yazılan miktar aynı satırın hedefi değişince korunur ve plana o miktarla girer', () => {
    let l = okut(BOS_LISTE, lotlu(malzeme(1, [KABUL])), yerOkut(GOZ));
    const a = l.satirlar[0]!.anahtar;
    l = satirHedefi(miktarDegistir(l, a, '1'), a, TORNA);
    expect(kayitPlani(l, true, () => 'k')).toEqual([expect.objectContaining({ tur: 'teslim', govde: expect.objectContaining({ miktar: '1', hedef: { istasyonId: 3 } }) })]);
  });

  it('kaynağı seçilmemiş ve reddedilip kalan satır hedefi olsa da bekleyenlerdedir', () => {
    const l = okut(BOS_LISTE, yerOkut(TORNA, null), malzeme(1, [KABUL]), malzeme(2, [KABUL, GOZ]));
    const [a, b] = l.satirlar.map((s) => s.anahtar) as [string, string];
    const r = sonucuIsle(l, [{ anahtar: a, tamam: false, neden: 'Yetersiz stok' }]);
    const { gruplar, bekleyenler } = hedefeGoreGrupla(r.liste);
    expect(gruplar).toEqual([]);
    expect(bekleyenler.map((s) => [s.anahtar, s.durum.tur])).toEqual([[a, 'kalan'], [b, 'kaynak-sec']]);
  });

  it('teslim kimliği satır anahtarından üretilir; kalan satır yeniden denenince aynı kimlikle gider (95 a)', () => {
    const l = okut(BOS_LISTE, malzeme(1, [KABUL]), malzeme(2, [KABUL]), KISI);
    const kimlik = (a: string) => `kimlik-${a}`;
    const ilk = kayitPlani(l, true, kimlik);
    const b = l.satirlar[1]!.anahtar;
    const r = sonucuIsle(l, [{ anahtar: l.satirlar[0]!.anahtar, tamam: true, neden: null }, { anahtar: b, tamam: false, neden: 'Bağlantı koptu' }]);
    const ikinci = kayitPlani(r.liste, true, kimlik);
    const kimligi = (p: typeof ilk, x: string) => { const adim = p.find((y) => y.anahtar === x); return adim?.tur === 'teslim' ? adim.govde.kaynakKimligi : undefined; };
    expect(kimligi(ilk, b)).toBe(`kimlik-${b}`);
    expect(kimligi(ikinci, b)).toBe(kimligi(ilk, b));
    expect(new Set(ilk.map((p) => kimligi(ilk, p.anahtar))).size).toBe(2);
  });

  it('kayıt sonrası yazılan düşer, reddedilen nedeniyle kalır ve yeniden planlanır; hepsi yazılınca hedef sıfırlanır', () => {
    const l = okut(BOS_LISTE, malzeme(1, [KABUL]), malzeme(2, [KABUL]), yerOkut(GOZ));
    const [a, b] = l.satirlar.map((s) => s.anahtar) as [string, string];
    const r = sonucuIsle(l, [{ anahtar: a, tamam: true, neden: null }, { anahtar: b, tamam: false, neden: 'Yetersiz stok' }]);
    expect(r.ozet).toBe('1 satır kaydedildi; 1 satır nedeniyle listede kaldı.');
    expect(r.liste.satirlar).toEqual([expect.objectContaining({ anahtar: b, durum: { tur: 'kalan', neden: 'Yetersiz stok' } })]);
    expect(kayitPlani(r.liste, true, () => 'k').map((p) => p.anahtar)).toEqual([b]);
    const son = sonucuIsle(r.liste, [{ anahtar: b, tamam: true, neden: null }]);
    expect(son).toEqual({ liste: BOS_LISTE, ozet: '1 satır kaydedildi.' });
  });

  it('tanınmayan, raf ve emir etiketi listeye eklenmez; ileti döner (reddedilen)', () => {
    expect(isListesiOkut(BOS_LISTE, { tur: 'bilinmiyor', kod: 'ZZZ' })).toEqual({ tur: 'ileti', liste: BOS_LISTE, ileti: 'Kod tanınmadı: ZZZ' });
    expect(isListesiOkut(BOS_LISTE, { tur: 'raf', raf: { id: 1, kod: 'A1' }, gozler: [] }).tur).toBe('ileti');
    expect(isListesiOkut(BOS_LISTE, { tur: 'eski-kart', kod: 'UE:12', uretimEmriId: 12 }).tur).toBe('ileti');
  });
});
