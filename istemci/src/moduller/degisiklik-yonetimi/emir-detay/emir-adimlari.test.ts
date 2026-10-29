import { describe, expect, it } from 'vitest';
import type { KararSatiri } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import {
  ASAMALAR, asamaBilgileri, asamaSirasi, kapatilabilir, kararUcu, topluOnaylanabilir, tutarMetni, varsayilanSekme, yeniParcaNoOnizleme,
} from './emir-adimlari.ts';

const karar = (y: Partial<KararSatiri>): KararSatiri => ({
  id: 1, hedef: 'emir', hedefId: 10, hedefEtiketi: 'UE-10', onerilenKod: 'kalanlari_gecir', mod: 'onayli', gerekce: 'Başlamamış.',
  izinliKodlar: ['kalanlari_gecir', 'beklet', 'hurda'], verilenKod: null, veren: null, sapmaReferansi: null, not: null, ...y,
});

describe('ECO detay ekran kuralları', () => {
  it('durumdan açılış sekmesi: disposition kararda, FAI uygulama ve doğrulamada, öbürleri revizyonda', () => {
    expect(varsayilanSekme('karar')).toBe('karar');
    expect(varsayilanSekme('uygulamada')).toBe('fai');
    expect(varsayilanSekme('dogrulama')).toBe('fai');
    expect(varsayilanSekme('yayina_hazir')).toBe('rev');
    expect(varsayilanSekme('kapandi')).toBe('rev');
  });

  it('kapanan emirde bütün aşamalar biter; açık emirde ilk aşama sıradadır', () => {
    expect(asamaSirasi('acik')).toBe(0);
    expect(asamaSirasi('kapandi')).toBeGreaterThanOrEqual(ASAMALAR.length);
  });

  it('aşama satırı o aşamayı bitiren son olayın kişisi ve günüdür; olmayan olay boş kalır', () => {
    const gecmis = [
      { olay: 'emir_acildi', kisiId: 1, kisiAdi: 'Deneme Proses', zaman: '2026-10-01T09:00:00+03:00', imzaAnlami: null, aciklama: null, ozet: 'ECO açıldı' },
      { olay: 'yayina_gonderildi', kisiId: 2, kisiAdi: null, zaman: '2026-10-03T09:00:00+03:00', imzaAnlami: null, aciklama: null, ozet: 'Yayın onayına' },
    ] as const;
    const bilgi = asamaBilgileri({ gecmis: [...gecmis] }, (z) => z.slice(0, 10));
    expect(bilgi[0]).toBe('Deneme Proses, 2026-10-01');
    expect(bilgi[1]).toBe('Bilinmeyen kişi, 2026-10-03');
    expect(bilgi[2]).toBeNull();
  });

  it('MRB modu ya da hurda, rework, sapma, yedek kodu mrb-karar ucuna; öbürü karar ucuna gider', () => {
    expect(kararUcu({ mod: 'mrb' }, 'beklet')).toBe('mrb-karar');
    expect(kararUcu({ mod: 'onayli' }, 'hurda')).toBe('mrb-karar');
    expect(kararUcu({ mod: 'onayli' }, 'eski_yedek')).toBe('mrb-karar');
    expect(kararUcu({ mod: 'onayli' }, 'kalanlari_gecir')).toBe('karar');
    expect(kararUcu({ mod: 'otomatik' }, 'beklet')).toBe('karar');
  });

  it('toplu onay yalnız verilmemiş, MRB olmayan, ertelemesiz, sapmasız ve izinli önerileri kapsar', () => {
    const liste = [
      karar({ id: 1 }),
      karar({ id: 2, verilenKod: 'kalanlari_gecir' }),
      karar({ id: 3, mod: 'mrb' }),
      karar({ id: 4, onerilenKod: 'beklet' }),
      karar({ id: 5, onerilenKod: 'eskiyle_tamamla_sapma', izinliKodlar: ['eskiyle_tamamla_sapma'] }),
      karar({ id: 6, onerilenKod: 'yeniden_olustur' }),
      karar({ id: 7, onerilenKod: 'rework', izinliKodlar: ['rework'] }),
    ];
    expect(topluOnaylanabilir(liste).map((k) => k.id)).toEqual([1]);
  });

  it('eksik koşul kapatmayı engeller; bağlı olmayan (bilinmiyor) koşul engellemez', () => {
    expect(kapatilabilir({ kapanisKosullari: [{ kosul: 'kararlar', durum: 'tamam', ayrinti: null }, { kosul: 'fai', durum: 'bilinmiyor', ayrinti: null }] })).toBe(true);
    expect(kapatilabilir({ kapanisKosullari: [{ kosul: 'kararlar', durum: 'eksik', ayrinti: '1 karar' }] })).toBe(false);
  });

  it('yeni parça numarası önizlemesi: iki cevap da evetse revizyon, biri hayırsa yeni numara, cevap eksikse karar yok', () => {
    expect(yeniParcaNoOnizleme('evet', 'evet')).toBe(false);
    expect(yeniParcaNoOnizleme('evet', 'hayir')).toBe(true);
    expect(yeniParcaNoOnizleme(null, 'evet')).toBeNull();
  });

  it('bilinmeyen maliyet sıfır yazılmaz', () => {
    expect(tutarMetni(null)).toBe('—');
    expect(tutarMetni('0')).toMatch(/^0 TL$/);
  });
});
