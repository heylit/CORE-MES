import type { CalismaKomutu } from '../kayit.ts';
import type { SihirbazDegeri, SihirbazTanimi } from '../ortak/sade/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { CARPANLAR, elleCarpan, fasonTerminiYaz, fiyatDenetle, gunYaz, sayi, tarihGirdisi, tl, type FasonSatiri } from './kurallar.ts';

// P2'nin "Veri gir" sihirbazları (zz24-sade SADE.ysiparis onem ve fiyat, zz25-sade-takvim SADE.terminler fason). Çizimi ortak sade kabuğu
// yapar; açılımdan sipariş ya da iş dolu açılır. Yazma yalnız komut.degistir ile; termin ve öncelik sahibinindir, burada form yoktur (222 a).

const metin = (v: string | boolean | undefined): string => (typeof v === 'string' ? v : '');

export function onemTanimi(c: PlanlamaCalismasi, sinir: number, komut: CalismaKomutu, kim: string): SihirbazTanimi {
  const carpan = CARPANLAR.filter(([v]) => v <= sinir);
  const bul = (id: string) => c.D.siparisler.find((s) => s.id === id);
  return {
    id: 'onem', ad: 'Siparişi öne al ya da geri bırak', simge: 'up', ne: 'Önemini elle çarpanla değiştirir; gerekçe yazılır.',
    alanlar: () => [
      { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: true, secenekler: c.D.siparisler.map((s) => [s.id, `${s.id} · ${s.ad ?? s.id} · şimdi ×${sayi(elleCarpan(s), 2)}`] as const) },
      { k: 'v', ad: 'Önemi', tur: 'secim', zorunlu: true, secenekler: carpan.map(([v, ad]) => [String(v), ad] as const), ipucu: '×2: bir saatlik gecikmesi iki kat pahalı sayılır, motor öne alır' },
      { k: 'g', ad: 'Gerekçe', tur: 'metin', zorunlu: true, ipucu: 'Örnek: müşteri hat duruşunda' },
    ],
    adimlar: [
      { ad: 'Hangi sipariş', k: ['sip'] },
      { ad: 'Ne kadar önemli', ne: 'Motor önemli siparişin gecikmesini daha pahalı sayar ve önce onu yetiştirmeye çalışır.', k: ['v', 'g'] },
    ],
    ilk: () => ({}),
    ileri: (d, i) => {
      const s = i === 0 ? bul(metin(d.sip)) : undefined;
      if (!s) return undefined;
      const e = elleCarpan(s);
      return { ...d, v: String(carpan.some(([k]) => k === e) ? e : 1), g: s.elleKim && s.elleKim !== 'geçiş' && typeof s.elleGerekce === 'string' ? s.elleGerekce : '' };
    },
    kontrol: (d, i) => ((i === 1 || i === -1) && metin(d.g).trim() !== '' && metin(d.g).trim().length < 3 ? 'Gerekçe en az üç harf olmalı.' : null),
    sonuc: 'yeni önem plana bir sonraki çözümde girer.',
    kaydet: (d) => {
      const id = metin(d.sip); const v = Number(d.v); const g = metin(d.g).trim();
      const s0 = bul(id); if (!s0) return;
      const once = elleCarpan(s0);
      komut.degistir('Elle çarpan değişti', (t) => {
        const s = t.D.siparisler.find((x) => x.id === id); if (!s) return false;
        Object.assign(s, { elle: v, elleGerekce: g, elleKim: kim });
        return true;
      }, { ayrinti: `${id}: ×${sayi(once, 2)} → ×${sayi(v, 2)} · ${g}` });
    },
    bitti: (d) => `${metin(d.sip)} önemi ×${sayi(Number(d.v), 2)} oldu`,
  };
}

export function fiyatTanimi(c: PlanlamaCalismasi, komut: CalismaKomutu): SihirbazTanimi {
  const bul = (id: string) => c.D.siparisler.find((s) => s.id === id);
  return {
    id: 'fiyat', ad: 'Fiyat ve ödeme vadesi', simge: 'lira', ne: 'Siparişin tutarı ve kaç günde ödeneceği.',
    alanlar: () => [
      { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: true, secenekler: c.D.siparisler.map((s) => [s.id, `${s.id} · ${s.ad ?? s.id} · ${s.gelir == null ? 'fiyatsız' : tl(s.gelir)}`] as const) },
      { k: 'gelir', ad: 'Tutar (TL)', tur: 'sayi', min: 0, zorunlu: true },
      { k: 'vade', ad: 'Ödeme vadesi (gün)', tur: 'sayi', min: 0, max: 365, tam: true, ipucu: 'Boş: peşin' },
    ],
    adimlar: [{ ad: 'Hangi sipariş', ne: 'Fiyatı olmayanlar listede "fiyatsız" yazar.', k: ['sip'] }, { ad: 'Tutar ve vade', k: ['gelir', 'vade'] }],
    ilk: (): SihirbazDegeri => { const s = c.D.siparisler.find((x) => x.gelir == null); return s ? { sip: s.id } : {}; },
    ileri: (d, i) => {
      const s = i === 0 ? bul(metin(d.sip)) : undefined;
      return s ? { ...d, gelir: s.gelir == null ? '' : String(s.gelir), vade: s.vade == null ? '' : String(s.vade as number) } : undefined;
    },
    kontrol: (d, i) => { if (i !== 1 && i !== -1) return null; const x = fiyatDenetle(metin(d.gelir), metin(d.vade)); return typeof x === 'string' ? x : null; },
    sonuc: 'kâr ve gecikme bedeli bu tutarla yeniden hesaplanır.',
    kaydet: (d) => {
      const id = metin(d.sip); const x = fiyatDenetle(metin(d.gelir), metin(d.vade));
      const s0 = bul(id); if (!s0 || typeof x === 'string') return;
      komut.degistir('Sipariş fiyatı değişti', (t) => {
        const s = t.D.siparisler.find((y) => y.id === id); if (!s) return false;
        Object.assign(s, { gelir: x.gelir });
        if (x.vade == null) delete (s as Record<string, unknown>).vade; else Object.assign(s, { vade: x.vade });
        return true;
      }, { ayrinti: `${id}: ${tl(s0.gelir)} → ${tl(x.gelir)}, vade ${s0.vade == null ? '—' : String(s0.vade as number)} → ${x.vade ?? '—'} gün` });
    },
    bitti: (d) => `${metin(d.sip)} fiyatı kaydedildi`,
  };
}

export function fasonTanimi(c: PlanlamaCalismasi, L: readonly FasonSatiri[], komut: CalismaKomutu): SihirbazTanimi {
  const D = c.D;
  const l = [...L].sort((a, b) => (a.T == null ? 0 : 1) - (b.T == null ? 0 : 1) || a.r.S - b.r.S);
  const bul = (id: string) => l.find((x) => x.id === id);
  return {
    id: 'fason', ad: 'Fason dönüş tarihi gir', simge: 'truck', ne: 'Fasoncunun söz verdiği dönüş günü.',
    alanlar: (d: SihirbazDegeri) => {
      const sec = bul(metin(d.is));
      return [
        { k: 'is', ad: 'Fason işi', tur: 'secim', zorunlu: true, secenekler: l.map((x) => [x.id, `${x.id} · ${x.f?.ad ?? x.r.m} · çıkış ${gunYaz(D, x.r.S)} · ${x.T == null ? 'tarih yok' : `dönüş ${gunYaz(D, x.T)}`}`] as const) },
        { k: 't', ad: 'Dönüş tarihi', tur: 'tarih', zorunlu: true, ipucu: sec ? `Sonraki adım ${gunYaz(D, sec.ger)} başlıyor; sipariş gecikmeden en geç ${gunYaz(D, sec.enGec)}` : 'Fasoncunun söz verdiği gün' },
      ];
    },
    adimlar: [{ ad: 'Hangi iş', ne: 'Tarihi olmayanlar başta.', k: ['is'] }, { ad: 'Dönüş tarihi', k: ['t'] }],
    ilk: () => ({}),
    ileri: (d, i) => { const x = i === 0 ? bul(metin(d.is)) : undefined; return x ? { ...d, t: tarihGirdisi(D, x.T) } : undefined; },
    sonuc: 'iş plana bu dönüş tarihiyle girer.',
    kaydet: (d) => {
      const id = metin(d.is); const t = metin(d.t);
      komut.degistir('Fason dönüş termini girildi', (taslak) => { fasonTerminiYaz(taslak, id, t); }, { ayrinti: `${id}: ${t}` });
    },
    bitti: (d) => `${metin(d.is)} dönüşü ${metin(d.t)} oldu`,
  };
}
