import { describe, expect, it } from 'vitest';
import type { AcikSiparisSatiri } from '#paylasilan/sozlesme/stok.ts';
import { bosSatir, farkliKart, farkliOnaysiz, fasonOnerilenAdet, onayBekleyenMetni, siparistenSatir } from './MalKabul.tsx';

describe('fason dönüşü önerilen adet (319)', () => {
  it('firmada kalanı önerir: gönderilen − dönen − hurda', () => {
    expect(fasonOnerilenAdet({ gonderilen: 100, donen: 30, hurda: 5 })).toBe('65');
  });
  it('firmada parça kalmadıysa öneri boş kalır; sıfır uydurulmaz', () => {
    expect(fasonOnerilenAdet({ gonderilen: 10, donen: 8, hurda: 2 })).toBe('');
    expect(fasonOnerilenAdet({ gonderilen: 10, donen: 9, hurda: 3 })).toBe('');
  });
});

// 3712: hizmet siparişinde işlenen parça mal kabulde görünür; dönen kart varsayılan olarak odur, farklı kart ikinci onay ister.
describe('işlenen malzeme ve dönen kart eşleşmesi (3712)', () => {
  const SATIR: AcikSiparisSatiri = {
    id: 5, siparisNo: 'ORN-SP-1', talepNo: 'ORN-ST-1', tedarikciAdi: 'ORN Isıl', malzemeId: 90, malzemeTur: 'hizmet', kalemAdi: 'Isıl işlem', miktar: '120', kalanMiktar: '120', birim: 'adet',
    beklenenTeslim: null, isEmriId: 3, emirNo: 'ORN-UE-1', uygulananMalzeme: { no: 42, kod: 'ORN-PRC-42', ad: 'ORN Mil' },
  } as AcikSiparisSatiri;

  it('hizmet satırında dönen kart işlenen parça olarak gelir; eşleşmede ek adım yok', () => {
    const s = siparistenSatir(bosSatir(), SATIR);
    expect(s.kart).toBe('42');
    expect(s.islenen).toEqual({ no: '42', etiket: 'ORN-PRC-42 · ORN Mil', emir: 'ORN-UE-1' });
    expect(farkliKart(s)).toBe(false);
    expect(farkliOnaysiz(s)).toBe(false);
  });

  it('farklı kart seçilince onay ister; onay yalnız o kart için geçerlidir', () => {
    const s = { ...siparistenSatir(bosSatir(), SATIR), kart: '57' };
    expect(farkliKart(s)).toBe(true);
    expect(farkliOnaysiz(s)).toBe(true);
    expect(farkliOnaysiz({ ...s, farkliOnay: '57' })).toBe(false);
    expect(farkliOnaysiz({ ...s, kart: '58', farkliOnay: '57' })).toBe(true);
  });

  it('Kabul pasifken neden metni onayın eksik olduğu satırları sırasıyla adlandırır', () => {
    const esit = siparistenSatir(bosSatir(), SATIR);
    const farkli = { ...esit, kart: '57' };
    expect(onayBekleyenMetni([esit])).toBeNull();
    expect(onayBekleyenMetni([farkli])).toBe('Farklı kartla kabul için satırdaki onay bekleniyor.');
    expect(onayBekleyenMetni([esit, farkli, { ...farkli, farkliOnay: '57' }, farkli])).toBe('Farklı kartla kabul için 2., 4. satırdaki onay bekleniyor.');
  });

  it('kart henüz seçilmediyse, malzeme dönmediyse ve hizmet dışı satırda onay istenmez', () => {
    const s = siparistenSatir(bosSatir(), SATIR);
    expect(farkliOnaysiz({ ...s, kart: '' })).toBe(false);
    expect(farkliOnaysiz({ ...s, donus: 'hizmet', kart: '90' })).toBe(false);
    const sarf = siparistenSatir(bosSatir(), { ...SATIR, malzemeTur: 'sarf', uygulananMalzeme: { no: 42, kod: 'X', ad: null } });
    expect(sarf.islenen).toBeNull();
    expect(farkliOnaysiz(sarf)).toBe(false);
  });
});
