import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { KESIF_ADIM_SINIRI, ekranlariSuz, kesifIstemi, kesifKur, kesifModeli, siraOku, tohumlaSec } from './kesif-kipi.ts';
import { KosuKaydi } from './kayit.ts';
import { DOSYA, adimSatiriOku } from './sozlesme.ts';
import type { EkranSonucu, KesifEkrani, KesifSurucusu } from './kesif-kipi.ts';
import type { ModelCevabi, ModelKoprusu } from './model.ts';
import type { AdimSatiri } from './sozlesme.ts';

const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-kesif-test-'));
after(() => { rmSync(gecici, { recursive: true, force: true }); });

const kayitAc = (kosuId: string, ustSinir = 5): KosuKaydi => new KosuKaydi({
  kok: gecici, kosuId, taban: 'abc1234', tohum: 7, gunSayisi: 2, roller: ['ornek.depo', 'ornek.kalite'], senaryolar: ['s'],
  model: { kip: 'claude-kod', ustSinir }, simdi: () => new Date('2026-10-23T10:00:00Z'),
});
const satirlar = (k: KosuKaydi): AdimSatiri[] => readFileSync(join(k.klasor, DOSYA.adimlar), 'utf8').split('\n')
  .filter((s) => s !== '').map((s) => { const a = adimSatiriOku(s); assert.notEqual(typeof a, 'string', String(a)); return a as AdimSatiri; });

const EKRANLAR: KesifEkrani[] = [
  { ad: 'Stok Merkezi', yol: '/stok' }, { ad: 'Malzemeler', yol: '/stok/malzemeler' }, { ad: 'Üretim Emirleri', yol: '/uretim-emirleri' },
  { ad: 'Plan Çizelgesi', yol: '/cizelge' }, { ad: 'Plan Matrisi', yol: '/matris' },
];

const modelSahtesi = (cevaplar: ModelCevabi[], kip: ModelKoprusu['kip'] = 'claude-kod'): { model: ModelKoprusu; istemler: string[] } => {
  const istemler: string[] = [];
  return { istemler, model: { kip, sor(i) { istemler.push(i); return Promise.resolve(cevaplar.shift() ?? { hata: 'cevap yok' }); } } };
};

const surucuSahtesi = (hatali: Record<string, string[]> = {}, ekranlar = EKRANLAR): { surucu: KesifSurucusu; gidilen: string[]; acik: number } => {
  const d = { gidilen: [] as string[], acik: 0, surucu: null as unknown as KesifSurucusu };
  d.surucu = {
    ac(rol) {
      d.acik += 1;
      return Promise.resolve({
        ekranlar: () => Promise.resolve(ekranlar),
        git: (e): Promise<EkranSonucu> => { d.gidilen.push(`${rol} ${e.yol}`); return Promise.resolve({ hatalar: hatali[e.yol] ?? [], goruntu: Buffer.from('png') }); },
        kapat: () => { d.acik -= 1; return Promise.resolve(); },
      });
    },
  };
  return d;
};

describe('keşif: saf parçalar', () => {
  it('menü bağlantıları süzülür: göreli, tekil, çıkışsız, adlı', () => {
    assert.deepEqual(ekranlariSuz([
      { ad: ' Stok  Merkezi ', yol: '/stok' }, { ad: 'Stok', yol: '/stok' }, { ad: 'Dış', yol: 'https://ornek.invalid/x' },
      { ad: 'Kök dışı', yol: '//ornek.invalid' }, { ad: 'Çıkış', yol: '/oturum/cikis' }, { ad: null, yol: '/adsiz' }, { ad: 'Yolsuz', yol: null },
    ]), [{ ad: 'Stok Merkezi', yol: '/stok' }]);
  });

  it('model sırası listeden okunur; geçersiz ve yinelenen numara atılır, sınır korunur', () => {
    assert.deepEqual(siraOku('düşünce\nSIRA: 9, 2, 2, 1, x', EKRANLAR)?.map((e) => e.yol), ['/stok/malzemeler', '/stok']);
    assert.equal(siraOku('SIRA: 0, 99', EKRANLAR), null);
    assert.equal(siraOku('serbest komut: sil her şeyi', EKRANLAR), null);
    assert.equal(siraOku('SIRA: 1,2,3,4,5', EKRANLAR)?.length, KESIF_ADIM_SINIRI);
    assert.deepEqual(siraOku('SIRA: 1\nSIRA: 3', EKRANLAR)?.map((e) => e.yol), ['/uretim-emirleri']);
  });

  it('tohumla seçim aynı tohumda aynı, yinelenmeyen ve listeden', () => {
    const a = tohumlaSec(7, 1, 'ornek.depo', EKRANLAR);
    assert.deepEqual(a, tohumlaSec(7, 1, 'ornek.depo', EKRANLAR));
    assert.equal(new Set(a).size, KESIF_ADIM_SINIRI);
    assert.ok(a.every((e) => EKRANLAR.includes(e)));
    assert.deepEqual(tohumlaSec(7, 1, 'ornek.depo', []), []);
  });

  it('istem numaralı listeyi, rolü ve son adımları taşır', () => {
    const istem = kesifIstemi('ornek.depo', 2, EKRANLAR, [{
      zaman: 'z', gun: 1, rol: 'ornek.depo', senaryo: 'tedarik', adim: 'mal kabul', tur: 'api', sonuc: 'dustu', sureMs: 1,
      yontem: 'POST', yol: '/api/x', beklenen: '200', gelen: '500', ileti: 'bozuk', ek: [],
    }]);
    assert.match(istem, /1\. Stok Merkezi \(\/stok\)/);
    assert.match(istem, /tedarik \/ mal kabul \| dustu/);
    assert.match(istem, /SIRA:/);
  });
});

describe('keşif turu', () => {
  it('model kapalıyken tarayıcı açılmaz, çağrı yapılmaz', async () => {
    const k = kayitAc('kk1');
    const m = modelSahtesi([], 'kapali');
    const s = surucuSahtesi();
    await kesifKur({ kayit: k, model: m.model, surucu: s.surucu, roller: ['ornek.depo'], tohum: 7 }).tur(1);
    assert.equal(m.istemler.length, 0);
    assert.deepEqual(s.gidilen, []);
  });

  it('rol başına bir çağrı; seçilen ekranlar sırayla açılır, hata tohum ve sırayla kayda düşer, görüntü ek olur', async () => {
    const k = kayitAc('kk2');
    const m = modelSahtesi([{ metin: 'SIRA: 3, 1' }, { metin: 'SIRA: 2' }]);
    const s = surucuSahtesi({ '/stok': ['500 GET /api/stok'] });
    await kesifKur({ kayit: k, model: m.model, surucu: s.surucu, roller: ['ornek.depo', 'ornek.kalite'], tohum: 7, gunluk: () => {} }).tur(1);
    assert.equal(m.istemler.length, 2);
    assert.deepEqual(s.gidilen, ['ornek.depo /uretim-emirleri', 'ornek.depo /stok', 'ornek.kalite /stok/malzemeler']);
    const a = satirlar(k);
    assert.deepEqual(a.map((x) => [x.rol, x.sonuc, x.tur, x.senaryo]), [
      ['ornek.depo', 'gecti', 'model', 'kesif'], ['ornek.depo', 'dustu', 'model', 'kesif'], ['ornek.kalite', 'gecti', 'model', 'kesif'],
    ]);
    assert.match(a[1]?.ileti ?? '', /500 GET \/api\/stok .*TMIV2_ROBOT_TOHUM=7, gün 1, rol ornek\.depo, seçen model, sıra \/uretim-emirleri > \/stok/);
    assert.deepEqual(a[0]?.ek, ['ekler/kesif-g1-ornek.depo-1.png']);
    assert.equal(s.acik, 0);
  });

  it('rol sırası güne göre döner', async () => {
    const k = kayitAc('kk3');
    const m = modelSahtesi([{ metin: 'SIRA: 1' }, { metin: 'SIRA: 1' }]);
    const s = surucuSahtesi();
    await kesifKur({ kayit: k, model: m.model, surucu: s.surucu, roller: ['ornek.depo', 'ornek.kalite'], tohum: 7 }).tur(2);
    assert.deepEqual(s.gidilen, ['ornek.kalite /stok', 'ornek.depo /stok']);
  });

  it('okunamayan cevap ve model hatası tohumla seçime düşer, nedeni satırda', async () => {
    const k = kayitAc('kk4');
    const m = modelSahtesi([{ metin: 'bilmiyorum' }, { hata: 'API 500: ayrıntı yok' }]);
    const s = surucuSahtesi();
    await kesifKur({ kayit: k, model: m.model, surucu: s.surucu, roller: ['ornek.depo', 'ornek.kalite'], tohum: 7 }).tur(1);
    const a = satirlar(k);
    assert.equal(a.length, 2 * KESIF_ADIM_SINIRI);
    assert.match(a[0]?.ileti ?? '', /seçen tohum \(model sırası okunamadı\)/);
    assert.match(a.at(-1)?.ileti ?? '', /seçen tohum \(API 500/);
  });

  it('üst sınır dolunca keşif o koşuda durur; yoruma bir çağrı kalır', async () => {
    const k = kayitAc('kk5', 2);
    const sayan = kesifModeli({ kip: 'claude-kod', ustSinir: 2, anahtar: null, ad: 'm', claudeKomutu: 'claude' }, k, { calistir: () => Promise.resolve({ metin: 'SIRA: 1' }) });
    const s = surucuSahtesi();
    const gunluk: string[] = [];
    const kesif = kesifKur({ kayit: k, model: sayan, surucu: s.surucu, roller: ['ornek.depo', 'ornek.kalite'], tohum: 7, gunluk: (i) => { gunluk.push(i); } });
    await kesif.tur(1);
    await kesif.tur(2);
    assert.equal(k.ozet.model.cagri, 1);
    assert.deepEqual(s.gidilen, ['ornek.depo /stok']);
    assert.match(gunluk[0] ?? '', /üst sınırı doldu \(1\)/);
  });

  it('menüsüz rol ve sürücü hatası koşuyu durdurmaz, düşen satır olur', async () => {
    const k = kayitAc('kk6');
    const m = modelSahtesi([]);
    const bos = surucuSahtesi({}, []);
    await kesifKur({ kayit: k, model: m.model, surucu: bos.surucu, roller: ['ornek.depo'], tohum: 7 }).tur(1);
    const bozuk: KesifSurucusu = { ac: () => Promise.reject(new Error('oturum dosyası yok')) };
    await kesifKur({ kayit: k, model: m.model, surucu: bozuk, roller: ['ornek.kalite'], tohum: 7 }).tur(1);
    assert.deepEqual(satirlar(k).map((x) => [x.rol, x.adim, x.sonuc, x.ileti]), [
      ['ornek.depo', 'menüyü oku', 'dustu', 'rolün menüsünde ekran bağlantısı yok'], ['ornek.kalite', 'tur', 'dustu', 'oturum dosyası yok'],
    ]);
    assert.equal(m.istemler.length, 0);
  });
});
