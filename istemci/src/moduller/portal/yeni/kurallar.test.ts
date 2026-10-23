import { describe, expect, it } from 'vitest';
import { bugun, gunEkle, kalanGun, kisaPara, sayiOku } from './bicim.ts';
import {
  adimAtla, GENEL_MUDUR, ibanGecerli, onayAdimlari, onaylayabilirMi, siparisAsamasi, teklifTutari, VARSAYILAN_KURALLAR,
} from './kurallar.ts';
import { GECERLI_IBAN, onay, ornekDepo, siparis, SIMDI } from './ornek-veri.ts';
import { sonrakiNo } from './veri.ts';

describe('portal kuralları', () => {
  it('onayı yalnız sıradaki adımın rolündeki kişi ya da genel müdür verir; açan kişi kendi kaydını onaylayamaz', () => {
    const a = onay({ id: 'a1' });
    expect(onaylayabilirMi(a, { id: 'tmi-5', role: 'Satın alma müdürü', tmiRoller: ['Satın alma müdürü'] })).toBe(true);
    expect(onaylayabilirMi(a, { id: 'tmi-6', role: 'Kalite', tmiRoller: ['Kalite'] })).toBe(false);
    expect(onaylayabilirMi(a, { id: 'tmi-7', role: GENEL_MUDUR, tmiRoller: [GENEL_MUDUR] })).toBe(true);
    // Çok bölümlü kişi: ana rolü başka olsa da bölüm rolü yeter.
    expect(onaylayabilirMi(a, { id: 'tmi-8', role: 'Muhasebe', tmiRoller: ['Muhasebe', 'Satın alma müdürü'] })).toBe(true);
    expect(onaylayabilirMi(a, { id: 'tmi-9', role: GENEL_MUDUR, tmiRoller: [GENEL_MUDUR] })).toBe(false);
    expect(onaylayabilirMi({ ...a, status: 'approved' }, { id: 'tmi-7', role: GENEL_MUDUR, tmiRoller: [] })).toBe(false);
    expect(onaylayabilirMi(a, null)).toBe(false);
  });

  it('kendi kaydında adım atlanmaz; yalnız genel müdürün kendi kaydında genel müdür adımı düşer', () => {
    const adimlar = ['Satın alma müdürü', GENEL_MUDUR];
    expect(adimAtla('po', adimlar, 'Satın alma müdürü')).toEqual(adimlar);
    expect(adimAtla('po', adimlar, GENEL_MUDUR)).toEqual(['Satın alma müdürü']);
    expect(adimAtla('iban', ['Muhasebe', 'Finans müdürü'], 'Muhasebe')).toEqual(['Muhasebe', 'Finans müdürü']);
  });

  it('satın alma eşiği tanımsızsa iki adım da istenir, tanımlıysa tutara göre düşer', () => {
    expect(onayAdimlari(VARSAYILAN_KURALLAR, 'po', { amount: 10 })).toEqual(['Satın alma müdürü', GENEL_MUDUR]);
    expect(onayAdimlari({ ...VARSAYILAN_KURALLAR, poMgr: 100, poGM: 1000 }, 'po', { amount: 50 })).toEqual([]);
    expect(onayAdimlari({ ...VARSAYILAN_KURALLAR, poMgr: 100, poGM: 1000 }, 'po', { amount: 500 })).toEqual(['Satın alma müdürü']);
    expect(onayAdimlari(VARSAYILAN_KURALLAR, 'payment', { amount: 150001 })).toEqual(['Finans müdürü']);
    expect(onayAdimlari(VARSAYILAN_KURALLAR, 'payment', { amount: 150000 })).toEqual([]);
  });

  it('sipariş aşaması: gecikme, tedarikçi onayı, iptal', () => {
    const d = ornekDepo();
    const o1 = d.orders['o1'];
    const o2 = d.orders['o2'];
    if (!o1 || !o2) throw new Error('örnek eksik');
    expect(siparisAsamasi(d, o1, SIMDI)).toBe('late');
    expect(siparisAsamasi(d, o2, SIMDI)).toBe('production');
    expect(siparisAsamasi(d, siparis({ id: 'x', type: 'purchase' }), SIMDI)).toBe('unconfirmed');
    expect(siparisAsamasi(d, { ...o1, status: 'cancelled' }, SIMDI)).toBe('cancelled');
  });

  it('teklif tutarı iskonto ve KDV ile hesaplanır', () => {
    const t = teklifTutari([{ name: 'a', qty: 2, unit: 'adet', price: null }], [100], 10);
    expect(t).toEqual({ sub: 200, disc: 20, net: 180, kdv: 36, grand: 216 });
  });

  it('IBAN denetimi: geçerli kabul, bozuk ve kısa ret', () => {
    expect(ibanGecerli(GECERLI_IBAN)).toBe(true);
    expect(ibanGecerli(GECERLI_IBAN.replace(/1$/, '2'))).toBe(false);
    expect(ibanGecerli('TR12')).toBe(false);
    expect(ibanGecerli(null)).toBe(false);
  });

  it('belge numarası okunan en büyük sıranın bir fazlasıdır', () => {
    expect(sonrakiNo([{ no: 'SP-2026-0009' }, { no: 'SP-2025-0012' }, { no: 'KK-2026-0050' }], 'SP', 4, SIMDI)).toBe('SP-2026-0013');
    expect(sonrakiNo([], 'SP', 4, SIMDI)).toBe('SP-2026-0001');
  });

  it('biçimler: gün farkı, kısa para, kullanıcı sayısı', () => {
    expect(kalanGun(gunEkle(SIMDI, 3), SIMDI)).toBe(3);
    expect(kalanGun(bugun(SIMDI), SIMDI)).toBe(0);
    expect(kalanGun(null, SIMDI)).toBeNull();
    expect(kisaPara(2_500_000)).toBe('₺2,5 mn');
    expect(kisaPara(null)).toBe('—');
    expect(sayiOku('1.250,5')).toBe(1250.5);
    expect(sayiOku('1250.5')).toBe(1250.5);
    expect(Number.isNaN(sayiOku(''))).toBe(true);
  });
});
