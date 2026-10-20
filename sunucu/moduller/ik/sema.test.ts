import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { DONEM_ALANLARI, GENEL_AYAR_ALANLARI, ORTAK_SUTUNLAR, TUR_TANIMLARI } from './sema.ts';
import type { Alan, Tip } from './sema.ts';

// Göç sema.ts'ten üretildi; tanım değişip göç değişmezse (ya da tersi) eşleyici olmayan sütuna yazar. Bu test ikisini bağlar.
const PG_TIPI: Record<Tip, string> = {
  metin: 'text', tarih: 'date', ay: 'date', tutar: 'numeric(14,2)', hesap: 'numeric(20,6)', sayi: 'numeric(14,4)', tamsayi: 'integer',
  mantik: 'boolean', saat: 'time without time zone', zaman: 'timestamp with time zone',
};

describe('İK şeması: tanım ile veritabanı aynı', () => {
  let ortam: TestVeritabani | undefined;
  const sutunlar = new Map<string, Map<string, { tip: string; bos: boolean }>>();
  before(async () => {
    ortam = await testVeritabaniKur('ik_sema');
    const satirlar = await ortam.vt.sorgu<{ tablo: string; sutun: string; tip: string; bos: boolean }>(
      `SELECT c.relname AS tablo, a.attname AS sutun, format_type(a.atttypid, a.atttypmod) AS tip, NOT a.attnotnull AS bos
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema() AND c.relname LIKE 'ik\\_%' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`,
    );
    for (const s of satirlar) {
      const t = sutunlar.get(s.tablo) ?? new Map<string, { tip: string; bos: boolean }>();
      t.set(s.sutun, { tip: s.tip, bos: s.bos });
      sutunlar.set(s.tablo, t);
    }
  });
  after(async () => { await ortam?.kaldir(); });

  const denetle = (tablo: string, alanlar: readonly Alan[], onek = ''): void => {
    const t = sutunlar.get(tablo);
    assert.ok(t, `tablo yok: ${tablo}`);
    for (const a of alanlar) {
      const s = t.get(onek + a.s);
      assert.ok(s, `${tablo}.${onek}${a.s} sütunu yok`);
      assert.equal(s.tip, PG_TIPI[a.t], `${tablo}.${onek}${a.s} tipi`);
      if (a.zorunlu) assert.equal(s.bos, false, `${tablo}.${onek}${a.s} zorunlu olmalı`);
    }
  };

  test('her ana tablo tanımdaki her alanı ve ortak sütunları taşır; fazladan sütun yok', () => {
    for (const t of Object.values(TUR_TANIMLARI)) {
      denetle(t.tablo, t.alanlar);
      const beklenen = new Set<string>([...ORTAK_SUTUNLAR, ...t.alanlar.map((a) => a.s)]);
      if (t.ozet) {
        for (const a of t.ozet.alanlar) beklenen.add(t.ozet.onek + a.s);
        for (const n of t.ozet.nesneler) {
          beklenen.add(`${t.ozet.onek}${n.onek}var`);
          denetle(t.tablo, n.alanlar, t.ozet.onek + n.onek);
          for (const a of n.alanlar) beklenen.add(t.ozet.onek + n.onek + a.s);
        }
        denetle(t.tablo, t.ozet.alanlar, t.ozet.onek);
      }
      const ekler: Record<string, string[]> = {
        ik_pozisyon: ['gonderen_kisi_id', 'onaylayan_kisi_id', 'onaylama', 'dort_gozsuz_onay'], ik_izin: ['karar_veren_kisi_id'],
        ik_bordro: ['parametre_donemi_no', 'kesinlestiren_kisi_id'],
      };
      for (const e of ekler[t.tablo] ?? []) beklenen.add(e);
      assert.deepEqual([...sutunlar.get(t.tablo)!.keys()].filter((s) => !beklenen.has(s)), [], `${t.tablo} fazladan sütun`);
    }
  });

  test('her alt liste kendi tablosunda, ana kayda bağlı', () => {
    for (const t of Object.values(TUR_TANIMLARI)) {
      for (const l of [...t.listeler, ...(t.ozet?.listeler ?? [])]) {
        denetle(l.tablo, l.alanlar);
        assert.ok(sutunlar.get(l.tablo)!.has(t.bagSutunu), `${l.tablo}.${t.bagSutunu}`);
        if (l.anahtar) assert.ok(sutunlar.get(l.tablo)!.has(l.anahtar), `${l.tablo}.${l.anahtar}`);
      }
    }
  });

  test('ayar tabloları tanımdaki alanları taşır; JSON sütun yok', () => {
    denetle('ik_genel_ayar', GENEL_AYAR_ALANLARI);
    denetle('ik_parametre_donemi', DONEM_ALANLARI);
    const json = [...sutunlar].flatMap(([tablo, s]) => [...s].filter(([, v]) => v.tip.startsWith('json')).map(([ad]) => `${tablo}.${ad}`));
    assert.deepEqual(json, []);
  });
});
