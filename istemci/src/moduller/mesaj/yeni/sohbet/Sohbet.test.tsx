import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BEN, KISI_A, ORNEK_ZAMAN, ornekBelgeler } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, mesajAc, sunucuKur, type SahteSunucu } from '../test-ortak.tsx';

// Otomatik uyarılar (M3) her açılışta koşar; örnek görevin son tarihi sabit güne bağlı olduğundan saat geçince "görev gecikti" iletisi
// kanala düşer ve okundu yazmasının bekleme süresini yeniden başlatır. Saat örnek ana alınır, zamanlayıcılar gerçek kalır.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(ORNEK_ZAMAN); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// Uydurma veri: örnek belgelere bu dosyanın iletileri eklenir.
const T = ORNEK_ZAMAN;
const belgeler = (ek: Record<string, Record<string, unknown>> = {}) => ({
  ...ornekBelgeler(),
  'channels/genel/msgs/m2': { by: BEN, ts: T - 3e4, kind: 'msg', text: 'Benim iletim', rx: {} },
  'channels/genel/msgs/m3': { by: KISI_A, ts: T - 2e4, kind: 'ann', text: 'Örnek duyuru', ref: 'd1', rx: {} },
  ...ek,
});

const iletiKutusu = async (metin: string) => {
  const el = (await screen.findByText(metin)).closest('article');
  if (!el) throw new Error(`ileti yok: ${metin}`);
  return el as HTMLElement;
};
const yazilan = (s: SahteSunucu, kosul: (yol: string) => boolean) => s.yazmalar.filter((y) => kosul(String(y.govde['yol'] ?? '')));
const kanalAc = async () => {
  mesajAc('/mesaj/yeni/sohbet/genel');
  return screen.findByRole('log', { name: 'Mesajlar' });
};

describe('M1 sohbet: kanal listesi ve akış', () => {
  it('kanallar son yazışmaya göre sıralı; bahisli kanalda @ işareti var', async () => {
    sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    mesajAc('/mesaj/yeni/sohbet');
    const liste = await screen.findByRole('navigation', { name: 'Kanallar' });
    const adlar = within(liste).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(adlar.findIndex((a) => a.includes('genel'))).toBeLessThan(adlar.findIndex((a) => a.includes('üretim')));
    expect(within(liste).getByLabelText('Senden bahsedildi')).toBeTruthy();
  });

  it('kanal açılınca iletiler, bahis adı ve duyuru etiketi çizilir; okundu bilgisi yazılır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    await kanalAc();
    const m1 = await iletiKutusu('Günaydın');
    expect(within(m1).getByText('@Deneme Yönetici')).toBeTruthy();
    expect(within(await iletiKutusu('Örnek duyuru')).getByText('Duyuru')).toBeTruthy();
    await waitFor(() => { expect(yazilan(s, (y) => y === `okuma/${BEN}`)).toHaveLength(1); }, { timeout: 4000 });
  });
});

describe('M1 sohbet: yazma (izinli ve reddedilen)', () => {
  it('yazabilen kişi Enter ile gönderir: ileti ve kanal özeti yazılır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    await kanalAc();
    const alan = await screen.findByRole('textbox', { name: 'Mesaj yaz' });
    fireEvent.change(alan, { target: { value: 'merhaba ekip' } });
    fireEvent.keyDown(alan, { key: 'Enter' });
    await waitFor(() => {
      const ileti = yazilan(s, (y) => /^channels\/genel\/msgs\/[A-Za-z0-9]+$/.test(y));
      expect(ileti).toHaveLength(1);
      expect(ileti[0]?.govde['veri']).toMatchObject({ by: BEN, kind: 'msg', text: 'merhaba ekip' });
    });
    await waitFor(() => { expect(yazilan(s, (y) => y === 'channels/genel').at(-1)?.govde['veri']).toMatchObject({ lastBy: BEN, lastText: 'merhaba ekip' }); });
  });

  it('salt okur kişide yazma alanı, Kanal düğmesi, tepki ve yanıt düğmeleri yoktur', async () => {
    sunucuKur({ ben: OKUYAN, belgeler: belgeler() });
    await kanalAc();
    expect(await screen.findByText('Bu çalışma alanında yalnızca okuma iznin var.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Mesaj yaz' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kanal' })).toBeNull();
    const m1 = await iletiKutusu('Günaydın');
    expect(within(m1).queryByRole('button', { name: 'Tamam tepkisi' })).toBeNull();
    expect(within(m1).queryByRole('button', { name: 'Yanıtla' })).toBeNull();
    fireEvent.click(within(m1).getByRole('button', { name: 'Diğer işlemler' }));
    const menu = await screen.findByRole('dialog', { name: 'Mesaj işlemleri' });
    expect(within(menu).queryByRole('group', { name: 'Tepki ver' })).toBeNull();
    expect(within(menu).queryByText('Yanıtla')).toBeNull();
    expect(within(menu).getByText('Metni kopyala')).toBeTruthy();
  });

  it('tepki yalnız kendi anahtarıyla birleştirilerek yazılır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    await kanalAc();
    fireEvent.click(within(await iletiKutusu('Günaydın')).getByRole('button', { name: 'Tamam tepkisi' }));
    await waitFor(() => {
      const y = yazilan(s, (x) => x === 'channels/genel/msgs/m1').at(-1);
      expect(y?.govde).toMatchObject({ kip: 'birlestir', veri: { rx: { c_tamam: { [BEN]: BEN } } } });
    });
  });

  it('kendi iletimde düzenle ve sil var; silme onaydan sonra "silindi" yazar (izinli)', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    await kanalAc();
    fireEvent.click(within(await iletiKutusu('Benim iletim')).getByRole('button', { name: 'Diğer işlemler' }));
    const menu = await screen.findByRole('dialog', { name: 'Mesaj işlemleri' });
    expect(within(menu).getByText('Düzenle')).toBeTruthy();
    fireEvent.click(within(menu).getByText('Sil'));
    const onay = await screen.findByRole('dialog', { name: 'Mesaj silinsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Sil' }));
    await waitFor(() => {
      expect(yazilan(s, (y) => y === 'channels/genel/msgs/m2').at(-1)?.govde['veri']).toEqual({ deleted: true, text: '', att: null });
    });
  });

  it('başkasının iletisinde düzenle, sil ve mesaj bilgisi yoktur; yönetici için de (reddedilen)', async () => {
    sunucuKur({ ben: YONETICI, belgeler: belgeler() });
    await kanalAc();
    fireEvent.click(within(await iletiKutusu('Günaydın')).getByRole('button', { name: 'Diğer işlemler' }));
    const menu = await screen.findByRole('dialog', { name: 'Mesaj işlemleri' });
    expect(within(menu).getByText('Yanıtla')).toBeTruthy();
    expect(within(menu).queryByText('Düzenle')).toBeNull();
    expect(within(menu).queryByText('Sil')).toBeNull();
    expect(within(menu).queryByText('Mesaj bilgisi (kimler okudu)')).toBeNull();
  });

  it('kendi iletisini düzenleyen kişi Enter ile kaydeder; bahis adı yeniden kodlanır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    await kanalAc();
    fireEvent.click(within(await iletiKutusu('Benim iletim')).getByRole('button', { name: 'Diğer işlemler' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Mesaj işlemleri' })).getByText('Düzenle'));
    const alan = await screen.findByRole('textbox', { name: 'Mesajı düzenle' });
    fireEvent.change(alan, { target: { value: 'Benim iletim @Örnek Kişi A' } });
    fireEvent.keyDown(alan, { key: 'Enter' });
    await waitFor(() => {
      expect(yazilan(s, (y) => y === 'channels/genel/msgs/m2').at(-1)?.govde['veri']).toMatchObject({ text: `Benim iletim <@${KISI_A}>`, mentions: [KISI_A] });
    });
  });
});

describe('M1 sohbet: duyuru okundu', () => {
  it('yazabilen kişi kanaldaki duyuruyu "Okudum, anladım" ile işaretler (izinli)', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    await kanalAc();
    fireEvent.click(within(await iletiKutusu('Örnek duyuru')).getByRole('button', { name: 'Okudum, anladım' }));
    await waitFor(() => { expect(yazilan(s, (y) => y === 'duyurular/d1').at(-1)?.govde['veri']).toEqual({ ack: { [BEN]: BEN } }); });
    expect(await screen.findByText('Okundu olarak işaretlendi.')).toBeTruthy();
  });

  it('salt okur kişide okundu düğmesi yoktur, okuyan sayısı görünür (reddedilen)', async () => {
    sunucuKur({ ben: OKUYAN, belgeler: belgeler() });
    await kanalAc();
    const m3 = await iletiKutusu('Örnek duyuru');
    expect(within(m3).queryByRole('button', { name: 'Okudum, anladım' })).toBeNull();
    fireEvent.click(within(m3).getByRole('button', { name: '0 kişi okudu' }));
    const p = await screen.findByRole('dialog', { name: 'Kimler okudu?' });
    expect(within(p).queryByRole('button', { name: 'Okumayanlara hatırlat' })).toBeNull();
  });

  it('duyurunun sahibi okumayanlara kanalda etiketli hatırlatma gönderir', async () => {
    const s = sunucuKur({
      ben: YAZAN,
      belgeler: belgeler({ 'duyurular/d2': { by: BEN, ts: T - 1e4, text: 'Benim duyurum', cid: 'genel', mid: 'm4', ack: {} }, 'channels/genel/msgs/m4': { by: BEN, ts: T - 1e4, kind: 'ann', text: 'Benim duyurum', ref: 'd2', rx: {} } }),
    });
    await kanalAc();
    fireEvent.click(within(await iletiKutusu('Benim duyurum')).getByRole('button', { name: '0 kişi okudu, kimler okumadı?' }));
    const p = await screen.findByRole('dialog', { name: 'Kimler okudu?' });
    fireEvent.click(within(p).getByRole('button', { name: 'Okumayanlara hatırlat' }));
    await waitFor(() => {
      const ileti = yazilan(s, (y) => /^channels\/genel\/msgs\/[A-Za-z0-9]{20}$/.test(y)).at(-1)?.govde['veri'] as Record<string, unknown> | undefined;
      expect(ileti?.['text']).toMatch(/^🔔 Hatırlatma: .*<@11>.* lütfen duyuruyu okuyup onaylayın\.$/);
      expect(ileti?.['replyTo']).toMatchObject({ id: 'm4', by: BEN });
    });
  });
});

describe('M1 sohbet: zamanlanmış mesajlar (225 a)', () => {
  const zamanli = { 'zamanli/z1': { cid: 'genel', by: KISI_A, text: 'Başkasının zamanlısı', sendAt: Date.now() + 36e5, repeat: 'none', ann: false, status: 'bekliyor', createdAt: T } };

  it('başkasının zamanlısında düzenle ve iptal yoktur (reddedilen)', async () => {
    sunucuKur({ ben: YAZAN, belgeler: belgeler(zamanli) });
    await kanalAc();
    fireEvent.click(await screen.findByRole('button', { name: /^1$/ }));
    const p = await screen.findByRole('dialog', { name: 'Zamanlanmış mesajlar' });
    expect(within(p).getByText('Başkasının zamanlısı')).toBeTruthy();
    expect(within(p).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(within(p).queryByRole('button', { name: 'İptal et' })).toBeNull();
  });

  it('yönetici başkasının zamanlısını iptal eder (izinli)', async () => {
    const s = sunucuKur({ ben: YONETICI, belgeler: belgeler(zamanli) });
    await kanalAc();
    fireEvent.click(await screen.findByRole('button', { name: /^1$/ }));
    const p = await screen.findByRole('dialog', { name: 'Zamanlanmış mesajlar' });
    fireEvent.click(within(p).getByRole('button', { name: 'İptal et' }));
    const onay = await screen.findByRole('dialog', { name: 'Zamanlanmış mesaj iptal edilsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/mesaj/belge/sil' && y.govde['yol'] === 'zamanli/z1')).toBe(true); });
  });

  it('yazma alanından zamanlanan mesaj kaydedilir; geçmiş zaman reddedilir', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    await kanalAc();
    const alan = await screen.findByRole('textbox', { name: 'Mesaj yaz' });
    fireEvent.change(alan, { target: { value: 'sonra gidecek' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle: dosya, görev, onay, duyuru' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mesajı zamanla' }));
    const form = await screen.findByRole('dialog', { name: 'Mesajı zamanla' });
    expect((within(form).getByRole('textbox', { name: /^Mesaj/ }) as HTMLTextAreaElement).value).toBe('sonra gidecek');
    const zaman = within(form).getByLabelText(/^Ne zaman\?/);
    fireEvent.change(zaman, { target: { value: '2020-01-01T08:00' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Zamanla' }));
    expect(await within(form).findByText('Geçmiş bir zaman seçtin.')).toBeTruthy();
    expect(yazilan(s, (y) => y.startsWith('zamanli/'))).toHaveLength(0);
    fireEvent.click(within(form).getByRole('button', { name: 'Yarın 08:00' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Zamanla' }));
    await waitFor(() => {
      expect(yazilan(s, (y) => y.startsWith('zamanli/')).at(-1)?.govde['veri']).toMatchObject({ cid: 'genel', by: BEN, text: 'sonra gidecek', repeat: 'none', ann: false, status: 'bekliyor' });
    });
    await waitFor(() => { expect((screen.getByRole('textbox', { name: 'Mesaj yaz' }) as HTMLTextAreaElement).value).toBe(''); });
  });
});

describe('M1 sohbet: kanal ve duyuru formları', () => {
  it('yeni kanal tekil ad ve kimlikle açılır ve kanala gidilir', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    mesajAc('/mesaj/yeni/sohbet');
    fireEvent.click(await screen.findByRole('button', { name: 'Kanal' }));
    const form = await screen.findByRole('dialog', { name: 'Yeni kanal' });
    fireEvent.change(within(form).getByLabelText(/^Kanal adı/), { target: { value: 'genel' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Oluştur' }));
    expect(await within(form).findByText('Bu adda bir kanal var.')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/^Kanal adı/), { target: { value: 'Sevkiyat Ekibi' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Oluştur' }));
    await waitFor(() => {
      expect(yazilan(s, (y) => y === 'channels/sevkiyat-ekibi').at(-1)?.govde).toMatchObject({ kip: 'tam', veri: { name: 'sevkiyat-ekibi', emoji: '💬', createdBy: BEN } });
    });
  });

  it('duyuru formu duyuru kaydı ve kanal iletisi yazar', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: belgeler() });
    mesajAc('/mesaj/yeni/sohbet/genel');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Ne yapmak istiyorsun?' })).getByText('Duyuru yap'));
    const form = await screen.findByRole('dialog', { name: 'Duyuru yap' });
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Yarın bakım var' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Duyur' }));
    await waitFor(() => {
      expect(yazilan(s, (y) => /^duyurular\/[A-Za-z0-9]{20}$/.test(y))[0]?.govde['veri']).toMatchObject({ by: BEN, text: 'Yarın bakım var', cid: 'genel' });
      expect(yazilan(s, (y) => /^channels\/genel\/msgs\//.test(y)).at(-1)?.govde['veri']).toMatchObject({ kind: 'ann', text: 'Yarın bakım var' });
    });
  });
});
