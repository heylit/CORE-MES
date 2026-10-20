import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import type { Emir, EmirAyrintiCevabi, RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { RefakatKarti } from './RefakatKarti.tsx';
import { partiMetni, refakatBelgesi } from './refakat.ts';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR = {
  id: 12, emirNo: 'UE-000012', durum: 'planli', parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 10, istasyon: { id: 3, ad: 'Deneme Tezgah' },
  acan: { id: 7, ad: 'Deneme Planlamaci' }, acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null, malzemeNo: 901,
} satisfies Emir;
const KART = {
  emirId: 12, qr: 'UE:12', emirNo: 'UE-000012', urun: { kod: 'DNM-001', ad: 'Deneme <mil>' }, adet: 10, teslim: '2026-10-20',
  parti: { ustEmirNo: null, bolunmeSira: null },
  adimlar: [
    { opNo: 10, ad: 'Torna', yer: 'Deneme Tezgah', fason: false },
    { opNo: 20, ad: 'Kaplama', yer: 'Deneme Fason', fason: true },
  ],
} satisfies RefakatKartiCevabi;
const YETKISIZ: Kullanici = { id: 11, ad: 'Deneme Operator', islemler: ['terminal.uret'] };

function Adres() {
  const l = useLocation();
  return <p>{l.pathname + l.search}</p>;
}

const ekran = [
  { yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi },
  { yol: '/uretim-emirleri/:id/refakat-karti', ekran: RefakatKarti },
];
const ayrinti = (emir: Emir) => json(200, { emir, kayitlar: [], adimlar: [] } satisfies EmirAyrintiCevabi);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Refakat kartı', () => {
  it('düğme okuma yetkisi olana, iş emirli ve iptal edilmemiş emirde görünür', async () => {
    for (const [kullanici, emir, gorunur] of [
      [OKUYUCU, EMIR, true], [YETKISIZ, EMIR, false], [OKUYUCU, { ...EMIR, durum: 'iptal' }, false], [OKUYUCU, { ...EMIR, malzemeNo: null }, false],
    ] as const) {
      sunucuKur(kullanici, { 'GET /uretim-emirleri/12': () => ayrinti(emir) });
      ac(ekran, '/uretim-emirleri/12');
      await screen.findByText('UE-000012');
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Refakat kartı bas' }) !== null).toBe(gorunur));
      cleanup();
    }
  });

  it('Etiket Merkezi sayfası olana Etiket Merkezi düğmesi emrin refakat şablonunu açar; sayfası olmayana görünmez', async () => {
    const yazici: Kullanici = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.etiket-merkezi'] };
    for (const [kullanici, emir, gorunur] of [
      [yazici, EMIR, true], [OKUYUCU, EMIR, false], [yazici, { ...EMIR, durum: 'iptal' }, false], [yazici, { ...EMIR, malzemeNo: null }, false],
    ] as const) {
      sunucuKur(kullanici, { 'GET /uretim-emirleri/12': () => ayrinti(emir) });
      ac([...ekran, { yol: '/etiket-merkezi', ekran: Adres }], '/uretim-emirleri/12');
      await screen.findByText('UE-000012');
      await waitFor(() => expect(screen.queryByRole('button', { name: "Etiket Merkezi'nde bas" }) !== null).toBe(gorunur));
      if (gorunur) {
        fireEvent.click(screen.getByRole('button', { name: "Etiket Merkezi'nde bas" }));
        expect(await screen.findByText('/etiket-merkezi?tur=refakat&id=12')).toBeTruthy();
      }
      cleanup();
    }
  });

  it('düğme kart sayfasını açar; kart sunucudan okunur ve önizlenir', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri/12': () => ayrinti(EMIR),
      'GET /adimli-emirler/12/refakat-karti': () => json(200, KART),
    });
    ac(ekran, '/uretim-emirleri/12');
    fireEvent.click(await screen.findByRole('button', { name: 'Refakat kartı bas' }));
    const cerceve = await screen.findByTitle('Refakat kartı önizleme');
    expect(cerceve.getAttribute('srcdoc')).toContain('UE-000012');
    expect(screen.getByRole('button', { name: 'Yazdır' })).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/adimli-emirler/12/refakat-karti')).toBe(true);
  });

  it('yetkisiz kişiye sunucunun reddi gösterilir, yazdırma kapalı kalır', async () => {
    sunucuKur(YETKISIZ, { 'GET /adimli-emirler/12/refakat-karti': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }) });
    ac(ekran, '/uretim-emirleri/12/refakat-karti');
    expect(await screen.findByText('Bu işlem için yetkiniz yok.')).toBeTruthy();
    expect(screen.queryByTitle('Refakat kartı önizleme')).toBeNull();
    expect((screen.getByRole('button', { name: 'Yazdır' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('belge 100x150 sayfadır, QR yalnız kimlik taşır, metin kaçışlanır, fason adım işaretlenir', () => {
    const b = refakatBelgesi(KART, new Date('2026-10-13T12:00:00'));
    expect(b).toContain('@page{size:100mm 150mm');
    expect(b).toContain('aria-label="QR: UE:12"');
    expect(b).toContain('Deneme &lt;mil&gt;');
    expect(b).not.toContain('<mil>');
    expect(b).toContain('Deneme Fason (fason)');
    expect(b).toContain('Parti: Ana emir');
  });

  it('parti metni ana emri ve alt partiyi ayırır', () => {
    expect(partiMetni({ ustEmirNo: null, bolunmeSira: null })).toBe('Ana emir');
    expect(partiMetni({ ustEmirNo: 'UE-000012', bolunmeSira: 2 })).toBe('Alt parti 2 · üst UE-000012');
  });
});
