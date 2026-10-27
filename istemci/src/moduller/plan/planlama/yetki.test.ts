import { describe, expect, it } from 'vitest';
import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from '../planlama-menusu.ts';
import { gorunumAcik } from './gorunumler.ts';
import { yetkiKur } from './yetki.ts';

describe('yetkiKur ve gorunumAcik', () => {
  it('bayraklar ortak işlemlerden okunur; kayıt yazma ben cevabından', () => {
    const y = yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'], { yazabilir: true });
    expect(y).toMatchObject({ planlamaOku: true, maliyetOku: false, planYaz: true, planCanliyaAl: false, kayitYazabilir: true, calismaYazabilir: true });
  });

  it('çalışma yazma yalnız plan.yaz ister, Reçete ve Rota kayıt izni aranmaz (925 a; izinli ve reddedilen)', () => {
    expect(yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'], { yazabilir: false }).calismaYazabilir).toBe(true);
    expect(yetkiKur([PLANLAMA_ISLEMI, 'plan.kilitle'], { yazabilir: true }).calismaYazabilir).toBe(false);
  });

  it('maliyet görünümü maliyet okuması ister (izinli ve reddedilen); öteki görünüm planlama okuması', () => {
    const planlamaci = yetkiKur([PLANLAMA_ISLEMI], { yazabilir: false });
    const mudur = yetkiKur([PLANLAMA_ISLEMI, MALIYET_ISLEMI], { yazabilir: false });
    expect(gorunumAcik('maliyet', planlamaci)).toBe(false);
    expect(gorunumAcik('maliyet', mudur)).toBe(true);
    expect(gorunumAcik('sevkiyat', planlamaci)).toBe(true);
    expect(gorunumAcik('sevkiyat', yetkiKur([], { yazabilir: true }))).toBe(false);
  });
});
