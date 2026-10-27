import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { islemMi, veriIslemiMi } from './islemler.ts';
import { SAYFA_GRUPLARI, aramaUcuGecerliMi, ikinciMenulerinHatalari, sayfalariSirala } from './sayfa-tanimi.ts';
import type { IkinciMenuTanimi, SayfaTanimi } from './sayfa-tanimi.ts';
import { IKINCI_MENULER, SAYFALAR, SAYFA_ISLEMLERI, SAYFA_YOLLARI } from './sayfalar.ts';

const KLASOR = fileURLToPath(new URL('./sayfalar/', import.meta.url));

test('her sayfanın yolu ve işlemi bir kez geçer; işlem sayfa.<yol>, grup bilinen gruplardan, başlık ve simge doludur', () => {
  assert.equal(SAYFALAR.length > 0, true);
  assert.equal(new Set(SAYFA_YOLLARI).size, SAYFA_YOLLARI.length);
  assert.equal(new Set(SAYFA_ISLEMLERI).size, SAYFA_ISLEMLERI.length);
  const gruplar: readonly string[] = SAYFA_GRUPLARI;
  for (const s of SAYFALAR) {
    assert.match(s.yol, /^\/[a-z][a-z0-9-]*$/);
    assert.equal(s.islem, `sayfa.${s.yol.slice(1)}`);
    assert.equal(gruplar.includes(s.grup), true, s.yol);
    assert.notEqual(s.baslik.trim(), '', s.yol);
    assert.notEqual(s.simge.trim(), '', s.yol);
    const { aramaUcu } = s as Pick<SayfaTanimi, 'aramaUcu'>;
    if (aramaUcu !== undefined) assert.equal(aramaUcuGecerliMi(aramaUcu), true, `arama ucu yol biçiminde değil: ${s.yol}`);
    const { aramaIslemi } = s as Pick<SayfaTanimi, 'aramaIslemi'>;
    if (aramaIslemi !== undefined) {
      assert.notEqual(aramaUcu, undefined, `arama işlemi arama ucu olmadan verilmiş: ${s.yol}`);
      assert.equal(veriIslemiMi(aramaIslemi), true, `arama işlemi kayıtlı veri işlemi değil: ${s.yol}`);
    }
  }
  assert.deepEqual(SAYFA_YOLLARI, SAYFALAR.map((s) => s.yol));
  assert.deepEqual(SAYFA_ISLEMLERI, SAYFALAR.map((s) => s.islem));
});

test('modül dosyasındaki her sayfa listededir; iki dosya aynı yolu veremez', async () => {
  const dosyalar = (await readdir(KLASOR)).filter((ad) => ad.endsWith('.ts')).sort();
  assert.equal(dosyalar.length > 0, true);
  const bulunan: SayfaTanimi[] = [];
  for (const dosya of dosyalar) {
    const disari = (await import(pathToFileURL(`${KLASOR}${dosya}`).href)) as Record<string, unknown>;
    const sayfalar = Object.values(disari).filter((d): d is readonly SayfaTanimi[] => Array.isArray(d)).flat();
    assert.equal(sayfalar.length > 0, true, dosya);
    for (const s of sayfalar) assert.equal(Number.isFinite(s.sira), true, `${dosya}: ${s.yol}`);
    bulunan.push(...sayfalar);
  }
  assert.equal(new Set(bulunan.map((s) => s.yol)).size, bulunan.length);
  assert.deepEqual(sayfalariSirala(bulunan), SAYFALAR);
});

test('diziliş: önce grup sırası, sonra sayfanın sırası, eşitlikte yol; verilen sıra sonucu değiştirmez', () => {
  const [ilkGrup, ikinciGrup] = SAYFA_GRUPLARI;
  const sayfa = (ad: string, grup: SayfaTanimi['grup'], sira: number): SayfaTanimi =>
    ({ yol: `/${ad}`, islem: `sayfa.${ad}`, baslik: ad, simge: 'list', grup, sira });
  const tanimlar = [sayfa('d', ikinciGrup, 5), sayfa('c', ilkGrup, 20), sayfa('b', ilkGrup, 10), sayfa('a', ilkGrup, 20)];
  const beklenen = ['/b', '/a', '/c', '/d'];
  assert.deepEqual(sayfalariSirala(tanimlar).map((s) => s.yol), beklenen);
  assert.deepEqual(sayfalariSirala([...tanimlar].reverse()).map((s) => s.yol), beklenen);
  assert.equal(sayfalariSirala(tanimlar).some((s) => 'sira' in s), false);
});

test('Satın Alma grubu menüde Stok ile Kalite arasındadır; tek sayfadır, bölümleri ikinci menüdedir', () => {
  const gruplar = [...new Set(SAYFALAR.map((s) => s.grup))];
  const yer = gruplar.indexOf('Satın Alma');
  assert.deepEqual([gruplar[yer - 1], gruplar[yer + 1]], ['Stok', 'Kalite']);
  assert.deepEqual(
    SAYFALAR.filter((s) => s.grup === 'Satın Alma').map((s) => s.yol),
    ['/satin-alma'],
  );
});

// 195 a, 658 b: Planlama plan modülünün sayfasıdır; maddeleri planlama sayfalarını görme işlemini ister (yönetici, müdür ve planlama;
// 663 a). Maliyet ve kâr gösteren üç madde birim maliyet okumasını ister (planlama rolü maliyet görmez, 200 a). Reçete ve Rota'da
// planlama maddesi kalmaz.
test('Planlama ikinci menüsünde planlama maddeleri plan.planlama-oku, maliyet maddeleri finans.maliyet-oku ister; Reçete ve Rota yalnız kendi sayfasını', () => {
  const menu: IkinciMenuTanimi | undefined = IKINCI_MENULER.find((m) => m.kok === '/plan');
  assert.ok(menu);
  const maddeler = menu.gruplar.flatMap((g) => g.maddeler);
  assert.deepEqual(maddeler.map((m) => m.anahtar),
    ['plan', 'studio', 'ysiparis', 'maliyet', 'giderler', 'mesaiplan', 'fasonplan', 'malzplan', 'terminler', 'denge', 'yillik', 'ufuk', 'sevkiyat', 'veri-sagligi']);
  const maliyet = ['maliyet', 'giderler', 'denge'];
  assert.deepEqual(maddeler.filter((m) => m.islem === 'finans.maliyet-oku').map((m) => m.anahtar), maliyet);
  assert.ok(maddeler.filter((m) => !maliyet.includes(m.anahtar)).every((m) => m.islem === 'plan.planlama-oku'));
  assert.ok(maddeler.every((m) => m.veya === undefined && (m.yol === '/plan' || m.yol === `/plan/${m.anahtar}`)));
  const rr = IKINCI_MENULER.find((m) => m.kok === '/recete-rota');
  assert.ok(rr);
  assert.ok(rr.gruplar.flatMap((g) => g.maddeler).every((m) => m.islem === 'sayfa.recete-rota'));
});

test('İK ikinci menüsünde PDKS aktar maddesi yalnız nizamiye.pdks-aktar ister (341 a); öteki maddeler ik.oku', () => {
  const menu: IkinciMenuTanimi | undefined = IKINCI_MENULER.find((m) => m.kok === '/ik');
  assert.ok(menu);
  const maddeler = menu.gruplar.flatMap((g) => g.maddeler);
  assert.deepEqual(maddeler.filter((m) => m.islem === 'nizamiye.pdks-aktar').map((m) => m.yol), ['/ik/pdks']);
  assert.ok(maddeler.filter((m) => m.yol !== '/ik/pdks').every((m) => m.islem === 'ik.oku'));
});

test('Stok ikinci menüsünde Raflar maddesi yoktur; raf matrisi depo ve konum ekranlarından açılır', () => {
  const menu = IKINCI_MENULER.find((m) => m.kok === '/stok');
  const yollar = menu?.gruplar.flatMap((g) => g.maddeler.map((m) => m.yol)) ?? [];
  assert.equal(yollar.includes('/stok/konumlar'), true);
  assert.equal(yollar.some((y) => y.startsWith('/stok/raflar')), false);
});

test('modül dosyasındaki her ikinci menü toplayıcıdadır ve geçerlidir: kök kayıtlı sayfa, yollar kökün altında ve tekil, işlemler kayıtlı', async () => {
  const dosyalar = (await readdir(KLASOR)).filter((ad) => ad.endsWith('.ts')).sort();
  const bulunan: IkinciMenuTanimi[] = [];
  for (const dosya of dosyalar) {
    const disari = (await import(pathToFileURL(`${KLASOR}${dosya}`).href)) as Record<string, unknown>;
    for (const [ad, deger] of Object.entries(disari)) {
      if (Array.isArray(deger)) continue;
      // Sayfa dosyası yalnız sayfa listesi ve ikinci menü verir; başka dışa açılan değer toplayıcıya girmeden kalırdı.
      assert.equal(typeof deger === 'object' && deger !== null && 'gruplar' in deger, true, `${dosya}: ${ad}`);
      bulunan.push(deger as IkinciMenuTanimi);
    }
  }
  const kokSirali = (liste: readonly IkinciMenuTanimi[]) => [...liste].sort((a, b) => (a.kok < b.kok ? -1 : 1));
  assert.deepEqual(kokSirali(IKINCI_MENULER), kokSirali(bulunan));
  assert.deepEqual(ikinciMenulerinHatalari(IKINCI_MENULER, { sayfaYollari: SAYFA_YOLLARI, islemMi }), []);
});
