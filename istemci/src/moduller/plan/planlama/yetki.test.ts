import { describe, expect, it } from 'vitest';
import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from '../planlama-menusu.ts';
import { gorunumAcik } from './gorunumler.ts';
import { yetkiKur } from './yetki.ts';

describe('yetkiKur ve gorunumAcik', () => {
  it('bayraklar ortak işlemlerden okunur', () => {
    const y = yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz']);
    expect(y).toMatchObject({ planlamaOku: true, maliyetOku: false, planYaz: true, planCanliyaAl: false, calismaYazabilir: true });
  });

  it('çalışma yazma yalnız plan.yaz ister, Reçete ve Rota kayıt izni aranmaz (925 a; izinli ve reddedilen)', () => {
    expect(yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz']).calismaYazabilir).toBe(true);
    expect(yetkiKur([PLANLAMA_ISLEMI, 'plan.kilitle']).calismaYazabilir).toBe(false);
  });

  it('maliyet görünümü maliyet okuması ister (izinli ve reddedilen); öteki görünüm planlama okuması', () => {
    const planlamaci = yetkiKur([PLANLAMA_ISLEMI]);
    const mudur = yetkiKur([PLANLAMA_ISLEMI, MALIYET_ISLEMI]);
    expect(gorunumAcik('maliyet', planlamaci)).toBe(false);
    expect(gorunumAcik('maliyet', mudur)).toBe(true);
    expect(gorunumAcik('sevkiyat', planlamaci)).toBe(true);
    expect(gorunumAcik('sevkiyat', yetkiKur([]))).toBe(false);
  });
});
