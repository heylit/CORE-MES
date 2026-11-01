import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { adrDenetle, depodanGirdi, dosyaDurumu, kodAtiflariniBul, type Girdi } from './adr-denetimi.ts';

const BASLIK = '| No | Başlık | Durum | Değiştirir | Değiştiren | Geçerli özet | Çapa |\n|---|---|---|---|---|---|---|\n';
const satir = (no: string, durum: string, degistirir: string, degistiren: string, capa: string) =>
  `| ${no} | Başlık | ${durum} | ${degistirir} | ${degistiren} | Özet. | ${capa} |\n`;
const adr = (no: string, durum: string, govde = '') => ({ no, dosya: `${no}-deneme.md`, metin: `# ADR ${no} — Deneme\n\nDurum: ${durum} (01.11.2026).\n\n${govde}` });

const DOSYALAR: Record<string, string> = { 'sunucu/a.ts': 'export function birIs() {}\n' };
function girdi(ek: Partial<Girdi> = {}): Girdi {
  return {
    dizin: BASLIK + satir('0001', 'kabul', '-', '0002', 'sunucu/a.ts#birIs') + satir('0002', 'kabul', '0001', '-', '-'),
    adrler: [adr('0001', 'kabul edildi'), adr('0002', 'kabul', 'ADR 0001 madde 1\'i değiştirir.')],
    claude: 'İstisna (ADR 0001).\n',
    kodAtiflari: [],
    yolVarMi: (yol) => yol in DOSYALAR || yol === 'sunucu',
    dosyaOku: (yol) => DOSYALAR[yol] ?? null,
    ...ek,
  };
}

test('ADR denetimi: tutarlı dizin, dosya ve CLAUDE.md temiz', () => {
  assert.deepEqual(adrDenetle(girdi()), []);
});

test('ADR denetimi: dosyadaki "kabul edildi" dizindeki "kabul" sayılır, ilk ayraca kadar okunur', () => {
  assert.equal(dosyaDurumu('Durum: kabul edildi (05.10.2026). ADR 0003 ile'), 'kabul');
  assert.equal(dosyaDurumu('Durum: kısmen yerine geçildi. 1, 2'), 'kısmen yerine geçildi');
  assert.equal(dosyaDurumu('Durum: ertelendi (1493 c): askıda'), 'ertelendi');
  assert.equal(dosyaDurumu('# Durumsuz'), null);
});

test('ADR denetimi: kopan çapa ve dosyada olmayan ad reddedilir', () => {
  const kopuk = girdi({ dizin: BASLIK + satir('0001', 'kabul', '-', '0002', 'sunucu/yok.ts, sunucu/a.ts#kalkanIs') + satir('0002', 'kabul', '0001', '-', '-') });
  assert.deepEqual(adrDenetle(kopuk), ['ADR 0001: çapa yok: sunucu/yok.ts', 'ADR 0001: çapadaki ad dosyada yok: sunucu/a.ts#kalkanIs']);
});

test('ADR denetimi: tek yönlü değiştirme bağı reddedilir', () => {
  const tekYon = girdi({ dizin: BASLIK + satir('0001', 'kabul', '-', '-', '-') + satir('0002', 'kabul', '0001', '-', '-') });
  assert.deepEqual(adrDenetle(tekYon), ["ADR 0002: 0001'yi değiştirir, ama 0001'nin Değiştiren sütununda yok"]);
});

test('ADR denetimi: listede olmayan durum ve dosya ile dizin arasındaki durum farkı reddedilir', () => {
  const g = girdi({ dizin: BASLIK + satir('0001', 'geçerli', '-', '0002', '-') + satir('0002', 'kabul', '0001', '-', '-'), claude: '' });
  assert.deepEqual(adrDenetle(g), ['ADR 0001: dizindeki durum listede yok: "geçerli"', 'ADR 0001: dosyadaki durum "kabul", dizindeki "geçerli"']);
});

test('ADR denetimi: dizinde olmayan dosya ve dosyası olmayan dizin satırı reddedilir', () => {
  const g = girdi({ adrler: [adr('0001', 'kabul'), adr('0003', 'kabul')] });
  assert.deepEqual(adrDenetle(g), ['ADR 0002: dizinde var, dosyası yok', 'ADR 0003: dosyası var, dizinde yok (0003-deneme.md)']);
});

test('ADR denetimi: depo dışı yol, IP adresi ve olmayan ADR\'ye atıf reddedilir; 127.0.0.1 ve sürüm numarası geçer', () => {
  const g = girdi({ adrler: [adr('0001', 'kabul', 'Kurgu /mnt/proje/x.md. Adres 192.0.2.10:587. Yalnız 127.0.0.1; sürüm 1.2.3. ADR 0009.'), adr('0002', 'kabul')] });
  assert.deepEqual(adrDenetle(g), [
    'ADR 0001: depo dışı yol (/mnt/) yazılmış',
    'ADR 0001: IP adresi yazılmış: 192.0.2.10',
    "ADR 0001: olmayan ADR'ye atıf: 0009",
  ]);
});

test('ADR denetimi: CLAUDE.md yürürlükte olmayan ADR\'ye durumu söylemeden atıf yapamaz', () => {
  const dizin = BASLIK + satir('0001', 'kabul', '-', '0002', '-') + satir('0002', 'kabul', '0001', '-', '-') + satir('0003', 'ertelendi', '-', '-', '-');
  const adrler = [adr('0001', 'kabul'), adr('0002', 'kabul'), adr('0003', 'ertelendi')];
  assert.deepEqual(adrDenetle(girdi({ dizin, adrler, claude: 'a\nDış erişim (ADR 0003).\nYok (ADR 0004).\n' })), [
    'CLAUDE.md:2: ADR 0003 "ertelendi" durumunda; satır bunu söylemeden atıf yapıyor',
    "CLAUDE.md:3: olmayan ADR'ye atıf: 0004",
  ]);
  assert.deepEqual(adrDenetle(girdi({ dizin, adrler, claude: 'Dış erişim askıda (ADR 0003 ertelendi).\r\n' })), []);
});

test('ADR denetimi: koddaki atıf bulunur; olmayan, yerine geçilmiş ve kaldırılmış ADR\'ye atıf reddedilir, kısmen yerine geçilmişe izin verilir', () => {
  assert.deepEqual(kodAtiflariniBul('sunucu/b.ts', '// Neden: ADR 0002 karar 1.\nconst x = 1; // ADR-0003, ADR0004\nADR 00051 değil'), [
    { yol: 'sunucu/b.ts', satir: 1, no: '0002' },
    { yol: 'sunucu/b.ts', satir: 2, no: '0003' },
    { yol: 'sunucu/b.ts', satir: 2, no: '0004' },
  ]);
  const dizin = BASLIK + satir('0001', 'kısmen yerine geçildi', '-', '0002', '-') + satir('0002', 'kabul', '0001, 0003', '-', '-')
    + satir('0003', 'yerine geçildi', '-', '0002', '-') + satir('0004', 'kaldırıldı', '-', '-', '-');
  const adrler = [adr('0001', 'kısmen yerine geçildi'), adr('0002', 'kabul'), adr('0003', 'yerine geçildi'), adr('0004', 'kaldırıldı')];
  const kodAtiflari = ['0001', '0002', '0003', '0004', '0009'].map((no, i) => ({ yol: 'sunucu/b.ts', satir: i + 1, no }));
  assert.deepEqual(adrDenetle(girdi({ dizin, adrler, claude: '', kodAtiflari })), [
    'sunucu/b.ts:3: ADR 0003 "yerine geçildi"; kod yürürlükteki karara atıf yapmalı',
    'sunucu/b.ts:4: ADR 0004 "kaldırıldı"; kod yürürlükteki karara atıf yapmalı',
    "sunucu/b.ts:5: olmayan ADR'ye atıf: 0009",
  ]);
});

test('ADR denetimi: 0025 ve sonrası şablon başlıklarını taşır; eski ADR\'den istenmez', () => {
  const tam = '## Bağlam\n\nx\n\n## Karar\n\ny\n\n## Sonuçlar\n\nz\n';
  const dizin = BASLIK + satir('0001', 'kabul', '-', '0002', '-') + satir('0002', 'kabul', '0001', '-', '-')
    + satir('0025', 'kabul', '-', '-', '-') + satir('0026', 'kabul', '-', '-', '-');
  const adrler = [adr('0001', 'kabul'), adr('0002', 'kabul'), adr('0025', 'kabul', tam), adr('0026', 'kabul', '## Bağlam\n\nx\n')];
  assert.deepEqual(adrDenetle(girdi({ dizin, adrler })), ['ADR 0026: şablon başlığı yok: ## Karar', 'ADR 0026: şablon başlığı yok: ## Sonuçlar']);
});

test('ADR denetimi: yerine geçilmiş ADR Değiştiren sütununu boş bırakamaz', () => {
  const dizin = BASLIK + satir('0001', 'kabul', '-', '0002', '-') + satir('0002', 'kabul', '0001', '-', '-')
    + satir('0003', 'yerine geçildi', '-', '-', '-') + satir('0004', 'kısmen yerine geçildi', '-', '-', '-');
  const adrler = [adr('0001', 'kabul'), adr('0002', 'kabul'), adr('0003', 'yerine geçildi'), adr('0004', 'kısmen yerine geçildi')];
  assert.deepEqual(adrDenetle(girdi({ dizin, adrler, claude: '' })), [
    'ADR 0003: "yerine geçildi" ama Değiştiren sütunu boş',
    'ADR 0004: "kısmen yerine geçildi" ama Değiştiren sütunu boş',
  ]);
});

test('ADR denetimi: depodaki ADR dizini, ADR dosyaları ve CLAUDE.md tutarlı', () => {
  const kok = resolve(fileURLToPath(import.meta.url), '..', '..');
  assert.deepEqual(adrDenetle(depodanGirdi(kok)), []);
});
