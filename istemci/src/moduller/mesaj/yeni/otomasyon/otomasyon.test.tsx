import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { BEN, KISI_A, KISI_B, ORNEK_ZAMAN, ornekBelgeler } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, mesajAc, sunucuKur, type SahteSunucu } from '../test-ortak.tsx';

// Örnek veri sabit güne bağlı (görev son tarihi, yarınki toplantı); saat örnek ana alınır, zamanlayıcılar gerçek kalır.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(ORNEK_ZAMAN); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// İlk tur açılıştan 2,5 sn, veri değişikliği turu 1,5 sn sonra koşar; bekleme bunları kapsar.
const BEKLE = { timeout: 8000 };
const DAKIKA = 60_000;
const GUN = 86_400_000;

const yazilan = (s: SahteSunucu, onek: string) => s.yazmalar.filter((y) => y.yol === '/mesaj/belge/yaz' && String(y.govde['yol']).startsWith(onek));
const govde = (y: { govde: Record<string, unknown> }) => y.govde['veri'] as Record<string, unknown>;

describe('M3 otomasyon', () => {
  it('vakti gelen zamanlanmış ileti zamanlayan adına gider; kayıt önce gönderildi olur, sonra ileti yazılır', async () => {
    const s = sunucuKur({
      ben: YAZAN,
      belgeler: { ...ornekBelgeler(), 'zamanli/z1': { cid: 'genel', by: KISI_A, text: 'Vardiya notu', sendAt: Date.now() - DAKIKA, repeat: 'none', ann: false, status: 'bekliyor', createdAt: 0 } },
    });
    mesajAc();
    await waitFor(() => { expect(yazilan(s, 'channels/genel/msgs/')).toHaveLength(1); }, BEKLE);
    const ileti = govde(yazilan(s, 'channels/genel/msgs/')[0]!);
    expect(ileti).toMatchObject({ by: KISI_A, text: 'Vardiya notu', scheduled: true, kind: 'msg' });
    const sira = s.yazmalar.map((y) => String(y.govde['yol']));
    expect(sira.indexOf('zamanli/z1')).toBeLessThan(sira.findIndex((y) => y.startsWith('channels/genel/msgs/')));
    expect(s.belgeler.get('zamanli/z1')?.veri).toMatchObject({ status: 'gonderildi' });
    expect(s.yazmalar.find((y) => y.yol === '/mesaj/belge/kilitle')?.govde).toMatchObject({ yol: 'zamanli/z1', sureMs: 30_000 });
  }, 15_000);

  it('kanalı silinmiş zamanlanmış ileti iptal olur, ileti yazılmaz', async () => {
    const s = sunucuKur({
      ben: YAZAN,
      belgeler: { ...ornekBelgeler(), 'zamanli/z1': { cid: 'yok', by: BEN, text: 'Not', sendAt: Date.now() - DAKIKA, status: 'bekliyor', createdAt: 0 } },
    });
    mesajAc();
    await waitFor(() => { expect(s.belgeler.get('zamanli/z1')?.veri).toMatchObject({ status: 'iptal' }); }, BEKLE);
    expect(s.yazmalar.some((y) => String(y.govde['yol']).includes('/msgs/'))).toBe(false);
  }, 15_000);

  it('otomatik uyarı tetik kaydını yazar ve botun adıyla, etiketle gider; ikinci turda tekrar gitmez', async () => {
    const s = sunucuKur({
      ben: YAZAN,
      belgeler: {
        ...ornekBelgeler(),
        'tasks/t9': { title: 'Geciken iş', to: KISI_B, by: KISI_A, status: 'todo', due: Date.now() - 2 * GUN, createdAt: 0 },
        'kurallar/r1': { type: 'task_late', cid: 'uretim', params: {}, on: true, by: KISI_A, createdAt: Date.now() - 3 * GUN },
      },
    });
    mesajAc();
    await waitFor(() => { expect(yazilan(s, 'channels/uretim/msgs/')).toHaveLength(1); }, BEKLE);
    const ileti = govde(yazilan(s, 'channels/uretim/msgs/')[0]!);
    expect(ileti).toMatchObject({ by: '__bot', kind: 'auto', rule: 'task_late', mentions: [KISI_B] });
    const tetik = yazilan(s, 'tetikler/');
    expect(tetik).toHaveLength(1);
    expect(govde(tetik[0]!)).toMatchObject({ rule: 'r1', by: BEN });
    await new Promise((r) => { setTimeout(r, 2000); });
    expect(yazilan(s, 'channels/uretim/msgs/')).toHaveLength(1);
  }, 15_000);

  it('başka sekmenin yazdığı tetik varsa uyarı gitmez', async () => {
    const due = Date.now() - 2 * GUN;
    const gun = new Date(due);
    const anahtar = `r1_t9_${String(gun.getFullYear())}-${String(gun.getMonth() + 1).padStart(2, '0')}-${String(gun.getDate()).padStart(2, '0')}`;
    const s = sunucuKur({
      ben: YAZAN,
      belgeler: {
        ...ornekBelgeler(),
        'tasks/t9': { title: 'Geciken iş', to: KISI_B, by: KISI_A, status: 'todo', due, createdAt: 0 },
        'kurallar/r1': { type: 'task_late', cid: 'uretim', params: {}, on: true, by: KISI_A, createdAt: Date.now() - 3 * GUN },
        [`tetikler/${anahtar}`]: { rule: 'r1', ts: 0, by: KISI_A },
      },
    });
    mesajAc();
    await waitFor(() => { expect(s.yazmalar.some((y) => y.govde['yol'] === `tetikler/${anahtar}`)).toBe(true); }, BEKLE);
    await new Promise((r) => { setTimeout(r, 500); });
    expect(yazilan(s, 'channels/uretim/msgs/')).toHaveLength(0);
  }, 15_000);

  it('salt okur kişinin sekmesi zamanlanmış ileti ve uyarı göndermez (reddedilen)', async () => {
    const s = sunucuKur({
      ben: OKUYAN,
      belgeler: {
        ...ornekBelgeler(),
        'zamanli/z1': { cid: 'genel', by: KISI_A, text: 'Not', sendAt: Date.now() - DAKIKA, status: 'bekliyor', createdAt: 0 },
        'tasks/t9': { title: 'Geciken iş', to: KISI_B, by: KISI_A, status: 'todo', due: Date.now() - 2 * GUN, createdAt: 0 },
      },
    });
    mesajAc();
    await screen.findByRole('tab', { name: /^Bugün/ });
    await new Promise((r) => { setTimeout(r, 4000); });
    expect(s.yazmalar.filter((y) => y.yol !== '/mesaj/belge/yaz' || !String(y.govde['yol']).startsWith('data/users/'))).toEqual([]);
  }, 15_000);

  it('görev hatırlatması ekranda eylemli bildirimle bir kez gösterilir ve işaret eski ekranla ortak yere yazılır', async () => {
    const s = sunucuKur({
      ben: YAZAN,
      belgeler: { ...ornekBelgeler(), 'tasks/t9': { title: 'Hatırlatılacak iş', to: BEN, by: KISI_A, status: 'todo', remind: Date.now() - DAKIKA, createdAt: 0 } },
    });
    vi.stubGlobal('AudioContext', undefined);
    mesajAc();
    expect(await screen.findByText(/Hatırlatma: Hatırlatılacak iş/, undefined, BEKLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Görevi aç' })).toBeTruthy();
    expect(yazilan(s, 'data/users/5/yerel/anahtarlar/mesai%3Art%3At9%3A').length).toBe(1);
  }, 15_000);

  it('açılıştan sonra gelen görev ataması ekranda bildirilir', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    mesajAc();
    await screen.findByRole('tab', { name: /^Bugün/ });
    s.disaridanYaz('tasks/t9', { title: 'Yeni iş', to: BEN, by: KISI_A, status: 'todo', createdAt: Date.now() + 1000 });
    expect(await screen.findByText('Örnek sana görev verdi: Yeni iş', undefined, { timeout: 15_000 })).toBeTruthy();
  }, 20_000);
});
