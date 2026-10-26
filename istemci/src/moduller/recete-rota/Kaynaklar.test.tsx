import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { SurumluIsMerkezi, SurumluIstasyon, SurumluMakine } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { KisiOzeti } from '#paylasilan/sozlesme/kisiler.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { Vardiya } from '#paylasilan/sozlesme/vardiya.ts';
import { CIHAZ_ANAHTARLARI, ONEK } from './ReceteRotaCercevesi.tsx';
import { kopruHatasi, kopruKur } from './kopru.ts';
import { YAZAR, ac, prototipiCalistir, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Kaynaklar sekmesi gerçek prototip sayfasında, gerçek köprüyle (kopru.ts) ve sahibi modüllerin uçlarını taklit eden bellek içi
// sunucuyla sınanır. Sunucu sahibinin kuralını uygular: sürüm eskiyse 409, tekrar korumalı uç kimlik ister.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const ESKI = { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: 'eski-surum' } };

interface Kayit { id: number; surum: number; [alan: string]: unknown }
interface Sahip {
  wcs: Kayit[]; istasyonlar: Kayit[]; makineler: Kayit[]; kisiler: Kayit[]; vardiyalar: Kayit[];
  planAyarlari: Kayit[]; makineDurumlari: Kayit[]; yetkinlik: Record<number, number[]>; tatiller: string[];
  yetkisiz: { istasyon: boolean; kisi: boolean; takvim?: boolean };
  matris: Array<{ isMerkeziId: number; gun: number; vardiyaId: number }>; kisiVardiyalari: Array<{ kisiId: number; vardiyaId: number }>;
  malzemeler: DurumCevabi['items']; operasyonlar: DurumCevabi['opdefs'];
  yazmalar: Array<{ yol: string; govde: Record<string, unknown>; baslik: Record<string, string> }>;
  sayac: number;
}

function sahipKur(): Sahip {
  return {
    wcs: [{ id: 1, kod: 'IM-1', ad: 'Talaşlı imalat', aciklama: 'Ana hat', aktif: true, surum: 1 } satisfies SurumluIsMerkezi],
    istasyonlar: [{ id: 7, kod: 'IS-7', ad: 'CNC torna', isMerkeziId: 1, tip: 'talasli', sorumluKisiId: null, sorumluAd: null, kapasiteKaynagi: null, uretimAlani: false, aktif: true, surum: 2 } satisfies SurumluIstasyon],
    makineler: [{ id: 11, kod: 'MK-1', ad: 'Torna bir', tur: null, markaModel: null, seriNo: null, istasyonId: 7, baglantiTuru: null, baglantiAdresi: null, aktif: true, surum: 1 } satisfies SurumluMakine],
    kisiler: [{ id: 21, ad: 'Ayşe Deneme', aktif: true, girisVar: false, kullaniciAdi: null, pinVar: false, sicilNo: 'S-1', gorev: 'Operatör', roller: [], surum: 1 } satisfies KisiOzeti],
    vardiyalar: [{ id: 31, ad: 'Sabah', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 1, molalar: [], netDakika: 480 } satisfies Vardiya],
    planAyarlari: [], makineDurumlari: [], yetkinlik: {}, tatiller: ['2031-01-01'],
    yetkisiz: { istasyon: false, kisi: false }, matris: [], kisiVardiyalari: [], malzemeler: [], operasyonlar: [], yazmalar: [], sayac: 100,
  };
}

function durumKur(s: Sahip): DurumCevabi {
  const ayar = (id: unknown) => s.planAyarlari.find((a) => a['istasyonId'] === id);
  const durum = (id: unknown) => s.makineDurumlari.find((d) => d['makineId'] === id);
  const ceviri = { calisir: 'aktif', bakim: 'bakim', ariza: 'ariza' } as const;
  return {
    items: s.malzemeler, units: [], opdefs: s.operasyonlar, settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], routes: null, routeRevs: null, maliyet: null, malzemeKesildi: false,
    wcs: s.yetkisiz.istasyon ? null : s.wcs.map((w) => ({ id: String(w.id), code: String(w['kod']), name: String(w['ad']), week: null, aktif: true })),
    stations: s.yetkisiz.istasyon ? null : s.istasyonlar.map((i) => ({
      id: String(i.id), code: String(i['kod']), name: String(i['ad']), wcId: String(i['isMerkeziId']), cost: null, aktif: true,
      eff: ayar(i.id) ? Number(ayar(i.id)?.['verimYuzde']) : 100, opPer: ayar(i.id) ? Number(ayar(i.id)?.['operatorIhtiyaci']) : 1,
      count: s.makineler.filter((m) => m['istasyonId'] === i.id).length,
    })),
    machines: s.yetkisiz.istasyon ? null : s.makineler.map((m) => ({
      id: String(m.id), code: String(m['kod']), name: String(m['ad']), stationId: String(m['istasyonId']), aktif: true,
      status: ceviri[(durum(m.id)?.['durum'] ?? 'calisir') as keyof typeof ceviri],
    })),
    people: s.yetkisiz.kisi ? null : s.kisiler.map((k) => ({
      id: String(k.id), name: String(k['ad']), code: (k['sicilNo'] as string | null), role: null, stationId: s.yetkinlik[k.id]?.length ? String(s.yetkinlik[k.id]![0]) : null, stationAtama: false,
      wcId: s.yetkinlik[k.id]?.length ? '1' : null, shiftId: null,
      skills: (s.yetkinlik[k.id] ?? []).map(String), cost: null, active: true,
    })),
    cal: {
      shifts: s.vardiyalar.filter((v) => v['aktif'] === true).map((v) => ({
        id: String(v.id), name: String(v['ad']), start: String(v['baslangic']), end: String(v['bitis']),
        breaks: v['molalar'] as Array<{ start: string; end: string }> ?? [], netDakika: 480,
      })),
      holidays: s.tatiller.slice(),
    },
  };
}

// Sahibi modüllerin uçları: kayıt bulunur, sürüm eskiyse 409 döner, yazma sürümü artırır.
function sahipCevabi(s: Sahip, yontem: string, yol: string, govde: Record<string, unknown>, baslik: Record<string, string>): Response {
  const liste = (a: Record<string, unknown>) => json(200, a);
  if (yontem === 'GET') {
    const kisitli = (alan: boolean, ad: string, deger: unknown) => (alan ? json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }) : liste({ [ad]: deger }));
    switch (yol) {
      case '/is-merkezleri': return kisitli(s.yetkisiz.istasyon, 'isMerkezleri', s.wcs);
      case '/istasyonlar': return kisitli(s.yetkisiz.istasyon, 'istasyonlar', s.istasyonlar);
      case '/makineler': return kisitli(s.yetkisiz.istasyon, 'makineler', s.makineler);
      case '/istasyon-plan-ayarlari': return kisitli(s.yetkisiz.istasyon, 'ayarlar', s.planAyarlari);
      case '/makine-durumlari': return kisitli(s.yetkisiz.istasyon, 'durumlar', s.makineDurumlari);
      case '/kisiler': return kisitli(s.yetkisiz.kisi, 'kisiler', s.kisiler);
      case '/vardiya-takvimi':
        if (s.yetkisiz.takvim) return json(500, { kod: 'SUNUCU', mesaj: 'Hata.' });
        return liste({ vardiyalar: s.vardiyalar, matris: s.matris, gunler: [], isMerkezleri: [], kisiVardiyalari: s.kisiVardiyalari, bugun: '2030-01-01' });
      case '/plan/planlama-kaynagi': return json(200, durumKur(s));
      default: return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }
  }
  s.yazmalar.push({ yol, govde, baslik });
  const guncelle = (kayitlar: Kayit[], id: number, alanlar: string[]): Response => {
    const k = kayitlar.find((x) => x.id === id);
    if (!k) return json(404, { kod: 'BULUNAMADI', mesaj: 'Kayıt bulunamadı.' });
    if (govde['surum'] !== k.surum) return json(409, ESKI);
    for (const a of alanlar) if (a in govde) k[a] = govde[a];
    k.surum += 1;
    return json(200, k);
  };
  const ekle = (kayitlar: Kayit[], ek: Record<string, unknown>): Response => {
    s.sayac += 1;
    const k: Kayit = { id: s.sayac, surum: 1, ...ek };
    kayitlar.push(k);
    return json(200, k);
  };
  let m: RegExpMatchArray | null;
  if (yol === '/is-merkezleri') return ekle(s.wcs, { kod: govde['kod'], ad: govde['ad'], aciklama: null, aktif: true });
  if (yol === '/istasyonlar') return ekle(s.istasyonlar, { ...govde, aktif: true });
  if (yol === '/makineler') return ekle(s.makineler, { ...govde, aktif: true });
  if (yol === '/kisiler') {
    if (!baslik[ISTEK_KIMLIGI_BASLIGI]) return json(400, { kod: 'DOGRULAMA', mesaj: 'İstek kimliği gerekli.' });
    return ekle(s.kisiler, { ad: govde['ad'], sicilNo: govde['sicilNo'] ?? null, gorev: null, aktif: true });
  }
  if ((m = yol.match(/^\/is-merkezleri\/(\d+)\/guncelle$/))) return guncelle(s.wcs, Number(m[1]), ['kod', 'ad']);
  if ((m = yol.match(/^\/istasyonlar\/(\d+)\/guncelle$/))) return guncelle(s.istasyonlar, Number(m[1]), ['kod', 'ad', 'kapasiteKaynagi']);
  if ((m = yol.match(/^\/makineler\/(\d+)\/guncelle$/))) return guncelle(s.makineler, Number(m[1]), ['kod', 'ad']);
  if ((m = yol.match(/^\/kisiler\/(\d+)\/duzenle$/))) return guncelle(s.kisiler, Number(m[1]), ['ad', 'sicilNo']);
  if ((m = yol.match(/^\/vardiyalar\/(\d+)\/guncelle$/))) return guncelle(s.vardiyalar, Number(m[1]), ['ad', 'baslangic', 'bitis', 'aktif']);
  const satirli = (kayitlar: Kayit[], anahtar: string, kimlik: number, alanlar: Record<string, unknown>): Response => {
    const var0 = kayitlar.find((x) => x[anahtar] === kimlik);
    if (govde['surum'] !== undefined && govde['surum'] !== (var0?.surum ?? 0)) return json(409, ESKI);
    if (var0) { Object.assign(var0, alanlar); var0.surum += 1; return json(200, var0); }
    kayitlar.push({ id: kimlik, [anahtar]: kimlik, surum: 1, ...alanlar });
    return json(200, kayitlar[kayitlar.length - 1]);
  };
  if ((m = yol.match(/^\/istasyonlar\/(\d+)\/plan-ayari$/))) {
    return satirli(s.planAyarlari, 'istasyonId', Number(m[1]), { verimYuzde: String(govde['verimYuzde']), operatorIhtiyaci: String(govde['operatorIhtiyaci']) });
  }
  if ((m = yol.match(/^\/makineler\/(\d+)\/durum$/))) return satirli(s.makineDurumlari, 'makineId', Number(m[1]), { durum: govde['durum'], aciklama: govde['aciklama'] ?? null });
  if ((m = yol.match(/^\/kisi-yetkinlikleri\/(\d+)\/belirle$/))) { s.yetkinlik[Number(m[1])] = govde['istasyonIdleri'] as number[]; return json(200, { istasyonIdleri: s.yetkinlik[Number(m[1])] }); }
  // Vardiya modülünün haftalık düzeni sürüm taşımaz; cevap bütün takvimdir.
  const takvim = () => json(200, { vardiyalar: s.vardiyalar, matris: s.matris, gunler: [], isMerkezleri: [], kisiVardiyalari: s.kisiVardiyalari, bugun: '2030-01-01' });
  if (yol === '/vardiya-matrisi/degistir') {
    const h = { isMerkeziId: govde['isMerkeziId'] as number, gun: govde['gun'] as number, vardiyaId: govde['vardiyaId'] as number };
    s.matris = s.matris.filter((x) => !(x.isMerkeziId === h.isMerkeziId && x.gun === h.gun && x.vardiyaId === h.vardiyaId));
    if (govde['acik'] === true) s.matris.push(h);
    return takvim();
  }
  if (yol === '/vardiya-matrisi/hafta-uygula') {
    const kaynak = govde['kaynakIsMerkeziId'] as number;
    const hedefler = s.wcs.map((w) => w.id).filter((id) => id !== kaynak);
    const kaynakHucreleri = s.matris.filter((x) => x.isMerkeziId === kaynak);
    s.matris = s.matris.filter((x) => !hedefler.includes(x.isMerkeziId));
    for (const id of hedefler) for (const x of kaynakHucreleri) s.matris.push({ ...x, isMerkeziId: id });
    return takvim();
  }
  if ((m = yol.match(/^\/kisi-vardiyalari\/(\d+)\/belirle$/))) {
    const kisiId = Number(m[1]);
    s.kisiVardiyalari = s.kisiVardiyalari.filter((k) => k.kisiId !== kisiId);
    if (govde['vardiyaId'] !== null) s.kisiVardiyalari.push({ kisiId, vardiyaId: govde['vardiyaId'] as number });
    return takvim();
  }
  if (yol === '/takvim-gunleri') { s.tatiller.push(String(govde['tarih'])); return json(200, {}); }
  if ((m = yol.match(/^\/takvim-gunleri\/([\d-]+)\/kaldir$/))) { s.tatiller = s.tatiller.filter((t) => t !== m![1]); return json(200, {}); }
  return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
}

type Pencere = Window & { eval: (k: string) => unknown };

async function ekranAc(s: Sahip) {
  const doc = { version: 7, name: 'Deneme fabrika', items: [], routes: {}, orders: [], wcs: [], stations: [], cal: { shifts: [], holidays: [] } };
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: YAZAR });
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: YAZAR.id, ad: YAZAR.ad }, yazabilir: true });
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar: [{ anahtar: ONEK, bicim: 'json', deger: doc, surum: 1 }] });
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as Record<string, unknown> : {};
    return sahipCevabi(s, yontem, yol, govde, (secenek?.headers ?? {}) as Record<string, string>);
  }));
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');

  // Çerçevenin köprü istekleri kabuk yerine gerçek köprüye (kopru.ts) gider; cevap çerçeveye ileti olarak döner.
  const isle = kopruKur(CIHAZ_ANAHTARLARI);
  // Çerçevenin kabuğa "şu sayfaya git" iletileri.
  const gidilen: string[] = [];
  const dinleyici = (e: MessageEvent) => {
    const m = e.data as { kanal?: string; yon?: string; id?: number; tip?: string; veri?: unknown; yol?: unknown } | null;
    if (m?.kanal === 'recete-rota' && m.yon === 'git' && typeof m.yol === 'string') { gidilen.push(m.yol); return; }
    if (m?.kanal !== 'recete-rota' || m.yon !== 'istek' || typeof m.id !== 'number' || typeof m.tip !== 'string') return;
    const cerceve = Array.from(document.querySelectorAll('iframe')).filter((f) => !f.hasAttribute('srcdoc')).at(-1)?.contentWindow;
    if (!cerceve) return;
    const yanit = (govde: Record<string, unknown>) => {
      cerceve.dispatchEvent(new (cerceve as unknown as typeof globalThis).MessageEvent('message', { data: { kanal: 'recete-rota', yon: 'yanit', id: m.id, ...govde }, source: cerceve.parent }));
    };
    if (m.tip === 'kayit-yaz') { yanit({ ok: true, veri: { kayit: { surum: 2 } } }); return; }
    isle(m.tip, m.veri).then((veri) => { yanit({ ok: true, veri }); }, (hata: unknown) => { yanit({ ok: false, ...kopruHatasi(hata) }); });
  };
  window.addEventListener('message', dinleyici);
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  await waitFor(() => { expect(ifade<boolean>('KB.bagli')).toBe(true); }, { timeout: 10000 });
  const alt = (v: string) => {
    ifade(`(ui.tab = "res", ui.resTab = "${v}", render(), 1)`);
  };
  const al = <T extends Element>(k: string): T => { const el = belge.querySelector<T>(k); expect(el, k).not.toBeNull(); return el!; };
  const degistir = (k: string, v: string) => { fireEvent.change(al<HTMLInputElement | HTMLSelectElement>(k), { target: { value: v } }); };
  const tikla = (k: string) => { fireEvent.click(al(k)); };
  const deger = (k: string) => al<HTMLInputElement>(k).value;
  return { belge, ifade, alt, al, degistir, tikla, deger, gidilen, kapat: () => { window.removeEventListener('message', dinleyici); } };
}

let kapat: (() => void) | null = null;
afterEach(() => { kapat?.(); kapat = null; cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Kaynaklar sekmesi sahibi modüllere bağlı', () => {
  it('KAY-01: iş merkezi, istasyon, makine, personel, vardiya ve tatil sahibinin kaydından gelir; karşılığı olmayan alanlar "bağlı değil" görünür ve girdirilmez', async () => {
    const s = sahipKur();
    s.yetkinlik[21] = [7];
    const e = await ekranAc(s);
    kapat = e.kapat;
    expect(e.ifade<unknown[]>('st.wcs.map(w=>[w.id,w.code,w.name])')).toEqual([['1', 'IM-1', 'Talaşlı imalat']]);
    e.alt('wcs');
    expect(e.deger('[data-k="w:1:name"]')).toBe('Talaşlı imalat');
    expect(e.deger('[data-k="s:7:name"]')).toBe('CNC torna');
    // Haftalık vardiya düzeni sahibinde yok: girdi alanı değil, "bağlı değil" etiketi; sıfır yazılmaz. Maliyet Finans'ta (kart #1187):
    // görme yetkisi yokken (dilim null) alan boş ve kapalıdır.
    const maliyetAlani = () => e.belge.querySelector<HTMLInputElement>('[data-f="cost"]');
    expect([maliyetAlani()?.value, maliyetAlani()?.disabled]).toEqual(['', true]);
    expect(e.belge.querySelector('[data-f="count"]')).toBeNull();
    expect(e.belge.querySelectorAll('.kb-bg').length).toBe(0);
    expect(e.ifade<unknown>('st.stations[0].cost')).toBeNull();
    e.alt('machines');
    expect(e.deger('[data-k="mc:11:name"]')).toBe('Torna bir');
    e.alt('people');
    expect(e.deger('[data-k="pp:21:name"]')).toBe('Ayşe Deneme');
    expect(e.deger('[data-k="pp:21:code"]')).toBe('S-1');
    expect([maliyetAlani()?.value, maliyetAlani()?.disabled]).toEqual(['', true]);
    expect(e.belge.querySelector('[data-f="shiftId"]')).not.toBeNull();
    expect(e.belge.querySelector('[data-act="toggleSkill"][data-st="7"]')?.getAttribute('aria-pressed')).toBe('true');
    e.alt('shifts');
    expect(e.deger('[data-k="v:31:name"]')).toBe('Sabah');
    expect(e.belge.querySelector('.wm-c')).not.toBeNull();
    expect(e.belge.querySelector('.kb-hafta')).toBeNull();
    expect(e.belge.body.textContent).toContain('01.01.2031');
  }, 60000);

  it('KAY-02: ekrandan düzenleme sahibinin ucuna gider ve ekran sahibinin güncel kaydını gösterir (iş merkezi, istasyon, makine, personel)', async () => {
    const s = sahipKur();
    const e = await ekranAc(s);
    kapat = e.kapat;
    e.alt('wcs');
    e.degistir('[data-k="w:1:name"]', 'Yeni merkez');
    await waitFor(() => { expect(s.wcs[0]?.['ad']).toBe('Yeni merkez'); });
    e.degistir('[data-k="s:7:name"]', 'Yeni torna');
    await waitFor(() => { expect(s.istasyonlar[0]).toMatchObject({ ad: 'Yeni torna', surum: 3 }); });
    // Gönderilmeyen alanlar okunmuş kayıttan tamamlandı: açıklama silinmedi.
    expect(s.wcs[0]).toMatchObject({ aciklama: 'Ana hat', surum: 2 });
    e.alt('machines');
    e.degistir('[data-k="mc:11:code"]', 'MK-9');
    await waitFor(() => { expect(s.makineler[0]?.['kod']).toBe('MK-9'); });
    e.alt('people');
    e.degistir('[data-k="pp:21:name"]', 'Ayşe Usta');
    await waitFor(() => { expect(s.kisiler[0]).toMatchObject({ ad: 'Ayşe Usta', gorev: 'Operatör' }); });
    expect(e.ifade<string>('st.wcs[0].name')).toBe('Yeni merkez');
  }, 60000);

  it('KAY-03: iki yerden düzenlemede ikinci kaydeden sürüm uyarısını ekranda görür, ekran güncel kayıtla yenilenir; yeniden denince geçer', async () => {
    const s = sahipKur();
    const e = await ekranAc(s);
    kapat = e.kapat;
    e.alt('wcs');
    // İstasyonlar ekranı arada aynı istasyonu kaydeder.
    Object.assign(s.istasyonlar[0]!, { ad: 'Diğer ekran adı', surum: 3 });
    e.degistir('[data-k="s:7:name"]', 'R&R adı');
    await waitFor(() => { expect(e.belge.querySelector('.kb-uyari')?.textContent).toContain(ESKI_SURUM_ILETISI); });
    expect(e.belge.querySelector('.kb-uyari')?.getAttribute('role')).toBe('alert');
    expect(s.istasyonlar[0]?.['ad']).toBe('Diğer ekran adı');
    await waitFor(() => { expect(e.deger('[data-k="s:7:name"]')).toBe('Diğer ekran adı'); });
    e.degistir('[data-k="s:7:name"]', 'R&R adı');
    await waitFor(() => { expect(s.istasyonlar[0]?.['ad']).toBe('R&R adı'); });
    await waitFor(() => { expect(e.belge.querySelector('.kb-uyari')).toBeNull(); });
  }, 60000);

  // Tek düzenleme yeri: istasyonun plan ayarı ve makine durumu İstasyonlar'da yazılır; ekran yazmaz, o sayfaya götürür ve değeri geri alır.
  it('KAY-04: verim, operatör ihtiyacı, makine durumu ve notu yazılmaz, İstasyonlar\'a götürür; yetkinlik düğmesi listeyi sahibine gönderir', async () => {
    const s = sahipKur();
    const e = await ekranAc(s);
    kapat = e.kapat;
    e.alt('wcs');
    const verim = e.deger('[data-k="s:7:eff"]');
    e.degistir('[data-k="s:7:eff"]', '90');
    e.degistir('[data-k="s:7:opPer"]', '0,5');
    expect(e.deger('[data-k="s:7:eff"]')).toBe(verim);
    e.alt('machines');
    const durum = e.deger('[data-k="mc:11:st"]');
    e.degistir('[data-k="mc:11:st"]', 'bakim');
    e.degistir('[data-k="mc:11:note"]', 'Yağ değişimi');
    expect([e.deger('[data-k="mc:11:st"]'), e.deger('[data-k="mc:11:note"]')]).toEqual([durum, '']);
    await waitFor(() => { expect(e.gidilen).toEqual(['/istasyonlar/is-merkezleri', '/istasyonlar/is-merkezleri', '/istasyonlar/makineler', '/istasyonlar/makineler']); });
    expect(e.belge.querySelector('#toasts')?.textContent).toContain('İstasyonlar sayfasında düzenlenir');
    expect(s.yazmalar.filter((y) => y.yol.includes('plan-ayari') || y.yol.endsWith('/durum'))).toEqual([]);
    e.alt('people');
    e.degistir('[data-s="skilladd"][data-id="21"]', '7');
    await waitFor(() => { expect(s.yetkinlik[21]).toEqual([7]); });
    await waitFor(() => { expect(e.belge.querySelector('[data-act="toggleSkill"][data-id="21"][data-st="7"]')).not.toBeNull(); });
    e.tikla('[data-act="toggleSkill"][data-id="21"][data-st="7"]');
    await waitFor(() => { expect(s.yetkinlik[21]).toEqual([]); });
  }, 60000);

  it('KAY-11: kapasite kaynağı seçilmemişse istasyon türünden gelir, seçim istasyonlar sahibine yazılır; insan kapasiteli istasyonun kaynağı yetkin kişilerdir; vardiyası atanmamış kişi istasyonunun vardiyasında çalışır', async () => {
    const s = sahipKur();
    s.yetkinlik = { 21: [7] };
    s.matris = [{ isMerkeziId: 1, gun: 1, vardiyaId: 31 }];
    const e = await ekranAc(s);
    kapat = e.kapat;
    expect(e.ifade<string[]>('["talasli","markalama","boya","kalite","montaj","depo",null].map(t=>kapasiteKaynagiTuret(t, null))')).toEqual(['makine', 'makine', 'makine', 'insan', 'insan', 'insan', 'makine']);
    expect(e.ifade<string>('kapasiteKaynagiTuret("montaj", "makine")')).toBe('makine');
    e.alt('wcs');
    expect(e.deger('[data-k="s:7:cap"]')).toBe('makine');
    expect(e.al('[data-k="s:7:cap"] option[value="makine"]').textContent).toContain('türden');
    expect(e.ifade<number>('stationResources(station("7")).length')).toBe(1);
    e.degistir('[data-k="s:7:cap"]', 'insan');
    await waitFor(() => { expect(s.istasyonlar[0]?.['kapasiteKaynagi']).toBe('insan'); });
    await waitFor(() => { expect(e.ifade<string>('station("7").capSrc')).toBe('insan'); });
    expect(e.ifade<string[]>('stationResources(station("7")).map(r=>r.id)')).toEqual(['7#P1']);
    e.alt('people');
    expect(e.belge.querySelector('.pcard')?.textContent).toContain('IS-7 CNC torna (yetkinlik)');
    // Pazartesi 2031-01-06: iş merkezinde Sabah vardiyası açık, kişinin kendi vardiyası yok -> 8 saat; salı vardiya yok -> 0.
    expect(e.ifade<number>('personBaseHours(person("21"), "2031-01-06")')).toBe(8);
    expect(e.ifade<number>('personBaseHours(person("21"), "2031-01-07")')).toBe(0);
  }, 60000);

  it('KAY-05: yeni iş merkezi, istasyon, makine ve personel formla sahibine eklenir; boş ad ya da sahibinin reddi formda görünür', async () => {
    const s = sahipKur();
    const e = await ekranAc(s);
    kapat = e.kapat;
    e.alt('wcs');
    e.tikla('[data-act="addWc"]');
    e.tikla('[data-act="kaynakKaydet"]');
    expect(e.al('#kyErr').textContent).toBe('Kod ve ad boş olamaz.');
    expect(s.wcs).toHaveLength(1);
    fireEvent.change(e.al('#kyKod'), { target: { value: 'IM-2' } });
    fireEvent.change(e.al('#kyAd'), { target: { value: 'Montaj' } });
    e.tikla('[data-act="kaynakKaydet"]');
    await waitFor(() => { expect(s.wcs.map((w) => w['ad'])).toEqual(['Talaşlı imalat', 'Montaj']); });
    await waitFor(() => { expect(e.belge.querySelector('#modal')?.innerHTML).toBe(''); });
    await waitFor(() => { expect(e.belge.querySelectorAll('[data-act="addStation"]')).toHaveLength(2); });
    e.tikla(`[data-act="addStation"][data-id="${String(s.wcs[1]?.id)}"]`);
    fireEvent.change(e.al('#kyKod'), { target: { value: 'IS-9' } });
    fireEvent.change(e.al('#kyAd'), { target: { value: 'Kaynak' } });
    e.tikla('[data-act="kaynakKaydet"]');
    await waitFor(() => { expect(s.istasyonlar[1]).toMatchObject({ kod: 'IS-9', ad: 'Kaynak', isMerkeziId: s.wcs[1]?.id }); });
    e.alt('machines');
    e.tikla('[data-act="addMachine"][data-id="7"]');
    fireEvent.change(e.al('#kyAd'), { target: { value: 'Torna iki' } });
    e.tikla('[data-act="kaynakKaydet"]');
    await waitFor(() => { expect(s.makineler[1]).toMatchObject({ ad: 'Torna iki', istasyonId: 7 }); });
    e.alt('people');
    e.tikla('[data-act="addPerson"]');
    fireEvent.change(e.al('#kyAd'), { target: { value: 'Veli Deneme' } });
    e.tikla('[data-act="kaynakKaydet"]');
    await waitFor(() => { expect(s.kisiler[1]).toMatchObject({ ad: 'Veli Deneme', sicilNo: null }); });
    expect(s.yazmalar.find((y) => y.yol === '/kisiler')?.baslik[ISTEK_KIMLIGI_BASLIGI]).toBeTruthy();
    await waitFor(() => { expect([...e.belge.querySelectorAll('input')].some((i) => i.value === 'Veli Deneme')).toBe(true); });
    // Sahibinin reddi formda kalır ve ekranda uyarı bırakmaz.
    e.alt('wcs');
    s.wcs.length = 0;
    e.tikla('[data-act="addWc"]');
    fireEvent.change(e.al('#kyKod'), { target: { value: 'IM-3' } });
    fireEvent.change(e.al('#kyAd'), { target: { value: 'Hata' } });
    s.sayac = 5;
    vi.mocked(fetch).mockImplementationOnce(async () => json(409, { kod: 'CAKISMA', mesaj: 'Bu kod kullanımda.' }));
    e.tikla('[data-act="kaynakKaydet"]');
    await waitFor(() => { expect(e.al('#kyErr').textContent).toBe('Bu kod kullanımda.'); });
  }, 60000);

  // Tek düzenleme yeri: vardiya, mola, iş merkezi haftası ve tatil Vardiya'da yazılır; ekran yazmaz, o sayfaya götürür.
  it('KAY-06: vardiya, mola, hafta düzeni ve tatil düzenlemesi yazılmaz, Vardiya sayfasına götürür', async () => {
    const s = sahipKur();
    s.matris = [{ isMerkeziId: 1, gun: 1, vardiyaId: 31 }];
    const e = await ekranAc(s);
    kapat = e.kapat;
    e.alt('shifts');
    const bitis = e.deger('[data-k="v:31:end"]');
    e.degistir('[data-k="v:31:end"]', '17:00');
    expect(e.deger('[data-k="v:31:end"]')).toBe(bitis);
    fireEvent.change(e.al('#holIn'), { target: { value: '2031-05-01' } });
    for (const k of ['[data-act="addHoliday"]', '[data-act="natHolidays"]', '[data-act="addShift"]', '[data-act="toggleShift"][data-id="1"][data-day="0"][data-shift="31"]', '[data-act="copyWeek"][data-id="1"]']) e.tikla(k);
    await waitFor(() => { expect(e.gidilen).toHaveLength(6); });
    expect(new Set(e.gidilen)).toEqual(new Set(['/vardiya']));
    expect(e.belge.querySelector('#modal')?.innerHTML).toBe('');
    expect(s.yazmalar).toEqual([]);
    expect(e.ifade<Record<number, string[]>>('st.wcs[0].week')).toMatchObject({ 1: ['31'], 0: [] });
  }, 60000);

  it('KAY-09: iş merkezi haftası ve kişi vardiyası Vardiya takviminden okunur (pazar 7); kişi vardiyası yazılmaz, Vardiya başına personel sayfasına götürür', async () => {
    const s = sahipKur();
    s.matris = [{ isMerkeziId: 1, gun: 1, vardiyaId: 31 }, { isMerkeziId: 1, gun: 7, vardiyaId: 31 }];
    s.kisiVardiyalari = [{ kisiId: 21, vardiyaId: 31 }];
    const e = await ekranAc(s);
    kapat = e.kapat;
    expect(e.ifade<Record<number, string[]>>('st.wcs[0].week')).toMatchObject({ 1: ['31'], 0: ['31'], 2: [] });
    e.alt('shifts');
    expect(e.al('[data-act="toggleShift"][data-id="1"][data-day="1"][data-shift="31"]').getAttribute('aria-pressed')).toBe('true');
    e.alt('people');
    expect(e.deger('[data-k="pp:21:sh"]')).toBe('31');
    e.degistir('[data-k="pp:21:sh"]', '');
    expect(e.deger('[data-k="pp:21:sh"]')).toBe('31');
    await waitFor(() => { expect(e.gidilen).toEqual(['/vardiya/personel']); });
    expect(s.yazmalar).toEqual([]);
  }, 60000);

  it('KAY-10: vardiya takvimi okunamazsa hafta matrisi ve kişi vardiyası girdirilmez, iletisi görünür; başka dilim çalışır', async () => {
    const s = sahipKur();
    s.yetkisiz.takvim = true;
    const e = await ekranAc(s);
    kapat = e.kapat;
    e.alt('shifts');
    expect(e.belge.querySelector('[data-act="toggleShift"]')).toBeNull();
    expect(e.belge.querySelector('[data-act="copyWeek"]')).toBeNull();
    expect(e.belge.querySelector('.kb-hafta')?.textContent).toContain('Vardiya takvimi okunamadı');
    e.alt('people');
    expect(e.belge.querySelector('[data-f="shiftId"]')).toBeNull();
    expect(e.deger('[data-k="pp:21:name"]')).toBe('Ayşe Deneme');
    expect(s.yazmalar.some((y) => y.yol.startsWith('/vardiya-matrisi') || y.yol.startsWith('/kisi-vardiyalari'))).toBe(false);
  }, 60000);

  it('KAY-07: sahibinin okuma yetkisi olmayan dilim boş ve anlaşılır görünür, ekran çökmez; yetkili dilim çalışır', async () => {
    const s = sahipKur();
    s.yetkisiz = { istasyon: true, kisi: true };
    const e = await ekranAc(s);
    kapat = e.kapat;
    expect(e.ifade<number[]>('[st.wcs.length, st.stations.length, st.machines.length, st.people.length]')).toEqual([0, 0, 0, 0]);
    for (const alt of ['overview', 'wcs', 'machines']) {
      e.alt(alt);
      expect(e.belge.querySelector('.kb-yok h3')?.textContent, alt).toBe('İstasyonlar verisine erişimin yok');
    }
    e.alt('people');
    expect(e.belge.querySelector('.kb-yok h3')?.textContent).toBe('Kişiler verisine erişimin yok');
    // Vardiya takvimi sahibinde oturumla açıktır: bu dilim yine gelir.
    e.alt('shifts');
    expect(e.deger('[data-k="v:31:name"]')).toBe('Sabah');
  }, 60000);

  it('KAY-08: malzeme ve operasyon yüklemesi (baglaYukle) ile kaynak yüklemesi (kaynakYukle) aynı anda ya da ardışık koşunca biri ötekinin dilimini ezmez', async () => {
    const s = sahipKur();
    s.malzemeler = [{ id: '501', kayitNo: 501, code: 'HM-1', name: 'Deneme çubuk', type: 'ham', unit: 'kg', cost: null, stock: null, min: null, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }];
    s.operasyonlar = [{ id: '601', code: 'TOR', abbr: null, name: 'Tornalama', group: 'talasli', groupName: 'Talaşlı', stationId: '7', setup: 10, cycle: 2, aktif: true }];
    const e = await ekranAc(s);
    kapat = e.kapat;
    const ikiDilim = () => {
      expect(e.ifade<string[]>('st.items.filter(i=>i.bagli).map(i=>i.code)')).toEqual(['HM-1']);
      expect(e.ifade<string[]>('st.opdefs.filter(o=>o.bagli).map(o=>o.code)')).toEqual(['TOR']);
      expect(e.ifade<string[]>('st.stations.map(x=>x.code)')).toEqual(['IS-7']);
      expect(e.ifade<string[]>('st.cal.shifts.map(v=>v.name)')).toEqual(['Sabah']);
    };
    await waitFor(ikiDilim, { timeout: 10000 });
    // Aynı anda: iki yükleme birbirinin ortasında biter.
    e.ifade('(window.__ikisi = Promise.all([baglaYukle(), kaynakYukle()]).then(() => (window.__bitti = true)), 1)');
    await waitFor(() => { expect(e.ifade<boolean>('!!window.__bitti')).toBe(true); });
    ikiDilim();
    // Kaynak komutu yalnız kaynak dilimini yeniler; malzeme ve operasyon yerinde kalır.
    e.alt('wcs');
    e.degistir('[data-k="w:1:name"]', 'Yeni merkez');
    await waitFor(() => { expect(e.ifade<string>('st.wcs[0].name')).toBe('Yeni merkez'); });
    ikiDilim();
    // Ardından bağlı durum yeniden uygulanır; kaynak dilimindeki güncel kayıt geri dönmez.
    e.ifade('(window.__bitti = false, baglaYukle().then(() => (window.__bitti = true)), 1)');
    await waitFor(() => { expect(e.ifade<boolean>('!!window.__bitti')).toBe(true); });
    ikiDilim();
    expect(e.ifade<string>('st.wcs[0].name')).toBe('Yeni merkez');
  }, 60000);
});
