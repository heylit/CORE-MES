import { describe, expect, it } from 'vitest';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { derle, girdiKur, malzemeHazir, planOku, plandanBitenler, type PlanIslemi } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import {
  akis, asilBekleme, bitisFarklari, canliFark, gunYeni, malzemeDetay, cubukYazisi, darbogaz, ga, gs, gunKaydi, ilerleme, isaretliSure, kapaliAraliklar, parcaAyir, saatPiksel, satirlar,
  siparisler, sure, suzKoy, suzUyar, terminMetni, tz, ufuk, zamanBasliklari, zs, farkKur, paAdim, paEmirFarki, paKontrol, paPlanKontrol, paRedVar, paSecim, planFarki, planGecikme, type SunucuSenaryosu,
} from './kurallar.ts';

const kur = (c: PlanlamaCalismasi = ornekCalisma()) => {
  const p = planOku(c); if (!p) throw new Error('plan yok');
  const cx = derle(girdiKur(c, plandanBitenler(c, p)));
  return { c, p, cx, h: malzemeHazir(cx) };
};

describe('atölye kuralları', () => {
  it('zaman yazımı eski panonunki: gün adı ve tarihi, saat, 48 saatten uzunu gün', () => {
    const { c } = kur();
    expect([gs(c.D, 0), zs(c.D, 7.5), ga(c.D, 30), tz(c.D, 31)]).toEqual(['Pzt 19', '07:30', '20.10', 'Sal 20 07:00']);
    expect([sure(5.4), sure(72.9), sure(null), isaretliSure(0.1), isaretliSure(-3)]).toEqual(['5 sa', '3,0 g', '—', '±0', '−3 sa']);
  });

  it('siparişler en riskli üstte; 8 saatten az pay riskli, gecikme geç', () => {
    const { c, p, cx, h } = kur();
    const L = siparisler(c, p, cx, h);
    expect(L.map((s) => [s.id, s.durum])).toEqual([['2', 'gec'], ['3', 'risk']]);
    expect(L[1]?.pay).toBeCloseTo(5.36, 1);
    expect(parcaAyir('2/3')).toEqual(['2', '/3']);
  });

  it('akış: rota sırası, bekleme ve nedeni, bitişi belirleyen zincir', () => {
    const { p, cx, h } = kur();
    const A = akis(p, cx, h, '2');
    expect(A?.L.map((x) => [x.k, x.kritik, x.neden])).toEqual([['20', true, null], ['30', true, 'fasoncu çıkış günü (5)'], ['40', true, null]]);
    expect(A?.L[1]?.bek).toBeCloseTo(2.75, 2);
    expect(asilBekleme(A)).toBe('fasoncu çıkış günü');
  });

  it('pano satırları tezgâhlar ve planda kullanılan fasoncular; ufuk son bitişten bir gün sonrası', () => {
    const { c, p } = kur();
    expect(satirlar(c.D, p).map((r) => [r.m, r.fason])).toEqual([['5', false], ['3', false], ['4', false], ['1', false], ['2', false], ['@5', true]]);
    expect(ufuk(p, 72)).toBe(264);
    expect(ufuk(p, 8760)).toBe(8760);
    expect(saatPiksel(720, 72)).toBe(10);
    expect(saatPiksel(100, 72)).toBe(4);
  });

  it('başlıklar: hafta ve altında gün ve saat, ayda gün numarası', () => {
    const { c, cx } = kur();
    const h = zamanBasliklari(c.D, cx, 48, 1, 72);
    expect(h.gunler.map((g) => g.ad)).toEqual(['Pzt 19', 'Sal 20']);
    expect(h.saatler.map((s) => s.ad).slice(0, 3)).toEqual(['06', '12', '18']);
    expect(zamanBasliklari(c.D, cx, 48, 1, 720).gunler.map((g) => g.ad)).toEqual(['19', '20']);
    expect(kapaliAraliklar(cx, '3', 48)[0]?.[0]).toBe(0);
  });

  it('darboğaz %85 ve üstündeki en dolu tezgâh', () => {
    expect(darbogaz({ a: 0.5, b: 0.9, c: 0.86 })).toBe('b');
    expect(darbogaz({ a: 0.84 })).toBeNull();
  });

  it('süzgeç: aynısı kaldırır, istasyon değişince uymayan tezgâh düşer, boşsa kalkar', () => {
    const { c, p } = kur();
    const f = suzKoy(c.D, null, 'm', '3');
    expect(f).toEqual({ g: null, m: '3', j: null });
    expect(suzKoy(c.D, f, 'g', '1')).toEqual({ g: '1', m: null, j: null });
    expect(suzKoy(c.D, f, 'm', '3')).toBeNull();
    const r = Object.values(p.ops).find((x) => x.m === '3') as PlanIslemi;
    expect(suzUyar(c.D, f, r)).toBe(true);
    expect(suzUyar(c.D, { g: null, m: null, j: '9' }, r)).toBe(false);
  });

  it('çubuk yazısı genişliğe göre; ilerleme geçen sürenin oranı', () => {
    const r = { id: '2.20', job: 'IE-0012', S: 0, C: 10, fas: false } as PlanIslemi;
    expect(cubukYazisi(r, '20', 'Freze', 120)).toEqual({ b: 'IE-0012', ek: ' · 20', alt: 'Freze' });
    expect(cubukYazisi(r, '20', 'Freze', 30)).toEqual({ b: '012', ek: '', alt: '' });
    expect(cubukYazisi(r, '20', 'Freze', 10)).toBeNull();
    expect(ilerleme(r, null, 10, 5)).toBe(0.5);
    expect(ilerleme(r, { S: 0, plan: 0, n: 4 }, 10, 5)).toBe(0.4);
    expect(ilerleme({ ...r, S: 6 }, null, 10, 5)).toBeNull();
  });

  it('termin metni şimdiki plandan, gecikmeyi söyler', () => {
    const { c, p, cx, h } = kur();
    const s = siparisler(c, p, cx, h)[0];
    if (!s) throw new Error('sipariş yok');
    const m = terminMetni(c, s);
    expect(m).toContain('2 numaralı siparişiniz (ORNEK Flanş, 50 adet)');
    expect(m).toContain('gecikme demek');
  });

  it('gün kaydı ve bitiş farkı', () => {
    const c = { ...ornekCalisma(), tpGun: { basi: { gun: '2026-10-25', e: { late: 1, wT: 3, J: { 2: { C: 100, T: 0 } } }, surum: 2 }, gecmis: { '2026-10-24': { sabah: { late: 1, wT: 2 }, son: { late: 0, wT: 0 }, kararlar: [], onaylar: [] } } } } as PlanlamaCalismasi;
    const g = gunKaydi(c);
    expect(g.basi?.surum).toBe(2);
    expect(g.gecmis.map((x) => x.gun)).toEqual(['2026-10-24']);
    expect(bitisFarklari({ 2: { C: 100, T: 0 } }, { 2: { C: 110, T: 5 }, 3: { C: 1, T: 0 } })).toEqual([{ j: '2', d: 10, gec: 'gecikmeye düşer' }]);
    expect(gunKaydi(ornekCalisma())).toEqual({ basi: null, gecmis: [] });
  });

  it('elle sıra listeyi sıralar; canlı senaryoyla fark eski farkSay gibi sayılır', () => {
    const { c, p, cx, h } = kur();
    expect(siparisler({ ...c, tpSira: ['3', '2', 'yok'] } as PlanlamaCalismasi, p, cx, h).map((s) => s.id)).toEqual(['3', '2']);
    expect(canliFark(c, p)).toEqual({ var: false, say: 0, farkli: true });
    const ops = Object.fromEntries(Object.entries(p.ops).map(([k, r]) => [k, { m: r.m, S: r.S }]));
    const ayni = { ...c, canli: 's1', senaryolar: [{ id: 's1', plan: { ops, zaman: 5 }, down: c.down }] } as PlanlamaCalismasi;
    expect(canliFark(ayni, p).say).toBe(0);
    const ilk = Object.keys(ops)[0] ?? '';
    const kayik = { ...ayni, senaryolar: [{ id: 's1', plan: { ops: { ...ops, [ilk]: { m: 'baska', S: 0 } }, zaman: 5 }, down: [] }] } as PlanlamaCalismasi;
    expect(canliFark(kayik, p).say).toBe(1 + c.down.length);
  });

  it('malzeme ayrıntısı malzemeHazir ile aynı dağıtımı yapar', () => {
    const { cx, h } = kur();
    const md = malzemeDetay(cx);
    for (const [j, L] of Object.entries(md)) {
      const t = L.some((x) => x.t === null) ? Infinity : Math.max(cx.now, ...L.map((x) => x.t ?? 0));
      expect(t).toBe(h[j]);
      for (const x of L) expect(x.kaynak.reduce((a, u) => a + u.miktar, 0) + x.eksik).toBeCloseTo(x.ihtiyac, 6);
    }
  });

  it('gün başı bir kez yazılır; anahtar sırası değişse de yeniden yazılmaz', () => {
    const { c, p } = kur();
    const g = gunYeni(c, p, '2026-10-25');
    expect(g).not.toBeNull();
    const ters = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, ters(x)])) : v);
    expect(gunYeni({ ...c, tpGun: ters(g) } as PlanlamaCalismasi, p, '2026-10-25')).toBeNull();
    const ertesi = gunYeni({ ...c, tpGun: g } as PlanlamaCalismasi, p, '2026-10-26') as { gecmis: Record<string, unknown>; basi: { gun: string } };
    expect(Object.keys(ertesi.gecmis).sort()).toEqual(['2026-10-25', '2026-10-26']);
    expect(ertesi.basi.gun).toBe('2026-10-26');
  });
});

describe('Onay ve canlı (sunucu senaryoları)', () => {
  const g = { emirSayisi: 5, isEmriSayisi: 9, yerlesen: 8, geciken: 2, zamanindaYuzde: 80, ortAtolyeGun: 2, darbogaz: null, enDoluKaynak: null, personelGun: null, maliyetTl: null };
  const s = (id: number, durum: SunucuSenaryosu['durum'], ek: Partial<SunucuSenaryosu> = {}): SunucuSenaryosu => ({
    id, ad: `S${id}`, aciklama: null, durum, acan: null, benim: true, acilma: '2026-10-20T08:00:00Z', surum: 1, tabanPlanSurumu: 2, canliDegisti: false,
    gostergeler: g, degisiklikler: [], etki: null, bekleyenler: [], ...ek,
  });
  it('akış adımı ve seçim: onay bekleyen önce, yoksa çalışma', () => {
    expect(paAdim(false, 0, false, false)).toBe('hazirla');
    expect(paAdim(true, 1, false, false)).toBe('canli');
    expect(paAdim(true, 0, true, true)).toBe('incele');
    expect(paAdim(true, 0, true, false)).toBe('onaya');
    expect(paAdim(true, 0, false, false)).toBe('bitti');
    const l = [s(1, 'acik'), s(2, 'onayda'), s(3, 'canliya_alindi')];
    expect(paSecim(l, null, true)).toBe(2);
    expect(paSecim(l, 3, true)).toBe(2);
    expect(paSecim([s(1, 'acik')], null, true)).toBe('calisma');
    expect(paSecim([s(1, 'acik')], 1, false)).toBe(1);
  });
  it('kontrol sunucu senaryosunun bildikleriyle', () => {
    const K = paKontrol(s(1, 'acik', { canliDegisti: true, bekleyenler: ['Müşteri önceliği'] }), { ...g, geciken: 1 }, 4);
    expect(K.map((k) => k[1])).toEqual([
      'Canlı plan bu plan hazırlandıktan sonra değişti (sürüm 2 → 4); aradaki canlı değişiklikleri bu planda yok',
      '1 iş yerleşmedi', 'Geciken sipariş canlıya göre 1 artıyor', 'Canlıya alınamaz, bekliyor: Müşteri önceliği', 'Canlı plandan farkı yok',
    ]);
    expect(paRedVar(K)).toBe(false);
  });
  it('fark ve planlar arası emir farkı', () => {
    expect(farkKur(3, 1)).toEqual({ metin: '+2,0', iyi: false });
    expect(farkKur(1, 1.01)).toBeNull();
    const e = (emirNo: string, canli: string, senaryo: string | null) => ({ emirNo, canli, senaryo });
    const etki = (l: ReturnType<typeof e>[]) => ({ tarihiDegisenEmirler: l, yukuDegisenIstasyonlar: [], yeniUyarilar: [] });
    const r = paEmirFarki([s(1, 'acik', { etki: etki([e('A', '2026-10-21T08:00:00Z', '2026-10-21T10:00:00Z')]) }), s(2, 'acik', { etki: etki([e('B', '2026-10-21T08:00:00Z', null)]) })]);
    expect(r.map((x) => x.emirNo)).toEqual(['B', 'A']);
    expect(r[1]?.senaryo).toEqual(['2026-10-21T10:00:00Z', '2026-10-21T08:00:00Z']);
  });
  it('plan farkı: tezgâh, saat, yeni; başlamış ve sabit iş oynadıysa kırmızı; gecikme termin günü sonuna göre', () => {
    const y = (isEmriId: number, kaynak: number, baslangic: string, ek: Record<string, unknown> = {}) => ({ isEmriId, kaynak: { tur: 'makine', id: kaynak }, baslangic, bitis: baslangic, kilitli: false, dondurulmus: false, durum: 'planli', ...ek });
    const plan = (yerlesimler: unknown[], emirler: unknown[]) => ({ kaynaklar: [{ tur: 'makine', id: 1, kod: 'M1', ad: 'M1' }, { tur: 'makine', id: 2, kod: 'M2', ad: 'M2' }], yerlesimler, emirler }) as unknown as PlanCevabi;
    const canli = plan([y(1, 1, '2026-10-21T08:00:00Z', { durum: 'basladi' }), y(2, 1, '2026-10-21T10:00:00Z', { kilitli: true }), y(3, 2, '2026-10-21T12:00:00Z')],
      [{ emirNo: 'E-1', teslim: '2026-10-21', bitis: '2026-10-21T12:00:00Z' }]);
    const sen = plan([y(1, 2, '2026-10-21T08:00:00Z'), y(2, 1, '2026-10-21T11:00:00Z'), y(3, 2, '2026-10-21T12:05:00Z'), y(4, 2, '2026-10-22T08:00:00Z')],
      [{ emirNo: 'E-1', teslim: '2026-10-21', bitis: '2026-10-23T12:00:00Z' }]);
    const f = planFarki(sen, canli);
    expect([f.tasinan, f.tezgah, f.saat, f.yeni, f.baslamis, f.sabit]).toEqual([2, 1, 1, 1, 1, 1]);
    expect(f.tez).toEqual({ M2: 2, M1: 1 });
    expect(f.sip[0]?.emirNo).toBe('E-1');
    expect(f.sip[0]?.T0).toBe(0);
    expect((f.sip[0]?.T1 ?? 0) > 30).toBe(true);
    expect(planGecikme(canli)).toBe(0);
    expect(paPlanKontrol(f, true).map((k) => k[0])).toEqual(['red', 'red']);
    expect(paPlanKontrol(null, true)).toEqual([]);
  });
});
