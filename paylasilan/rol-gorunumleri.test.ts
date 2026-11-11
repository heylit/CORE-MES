import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { GENIS_MENU, MENU_SINIRI, ROL_GORUNUMLERI, etkinGorunum, seritRolGorunurMu } from './rol-gorunumleri.ts';
import { SAYFALAR, menudeGorunur } from './sayfalar.ts';
import { ROL_KODLARI, YONETICI_ROLU, rolunIslemleri, type RolKodu } from '../araclar/yetki-beklentisi.ts';

describe('rol görünümleri (1390 a)', () => {
  test('her rolün menüsü en çok 8 sayfadır (müdür ve planlamada 10, kalitede 9; 1851 a, 2945 a), tekrarsızdır ve yalnız menüde görünen kayıtlı sayfaları içerir', () => {
    const menudekiler = new Set(SAYFALAR.filter(menudeGorunur).map((s) => s.yol as string));
    for (const [rol, g] of Object.entries(ROL_GORUNUMLERI)) {
      assert.ok(g.sayfalar.length > 0 && g.sayfalar.length <= (GENIS_MENU[rol] ?? MENU_SINIRI), `${rol}: ${String(g.sayfalar.length)} sayfa`);
      assert.equal(new Set(g.sayfalar).size, g.sayfalar.length, `${rol}: tekrar eden sayfa`);
      for (const yol of g.sayfalar) assert.ok(menudekiler.has(yol), `${rol}: menüde olmayan sayfa ${yol}`);
      assert.equal(new Set(g.kartlar).size, g.kartlar.length, `${rol}: tekrar eden kart`);
    }
  });

  test('1851 a: Akış Süresi müdür ve planlama menüsünde, telefon alt çubuğunun (ilk dört) dışında', () => {
    for (const rol of ['mudur', 'planlama_proje']) assert.ok((ROL_GORUNUMLERI[rol]?.sayfalar.indexOf('/akis') ?? -1) >= 4, rol);
  });

  // Rol menüsü kişinin göremediği sayfayı çizmez (Kabuk); burada aynı süzgeç rolün beklenen yetkisiyle uygulanır.
  const menusu = (rol: RolKodu): readonly string[] => {
    const islemler: readonly string[] = rolunIslemleri(rol);
    const gorur = new Set(SAYFALAR.filter((s) => islemler.includes(s.islem)).map((s) => s.yol as string));
    return etkinGorunum([rol]).sayfaSirasi.filter((yol) => gorur.has(yol));
  };

  test('2893-5 a: Adım Durumu yetkili rolün ana menüsünde görünür, yetkisiz rolde görünmez', () => {
    for (const rol of ROL_KODLARI) {
      if (rol === YONETICI_ROLU.kod || ROL_GORUNUMLERI[rol] === undefined) continue;
      const yetkili = (rolunIslemleri(rol) as readonly string[]).includes('sayfa.adim-durumu');
      assert.equal(menusu(rol).includes('/adim-durumu'), yetkili, rol);
    }
  });

  test('2945 a: Adım Durumu Üretim Emirleri\'nin yanında; üretim müdüründe Vardiya\'dan sonra', () => {
    for (const rol of ['mudur', 'planlama_proje', 'kalite', 'cam'] as const) {
      const m = menusu(rol);
      assert.equal(m.indexOf('/adim-durumu'), m.indexOf('/uretim-emirleri') + 1, rol);
    }
    const um = menusu('uretim_muduru');
    assert.equal(um.indexOf('/adim-durumu'), um.indexOf('/vardiya') + 1);
  });

  test('operatör CNC Kurulum görmez (1393 c+); yönetici rol listesinde yoktur, tam görünümdedir', () => {
    assert.equal(ROL_GORUNUMLERI.operator?.sayfalar.includes('/cnc-kurulum'), false);
    assert.equal(ROL_GORUNUMLERI.yonetici, undefined);
  });

  test('etkin görünüm: birden çok rol birleşir; yönetici, listesiz rol ya da rol bilgisi yoksa tam görünüm', () => {
    const iki = etkinGorunum(['operator', 'depo']);
    assert.deepEqual(iki.sayfaSirasi.slice(0, 3), ['/uretim-terminali', '/kuyruk', '/ik-islemlerim']);
    assert.ok(iki.sayfalar?.has('/stok'));
    assert.ok(iki.kartlar?.has('arkon-ozetim') && iki.kartlar.has('stok-sayim'));
    for (const roller of [undefined, [], ['yonetici'], ['operator', 'yonetici'], ['ozel_rol']]) {
      const g = etkinGorunum(roller);
      assert.equal(g.sayfalar, null);
      assert.equal(g.kartlar, null);
    }
    // Müdürün menüsü daralır, ana sayfası (şirket özeti) süzülmez.
    const mudur = etkinGorunum(['mudur']);
    assert.ok(mudur.sayfalar !== null);
    assert.equal(mudur.kartlar, null);
  });

  test('rol panosu kaynakları (kart 1585, 1773): rol yalnız kendi listesiyle yeni düzene geçer; listesiz rol boş küme, yönetici tam', () => {
    const operator = etkinGorunum(['operator']);
    assert.ok(operator.kaynaklar?.has('uretim-emirleri-kuyrugum-is'));
    assert.equal(etkinGorunum(['depo']).kaynaklar?.size, 0);
    assert.ok(etkinGorunum(['mudur']).kaynaklar?.has('uretim-emirleri-uretim-grafik'));
    assert.equal(etkinGorunum(['mudur']).kaynaklar?.has('arkon-gunum-olcu'), false);
    assert.ok(etkinGorunum(['operator', 'depo']).kaynaklar?.has('istasyonlar-duran-is'));
    assert.equal(etkinGorunum(['yonetici']).kaynaklar, null);
    for (const [rol, g] of Object.entries(ROL_GORUNUMLERI)) {
      const k = g.kaynaklar ?? [];
      assert.equal(new Set(k).size, k.length, `${rol}: tekrar eden kaynak`);
    }
  });

  test('kur ve faiz şeridi yalnız finans, satın alma, müdür ve yöneticide (1394 a)', () => {
    for (const rol of ['muhasebe_finans', 'satin_alma', 'mudur', 'yonetici']) assert.equal(seritRolGorunurMu('kur-faiz', [rol]), true);
    for (const rol of ['operator', 'kalite', 'planlama_proje', 'ozel_rol']) assert.equal(seritRolGorunurMu('kur-faiz', [rol]), false);
    assert.equal(seritRolGorunurMu('kur-faiz', undefined), false);
    assert.equal(seritRolGorunurMu('baska-serit', ['operator']), true);
  });

  test('müdür rolleri (2177): genel müdür ve yardımcısı Müdür görünümünü, alan müdürleri ekip rolünün görünümünü alır', () => {
    for (const [rol, kaynak] of [
      ['genel_mudur', 'mudur'], ['genel_mudur_yardimcisi', 'mudur'], ['planlama_muduru', 'planlama_proje'], ['satin_alma_muduru', 'satin_alma'],
      ['uretim_muduru', 'vardiya_sorumlusu'],
    ] as const) assert.deepEqual(ROL_GORUNUMLERI[rol], ROL_GORUNUMLERI[kaynak], rol);
    assert.equal(etkinGorunum(['genel_mudur']).kartlar, null);
    for (const rol of ['genel_mudur', 'genel_mudur_yardimcisi', 'satin_alma_muduru']) assert.equal(seritRolGorunurMu('kur-faiz', [rol]), true, rol);
    for (const rol of ['planlama_muduru', 'uretim_muduru']) assert.equal(seritRolGorunurMu('kur-faiz', [rol]), false, rol);
  });
});
