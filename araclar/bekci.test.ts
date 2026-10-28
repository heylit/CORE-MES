import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { UYGULANIYOR_DOSYASI } from '../sunucu/moduller/ayarlar/disari.ts';
import {
  ACILIS_PAYI_MS, Bekci, GUNCELLEME_ISARETI, GUNCELLEME_PAYI_MS, KARARLI_MS, YOKLAMA_ARALIGI_MS, baslangicBetigi, baslangicKlasoru, beklemeMs, guncellemeSuruyorMu, gunlukDosyasi,
  type BekciOrtami,
} from './bekci.ts';
import { ISARET_YENILEME_MS } from './guncelleyici.ts';

// Sahte saat ve süreç: her açılış verilen süre ayakta kalır ve verilen kodla kapanır.
function sahte(acilislar: { sure: number; kod: number | null; sinyal?: string }[], durdurAn?: number) {
  let saat = 0;
  const iz: string[] = [];
  const beklemeler: number[] = [];
  let bekci: Bekci | undefined;
  let sira = 0;
  const o: BekciOrtami = {
    baslat: () => {
      const a = acilislar[sira++];
      if (a === undefined) {
        bekci?.durdur();
        return { kapandi: Promise.resolve({ kod: 0, sinyal: null }), sonlandir: () => undefined };
      }
      saat += a.sure;
      if (durdurAn === sira) bekci?.durdur();
      return { kapandi: Promise.resolve({ kod: a.kod, sinyal: a.sinyal ?? null }), sonlandir: () => undefined };
    },
    bekle: (ms) => { beklemeler.push(ms); saat += ms; return Promise.resolve(); },
    simdi: () => saat,
    yaz: (satir) => { iz.push(satir); },
  };
  bekci = new Bekci(o);
  return { bekci, iz, beklemeler, acilisSayisi: () => sira };
}

test('çöken sunucu yeniden açılır; art arda çöküşte bekleme 5 sn\'den 60 sn\'ye kadar uzar, uzun süre ayakta kalınca sıfırlanır', async () => {
  const { bekci, iz, beklemeler } = sahte([
    { sure: 1_000, kod: 1 }, { sure: 1_000, kod: 1 }, { sure: 1_000, kod: 1 }, { sure: 1_000, kod: 1 }, { sure: 1_000, kod: 1 },
    { sure: 1_000, kod: 1 }, { sure: KARARLI_MS, kod: 1 }, { sure: 1_000, kod: null, sinyal: 'SIGKILL' },
  ]);
  await bekci.calistir();
  assert.deepEqual(beklemeler, [5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 5_000, 10_000]);
  assert.ok(iz.includes('Sunucu kapandı (çıkış 1); 5 sn sonra yeniden açılacak.'), iz.join('\n'));
  assert.ok(iz.includes('Sunucu kapandı (sinyal SIGKILL); 10 sn sonra yeniden açılacak.'), iz.join('\n'));
  assert.equal(iz.at(-1), 'Bekçi durdu; sunucu yeniden açılmayacak.');
});

test('kapanış istenince (Ctrl+C, pencere kapanışı) sunucu yeniden açılmaz', async () => {
  const { bekci, beklemeler, acilisSayisi } = sahte([{ sure: 1_000, kod: 0 }, { sure: 1_000, kod: 1 }], 1);
  await bekci.calistir();
  assert.equal(acilisSayisi(), 1);
  assert.deepEqual(beklemeler, []);
});

test('bekleme süresi art arda çöküş sayısıyla katlanır, 60 sn\'yi aşmaz', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 50].map(beklemeMs), [5_000, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
});

test('günlük deponun yanındaki TMIV2-GUNLUK klasörüne yazılır, içine değil', () => {
  const depo = path.resolve('/kullanici/Desktop/TMICOREV2');
  const dosya = gunlukDosyasi(depo);
  assert.equal(dosya, path.resolve('/kullanici/Desktop/TMIV2-GUNLUK/bekci.log'));
  assert.ok(!dosya.startsWith(depo + path.sep));
});

test('Başlangıç betiği depo klasöründe bekçiyi küçültülmüş pencerede açar; tırnak ya da % taşıyan yol reddedilir', () => {
  const betik = baslangicBetigi('C:\\Users\\kullanici\\Masaüstü\\TMICOREV2', 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(betik, [
    '@echo off',
    'rem TMI CORE V2: oturum acilinca sunucuyu bekciyle baslatir. Kaldirmak icin: npm run otomatik-baslat -- kaldir',
    'chcp 65001 >nul',
    'cd /d "C:\\Users\\kullanici\\Masaüstü\\TMICOREV2"',
    'start "TMIV2 sunucu" /min "C:\\Program Files\\nodejs\\node.exe" araclar\\bekci.ts',
    '',
  ].join('\r\n'));
  assert.throws(() => baslangicBetigi('C:\\a%PATH%b', 'C:\\node.exe'), /" ya da %/);
  assert.throws(() => baslangicBetigi('C:\\a', 'C:\\no"de.exe'), /" ya da %/);
});

test('Başlangıç klasörü kullanıcının APPDATA klasöründedir (yönetici istemez); APPDATA yoksa açık hata', () => {
  assert.equal(baslangicKlasoru({ APPDATA: 'C:\\Users\\k\\AppData\\Roaming' }),
    'C:\\Users\\k\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup');
  assert.throws(() => baslangicKlasoru({}), /APPDATA/);
});

// Donan sunucu: süreç ayaktadır ama yoklamaya cevap vermez; ancak sonlandırılınca kapanır.
test('donan sunucu: açılış payından sonra art arda üç yoklama cevapsızsa sonlandırılıp yeniden açılır', async () => {
  let saat = 0;
  const iz: string[] = [];
  const beklemeler: number[] = [];
  let acilis = 0;
  let yoklama = 0;
  let sonlandirilan = 0;
  let bekci: Bekci | undefined;
  const o: BekciOrtami = {
    baslat: () => {
      acilis += 1;
      if (acilis === 2) { bekci?.durdur(); return { kapandi: Promise.resolve({ kod: 0, sinyal: null }), sonlandir: () => undefined }; }
      let kapat: (s: { kod: number | null; sinyal: string | null }) => void = () => undefined;
      const kapandi = new Promise<{ kod: number | null; sinyal: string | null }>((coz) => { kapat = coz; });
      return { kapandi, sonlandir: () => { sonlandirilan += 1; kapat({ kod: null, sinyal: 'SIGKILL' }); } };
    },
    bekle: (ms) => { beklemeler.push(ms); saat += ms; return Promise.resolve(); },
    simdi: () => saat,
    yaz: (satir) => { iz.push(satir); },
    // İlk iki yoklama cevaplı (sunucu çalışıyor), sonra donar; cevaplı yoklama sayacı sıfırlar.
    yokla: () => { yoklama += 1; return Promise.resolve(yoklama <= 2 || yoklama === 4); },
  };
  bekci = new Bekci(o);
  await bekci.calistir();
  assert.equal(sonlandirilan, 1);
  assert.equal(acilis, 2);
  assert.equal(yoklama, 7);
  assert.equal(beklemeler[0], ACILIS_PAYI_MS);
  assert.ok(beklemeler.includes(YOKLAMA_ARALIGI_MS));
  assert.ok(iz.includes('Sunucu art arda 3 yoklamada cevap vermedi; sonlandırılıp yeniden açılacak.'), iz.join('\n'));
  assert.ok(iz.includes('Sunucu kapandı (sinyal SIGKILL); 5 sn sonra yeniden açılacak.'), iz.join('\n'));
});

test('kendiliğinden kapanan sunucuda yoklama durur; yoklama yoksa (eski ortam) yalnız kapanış izlenir', async () => {
  let yoklama = 0;
  let acilis = 0;
  let bekci: Bekci | undefined;
  let kapat: () => void = () => undefined;
  const o: BekciOrtami = {
    baslat: () => {
      acilis += 1;
      if (acilis === 2) { bekci?.durdur(); return { kapandi: Promise.resolve({ kod: 0, sinyal: null }), sonlandir: () => undefined }; }
      return { kapandi: new Promise((coz) => { kapat = () => { coz({ kod: 1, sinyal: null }); }; }), sonlandir: () => { throw new Error('sonlandırılmamalı'); } };
    },
    bekle: () => Promise.resolve(),
    simdi: () => 0,
    yaz: () => undefined,
    yokla: () => { yoklama += 1; if (yoklama === 2) kapat(); return Promise.resolve(true); },
  };
  bekci = new Bekci(o);
  await bekci.calistir();
  assert.equal(acilis, 2);
  assert.equal(yoklama, 2);
});

// Güncelleyici sunucuyu kapatıp yedek ve göç yaparken sağlık ucu cevap vermez; o sırada ağacı kapatmak göçü yarıda keser (denetim #8).
test('güncelleme sürerken cevapsız yoklama sayılmaz; güncelleme bitince sayaç baştan işler', async () => {
  const iz: string[] = [];
  let acilis = 0;
  let yoklama = 0;
  let sonlandirilan = 0;
  let bekci: Bekci | undefined;
  const o: BekciOrtami = {
    baslat: () => {
      acilis += 1;
      if (acilis === 2) { bekci?.durdur(); return { kapandi: Promise.resolve({ kod: 0, sinyal: null }), sonlandir: () => undefined }; }
      let kapat: (s: { kod: number | null; sinyal: string | null }) => void = () => undefined;
      const kapandi = new Promise<{ kod: number | null; sinyal: string | null }>((coz) => { kapat = coz; });
      return { kapandi, sonlandir: () => { sonlandirilan += 1; kapat({ kod: null, sinyal: 'SIGKILL' }); } };
    },
    bekle: () => Promise.resolve(),
    simdi: () => 0,
    yaz: (satir) => { iz.push(satir); },
    // Sunucu hiç cevap vermez; ilk on yoklamada güncelleme sürüyor.
    yokla: () => { yoklama += 1; return Promise.resolve(false); },
    guncellemeSuruyor: () => yoklama <= 10,
  };
  bekci = new Bekci(o);
  await bekci.calistir();
  assert.equal(sonlandirilan, 1);
  assert.equal(yoklama, 13);
  assert.equal(iz.filter((s) => s.startsWith('Güncelleme sürüyor')).length, 1, iz.join('\n'));
});

test('güncelleme işareti yoksa ya da güncelleme payından eskiyse (takılan güncelleyici) güncelleme sürmüyor sayılır', () => {
  const simdi = 10 * GUNCELLEME_PAYI_MS;
  assert.equal(guncellemeSuruyorMu(null, simdi), false);
  assert.equal(guncellemeSuruyorMu(simdi - 60_000, simdi), true);
  assert.equal(guncellemeSuruyorMu(simdi - GUNCELLEME_PAYI_MS - 1, simdi), false);
  assert.equal(GUNCELLEME_ISARETI, UYGULANIYOR_DOSYASI);
  // Güncelleyici işareti bu aralıkla yeniler; bir iki yenileme kaçsa da pay dolmamalı.
  assert.ok(GUNCELLEME_PAYI_MS >= 3 * ISARET_YENILEME_MS);
});
