import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  GOSTERGE_DOSYASI, paketSonrasiYardimci, yardimciAdimlari, yardimciGuncellemeAyariOku, yardimciKlasorAdi, yardimciyiGuncelle, type YardimciGuncellemeAdimlari, type YardimciSurumOkumasi,
} from './logo-yardimcisi-guncelle.ts';

const P = 'a'.repeat(64);
const ESKI = 'b'.repeat(64);
const SURE = { kapanma: 3000, acilma: 3000 };

// Sahte yardımcı: kapı, çalışan özet ve gösterge bellekte; olaylar sırayla kaydedilir. Başlatma betiği göstergedeki exe'yi açar.
const YENI_EXE = 'ORN\\yeni\\cikti\\logo-yardimcisi.exe';
const ESKI_EXE = 'ORN\\eski\\cikti\\logo-yardimcisi.exe';
function sahte(o: {
  ozet?: string | null; ulasilamaz?: boolean; kapanmaz?: boolean; derlenmez?: boolean; yeniOzet?: string; gosterge?: string | null;
  kapiHepDolu?: boolean;
} = {}) {
  const olaylar: string[] = [];
  const eskiOzet = o.ozet === undefined ? ESKI : o.ozet;
  let calisan: string | null | undefined = o.ulasilamaz ? undefined : eskiOzet;
  let gosterge: string | null = o.gosterge === undefined ? ESKI_EXE : o.gosterge;
  const a: YardimciGuncellemeAdimlari = {
    surumOku: async (): Promise<YardimciSurumOkumasi> => (calisan === undefined ? { tur: 'ulasilamadi' } : { tur: 'ozet', ozet: calisan }),
    hazirla: async () => {
      olaylar.push('hazirla');
      if (o.derlenmez) throw new Error('testler.exe çıkış kodu 1');
      return YENI_EXE;
    },
    gostergeOku: async () => gosterge,
    gostergeYaz: async (exe) => { olaylar.push(`gosterge ${exe}`); gosterge = exe; },
    kapat: async () => { olaylar.push('kapat'); if (!o.kapanmaz) calisan = undefined; },
    kapiBosMu: async () => !o.kapiHepDolu && calisan === undefined,
    baslat: () => {
      olaylar.push('baslat');
      if (calisan !== undefined || o.kapiHepDolu) olaylar.push('IKI-YARDIMCI');
      calisan = gosterge === YENI_EXE ? (o.yeniOzet ?? P) : eskiOzet;
    },
    bekle: async () => {},
  };
  return { a, olaylar, calisan: () => calisan, gosterge: () => gosterge };
}

describe('3314 Dilim 2: güncelleyici Logo yardımcısını yeniler', () => {
  test('eski çalışıyorsa: derle, gösterge, kapat, kapı boşalınca aç, özeti doğrula', async () => {
    const { a, olaylar } = sahte();
    const r = await yardimciyiGuncelle(P, a, SURE);
    assert.equal(r.sonuc, 'guncellendi');
    assert.deepEqual(olaylar, ['hazirla', `gosterge ${YENI_EXE}`, 'kapat', 'baslat']);
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

  test('(ret) yeni yardımcı paketin özetini bildirmezse eskisine dönülür: gösterge geri yazılır, eskisi açılır ve doğrulanır', async () => {
    const s = sahte({ yeniOzet: 'c'.repeat(64) });
    const r = await yardimciyiGuncelle(P, s.a, SURE);
    assert.equal(r.sonuc, 'hata');
    assert.match(r.ileti, /eskisine dönüldü/);
    assert.deepEqual(s.olaylar, ['hazirla', `gosterge ${YENI_EXE}`, 'kapat', 'baslat', `gosterge ${ESKI_EXE}`, 'kapat', 'baslat']);
    assert.equal(s.gosterge(), ESKI_EXE, 'yeniden açılışta da eskisi gelir');
    assert.equal(s.calisan(), ESKI, 'eski özet çalışıyor');
    assert.equal((await yardimciyiGuncelle(null, sahte().a, SURE)).sonuc, 'atlandi');
  });

  test('(ret) ilk geçişte gösterge yoksa dönülecek exe yoktur; bu ayrı iletiyle söylenir', async () => {
    const s = sahte({ yeniOzet: 'c'.repeat(64), gosterge: null });
    const r = await yardimciyiGuncelle(P, s.a, SURE);
    assert.equal(r.sonuc, 'hata');
    assert.match(r.ileti, /gösterge dosyası önceden yoktu/);
    assert.ok(!r.ileti.includes('eskisine dönüldü'));
    assert.equal(s.olaylar.filter((x) => x === 'baslat').length, 1, 'ikinci kez başlatılmaz');
  });

  test('(ret) T3: kapı dolu ama sürüm okunamıyorsa yenisi başlatılmaz (iki yardımcı olmaz)', async () => {
    const s = sahte({ ulasilamaz: true, kapiHepDolu: true });
    const r = await yardimciyiGuncelle(P, s.a, SURE);
    assert.equal(r.sonuc, 'hata');
    assert.match(r.ileti, /Yardımcı kapısı dolu ama sürüm okunamadı/);
    assert.ok(!s.olaylar.includes('baslat'));
    assert.ok(!s.olaylar.includes('kapat'), 'sürümü bilinmeyen sürece kapat gönderilmez');
  });

  test('ayar: kurulum yoksa kapalı; eksik değişken adıyla söylenir, değeri söylenmez', async () => {
    assert.equal(yardimciGuncellemeAyariOku({}), null);
    const tam = { TMIV2_LOGO_YARDIMCI_KURULUM: '/orn/kurulum', TMIV2_LOGO_YARDIMCI_BASLAT: '/orn/kurulum/baslat.cmd', TMIV2_LOGO_KOPRU_ADRESI: 'http://127.0.0.1:4195/', TMIV2_LOGO_KOPRU_ANAHTARI: 'gizli-anahtar-0123456' };
    assert.deepEqual(yardimciGuncellemeAyariOku(tam), { kurulum: '/orn/kurulum', baslat: '/orn/kurulum/baslat.cmd', adres: 'http://127.0.0.1:4195', anahtar: 'gizli-anahtar-0123456' });
    const eksik = yardimciGuncellemeAyariOku({ ...tam, TMIV2_LOGO_YARDIMCI_BASLAT: '' });
    assert.ok(eksik !== null && 'hata' in eksik && /TMIV2_LOGO_YARDIMCI_BASLAT/.test(eksik.hata));
    const anahtarsiz = yardimciGuncellemeAyariOku({ ...tam, TMIV2_LOGO_KOPRU_ANAHTARI: '' });
    assert.ok(anahtarsiz !== null && 'hata' in anahtarsiz && !anahtarsiz.hata.includes('gizli'));
    const disAdres = yardimciGuncellemeAyariOku({ ...tam, TMIV2_LOGO_KOPRU_ADRESI: 'http://10.0.0.5:4195' });
    assert.ok(disAdres !== null && 'hata' in disAdres && /127\.0\.0\.1/.test(disAdres.hata), 'anahtar başka adrese gönderilmez');
    assert.equal((await paketSonrasiYardimci({}, '/orn', '2099.01.01-1')).sonuc, 'atlandi');
  });

  test('(ret) Risk N2: hedef klasör göstergedeki çalışan klasörse hazırlık silmeden hata verir', async () => {
    const kurulum = mkdtempSync(join(tmpdir(), 'orn-yardimci-'));
    try {
      const ad = yardimciKlasorAdi('2099.01.01-1', P);
      const calisanKlasor = join(kurulum, ad);
      mkdirSync(join(calisanKlasor, 'cikti'), { recursive: true });
      writeFileSync(join(calisanKlasor, 'cikti', 'logo-yardimcisi.exe'), 'x');
      writeFileSync(join(kurulum, GOSTERGE_DOSYASI), `${join(calisanKlasor, 'cikti', 'logo-yardimcisi.exe')}\r\n`);
      const ayar = { kurulum, baslat: join(kurulum, 'baslat.cmd'), adres: 'http://127.0.0.1:4195', anahtar: 'orn-anahtar' };
      const adimlar = yardimciAdimlari(ayar, join(kurulum, 'yok-kaynak'), ad);
      await assert.rejects(adimlar.hazirla(), /çalışan yardımcının klasörü/);
      assert.ok(existsSync(join(calisanKlasor, 'cikti', 'logo-yardimcisi.exe')), 'çalışan exe silinmedi');
      assert.equal(await adimlar.gostergeOku(), join(calisanKlasor, 'cikti', 'logo-yardimcisi.exe'));
    } finally {
      rmSync(kurulum, { recursive: true, force: true });
    }
  });

  test('klasör adı sürüm ve özetten; yol karakteri taşımaz', () => {
    assert.equal(yardimciKlasorAdi('2099.01.01-1', P), 'logo-yardimcisi-2099.01.01-1-aaaaaaaa');
    assert.equal(yardimciKlasorAdi('a/b\\c', P), 'logo-yardimcisi-a-b-c-aaaaaaaa');
  });
});
