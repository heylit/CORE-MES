import { describe, expect, it } from 'vitest';
import { finansKur } from '../plan/test-yardim.tsx';
import { cekDuzeltKomutu, cekIptalKomutu, cekListeleri, cekOzeti, duzeltIlk, kalanGunMetni, sunucuCeki, vadeTakvimi } from './cekler.ts';

const { V, motor } = finansKur();

describe('çek ve senet: saf hesaplar', () => {
  it('özet: portföy, ödenecek, 30 gün net, karşılıksız ve en büyük keşideci (iptal sayılmaz)', () => {
    const oz = cekOzeti(motor);
    expect(oz.portfoy).toEqual({ tutar: 8300, adet: 2 });
    expect(oz.odenecek).toEqual({ tutar: 2000, adet: 1 });
    // Portföydeki çeklerin vadesi 31 gün sonra: 30 günlük nete yalnız verilen çek girer.
    expect(oz.net30).toBe(-2000);
    expect(oz.karsiliksiz).toEqual({ tutar: 0, adet: 0 });
    expect(oz.enBuyuk).toEqual({ firma: 'Deneme Musteri · M1', pay: 1 });
  });

  it('listeler: takipteki vadeye göre, kapanan ayrı; yön süzgeci', () => {
    const { takipte, kapanan } = cekListeleri(motor, 'tum');
    expect(takipte.map((q) => q._cekId)).toEqual([2, 1, 5]);
    expect(kapanan.map((q) => q._cekId)).toEqual([3]);
    expect(cekListeleri(motor, 'verilen').takipte.map((q) => q._cekId)).toEqual([2]);
    expect(cekListeleri(motor, 'alinan').takipte.map((q) => q._cekId)).toEqual([1, 5]);
  });

  it('kalan gün yazısı; sonuçlanan çekte boş', () => {
    const [c2, c1] = cekListeleri(motor, 'tum').takipte;
    expect(kalanGunMetni(c2!, motor.bugun)).toBe('5 gün kaldı');
    expect(kalanGunMetni(c1!, motor.bugun)).toBe('31 gün kaldı');
    expect(kalanGunMetni({ ...c1!, due: '2026-10-10' }, motor.bugun)).toBe('5 gün geçti');
    expect(kalanGunMetni({ ...c1!, due: motor.bugun }, motor.bugun)).toBe('Bugün');
    expect(kalanGunMetni(cekListeleri(motor, 'tum').kapanan[0]!, motor.bugun)).toBe('');
  });

  it('vade takvimi: 12 hafta, alınan artı verilen eksi, sipariş dilimi ayrı', () => {
    const { haftalar, siparisVar } = vadeTakvimi(motor, Array.from({ length: 13 }, (_, i) => ({ tutar: i === 1 ? 500 : 0 })));
    expect(haftalar).toHaveLength(12);
    expect(haftalar[0]).toMatchObject({ baslangic: '2026-10-15', giren: 0, cikan: -2000, siparis: -0 });
    expect(haftalar[4]).toMatchObject({ giren: 8300, cikan: 0 });
    expect(haftalar[1]!.siparis).toBe(-500);
    expect(siparisVar).toBe(true);
    expect(vadeTakvimi(motor, []).siparisVar).toBe(false);
  });

  it('düzeltme ve iptal komutu: sürümle, boş banka null; yalnız banka, seri no ve vade gider', () => {
    const c = V.cekById.get(2)!;
    const ilk = duzeltIlk(c);
    expect(ilk).toEqual({ banka: '', seriNo: '', vade: '2026-10-20' });
    const k = cekDuzeltKomutu(c, { banka: ' ', seriNo: 'A1', vade: '2026-10-25' });
    expect(k).toMatchObject({ uc: 'POST /finans/cekler/:id/duzelt', parametre: { id: 2 } });
    expect(k.govde).toEqual({ surum: 1, banka: null, seriNo: 'A1', vade: '2026-10-25' });
    expect(cekIptalKomutu(c)).toMatchObject({ uc: 'POST /finans/cekler/:id/iptal', parametre: { id: 2 }, govde: { surum: 1 } });
    const q = motor.durum.cheques.find((x) => x._cekId === 2)!;
    expect(sunucuCeki(V, q)).toBe(c);
    expect(sunucuCeki(V, { ...q, _cekId: undefined } as never)).toBeNull();
  });
});
