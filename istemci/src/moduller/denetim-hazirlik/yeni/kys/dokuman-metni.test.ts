import { describe, expect, it } from 'vitest';
import { depoOku } from '../normalize.ts';
import { bugunTarihi } from '../tarih.ts';
import type { Profil, Surec } from '../tipler.ts';
import {
  anaListe, asciiAd, bloklar, bolumMetni, degiskenAc, dokumanBul, dokumanDurumu, dosyaAgaci, duzenleyiciAc, elleDokumanEkle, elleDokumanKodu,
  gorevMetni, gozdenGecirmeTakvimi, gozdenGecirmeYuku, klasorBetigi, kodlariEksik, rutinTakvimi, sablonKodlariniVer, sonrakiKod, yayinla,
} from './dokuman-metni.ts';
import { DOCT, FLOW_DOC } from './dokuman-sablonlari.ts';
import { ROLES } from '../icerik/kys-yapi.ts';

// Saf yordamlar; veri sentetiktir.

const profil = (): Profil => { const d = depoOku(null); return d.data[d.active] as Profil; };
const surec = (y: Partial<Surec> = {}): Surec => ({
  id: 's1', type: 'a', name: 'Talaşlı imalat', owner: 'Üretim', inputs: '', outputs: '', kpi: 'Hurda oranı', unit: '%', target: 2, dir: 'le',
  res: '', who: '', how: '', risk: '', vals: {}, ...y,
});

describe('doküman kodu', () => {
  it('önekli türün en büyük sırasından bir fazlasını verir', () => {
    const p = profil();
    expect(sonrakiKod(p.kys, 'PR')).toBe('KYS-PR-001');
    p.kys.prefix = 'ABC';
    p.kys.docs.push({ id: 'd1', code: 'ABC-PR-007', name: 'x', type: 'PR', rev: '00', owner: '', loc: '', gen: '', date: '' });
    expect(sonrakiKod(p.kys, 'PR')).toBe('ABC-PR-008');
    expect(elleDokumanKodu(p.kys, 'TL')).toBe('ABC-TL-001');
  });

  it('kütüphane açılışında bütün şablonlara kod verir, ikinci kez değişiklik yoktur', () => {
    const p = profil();
    expect(kodlariEksik(p.kys)).toBe(true);
    expect(sablonKodlariniVer(p.kys)).toBe(true);
    expect(kodlariEksik(p.kys)).toBe(false);
    expect(sablonKodlariniVer(p.kys)).toBe(false);
    const kodlar = DOCT.map((d) => p.kys.gd[d.id]?.code);
    expect(new Set(kodlar).size).toBe(DOCT.length);
  });
});

describe('yayın ve revizyon', () => {
  it('düzenleyici taslak açar; ilk yayın ana listeye ve yapı taşına işlenir; revizyon numarayı artırır', () => {
    const p = profil();
    p.kys.roles['kys'] = { kisi: 'Deneme Kalite', vekil: '' };
    const d = dokumanBul(p.kys, 'dok');
    if (!d) throw new Error('şablon yok');
    expect(duzenleyiciAc(p.kys, d)).toBe(true);
    expect(dokumanDurumu(p.kys, 'dok').k).toBe('taslak');
    expect(p.kys.gd['dok']?.prep).toBe('Deneme Kalite');
    yayinla(p.kys, d, '', '2026-01-10');
    expect(dokumanDurumu(p.kys, 'dok')).toEqual({ k: 'yayin', t: 'Yürürlükte · Rev. 00' });
    expect(p.kys.docs.filter((x) => x.gen === 'dok')).toHaveLength(1);
    expect(p.kys.items[d.bl]).toMatchObject({ st: 2, date: '2026-01-10', code: p.kys.gd['dok']?.code });
    yayinla(p.kys, d, 'Akış eklendi', '2026-02-01');
    expect(p.kys.gd['dok']?.rev).toBe('01');
    expect(p.kys.gd['dok']?.hist.map((h) => h.note)).toEqual(['İlk yayın', 'Akış eklendi']);
    expect(p.kys.docs.filter((x) => x.gen === 'dok')).toHaveLength(1);
    expect(anaListe(p.kys).some((s) => s.gen === 'dok' && s.rev === '01')).toBe(true);
  });
});

describe('şablon metni', () => {
  it('firma ve rol değişkenlerini açar; düzenlenen bölüm şablonun yerine geçer', () => {
    const p = profil();
    p.profile.firma = 'Deneme Atölye';
    p.kys.roles['ust'] = { kisi: 'Deneme Müdür', vekil: '' };
    expect(degiskenAc('{firma} · {gm}', { profil: p, cihazlar: [] })).toBe('Deneme Atölye · Genel Müdür (Deneme Müdür)');
    const d = dokumanBul(p.kys, 'pol');
    const s = d?.secs[0];
    if (!d || !s) throw new Error('şablon yok');
    p.kys.gd['pol'] = { code: '', rev: '00', pub: '', date: '', prep: '', appr: '', st: 'taslak', secs: { [s[0]]: 'Elle yazıldı' }, hist: [] };
    expect(bolumMetni(d, s, { profil: p, cihazlar: [] })).toBe('Elle yazıldı');
  });

  it('süreç tablosu süreç yoksa yönlendirme, varsa tablo yazar', () => {
    const p = profil();
    expect(degiskenAc('{SUREC_TABLOSU}', { profil: p, cihazlar: [] })).toMatch(/Süreçler sekmesinde/);
    p.kys.procs.push(surec());
    expect(degiskenAc('{SUREC_TABLOSU}', { profil: p, cihazlar: [] })).toContain('| Talaşlı imalat | Ana | Üretim | Hurda oranı | ≤ %2 |');
  });

  it('bölüm biçimi: başlık, madde, sıra, tablo, kalın, kutucuk ve akış şeması', () => {
    const b = bloklar('## Alt\n\n- bir\n- **iki**\n\n1. a\n2) b\n\n| x | y |\n| 1 |\n\n[[AKIS:dok]]\n\nDüz [ ] metin');
    expect(b.map((x) => x.tur)).toEqual(['baslik', 'madde', 'sira', 'tablo', 'akis', 'paragraf']);
    const madde = b[1];
    expect(madde?.tur === 'madde' && madde.satirlar[1]).toEqual([{ t: 'iki', kalin: true }]);
    const tablo = b[3];
    expect(tablo?.tur === 'tablo' && tablo.satirlar[0]?.length).toBe(2);
    const par = b[5];
    expect(par?.tur === 'paragraf' && par.satirlar[0]?.[0]?.t).toBe('Düz ☐ metin');
  });

  it('akış bölümü olan her prosedürün akışı tanımlıdır', () => {
    for (const [id, akis] of Object.entries(FLOW_DOC)) {
      const d = DOCT.find((x) => x.id === id);
      expect(d?.secs.some((s) => s[2] === `[[AKIS:${akis}]]`)).toBe(true);
    }
  });
});

describe('dosyalama', () => {
  it('ASCII ad, klasör betiği ve elle eklenen doküman', () => {
    expect(asciiAd('Çağrı Şube Öğe')).toBe('Cagri_Sube_Oge');
    const p = profil();
    const bat = klasorBetigi(p.kys, 'Deneme Atölye');
    expect(bat).toContain('set "KOK=Deneme_Atolye_KYS"');
    expect(bat).toContain('mkdir "%KOK%\\01_Surecler\\00_Prosedurler" 2>nul');
    const k = elleDokumanEkle(p.kys, { type: 'TL', code: 'KYS-TL-004', name: ' Tezgâh talimatı ', rev: '', owner: '', loc: '' }, '2026-03-01');
    expect(k).toMatchObject({ code: 'KYS-TL-004', name: 'Tezgâh talimatı', rev: '00', date: '2026-03-01' });
    expect(anaListe(p.kys).find((s) => s.src === 'el')?.code).toBe('KYS-TL-004');
    const agac = dosyaAgaci(p.kys);
    expect(agac.adet).toBe(1);
    expect(agac.klasorler.find((f) => f.ad === '01_Surecler')?.altlar.find((a) => a.ad === '00_Talimatlar')?.dokumanlar[0]?.code).toBe('KYS-TL-004');
  });
});

describe('görev tanımı ve takvim', () => {
  it('görev metni görevli ve vekili yazar, ardışık boş satır kalmaz', () => {
    const p = profil();
    const r = ROLES[0];
    if (!r) throw new Error('rol yok');
    p.kys.roles[r.k] = { kisi: 'Deneme Kişi', vekil: 'Deneme Vekil' };
    const m = gorevMetni(r, p.kys, '');
    expect(m).toContain('Görevli: Deneme Kişi');
    expect(m).toContain('Vekili: Deneme Vekil');
    expect(m).not.toMatch(/\n\n\n/);
  });

  it('gözden geçirme takvimi tarihsizde boş, tarihlide olay; rutin takvimi dört tekrar yazar', () => {
    const p = profil();
    expect(gozdenGecirmeTakvimi(p, 'p1')).toBeNull();
    p.kys.items['b52'] = { st: 2, date: bugunTarihi(), code: '', rev: '', owner: '', note: '' };
    const t = gozdenGecirmeTakvimi(p, 'p1');
    expect(t?.adet).toBe(1);
    expect(t?.metin).toContain('BEGIN:VEVENT');
    expect(gozdenGecirmeYuku(p).aylar).toHaveLength(12);
    expect(rutinTakvimi(p, 'p1').match(/RRULE:/g)).toHaveLength(4);
  });
});
