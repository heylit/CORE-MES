import { describe, expect, it } from 'vitest';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Emir, SonOlaylarCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { calismaOrani, cerceveKur, ekranda, etiketleriYerlestir, gecisler, gecmisAni, ikizKaydi, ikizPlani, isabet } from './ikiz.ts';

const istasyon = (istasyonId: number, kod: string, x: string, hucre: string) => ({
  istasyonId, kod, ad: `${kod} tezgahı`, tip: 'talasli' as const, aktif: true, x, z: '5.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre,
  makineler: [], model: null, merkezModeli: null,
});

const BOLUM = {
  salon: {
    id: 1, kod: 'S1', ad: 'Deneme salonu', genislik: '20.00', derinlik: '8.00', hucreBoyu: '4.00', surum: 1, fabrika: { x: '10.00', z: '0.00', donus: '0.0' },
    giris: null, kaydeden: { id: 1, ad: 'Deneme' }, kaydedildi: '2026-10-14T06:00:00Z', sutunlar: ['A', 'B', 'C', 'D', 'E'], satirlar: ['1', '2'],
  },
  istasyonYerleri: [istasyon(5, 'CNC-01', '5.00', 'B2'), istasyon(6, 'CNC-02', '14.00', 'D2')],
  makineYerleri: [], raflar: [], alanlar: [], duvarlar: [], gecisler: [],
} satisfies YerlesimCevabi;
const BOLUMLER = [BOLUM];

const t = (saat: string) => Date.parse(`2026-10-14T${saat}:00Z`);
let olayNo = 0;
const olay = (tur: SonOlaylarCevabi['olaylar'][number]['olay'], istasyonId: number, saat: string, emirId = 30, durus: string | null = null) => ({
  id: `o${++olayNo}`, olay: tur, emir: { id: emirId, emirNo: `UE-0000${emirId}`, parcaNo: 'DENEME-1' },
  isEmri: { id: 300, opNo: istasyonId === 5 ? 10 : 20, ad: istasyonId === 5 ? 'Tornalama' : 'Frezeleme' },
  makine: null, istasyon: { id: istasyonId, ad: `İstasyon ${istasyonId}` }, kisi: { id: 1, ad: 'Deneme Operatör' }, adet: null,
  durusNedeni: durus === null ? null : { id: 3, ad: durus }, zaman: `2026-10-14T${saat}:00Z`,
});

// Sunucu yeniden eskiye verir.
const DEFTER = {
  olaylar: [
    olay('baslat', 6, '11:00'), olay('bitir', 5, '10:30'), olay('devam', 5, '09:30'), olay('durdur', 5, '09:00', 30, 'Takım değişimi'), olay('baslat', 5, '08:00'),
  ],
} satisfies SonOlaylarCevabi;

const emir = (ek: Partial<Emir> = {}): Emir => ({
  id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1', parcaAd: 'Deneme kapak', adet: 10, istasyon: { id: 6, ad: 'İstasyon 6' }, durum: 'basladi',
  acan: { id: 1, ad: 'Deneme' }, acilma: '2026-10-14T07:00:00Z', baslama: '2026-10-14T08:00:00Z', bitis: null, iptal: null, saglamAdet: null, ...ek,
});

const plan = ikizPlani(BOLUMLER, true);
const nesne = (kod: string) => {
  const n = plan?.nesneler.find((o) => o.kod === kod);
  if (!n) throw new Error(`${kod} planda yok`);
  return n;
};

describe('dijital ikiz planı', () => {
  it('nesneler fabrika metresinde, ızgara sütun harfi ve satır sayısıyla kurulur', () => {
    expect(plan?.nesneler.map((n) => [n.kod, n.x, n.z, n.hucre])).toEqual([['CNC-01', 15, 5, 'B2'], ['CNC-02', 24, 5, 'D2']]);
    expect(plan?.bolumler[0]?.etiketler.map((e) => e.metin)).toEqual(['A', 'B', 'C', 'D', 'E', '1', '2']);
    expect(plan?.kutu).toEqual({ x0: 10, z0: 0, x1: 30, z1: 8 });
  });

  it('bölüm yoksa plan yoktur', () => {
    expect(ikizPlani([], true)).toBeNull();
  });

  it('isabet imlecin altındaki nesneyi verir, boş yerde null', () => {
    if (!plan) throw new Error('plan yok');
    const c = cerceveKur(plan.kutu, 800, 400, 30);
    const p = ekranda(c, nesne('CNC-02'));
    expect(isabet(c, plan.nesneler, 20, p.x, p.y)?.kod).toBe('CNC-02');
    const bos = ekranda(c, { x: 20, z: 1 });
    expect(isabet(c, plan.nesneler, 20, bos.x, bos.y)).toBeNull();
  });
});

describe('zaman makinesi', () => {
  const kayit = ikizKaydi(DEFTER, 200);

  it('seçilen andaki son durum olayını gösterir: çalışıyor, durdu (neden), bitince boş', () => {
    const a = gecmisAni(BOLUMLER, nesne('CNC-01'), kayit, [emir()], t('08:30'));
    expect([a.durum, a.emirNo, a.op]).toEqual(['calisiyor', 'UE-000030', 'Op 10 · Tornalama']);
    const b = gecmisAni(BOLUMLER, nesne('CNC-01'), kayit, [emir()], t('09:15'));
    expect([b.durum, b.neden]).toEqual(['durdu', 'Takım değişimi']);
    expect(gecmisAni(BOLUMLER, nesne('CNC-01'), kayit, [emir()], t('10:45')).durum).toBe('sirada');
    expect(gecmisAni(BOLUMLER, nesne('CNC-02'), kayit, [emir()], t('11:30')).durum).toBe('calisiyor');
  });

  it('olay öncesinde ve kayıtsız anda durum uydurulmaz: süren emir varsa bilinmiyor, yoksa boş', () => {
    expect(gecmisAni(BOLUMLER, nesne('CNC-02'), kayit, [emir()], t('07:30')).durum).toBe('sirada');
    const okunamadi = ikizKaydi(undefined, 200);
    const a = gecmisAni(BOLUMLER, nesne('CNC-02'), okunamadi, [emir()], t('09:00'));
    expect([a.durum, a.emirNo]).toEqual(['bilinmiyor', 'UE-000030']);
    expect(gecmisAni(BOLUMLER, nesne('CNC-02'), okunamadi, null, t('09:00')).durum).toBe('bilinmiyor');
  });

  it('kuyruk o anda açılmış ve henüz başlamamış emirlerdir; emir listesi yoksa null', () => {
    const planli = emir({ id: 31, durum: 'planli', acilma: '2026-10-14T09:00:00Z', baslama: null });
    expect(gecmisAni(BOLUMLER, nesne('CNC-02'), kayit, [emir(), planli], t('08:30')).kuyruk).toBe(0);
    expect(gecmisAni(BOLUMLER, nesne('CNC-02'), kayit, [emir(), planli], t('09:30')).kuyruk).toBe(1);
    expect(gecmisAni(BOLUMLER, nesne('CNC-02'), kayit, null, t('09:30')).kuyruk).toBeNull();
  });

  it('defter sınıra dayanınca en eski olaydan öncesi kapsam dışıdır', () => {
    expect(ikizKaydi(DEFTER, 5).kapsamBasi).toBe(t('08:00'));
    expect(ikizKaydi(DEFTER, 6).kapsamBasi).toBeNull();
  });

  it('çalışma payı aralıkta çalışır geçen süredir; aralık defterin dışındaysa null', () => {
    expect(calismaOrani(BOLUMLER, 'istasyon:5', kayit, t('08:00'), t('10:00'))).toBeCloseTo(1.5 / 2);
    expect(calismaOrani(BOLUMLER, 'istasyon:5', ikizKaydi(DEFTER, 5), t('07:00'), t('10:00'))).toBeNull();
    expect(calismaOrani(BOLUMLER, 'istasyon:5', ikizKaydi(undefined, 200), t('07:00'), t('10:00'))).toBeNull();
  });

  it('parça akışı aynı emrin bir nesneden öbürüne geçişidir', () => {
    expect(gecisler(BOLUMLER, kayit)).toEqual([{ emirId: 30, emirNo: 'UE-000030', kaynak: 'istasyon:5', hedef: 'istasyon:6', zaman: t('11:00') }]);
  });
});

describe('dijital ikiz adlari', () => {
  const kutu = (x: number, y = 100) => ({ x, y, g: 30, d: 30 });
  it('ad kutunun altina yazilir; yandaki adla carpisan once ustune gecer, o da doluysa yazilmaz', () => {
    const yer = etiketleriYerlestir([
      { anahtar: 'a', genislik: 80, kutu: kutu(100), zorunlu: false },
      { anahtar: 'b', genislik: 80, kutu: kutu(140), zorunlu: false },
      { anahtar: 'c', genislik: 80, kutu: kutu(160), zorunlu: false },
    ], 12);
    expect(yer.get('a')).toEqual({ x: 100, y: 124 });
    expect(yer.get('b')).toEqual({ x: 140, y: 76 });
    expect(yer.has('c')).toBe(false);
  });

  it('imlecin altindaki nesnenin adi her zaman ve once yazilir', () => {
    const yer = etiketleriYerlestir([
      { anahtar: 'a', genislik: 80, kutu: kutu(100), zorunlu: false },
      { anahtar: 'b', genislik: 80, kutu: kutu(120), zorunlu: true },
    ], 12);
    expect(yer.get('b')).toEqual({ x: 120, y: 124 });
    expect(yer.get('a')).toEqual({ x: 100, y: 76 });
  });
});
