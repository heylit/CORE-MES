import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import cakisma, { calisanEmirSec, emirSurumuOku, ikiYeniOncelik, olaySayisi, planlanacakEmirSec, yarisCiktisi, yarisSonucu } from './cakisma.ts';
import { gunleriKos } from '../gun-dongusu.ts';
import { KosuKaydi } from '../kayit.ts';
import { DOSYA, adimSatiriOku } from '../sozlesme.ts';
import { rastgeleUret } from '../tohum.ts';
import type { Cevap, RolIstemcisi } from '../senaryo.ts';
import type { AdimSatiri } from '../sozlesme.ts';
import type { Hesap } from '../../hesaplar.ts';

const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-robot-cakisma-'));
after(() => { rmSync(gecici, { recursive: true, force: true }); });

describe('yarış sonucu', () => {
  it('tam biri geçer, öbürü 409 alırsa geçer', () => {
    assert.deepEqual(yarisSonucu([200, 409]), { tur: 'tek-gecti', kazanan: 0 });
    assert.deepEqual(yarisSonucu([409, 204]), { tur: 'tek-gecti', kazanan: 1 });
  });
  it('ikisi de geçerse kayıt iki kez yazılmıştır', () => {
    assert.deepEqual(yarisSonucu([200, 200]), { tur: 'iki-kez' });
    assert.match(String(yarisCiktisi('/api/x', [{ durum: 200, govde: {} }, { durum: 200, govde: {} }]).ileti), /iki kez/);
  });
  it('ikisi de reddedilirse ya da başka kod gelirse düşer, gövde iletiye girer', () => {
    assert.deepEqual(yarisSonucu([409, 409]), { tur: 'beklenmedik' });
    assert.deepEqual(yarisSonucu([200, 500]), { tur: 'beklenmedik' });
    const c = yarisCiktisi('/api/x', [{ durum: 403, govde: { kod: 'YETKI_YOK' } }, { durum: 409, govde: 'y' }]);
    assert.equal(c.sonuc, 'dustu');
    assert.equal(c.gelen, '403 + 409');
    assert.match(String(c.ileti), /YETKI_YOK/);
  });
});

describe('cevap okuyucuları', () => {
  const r = rastgeleUret(3);
  it('planlanacak emir: yalnız taslak ya da planlı, arşiv dışı; örnek veri robotunkinden önce', () => {
    const govde = { emirler: [
      { id: 1, durum: 'basladi', arsiv: false, urun: { kod: 'ORN-1' } },
      { id: 2, durum: 'planli', arsiv: true, urun: { kod: 'ORN-2' } },
      { id: 3, durum: 'taslak', arsiv: false, urun: { kod: 'BNZ-MALZEME-KAREMO-00001' } },
      { id: 4, durum: 'planli', arsiv: false, urun: { kod: 'ORN-4' } },
    ] };
    assert.equal(planlanacakEmirSec(govde, r)?.id, 4);
    assert.equal(planlanacakEmirSec({ emirler: [govde.emirler[2]] }, r)?.id, 3);
    assert.equal(planlanacakEmirSec({ emirler: [govde.emirler[0]] }, r), null);
    assert.equal(planlanacakEmirSec('bozuk', r), null);
  });
  it('çalışan emir: başlamış ve çalışma durumu dolu', () => {
    const govde = { emirler: [
      { id: 1, durum: 'planli', parcaNo: 'ORN-1', canli: null },
      { id: 2, durum: 'basladi', parcaNo: 'ORN-2', canli: { calisma: null } },
      { id: 3, durum: 'basladi', parcaNo: 'ORN-3', canli: { calisma: 'durakli' } },
    ] };
    assert.deepEqual(calisanEmirSec(govde, r), { id: 3, parcaNo: 'ORN-3', calisma: 'durakli' });
  });
  it('sürüm ve olay sayısı yoksa null döner, sıfır uydurulmaz', () => {
    assert.deepEqual(emirSurumuOku({ emir: { surum: 4, oncelik: 2 } }), { surum: 4, oncelik: 2 });
    assert.equal(emirSurumuOku({ emir: { oncelik: 2 } }), null);
    assert.equal(olaySayisi({ kayitlar: [{ olay: 'duraklat' }, { olay: 'devam' }, { olay: 'duraklat' }] }, 'duraklat'), 2);
    assert.equal(olaySayisi({ kod: 'YETKI_YOK' }, 'duraklat'), null);
  });
  it('iki yeni öncelik birbirinden ve mevcuttan farklı, 1-4 arasında', () => {
    for (let t = 0; t < 50; t += 1) {
      const mevcut = 1 + (t % 4);
      const [a, b] = ikiYeniOncelik(mevcut, rastgeleUret(t));
      assert.notEqual(a, b);
      assert.ok(a !== mevcut && b !== mevcut);
      assert.ok([a, b].every((o) => o >= 1 && o <= 4));
    }
  });
});

// Sunucunun davranışını taklit eden sahte istemci: öncelik sürüm denetimli, terminal komutu durum denetimli.
// `kilitsiz` açıkken sunucu denetimi yapmaz; senaryo iki kez yazmayı bulgu olarak yakalamalı.
function sahteSunucu(kilitsiz: boolean): { istemci: (h: Hesap) => RolIstemcisi; cagrilar: string[] } {
  const ust = { id: 7, durum: 'planli', arsiv: false, urun: { kod: 'ORN-7' }, oncelik: 3, surum: 5 };
  const terminal = { id: 9, durum: 'basladi', parcaNo: 'ORN-9', calisma: 'calisiyor', kayitlar: [{ olay: 'baslat' }] as { olay: string }[] };
  const cagrilar: string[] = [];
  const cevap = (durum: number, govde: unknown): Promise<Cevap> => new Promise((c) => { setTimeout(() => { c({ durum, govde }); }, 1); });
  const istemci = (h: Hesap): RolIstemcisi => ({
    istek(yontem, yol, govde) {
      cagrilar.push(`${h} ${yontem} ${yol}`);
      if (yol === '/api/adimli-emirler') return cevap(200, { emirler: [ust] });
      if (yol === '/api/adimli-emirler/7') return cevap(200, { emir: ust });
      if (yol === '/api/adimli-emirler/7/oncelik') {
        const g = govde as { oncelik: number; surum: number };
        if (!kilitsiz && g.surum !== ust.surum) return cevap(409, { kod: 'CAKISMA' });
        ust.oncelik = g.oncelik;
        ust.surum += 1;
        return cevap(200, { emir: ust });
      }
      if (yol === '/api/uretim-emirleri?durum=basladi') return cevap(200, { emirler: [{ ...terminal, canli: { calisma: terminal.calisma } }] });
      if (yol === '/api/uretim-emirleri/9') return cevap(200, { emir: terminal, kayitlar: terminal.kayitlar });
      const komut = yol.split('/').at(-1) ?? '';
      if (komut === 'duraklat' || komut === 'devam') {
        const izinli = komut === 'duraklat' ? terminal.calisma === 'calisiyor' : terminal.calisma !== 'calisiyor';
        if (!kilitsiz && !izinli) return cevap(409, { kod: 'CAKISMA' });
        terminal.calisma = komut === 'duraklat' ? 'durakli' : 'calisiyor';
        terminal.kayitlar.push({ olay: komut });
        return cevap(200, { emir: terminal });
      }
      return cevap(404, 'yok');
    },
  });
  return { istemci, cagrilar };
}

async function kos(kosuId: string, kilitsiz: boolean): Promise<{ satirlar: AdimSatiri[]; cagrilar: string[] }> {
  const kayit = new KosuKaydi({
    kok: gecici, kosuId, taban: null, tohum: 1, gunSayisi: 1, roller: [...cakisma.roller], senaryolar: [cakisma.ad],
    model: { kip: 'kapali', ustSinir: 0 },
  });
  const s = sahteSunucu(kilitsiz);
  await gunleriKos({ kayit, senaryolar: [cakisma], istemci: s.istemci, tohum: 1, gunSayisi: 1, esZamanli: 1 });
  const satirlar = readFileSync(join(kayit.klasor, DOSYA.adimlar), 'utf8').split('\n').filter((x) => x !== '')
    .map((x) => adimSatiriOku(x) as AdimSatiri);
  return { satirlar, cagrilar: s.cagrilar };
}

describe('cakisma senaryosu', () => {
  it('sürüm ve durum denetleyen sunucuda her adım geçer, emir bulunduğu hâle döner', async () => {
    const { satirlar, cagrilar } = await kos('dogru', false);
    assert.deepEqual(satirlar.filter((a) => a.sonuc !== 'gecti').map((a) => `${a.adim}: ${a.ileti ?? ''}`), []);
    assert.ok(satirlar.some((a) => a.adim === 'bayat sürümle yeniden yazar' && a.gelen === '409'));
    assert.equal(cagrilar.filter((c) => c.endsWith('/oncelik')).length, 3);
    const komutlar = cagrilar.filter((c) => /\/(duraklat|devam)$/.test(c));
    assert.deepEqual(komutlar.map((c) => c.split('/').at(-1)), ['duraklat', 'duraklat', 'devam', 'devam']);
    assert.deepEqual(komutlar.map((c) => c.split(' ')[0]), ['ornek.operator1', 'ornek.operator2', 'ornek.operator1', 'ornek.operator2']);
  });

  it('denetimsiz sunucuda iki kez yazma bulgu olarak düşer', async () => {
    const { satirlar } = await kos('kilitsiz', true);
    const dusen = satirlar.filter((a) => a.sonuc === 'dustu').map((a) => a.adim);
    assert.ok(dusen.includes('iki planlamacı aynı sürümle öncelik yazar'));
    assert.ok(dusen.includes('emir tek kez yazıldı'));
    assert.ok(dusen.includes('iki operatör aynı anda duraklat'));
    assert.ok(dusen.includes('duraklat defterde tek satır'));
  });

  it('uygun emir yoksa yazma gönderilmez, bağlanmamış sayılır', async () => {
    const kayit = new KosuKaydi({
      kok: gecici, kosuId: 'bos', taban: null, tohum: 1, gunSayisi: 1, roller: [...cakisma.roller], senaryolar: [cakisma.ad],
      model: { kip: 'kapali', ustSinir: 0 },
    });
    const yollar: string[] = [];
    const istemci = (): RolIstemcisi => ({ istek(y, yol) { yollar.push(`${y} ${yol}`); return Promise.resolve({ durum: 200, govde: { emirler: [] } }); } });
    await gunleriKos({ kayit, senaryolar: [cakisma], istemci, tohum: 1, gunSayisi: 1, esZamanli: 1 });
    assert.ok(yollar.every((y) => y.startsWith('GET ')));
    assert.equal(kayit.ozet.sayac.baglanmamis, 2);
    assert.equal(kayit.ozet.sayac.dustu, 0);
  });
});
