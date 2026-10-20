import { describe, expect, it } from 'vitest';
import { adimIstegi, gonderimUyarisi, istasyonsuzMu, istasyonPaketleri, siralamayiGonder, istasyonPlanOzeti, operatoreAcik, planEtiketi, planOnce, siralamaIstegi, tmiPlani } from '../../../../arkon/web/src/data/tmi-plan.ts';

// Kart #199 (A4): rotalı işin paketi operatöre yalnız yayında ve canlı planda iş emrinin kaynağına yerleşmişse düşer.
const ie = (status: string, plan?: { canli: boolean; sira: number | null; eslesiyor: boolean; zorunlu?: boolean; taslakta?: boolean } | null) => ({ status, tmi: { isEmriId: 4, plan } });
const CANLI = { canli: true, sira: 2, eslesiyor: true };

describe('Arkon rotalı işin plan durumu', () => {
  it('ayar kapalıyken (kart #1257) plansız ya da başka kaynaktaki yayın düşer; etiket bilgi olarak kalır', () => {
    const plansiz = { canli: false, sira: null, eslesiyor: false, zorunlu: false };
    expect(operatoreAcik(ie('published', plansiz))).toBe(true);
    expect(operatoreAcik(ie('published', { ...CANLI, eslesiyor: false, zorunlu: false }))).toBe(true);
    expect(planEtiketi(ie('published', plansiz))).toBe('planlanmadi');
    expect(operatoreAcik(ie('draft', plansiz))).toBe(false);
    expect(istasyonPlanOzeti([{ machine: 'AI1', ...ie('published', plansiz) }], 'AI1')).toBe(null);
    expect(operatoreAcik(ie('published', { ...plansiz, zorunlu: true }))).toBe(false);
  });
  it('gönderim uyarısı: canlı planda değil ya da başka kaynakta; ayar açıksa operatörde görünmez', () => {
    expect(gonderimUyarisi(ie('draft', CANLI))).toBe(null);
    expect(gonderimUyarisi({ status: 'draft' })).toBe(null);
    expect(gonderimUyarisi(ie('draft', { canli: false, sira: null, eslesiyor: false, zorunlu: false }))).toEqual({ neden: 'Bu iş canlı planda değil.', gorunmez: false });
    expect(gonderimUyarisi(ie('draft', { ...CANLI, eslesiyor: false, zorunlu: true }))).toEqual({ neden: 'Bu iş canlı planda başka bir kaynağa yerleşmiş.', gorunmez: true });
    expect(gonderimUyarisi(ie('draft', { canli: false, sira: null, eslesiyor: false, zorunlu: true, taslakta: true })))
      .toEqual({ neden: 'Bu iş plan taslağında; plan canlıya alınmadı.', gorunmez: true, taslakta: true });
  });
  it('istasyonsuz paket', () => {
    expect(istasyonsuzMu({ machine: '' })).toBe(true);
    expect(istasyonsuzMu({ machine: ' ' })).toBe(true);
    expect(istasyonsuzMu({})).toBe(true);
    expect(istasyonsuzMu({ machine: 'AI1' })).toBe(false);
  });
  it('yayında, canlı ve eşleşen iş operatöre düşer', () => {
    expect(operatoreAcik(ie('published', CANLI))).toBe(true);
    expect(planEtiketi(ie('published', CANLI))).toBe(null);
  });
  it('taslak, plansız ya da başka kaynağa yerleşmiş iş düşmez', () => {
    expect(operatoreAcik(ie('draft', CANLI))).toBe(false);
    expect(planEtiketi(ie('draft', CANLI))).toBe('hazirlik-bekliyor');
    expect(operatoreAcik(ie('published', { canli: false, sira: null, eslesiyor: false }))).toBe(false);
    expect(planEtiketi(ie('published', { canli: false, sira: null, eslesiyor: false }))).toBe('planlanmadi');
    expect(operatoreAcik(ie('published', { ...CANLI, eslesiyor: false }))).toBe(false);
    expect(planEtiketi(ie('published', { ...CANLI, eslesiyor: false }))).toBe('kaynak-farkli');
  });
  it('bitmiş iş emrinin paketi (sunucu planı yazmaz) etiketlenmez, Pano özetine girmez', () => {
    for (const plan of [undefined, null]) {
      expect(tmiPlani(ie('published', plan))).toBe(null);
      expect(planEtiketi(ie('published', plan))).toBe(null);
      expect(operatoreAcik(ie('published', plan))).toBe(true);
      expect(istasyonPlanOzeti([{ machine: 'AI1', ...ie('published', plan) }], 'AI1')).toBe(null);
    }
  });
  it('rotasız TMI emri ve Arkon paketi bugünkü gibi: yayınlanınca düşer, etiket yok', () => {
    for (const p of [{ status: 'published' }, { status: 'published', tmi: null }]) {
      expect(operatoreAcik(p)).toBe(true);
      expect(tmiPlani(p)).toBe(null);
      expect(planEtiketi(p)).toBe(null);
    }
    expect(operatoreAcik({ status: 'draft' })).toBe(false);
    expect(operatoreAcik(null)).toBe(false);
  });
  it('istasyon süzgeci (operatör kuyruğu, Pano) ve Pano özeti', () => {
    const m = (machine: string, p: object) => ({ machine, ...p });
    const pk = [
      m('AI1', ie('published', CANLI)), m('AI1', ie('published', { canli: false, sira: null, eslesiyor: false })), m('AI1', ie('draft', CANLI)), m('AI1', ie('draft', CANLI)),
      m('AI1', { status: 'published' }), m('AI1', ie('published', { ...CANLI, eslesiyor: false })), m('AI2', ie('published', CANLI)),
    ];
    expect(istasyonPaketleri(pk, 'AI1')).toEqual([pk[0], pk[4]]);
    expect(istasyonPlanOzeti(pk, 'AI1')).toBe('2 iş hazırlık bekliyor · 1 iş planlanmadı · 1 iş plan başka kaynakta');
    expect(istasyonPlanOzeti(pk, 'AI2')).toBe(null);
  });
  // A4: canlı planda yerleşmiş TMI işi plan sırasıyla önce; Planlama'daki taşıma yalnız aynı kaynağın kuyruğunu plana gönderir.
  it('sıra: plandaki TMI işi önce, plan sırasıyla; öteki paketler ardından', () => {
    const tp = (id: number, sira: number | null, kaynakId = 5) => ({ id: `tmi-ie-${id}`, status: 'published', machine: 'AI1',
      tmi: { isEmriId: id, plan: { canli: sira !== null, sira, eslesiyor: true, kaynak: sira === null ? null : { tur: 'makine' as const, id: kaynakId } } } });
    const arkon = { id: 'x', status: 'published', machine: 'AI1' };
    const [a, b, c] = [tp(1, 2), tp(2, 1), tp(3, 1, 6)];
    expect([arkon, a, b, c].sort(planOnce)).toEqual([b, c, a, arkon]);
    expect(istasyonPaketleri([arkon, a, b], 'AI1')).toEqual([b, a, arkon]);
    const once = [b, c, a, arkon];
    expect(siralamaIstegi(once, [a, b, c, arkon], a)).toEqual({ kaynak: { tur: 'makine', id: 5 }, onceki: [2, 1], yeni: [1, 2] });
    expect(siralamaIstegi(once, [c, b, a, arkon], c)).toBe(null);
    expect(siralamaIstegi(once, [b, a, c, arkon], a)).toBe(null);
    expect(siralamaIstegi(once, once, tp(4, null))).toBe(null);
    expect(siralamaIstegi(once, [arkon, b, c, a], arkon)).toBe(null);
  });
  it('yukarı/aşağı: iç içe dizilmiş şeritte iş kendi kaynağındaki komşusuyla yer değiştirir; aynı kimlikli kişi makineyle karışmaz', () => {
    const tp = (id: number, sira: number, kaynak: { tur: 'makine' | 'kisi'; id: number }) => ({ id: `tmi-ie-${id}`, status: 'published', machine: 'AI1',
      tmi: { isEmriId: id, plan: { canli: true, sira, eslesiyor: true, kaynak } } });
    const m5 = { tur: 'makine' as const, id: 5 }, m6 = { tur: 'makine' as const, id: 6 }, k5 = { tur: 'kisi' as const, id: 5 };
    const [a, x, b, k] = [tp(1, 1, m5), tp(9, 1, m6), tp(2, 2, m5), tp(7, 1, k5)];
    const serit = [a, k, x, b].sort(planOnce);
    expect(serit).toEqual([k, a, x, b]);
    expect(adimIstegi(serit, b, -1)).toEqual({ kaynak: m5, onceki: [1, 2], yeni: [2, 1] });
    expect(adimIstegi(serit, a, 1)).toEqual({ kaynak: m5, onceki: [1, 2], yeni: [2, 1] });
    expect(adimIstegi(serit, a, -1)).toBe(null);
    expect(adimIstegi(serit, k, 1)).toBe(null);
  });
  it('sıralama gönderimi: ekranın plan sürümüyle gider; sürüm yoksa gönderilmez ve yenilenir; plan değiştiyse (409) yenilenir', async () => {
    const istek = { kaynak: { tur: 'makine' as const, id: 5 }, onceki: [1, 2], yeni: [2, 1] };
    const giden: unknown[] = [];
    const gonder = async (g: unknown) => { giden.push(g); };
    expect(await siralamayiGonder(istek, 7, gonder)).toEqual({ sonuc: 'yazildi' });
    expect(giden).toEqual([{ ...istek, planSurumu: 7 }]);
    expect(await siralamayiGonder(istek, null, gonder)).toEqual({ sonuc: 'hata', ileti: 'Plan okunamadı; ekran yeniden yükleniyor', yenile: true });
    expect(giden).toHaveLength(1);
    const red = (status: number, message: string) => async () => { throw Object.assign(new Error(message), { status }); };
    expect(await siralamayiGonder(istek, 7, red(409, 'Plan değişti: ekranı yenileyip yeniden sıralayın.')))
      .toEqual({ sonuc: 'hata', ileti: 'Plan değişti: ekranı yenileyip yeniden sıralayın.', yenile: true });
    expect(await siralamayiGonder(istek, 7, red(403, 'Yetki yok'))).toEqual({ sonuc: 'hata', ileti: 'Yetki yok', yenile: false });
  });
});
