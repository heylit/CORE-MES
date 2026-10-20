import { describe, expect, it, vi } from 'vitest';
import { cagridanArizaAc } from '../../../../arkon/web/src/data/ariza-ustlenme.ts';

// Borç Y6 (kullanıcı onayı 17.10): üstlenilen arıza aynı tabletteki açık Bakım listesinde sayfa yenilemeden görünür.
const cagri = { machine: 'M1', mc: 'MC1', wc: 'W1', t0: 1000, by: 'Operatör', note: 'Yağ kaçağı', orderNo: 'E1' };

function bagimliliklar(kayitli: unknown = null) {
  return { get: vi.fn(async () => kayitli), put: vi.fn(async () => {}), send: vi.fn(), yerel: vi.fn() };
}

describe('çağrıdan arıza açma', () => {
  it('arıza yazılır, öteki cihazlara ve aynı sekmeye bildirilir', async () => {
    const d = bagimliliklar();
    expect(await cagridanArizaAc(cagri, 'Bakımcı', 5000, d)).toBe(true);
    expect(d.get).toHaveBeenCalledWith('ar-1000');
    expect(d.put).toHaveBeenCalledWith({
      id: 'ar-1000', type: 'ariza', st: 'M1', mc: 'MC1', wc: 'W1', title: 'Yağ kaçağı', openedAt: 1000, openedBy: 'Operatör',
      ackAt: 5000, ackBy: 'Bakımcı', status: 'work', callId: '1000', orderNo: 'E1',
    });
    expect(d.send).toHaveBeenCalledWith({ type: 'maint' });
    expect(d.yerel).toHaveBeenCalledWith({ type: 'maint' });
  });

  it('bildirim yazımdan sonra gider', async () => {
    const sira: string[] = [];
    const d = { get: async () => null, put: async () => { sira.push('put'); }, send: () => { sira.push('send'); }, yerel: () => { sira.push('yerel'); } };
    await cagridanArizaAc(cagri, 'Bakımcı', 5000, d);
    expect(sira).toEqual(['put', 'send', 'yerel']);
  });

  it('aynı çağrının arızası zaten varsa yeniden yazılmaz ve bildirilmez', async () => {
    const d = bagimliliklar({ id: 'ar-1000' });
    expect(await cagridanArizaAc(cagri, 'Bakımcı', 5000, d)).toBe(false);
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.yerel).not.toHaveBeenCalled();
  });

  it('notsuz çağrının başlığı "Bakım çağrısı", eksik alanlar boş', async () => {
    const d = bagimliliklar();
    await cagridanArizaAc({ machine: 'M2', t0: 7, by: 'X' }, 'Y', 9, d);
    expect(d.put).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bakım çağrısı', mc: null, wc: null, orderNo: null }));
  });
});
