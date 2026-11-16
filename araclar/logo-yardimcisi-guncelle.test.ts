import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  paketSonrasiYardimci, yardimciGuncellemeAyariOku, yardimciKlasorAdi, yardimciyiGuncelle, type YardimciGuncellemeAdimlari, type YardimciSurumOkumasi,
} from './logo-yardimcisi-guncelle.ts';

const P = 'a'.repeat(64);
const ESKI = 'b'.repeat(64);
const SURE = { kapanma: 3000, acilma: 3000 };

// Sahte yardımcı: kapı ve çalışan özet bellekte; olaylar sırayla kaydedilir.
function sahte(o: { ozet?: string | null; ulasilamaz?: boolean; kapanmaz?: boolean; derlenmez?: boolean; yeniOzet?: string } = {}) {
  const olaylar: string[] = [];
  let calisan: string | null | undefined = o.ulasilamaz ? undefined : (o.ozet === undefined ? ESKI : o.ozet);
  const a: YardimciGuncellemeAdimlari = {
    surumOku: async (): Promise<YardimciSurumOkumasi> => (calisan === undefined ? { tur: 'ulasilamadi' } : { tur: 'ozet', ozet: calisan }),
    hazirla: async () => {
      olaylar.push('hazirla');
      if (o.derlenmez) throw new Error('testler.exe çıkış kodu 1');
      return 'ORN\\yeni\\cikti\\logo-yardimcisi.exe';
    },
    gostergeYaz: async (exe) => { olaylar.push(`gosterge ${exe}`); },
    kapat: async () => { olaylar.push('kapat'); if (!o.kapanmaz) calisan = undefined; },
    kapiBosMu: async () => calisan === undefined,
    baslat: () => {
      olaylar.push('baslat');
      if (calisan !== undefined) olaylar.push('IKI-YARDIMCI');
      calisan = o.yeniOzet ?? P;
    },
    bekle: async () => {},
  };
  return { a, olaylar };
}

describe('3314 Dilim 2: güncelleyici Logo yardımcısını yeniler', () => {
  test('eski çalışıyorsa: derle, gösterge, kapat, kapı boşalınca aç, özeti doğrula', async () => {
    const { a, olaylar } = sahte();
    const r = await yardimciyiGuncelle(P, a, SURE);
    assert.equal(r.sonuc, 'guncellendi');
    assert.deepEqual(olaylar, ['hazirla', 'gosterge ORN\\yeni\\cikti\\logo-yardimcisi.exe', 'kapat', 'baslat']);
  });

  test('zaten aynı özetse hiçbir şey yapılmaz', async () => {
    const { a, olaylar } = sahte({ ozet: P });
    assert.equal((await yardimciyiGuncelle(P, a, SURE)).sonuc, 'guncel');
    assert.deepEqual(olaylar, []);
  });

  test('(ret) derleme ya da test geçmezse eskisi kapatılmaz, gösterge yazılmaz', async () => {
    const { a, olaylar } = sahte({ derlenmez: true });
    const r = await yardimciyiGuncelle(P, a, SURE);
    assert.equal(r.sonuc, 'hata');
    assert.match(r.ileti, /eski yardımcı çalışıyor/);
    assert.deepEqual(olaylar, ['hazirla']);
  });

  test('(ret) eskisi kapanmazsa yenisi açılmaz: aynı anda iki yardımcı olmaz', async () => {
    const { a, olaylar } = sahte({ kapanmaz: true });
    const r = await yardimciyiGuncelle(P, a, SURE);
    assert.equal(r.sonuc, 'hata');
    assert.match(r.ileti, /iki yardımcı olmaz/);
    assert.ok(!olaylar.includes('baslat'));
  });

  test('eski exe sürüm bildirmiyorsa (404) da güncellenir; yardımcı çalışmıyorsa kapatmadan açılır', async () => {
    const eski = sahte({ ozet: null });
    assert.equal((await yardimciyiGuncelle(P, eski.a, SURE)).sonuc, 'guncellendi');
    const yok = sahte({ ulasilamaz: true });
    assert.equal((await yardimciyiGuncelle(P, yok.a, SURE)).sonuc, 'guncellendi');
    assert.ok(!yok.olaylar.includes('kapat'));
    assert.ok(!yok.olaylar.includes('IKI-YARDIMCI'));
  });

  test('(ret) yeni yardımcı paketin özetini bildirmezse hata; paket kaynaksızsa atlanır', async () => {
    const { a } = sahte({ yeniOzet: ESKI.replace('b', 'c') });
    assert.equal((await yardimciyiGuncelle(P, a, SURE)).sonuc, 'hata');
    assert.equal((await yardimciyiGuncelle(null, sahte().a, SURE)).sonuc, 'atlandi');
  });

  test('ayar: kurulum yoksa kapalı; eksik değişken adıyla söylenir, değeri söylenmez', async () => {
    assert.equal(yardimciGuncellemeAyariOku({}), null);
    const tam = { TMIV2_LOGO_YARDIMCI_KURULUM: '/orn/kurulum', TMIV2_LOGO_YARDIMCI_BASLAT: '/orn/kurulum/baslat.cmd', TMIV2_LOGO_KOPRU_ADRESI: 'http://127.0.0.1:4195/', TMIV2_LOGO_KOPRU_ANAHTARI: 'gizli-anahtar-0123456' };
    assert.deepEqual(yardimciGuncellemeAyariOku(tam), { kurulum: '/orn/kurulum', baslat: '/orn/kurulum/baslat.cmd', adres: 'http://127.0.0.1:4195', anahtar: 'gizli-anahtar-0123456' });
    const eksik = yardimciGuncellemeAyariOku({ ...tam, TMIV2_LOGO_YARDIMCI_BASLAT: '' });
    assert.ok(eksik !== null && 'hata' in eksik && /TMIV2_LOGO_YARDIMCI_BASLAT/.test(eksik.hata));
    const anahtarsiz = yardimciGuncellemeAyariOku({ ...tam, TMIV2_LOGO_KOPRU_ANAHTARI: '' });
    assert.ok(anahtarsiz !== null && 'hata' in anahtarsiz && !anahtarsiz.hata.includes('gizli'));
    assert.equal((await paketSonrasiYardimci({}, '/orn', '2099.01.01-1')).sonuc, 'atlandi');
  });

  test('klasör adı sürüm ve özetten; yol karakteri taşımaz', () => {
    assert.equal(yardimciKlasorAdi('2099.01.01-1', P), 'logo-yardimcisi-2099.01.01-1-aaaaaaaa');
    assert.equal(yardimciKlasorAdi('a/b\\c', P), 'logo-yardimcisi-a-b-c-aaaaaaaa');
  });
});
