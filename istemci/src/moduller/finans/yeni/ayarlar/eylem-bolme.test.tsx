import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { FinansHamVerisi } from '../donustur.ts';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { finansAc, sunucuKur } from '../test-ortak.tsx';

// 3165 a: finans yönetimi sekiz eyleme bölündü. Sekizini birden taşıyanda eylemler yer değiştirse fark edilmez; burada her kişi
// tek eylem taşır ve Ayarlar'ın her bölümü yalnız kendi eylemiyle yazılır. Kişiler uydurmadır.
const AYAR_EYLEMLERI = ['finans.ayar', 'finans.hesap-yonet', 'finans.oran-yaz', 'finans.sabit-kiymet', 'finans.duzenli-odeme'] as const;
type Eylem = (typeof AYAR_EYLEMLERI)[number];
const tek = (eylem: Eylem): Kullanici => ({ id: 21, ad: 'Deneme Tek Eylem', islemler: ['sayfa.finans', 'finans.oku', eylem] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T09:00:00'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// Düğmenin YOKLUĞU oturum yüklenmeden de doğrudur; önce oturumun ekrana işlemesi beklenir.
const oturumIslesin = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
// Sabit kıymet satırındaki düğme ölçülsün diye örnek veriye bir uydurma kıymet eklenir.
const hamVeri = (): FinansHamVerisi => ({
  ...ornekHamVeri(),
  sabitKiymetler: [{
    id: 1, ad: 'Deneme tezgah', makineKodu: null, paraBirimi: 'TRY', bedel: '120000.00', kur: '1.000000', alisTarihi: '2026-01-10', omurAy: 60, yontem: 'normal', kalintiDegeri: '0.00',
    devirTarihi: null, devirBirikmisTl: null, pasifTarihi: null, aciklama: null, surum: 1, olusturma: '2026-01-10T08:00:00.000Z', makineId: null,
    bedelTl: '120000.00', buAyTl: '2000.00', birikmisTl: '18000.00', netTl: '102000.00',
  }],
});
const ac = async (eylem: Eylem, sekme: string) => {
  sunucuKur(tek(eylem), {}, hamVeri());
  finansAc(`/finans/ayarlar?sekme=${sekme}`);
  await screen.findByRole('tablist', { name: 'Ayar bölümleri' });
  await oturumIslesin();
};
const dugme = (ad: string): boolean => screen.queryByRole('button', { name: ad }) !== null;
const form = (ad: string): boolean => screen.queryByRole('form', { name: ad }) !== null;

describe('finans Ayarlar: her bölüm kendi eylemiyle yazılır (3165 a)', () => {
  it.each(AYAR_EYLEMLERI)('yalnız %s taşıyan kişi yalnız kendi bölümünü yazar', async (eylem) => {
    await ac(eylem, 'hesaplar');
    expect(dugme('Yeni hesap'), 'hesap').toBe(eylem === 'finans.hesap-yonet');
    expect(screen.queryAllByRole('button', { name: 'Düzenle' }).length > 0, 'hesap satırı düzenle').toBe(eylem === 'finans.hesap-yonet');
    expect(screen.queryAllByRole('button', { name: 'Pasife al' }).length > 0, 'hesap satırı pasif').toBe(eylem === 'finans.hesap-yonet');
    cleanup();

    await ac(eylem, 'kdv');
    expect(form('KDV oranı ekle'), 'oran').toBe(eylem === 'finans.oran-yaz');
    cleanup();

    await ac(eylem, 'sabit');
    expect(form('Sabit kıymet ekle'), 'sabit kıymet').toBe(eylem === 'finans.sabit-kiymet');
    expect(screen.getAllByText('Deneme tezgah').length > 0).toBe(true);
    expect(dugme('Pasife al'), 'sabit kıymet satırı pasif').toBe(eylem === 'finans.sabit-kiymet');
    cleanup();

    await ac(eylem, 'nakit');
    expect(dugme('Düzenli ödeme ekle'), 'düzenli ödeme').toBe(eylem === 'finans.duzenli-odeme');
    expect(dugme('Kaldır'), 'düzenli kaldır').toBe(eylem === 'finans.duzenli-odeme');
    expect((screen.getByLabelText('Güvenlik eşiği') as HTMLInputElement).disabled, 'nakit ayarı').toBe(eylem !== 'finans.ayar');
    cleanup();

    await ac(eylem, 'kurlar');
    expect(form('Çapraz kur payı'), 'kur payı').toBe(eylem === 'finans.ayar');
    cleanup();

    await ac(eylem, 'danisman');
    expect((screen.getByLabelText('Nakit risk toleransı') as HTMLSelectElement).disabled, 'analiz ayarı').toBe(eylem !== 'finans.ayar');
  });
});
