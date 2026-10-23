import { describe, expect, it } from 'vitest';
import { csvMetni, guvenliAd, htmlKacis, icsDosyasi, icsKatla } from './disa-aktar.ts';
import { bosProfil, yeniDenetim } from './normalize.ts';

describe('dışa aktarma', () => {
  it('ics satırı 75 sekizlikte katlanır, çok baytlı karakter bölünmez', () => {
    const satir = `SUMMARY:${'ş'.repeat(60)}`;
    const parcalar = icsKatla(satir).split('\r\n ');
    expect(parcalar.length).toBeGreaterThan(1);
    for (const p of parcalar) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parcalar.join('')).toBe(satir);
  });

  it('ics dosyası takvim ve olay sarmalını, son günde kısa hatırlatmayı taşır', () => {
    const p = bosProfil();
    p.profile.firma = 'Deneme; A,B';
    const a = yeniDenetim({ prog: 'iso9001', kind: 'deadline', type: 'Son gün', date: '2026-06-10' });
    const metin = icsDosyasi([{ a, profil: p }], new Date(Date.UTC(2026, 0, 1)));
    expect(metin.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(metin.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(metin).toContain('DTSTART;VALUE=DATE:20260610');
    expect(metin).toContain('DTEND;VALUE=DATE:20260611');
    expect(metin).toContain('TRIGGER:-P3D');
    expect(metin).toContain('TRANSP:TRANSPARENT');
    expect(metin).toContain('Deneme\; A\\,B');
  });

  it('csv noktalı virgüllü, BOM ile; ayraç ve tırnak kaçırılır', () => {
    expect(csvMetni([['a', 'b;c'], ['"x"', null]])).toBe('﻿a;"b;c"\r\n"""x""";');
  });

  it('dosya adı ve html kaçışı', () => {
    expect(guvenliAd('a/b: c?')).toBe('a-b--c-');
    expect(htmlKacis('<b a="1">&\'')).toBe('&lt;b a=&quot;1&quot;&gt;&amp;&#39;');
  });
});
