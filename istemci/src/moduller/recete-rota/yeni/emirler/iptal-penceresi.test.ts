import { describe, expect, it } from 'vitest';
import { iptalBilgileri, talepMetni, talepUyarisi, turMetni } from './IptalPenceresi.tsx';

describe('3576 iptal penceresi metinleri', () => {
  it('tür: parti, kol aralığı, birleşmesi olmayan kol; op bilinmiyorsa uydurulmaz', () => {
    expect(turMetni({ tur: 'parti', baslangicOpNo: 10, birlesmeOpNo: null })).toBe('Parti');
    expect(turMetni({ tur: 'kol', baslangicOpNo: 20, birlesmeOpNo: 40 })).toBe('Kol (OP 20→40)');
    expect(turMetni({ tur: 'kol', baslangicOpNo: 20, birlesmeOpNo: null })).toBe('Kol (OP 20→son)');
    expect(turMetni({ tur: 'kol', baslangicOpNo: null, birlesmeOpNo: null })).toBe('Kol');
  });
  it('satın alma uyarısı: yoksa yazılmaz, ilk üç talep ve fazlası sayıyla', () => {
    const t = (n: number) => ({ id: `kimlik-${String(n)}`, no: `ST-${String(n)}` });
    expect(talepUyarisi([])).toBeNull();
    expect(talepMetni(talepUyarisi([t(1)])!)).toContain('1 açık satın alma talebi var (ST-1)');
    expect(talepMetni(talepUyarisi([t(1), t(2), t(3), t(4), t(5)])!)).toContain('(ST-1, ST-2, ST-3 +2 talep)');
    expect(talepMetni(talepUyarisi([t(1)])!)).toContain('Talep iptal edilmez; satın alma karar verir.');
  });
  it('bilgi satırları: hazırlık görevi yoksa o satır yazılmaz', () => {
    const o = { surum: 1, altEmirler: [], hazirlikGorevi: 0, satinAlmaTalepleri: [], engel: null };
    expect(iptalBilgileri(o)).toHaveLength(1);
    expect(iptalBilgileri({ ...o, hazirlikGorevi: 2 })).toContain('Bu emirlerin 2 hazırlık görevi kapanır.');
  });
});
