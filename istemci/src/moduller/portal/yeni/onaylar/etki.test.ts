import { describe, expect, it } from 'vitest';
import { onay, SIMDI, siparis } from '../ornek-veri.ts';
import type { Firma, Odeme, Sozlesme } from '../tipler.ts';
import { kararBuradaMi, kararIletisi, onayEtkisi } from './etki.ts';

const B = { kullaniciKimligi: 'tmi-5', simdi: SIMDI, kurumAdi: 'Deneme Atölye' };
const AN = new Date(SIMDI).toISOString();
const onayli = (k: Parameters<typeof onay>[0]) => onay({ status: 'approved', ...k });
const redli = (k: Parameters<typeof onay>[0]) =>
  onay({ status: 'rejected', steps: [{ role: 'Satın alma müdürü', status: 'rejected', note: 'Bütçe yok' }], ...k });

describe('onayEtkisi', () => {
  it('bekleyen onay ve kayıtsız onay sonuç doğurmaz', () => {
    expect(onayEtkisi(onay({ id: 'a1' }), siparis({ id: 'o1', type: 'purchase' }), B)).toBeNull();
    expect(onayEtkisi(onayli({ id: 'a1' }), undefined, B)).toBeNull();
  });

  it('satın alma siparişi: onayda onaylı, retde gerekçeyle reddedildi', () => {
    const o = siparis({ id: 'o1', type: 'purchase' });
    const e = onayEtkisi(onayli({ id: 'a1' }), o, B);
    expect(e).toMatchObject({ koleksiyon: 'orders', kayit: { id: 'o1', surum: 1, approvalState: 'approved' } });
    expect(e?.kayit.history?.at(-1)).toEqual({ at: AN, by: 'firm', u: 'tmi-5', text: 'Onaylandı, tedarikçiye gönderildi' });
    expect(onayEtkisi(redli({ id: 'a1' }), o, B)?.kayit.history?.at(-1)?.text).toBe('Onay reddedildi: Bütçe yok');
  });

  it('ödeme: onayda gönderilir, retde gerekçe yazılır', () => {
    const p = { id: 'y1', surum: 1, status: 'pending_approval' } as unknown as Odeme;
    expect(onayEtkisi(onayli({ id: 'a2', kind: 'payment', refCol: 'payments', refId: 'y1' }), p, B)).toMatchObject({ kayit: { status: 'sent', rejectNote: '' } });
    expect(onayEtkisi(redli({ id: 'a2', kind: 'payment', refCol: 'payments', refId: 'y1' }), p, B)).toMatchObject({ kayit: { status: 'rejected', rejectNote: 'Bütçe yok' } });
  });

  it('IBAN: onayda yeni hesap geçerli olur, eski IBAN saklanır; yeni hesap yoksa yazılmaz', () => {
    const f: Firma = { id: 'p1', surum: 2, name: 'Deneme Tedarikçi', type: 'supplier', bank: { bank: 'Eski', iban: 'TR00' }, bankChange: { status: 'pending' } };
    const a = onayli({ id: 'a3', kind: 'iban', refCol: 'parties', refId: 'p1', payload: { bank: 'Yeni', iban: 'TR96' } });
    expect(onayEtkisi(a, f, B)).toMatchObject({
      koleksiyon: 'parties', kayit: { surum: 2, bank: { bank: 'Yeni', iban: 'TR96', prev: 'TR00', verifiedAt: AN }, bankChange: { status: 'approved', decidedAt: AN } },
    });
    expect(onayEtkisi({ ...a, payload: {} }, f, B)).toBeNull();
    // Retde hesap değişmez.
    expect(onayEtkisi(redli({ id: 'a3', kind: 'iban', refCol: 'parties', refId: 'p1' }), f, B)).toMatchObject({ kayit: { bank: { iban: 'TR00' }, bankChange: { status: 'rejected', note: 'Bütçe yok' } } });
  });

  it('sözleşme: onayda kurum imzası kişi ve zamanla yazılır', () => {
    const c = { id: 'c1', surum: 1, signed: { party: { at: AN } } } as unknown as Sozlesme;
    const e = onayEtkisi(onayli({ id: 'a4', kind: 'contract', refCol: 'contracts', refId: 'c1' }), c, B);
    expect(e).toMatchObject({ kayit: { approval: 'approved', signed: { party: { at: AN }, firm: { u: 'tmi-5', at: AN } } } });
    expect(e?.kayit.history?.at(-1)?.text).toBe('İç onay tamamlandı, Deneme Atölye imzaladı');
  });

  it('iskonto ve fiyat artışı kararı burada verilmez ve sonuç doğurmaz', () => {
    expect(kararBuradaMi({ kind: 'discount' })).toBe(false);
    expect(kararBuradaMi({ kind: 'pricereq' })).toBe(false);
    expect(kararBuradaMi({ kind: 'po' })).toBe(true);
    expect(onayEtkisi(onayli({ id: 'a5', kind: 'discount', refCol: 'requests' }), {}, B)).toBeNull();
  });
});

describe('kararIletisi', () => {
  it('ara adımda sıradaki onaycıyı söyler', () => {
    expect(kararIletisi(onay({ id: 'a1', steps: [{ role: 'Satın alma müdürü', status: 'approved' }, { role: 'Genel müdür', status: 'pending' }] })))
      .toBe('Onaylandı; sıradaki onaycı: Genel müdür');
    expect(kararIletisi(onayli({ id: 'a1' }))).toBe('Onaylandı; işlem tamamlandı');
    expect(kararIletisi(redli({ id: 'a1' }))).toBe('Reddedildi');
  });
});
