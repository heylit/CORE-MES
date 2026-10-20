import { beforeEach, describe, expect, it, vi } from 'vitest';
import { kalibrasyonKuraliBetigi } from '../kalibrasyon/disari.ts';
import { OLCU_ALETI_BETIGI } from './acilis.ts';
import { KALIBRASYON_YOLU, kalibrasyonaGitIstegiMi } from './KaliteMerkeziCercevesi.tsx';
import { KITAPLIK_KIMLIKLERI, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

// 329 a: ölçüm cihazları listesi Kalibrasyondan salt okunur gelir; ekleme, düzenleme, kalibrasyon kaydı ve silme kapanır. Uygulamanın
// kendi vDev ve devHistory tanımları kurulu sayfadan ayıklanır, betik gerçektir.
const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
const SAYFA = sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: false } });
const SATIRLAR = SAYFA.split('\n');

function parca(bas: string): string {
  const i = SATIRLAR.findIndex((s) => s.startsWith(bas));
  if (i < 0) throw new Error(`Paketten ayıklanamadı: ${bas}`);
  let derinlik = 0;
  let basladi = false;
  const cikti: string[] = [];
  for (let k = i; k < SATIRLAR.length; k++) {
    const satir = SATIRLAR[k] ?? '';
    cikti.push(satir);
    for (const ch of satir) {
      if (ch === '{') { derinlik++; basladi = true; } else if (ch === '}') derinlik--;
    }
    if (basladi && derinlik === 0) break;
  }
  return cikti.join('\n');
}
const sabit = (bas: string): string => {
  const s = SATIRLAR.find((x) => x.startsWith(bas));
  if (!s) throw new Error(`Paketten ayıklanamadı: ${bas}`);
  return s;
};

type Cihaz = Record<string, unknown> & { _id: string };
interface Sayfa {
  vDev: { html(): string };
  devHistory(id: string): void;
  openDev(rec?: unknown): void;
  openCalRec(id: string): void;
  delRec(col: string, id: string, ad: string): void;
  S: { dev: Cihaz[]; insp: unknown[] };
}

const kalibrasyonCihazi = (ek: Record<string, unknown> = {}): Cihaz => ({
  _id: 'kal-1', kod: 'OC-1', ad: 'Kumpas 150', tip: 'Kumpas', lokasyon: 'CNC-1', aralik: '0-150', sonKal: '2026-10-01', periyot: 3, periyotGun: 90,
  sertifika: 'SRT-1', kullanimDisi: false, kalibrasyondan: true,
  gecmis: [{ tarih: '2026-10-01', sonuc: 'Uygun', sertifika: 'SRT-1', not: 'sapma yok' }], ...ek,
});

function kur(devler: Cihaz[]) {
  const ust = { postMessage: vi.fn() };
  const toast = vi.fn();
  const asilSil = vi.fn();
  const pencere = { __TMI_KM: { koken: 'http://localhost:4101' }, parent: ust } as Record<string, unknown>;
  const kod = [
    kalibrasyonKuraliBetigi(),
    sabit('const pad='), sabit('const isoOf='), sabit('const parse='), sabit('const TODAY='),
    sabit('const trd='), sabit('const stamp='), sabit('const noData='), sabit('const devById='),
    parca('function addMonths'), parca('function daysUntil'), parca('function devStatus'), parca('function head('), parca('function attachHTML'),
    parca('function devHistory'), parca('const vDev={'),
    'function openDev(){ throw new Error("özgün openDev"); }',
    'function openCalRec(){ throw new Error("özgün openCalRec"); }',
    'function delRec(){ return asilSil.apply(this, arguments); }',
    'const UI={f:{}}; const DL=false; const S={dev:devler,insp:[]};',
    OLCU_ALETI_BETIGI,
    'return {vDev,devHistory,openDev,openCalRec,delRec,S};',
  ].join('\n');
  // Uygulamanın dışarıdan aldıkları: modal (başlığı uygulamanınki gibi kaçışlar), ek ve yardımcı kancalar.
  const govde = `const $$=()=>[]; const renderAttach=()=>{}; ${sabit('const esc=')}\nconst openModal=(t,b)=>{document.getElementById('modal').innerHTML='<h3>'+esc(t)+'</h3><div class="mbody">'+b+'</div>'};\n${kod}`;
  const sayfa = new Function('window', 'toast', 'asilSil', 'devler', govde)(pencere, toast, asilSil, devler) as Sayfa;
  return { sayfa, ust, toast, asilSil, pencere };
}

describe('Kalite Merkezi ölçüm cihazları: Kalibrasyondan salt okunur liste (329 a)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    document.body.innerHTML = '<div id="modal"></div>';
  });

  it('liste Kalibrasyon cihazlarını gösterir; ekle, düzenle, kalibrasyon kaydet ve sil yok, Kalibrasyon sayfası düğmesi ve açıklama var', () => {
    const { sayfa } = kur([kalibrasyonCihazi()]);
    const h = sayfa.vDev.html();
    expect(h).toContain('OC-1');
    expect(h).toContain('Kumpas 150');
    expect(h).toContain('CNC-1');
    for (const yok of ['>Cihaz ekle<', 'openDev(', 'openCalRec(', 'delRec(', '>Düzenle<', '>Sil<', 'Kalibrasyon kaydet']) expect(h, yok).not.toContain(yok);
    expect(h).toContain('onclick="tmiKalibrasyonaGit()"');
    expect(h).toContain('id="tmiKalibrasyonNotu"');
    expect(h).toContain('devHistory(');
  });

  it('boş listede de ekleme düğmesi yoktur', () => {
    const h = kur([]).sayfa.vDev.html();
    expect(h).not.toContain('>Cihaz ekle<');
    expect(h).not.toContain('openDev(');
    expect(h).toContain('tmiKalibrasyonaGit()');
  });

  it('periyot gün olarak gösterilir (gün / 30 ay yuvarlanmış metin değil); durum Kalibrasyon kuralındandır', () => {
    const h = kur([kalibrasyonCihazi({ periyotGun: 100, periyot: 100 / 30 })]).sayfa.vDev.html();
    expect(h).toContain('100 gün</span>');
    expect(h).not.toContain('3.33');
    expect(h).toContain('Geçerli');
    expect(h).toContain('09.01.2027');
  });

  it('ay cinsinden eski kayıt (periyotGun yok) olduğu gibi gösterilir', () => {
    const h = kur([{ _id: 'd_1', kod: 'ESKI-1', ad: 'Eski mastar', sonKal: '', periyot: 12, kalibrasyondaYok: true }]).sayfa.vDev.html();
    expect(h).toContain('12 ay</span>');
    expect(h).toContain('Kayıt yok');
  });

  it('XSS: Kalibrasyondan gelen metinler listede ve geçmiş penceresinde kaçışlanır', () => {
    const zarar = '<img src=x onerror=alert(1)>';
    const { sayfa } = kur([kalibrasyonCihazi({
      kod: '"><script>alert(2)</script>', ad: zarar, lokasyon: zarar, aralik: zarar, tip: zarar, sertifika: zarar,
      gecmis: [{ tarih: '2026-10-01', sonuc: 'Uygun', sertifika: zarar, not: zarar }],
    })]);
    const liste = sayfa.vDev.html();
    sayfa.devHistory('kal-1');
    const pencere = document.getElementById('modal')!.innerHTML;
    for (const cikti of [liste, pencere]) {
      expect(cikti).not.toContain('<img src=x');
      expect(cikti).not.toContain('<script>alert(2)');
      expect(cikti).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
    expect(document.getElementById('modal')!.querySelector('img,script')).toBeNull();
  });

  it('geçmiş penceresi Kalibrasyon kayıtlarını gösterir; sertifika eki bölümü (yazma yolu) gösterilmez', () => {
    const { sayfa } = kur([kalibrasyonCihazi()]);
    document.getElementById('modal')!.innerHTML = '';
    sayfa.devHistory('kal-1');
    const pencere = document.getElementById('modal')!;
    expect(pencere.textContent).toContain('SRT-1');
    expect(pencere.textContent).toContain('sapma yok');
    expect(pencere.querySelector('.attw')).toBeNull();
  });

  it('ekleme, düzenleme, kalibrasyon kaydı ve cihaz silme kullanıcıyı Kalibrasyon sayfasına yönlendirir; öteki kayıtların silinmesi özgün kalır', () => {
    const { sayfa, ust, toast, asilSil } = kur([kalibrasyonCihazi()]);
    sayfa.openDev();
    sayfa.openCalRec('kal-1');
    sayfa.delRec('dev', 'kal-1', 'OC-1');
    expect(toast).toHaveBeenCalledTimes(3);
    expect(toast).toHaveBeenCalledWith('Ölçü aletleri Kalibrasyon sayfasından yönetilir.', 'bad');
    expect(ust.postMessage).toHaveBeenCalledTimes(3);
    expect(ust.postMessage.mock.calls[0]).toEqual([expect.objectContaining({ kanal: 'tmi-kalite-merkezi', yon: 'istek', tip: 'kalibrasyona-git', id: expect.any(Number) }), 'http://localhost:4101']);
    expect(asilSil).not.toHaveBeenCalled();
    sayfa.delRec('ncr', 'n1', 'NCR-1');
    expect(asilSil).toHaveBeenCalledWith('ncr', 'n1', 'NCR-1');
  });

  it('kabuk yalnız kalite merkezi kanalındaki "kalibrasyona-git" isteğini kabul eder ve tek hedefe gider', () => {
    expect(KALIBRASYON_YOLU).toBe('/kalibrasyon');
    expect(kalibrasyonaGitIstegiMi({ kanal: 'tmi-kalite-merkezi', yon: 'istek', id: 1, tip: 'kalibrasyona-git' })).toBe(true);
    expect(kalibrasyonaGitIstegiMi({ kanal: 'baska', yon: 'istek', id: 1, tip: 'kalibrasyona-git' })).toBe(false);
    expect(kalibrasyonaGitIstegiMi({ kanal: 'tmi-kalite-merkezi', yon: 'yanit', id: 1, tip: 'kalibrasyona-git' })).toBe(false);
    expect(kalibrasyonaGitIstegiMi({ kanal: 'tmi-kalite-merkezi', yon: 'istek', id: 1, tip: 'api' })).toBe(false);
    expect(kalibrasyonaGitIstegiMi(null)).toBe(false);
  });

  it('betik kurulu sayfada uygulamanın tanımlarından sonra, görünüm betiğinden önce çalışır', () => {
    const betik = SAYFA.indexOf(OLCU_ALETI_BETIGI);
    expect(betik).toBeGreaterThan(SAYFA.indexOf('const vDev={'));
    expect(betik).toBeLessThan(SAYFA.lastIndexOf('(function () {\n  \'use strict\';\n  var A = window.__TMI_KM || {};\n  var UST = window.parent;\n  var GK'));
  });
});
