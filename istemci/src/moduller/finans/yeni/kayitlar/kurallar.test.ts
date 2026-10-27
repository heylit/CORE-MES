import { describe, expect, it } from 'vitest';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { finansiKur } from '../veri.ts';
import {
  aylaraBol, kayitCsvSatirlari, kayitDurumu, kayitlariSuz, kategoriEtiketi, suzgecSayilari,
} from './kurallar.ts';
import { belgeIptalKomutu, cariIpucu, duzeltIlkDegerleri, duzeltKomutu, odemeIptalKomutu } from './kurallar-duzelt.ts';

const BUGUN = '2026-10-15';
const kur = () => finansiKur(ornekHamVeri(), BUGUN);

describe('Kayıtlar: süzgeç, arama, sıra', () => {
  it('sayaçlar süzgeçlerle aynı satırları sayar', () => {
    const { motor } = kur();
    const tx = motor.durum.tx;
    const s = suzgecSayilari(tx, BUGUN);
    expect(s.tum).toBe(tx.length);
    expect(s.satis + s.alis).toBe(tx.length);
    expect(s.acik).toBe(kayitlariSuz(tx, 'acik', '', BUGUN).length);
    expect(s.geciken).toBe(tx.filter((t) => t.status === 'acik' && t.due < BUGUN).length);
    expect(s.geciken).toBeGreaterThan(0);
  });

  it('en yeni üstte; arama cari, açıklama ve kategoride, büyük küçük harf duyarsız', () => {
    const { motor } = kur();
    const satirlar = kayitlariSuz(motor.durum.tx, 'tum', '', BUGUN);
    for (let i = 1; i < satirlar.length; i += 1) expect(satirlar[i - 1]!.date >= satirlar[i]!.date).toBe(true);
    const bulunan = kayitlariSuz(motor.durum.tx, 'tum', 'HAMMADDE', BUGUN);
    expect(bulunan.length).toBeGreaterThan(0);
    expect(bulunan.every((t) => `${t.desc} ${t.cat}`.toLocaleLowerCase('tr').includes('hammadde'))).toBe(true);
    expect(kayitlariSuz(motor.durum.tx, 'alis', '', BUGUN).every((t) => t.type === 'gider')).toBe(true);
  });

  it('ay grupları sırayı bozmaz', () => {
    const { motor } = kur();
    const satirlar = kayitlariSuz(motor.durum.tx, 'tum', '', BUGUN);
    const gruplar = aylaraBol(satirlar);
    expect(gruplar.flatMap((g) => g.satirlar)).toEqual(satirlar);
    expect(new Set(gruplar.map((g) => g.ay)).size).toBe(gruplar.length);
    expect(gruplar[0]!.baslik).toMatch(/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+ 2026$/);
  });

  it('durum metni ve kategori etiketi prototipteki gibidir', () => {
    const { motor } = kur();
    const tx = motor.durum.tx;
    const geciken = tx.find((t) => t.status === 'acik' && t.due < BUGUN)!;
    expect(kayitDurumu(geciken, BUGUN)).toEqual({ metin: expect.stringMatching(/^\d+ gün gecikti$/), ton: 'hata' });
    const odenen = tx.find((t) => t.status === 'odendi' && t.type === 'gelir')!;
    expect(kayitDurumu(odenen, BUGUN)).toEqual({ metin: 'Tahsil edildi', ton: 'tamam' });
    const avans = tx.find((t) => t._odemeId !== undefined)!;
    expect(kategoriEtiketi(avans)).toBe('Avans');
  });

  it('CSV bütün kayıtları prototipin sütunlarıyla verir', () => {
    const { motor } = kur();
    const satirlar = kayitCsvSatirlari(motor.durum.tx);
    expect(satirlar).toHaveLength(motor.durum.tx.length);
    // Kısmen tahsil edilmiş belge iki satırdır: kapanan parça ve açık kalan.
    const s1 = satirlar.filter((r) => r[4] === 'S-1');
    expect(s1.map((r) => r[9]).sort()).toEqual(['açık', 'ödendi']);
    expect(s1[0]!.slice(0, 2)).toEqual(['10.09.2026', 'gelir']);
  });
});

describe('Kayıtlar: düzeltme ve iptal komutu', () => {
  it('belge düzeltme belgenin kendi tutarı ve açıklamasıyla başlar, tek uca gider', () => {
    const { V } = kur();
    const b = V.belgeById.get(2)!;
    const ilk = duzeltIlkDegerleri(V, b);
    expect(ilk).toMatchObject({ amount: '1000', desc: 'Hammadde', kdv: '20', due: '2026-09-05', cat: 'Mal / hammadde alımı', party: 'Deneme Tedarik' });
    const s = duzeltKomutu(V, b, { ...ilk, desc: 'Yeni not', amount: '1500.255' });
    expect('komut' in s && s.komut).toMatchObject({
      uc: 'POST /finans/belgeler/:id/duzelt', parametre: { id: 2 }, tekrar: false,
      govde: { kategori: 'mal_alimi', firmaId: 2, aciklama: 'Yeni not', tutar: 1500.26, kdvOrani: 20, paraBirimi: 'TRY', surum: 1 },
    });
  });

  it('döviz belgesinde tutar, tevkifatlı belgede KDV oranı belgeden gider', () => {
    const { V } = kur();
    const eur = V.belgeById.get(3)!;
    const s1 = duzeltKomutu(V, eur, { ...duzeltIlkDegerleri(V, eur), amount: '999' });
    expect('komut' in s1 && s1.komut.govde).toMatchObject({ tutar: 100, paraBirimi: 'EUR', kur: 35.5 });
    const tevk = V.belgeById.get(8)!;
    const s2 = duzeltKomutu(V, tevk, { ...duzeltIlkDegerleri(V, tevk), kdv: '0' });
    expect('komut' in s2 && s2.komut.govde).toMatchObject({ kdvOrani: 20, tevkifatPay: 5, tevkifatPayda: 10 });
  });

  it('firması olan belgede listede olmayan firma ve sıfır tutar reddedilir; firmasız belge firmasız kalır', () => {
    const { V } = kur();
    const b = V.belgeById.get(1)!;
    expect(duzeltKomutu(V, b, { ...duzeltIlkDegerleri(V, b), party: 'Yok Boyle' })).toMatchObject({ alan: 'party' });
    expect(duzeltKomutu(V, b, { ...duzeltIlkDegerleri(V, b), amount: '0' })).toMatchObject({ alan: 'amount' });
    const firmasiz = V.belgeById.get(7)!;
    const s = duzeltKomutu(V, firmasiz, duzeltIlkDegerleri(V, firmasiz));
    expect('komut' in s && s.komut.govde).toMatchObject({ firmaId: null });
  });

  it('iptal komutları sürümle gider', () => {
    const { V } = kur();
    expect(belgeIptalKomutu(V.belgeById.get(1)!)).toMatchObject({ uc: 'POST /finans/belgeler/:id/iptal', parametre: { id: 1 }, govde: { surum: 1 } });
    expect(odemeIptalKomutu(V.odemeById.get(4)!)).toMatchObject({ uc: 'POST /finans/odemeler/:id/iptal', parametre: { id: 4 }, govde: { surum: 1 } });
  });

  it('cari ipucu: müşteride risk notu, tedarikçide son 12 ay, boşta yok', () => {
    const { motor } = kur();
    expect(cariIpucu(motor, 'gelir', '')).toBeNull();
    expect(cariIpucu(motor, 'gelir', 'Hic Yok')?.metin).toMatch(/^Yeni müşteri/);
    expect(cariIpucu(motor, 'gider', 'Deneme Tedarik')?.metin).toMatch(/^Bu cariye son 12 ayda \d+ kayıt/);
  });
});
