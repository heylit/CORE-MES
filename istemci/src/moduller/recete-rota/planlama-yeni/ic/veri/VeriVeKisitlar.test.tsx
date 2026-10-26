import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { VERI_NOTU } from '../../motor/ortak.tsx';
import { OKUYAN, ekranAc } from './test-veri.tsx';

// Ekran yer tutucu metnine değil kendi işaretlerine bakar: kap `data-parca="veri"` ve `data-bolum`, tabloların ve formların erişilebilir adı.
afterEach(() => { cleanup(); });

const bolum = (ad: string) => { fireEvent.click(within(screen.getByRole('navigation', { name: 'Veri ve kısıtlar' })).getByRole('button', { name: new RegExp(`^${ad}`) })); };
const tablo = (ad: string) => screen.getByRole('table', { name: ad });
const satirlar = (ad: string) => within(tablo(ad)).getAllByRole('row').slice(1);
const pasif = (el: HTMLElement) => [el.getAttribute('aria-disabled'), el.getAttribute('title')];

describe('Veri ve kısıtlar', () => {
  it('on görünüm bugünkü sayfanın sırasıyla; Siparişler açılır, veri denetimi bulgu sayısını taşır', () => {
    ekranAc();
    const nav = screen.getByRole('navigation', { name: 'Veri ve kısıtlar' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Siparişler', 'Kısıtlar', 'Tezgâhlar', 'Ürün ve rota', 'Takvim', 'Personel', 'Malzeme', 'Fason ve aparat', 'Ayar matrisi', 'Veri denetimi4',
    ]);
    expect(document.querySelector('[data-parca="veri"]')?.getAttribute('data-bolum')).toBe('siparisler');
    expect(satirlar('Siparişler').map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['S1', 'S2', 'S3']);
  });

  it('Siparişler: süzgeç ve arama; sahibin verisi pasif (222 a); Çizelgede göster planı açar', () => {
    const { sec, git, degisiklikler } = ekranAc();
    fireEvent.click(screen.getByRole('button', { name: 'Gecikenler' }));
    expect(satirlar('Siparişler')).toHaveLength(1);
    expect(within(satirlar('Siparişler')[0]!).getByText('3 sa geç')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hepsi' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Sipariş ara' }), { target: { value: 'govde' } });
    expect(satirlar('Siparişler').map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['S2']);
    expect(pasif(screen.getByRole('button', { name: /Yeni sipariş/ }))).toEqual(['true', `Yeni sipariş: ${VERI_NOTU}`]);
    fireEvent.click(screen.getByRole('button', { name: /Yeni sipariş/ }));
    fireEvent.click(within(satirlar('Siparişler')[0]!).getByRole('button', { name: 'Sil' }));
    expect(degisiklikler).toEqual([]);
    fireEvent.click(within(satirlar('Siparişler')[0]!).getByRole('button', { name: 'Çizelgede göster' }));
    expect(sec).toHaveBeenCalledWith({ siparis: 'S2', adim: null });
    expect(git).toHaveBeenCalledWith('plan');
  });

  it('Kısıtlar: kapalı kısıt şeridi, anahtar ve Hepsini aç çalışmaya yazar; bedel aynı veri sürümünden, hesabı motor ister', () => {
    const { degisiklikler } = ekranAc();
    bolum('Kısıtlar');
    expect(screen.getByText(/Kapalı kısıt:/).parentElement?.textContent).toContain('Tatil günleri');
    const ariza = screen.getByRole('switch', { name: 'Arıza ve planlı bakım' }) as HTMLInputElement;
    expect([ariza.checked, (screen.getByRole('switch', { name: 'Tatil günleri' }) as HTMLInputElement).checked]).toEqual([true, false]);
    expect(within(ariza.closest('tr')!).getByText('−4 sa')).toBeTruthy();
    expect(within(screen.getByRole('switch', { name: 'Tatil günleri' }).closest('tr')!).getByText('etkisi yok')).toBeTruthy();
    fireEvent.click(ariza);
    expect(degisiklikler.at(-1)).toMatchObject({ ne: 'Kısıt kapatıldı', secenek: { ayrinti: 'Arıza ve planlı bakım' } });
    expect(degisiklikler.at(-1)?.sonra.kapali).toEqual(['tatil', 'ariza']);
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini aç' }));
    expect(degisiklikler.at(-1)?.sonra.kapali).toEqual([]);
    expect(screen.queryByText(/Kapalı kısıt:/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Yeniden hesapla' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('Kısıtlar: parametre sınır içinde yazılır, dışında bildirim; değişiklik bütçesi sessiz kaydedilir', async () => {
    const { degisiklikler } = ekranAc();
    bolum('Kısıtlar');
    const famK = screen.getByRole('spinbutton', { name: 'Aynı aile katsayısı' });
    fireEvent.change(famK, { target: { value: '2' } }); fireEvent.blur(famK);
    expect(await screen.findByText('Değer 0 ile 1 arasında olmalı.')).toBeTruthy();
    expect(degisiklikler).toEqual([]);
    const famK2 = screen.getByRole('spinbutton', { name: 'Aynı aile katsayısı' });
    fireEvent.change(famK2, { target: { value: '0.5' } }); fireEvent.blur(famK2);
    expect(degisiklikler.at(-1)).toMatchObject({ ne: 'Parametre değişti', secenek: { ayrinti: 'Aynı aile katsayısı: 0.3 → 0.5' } });
    expect(degisiklikler.at(-1)?.sonra.w.famK).toBe(0.5);
    const butce = screen.getByRole('spinbutton', { name: 'Bütçe' });
    fireEvent.change(butce, { target: { value: '20' } }); fireEvent.blur(butce);
    expect(degisiklikler.at(-1)).toMatchObject({ secenek: { sessiz: true } });
    expect(degisiklikler.at(-1)?.sonra.param.maxChg).toBe(20);
    fireEvent.change(screen.getByRole('combobox', { name: 'Talaşlı fasoncu' }), { target: { value: 'F1' } });
    expect((degisiklikler.at(-1)?.sonra.D.ayarlar as Record<string, unknown>).fasonTalas).toBe('F1');
  });

  it('yalnız okuyan planlamacıda anahtar, parametre, matris ve formlar kapalı (komut yok)', () => {
    ekranAc({ islemler: OKUYAN });
    bolum('Kısıtlar');
    expect((screen.getByRole('switch', { name: 'Arıza ve planlı bakım' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('spinbutton', { name: 'Aynı aile katsayısı' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Hepsini aç' })).toBeNull();
    bolum('Takvim');
    expect(screen.queryByRole('form', { name: 'Arıza ya da bakım ekle' })).toBeNull();
    expect(within(tablo('Arıza ve planlı bakım')).queryByRole('button', { name: 'Sil' })).toBeNull();
    bolum('Ayar matrisi');
    expect((screen.getByRole('spinbutton', { name: 'B sonra A ayar dakikası' }) as HTMLInputElement).disabled).toBe(true);
    bolum('Fason ve aparat');
    expect(screen.queryByRole('button', { name: 'Yeni aparat' })).toBeNull();
  });

  it('Takvim: vardiya ve çalışma günü sahibinden (pasif); arıza ekle ve sil, ek mesai tekrarı reddedilir', () => {
    const { degisiklikler } = ekranAc();
    bolum('Takvim');
    expect((screen.getByRole('checkbox', { name: 'Pzt V1' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Pzt V1' }) as HTMLInputElement).disabled).toBe(true);
    expect(satirlar('Vardiyalar').map((r) => within(r).getAllByRole('cell')[3]?.textContent)).toEqual(['8 sa', '8 sa']);
    expect(satirlar('Arıza ve planlı bakım')[0]?.textContent).toContain('20.10 Sal 07:00');
    fireEvent.submit(screen.getByRole('form', { name: 'Arıza ya da bakım ekle' }));
    expect(degisiklikler.at(-1)).toMatchObject({ ne: 'Arıza/bakım eklendi', secenek: { ayrinti: 'T1 20.10 Sal 07:00 → 20.10 Sal 15:00' } });
    expect(degisiklikler.at(-1)?.sonra.down).toHaveLength(2);
    fireEvent.click(within(satirlar('Arıza ve planlı bakım')[0]!).getByRole('button', { name: 'Sil' }));
    expect(degisiklikler.at(-1)?.sonra.down).toEqual([{ m: 'T1', from: 31, to: 39 }]);
    const mesai = screen.getByRole('form', { name: 'Ek mesai ekle' });
    fireEvent.change(within(mesai).getByRole('combobox', { name: 'Tezgâh' }), { target: { value: 'T2' } });
    fireEvent.submit(mesai);
    expect(within(mesai).getByRole('alert').textContent).toBe('Bu ek mesai zaten var.');
    fireEvent.change(within(mesai).getByRole('combobox', { name: 'Tezgâh' }), { target: { value: 'T1' } });
    fireEvent.submit(mesai);
    expect(degisiklikler.at(-1)?.sonra.ekMesai).toEqual([{ m: 'T2', gun: 5, vardiya: 'V1' }, { m: 'T1', gun: 5, vardiya: 'V1' }]);
  });

  it('Personel: kapasite ızgarası açık vardiyada kimse yoksa kırmızı; devamsızlık ve personel sahibinden', () => {
    ekranAc();
    bolum('Personel');
    const iz = tablo('Vardiya ve yetkinlik kapasitesi');
    const freze = within(iz).getByRole('rowheader', { name: 'Freze' }).closest('tr')!;
    expect(within(freze).getAllByRole('cell').map((h) => [h.textContent, h.getAttribute('data-ton')])).toEqual([['0 / 0,5', 'hata'], ['kapalı', null]]);
    expect(pasif(screen.getByRole('button', { name: 'Devamsızlık ekle' }))).toEqual(['true', `Devamsızlık ekle: ${VERI_NOTU}`]);
    expect(within(satirlar('Personel')[0]!).getByText('Ayarcı')).toBeTruthy();
  });

  it('Malzeme: karşılama önce yüksek öncelik; birim fiyat yalnız maliyet görene; tedarikçi düzenlenir', () => {
    const { degisiklikler, unmount } = ekranAc();
    bolum('Malzeme');
    expect(satirlar('Siparişlere karşılama').map((r) => within(r).getAllByRole('cell').map((h) => h.textContent))).toEqual([
      ['S1', 'M1', '4 kg', 'Stok', '19.10 Pzt 07:00'], ['S2', 'M1', '10 kg', 'Satın alma', '22.10 Per 10:00'],
    ]);
    expect(within(tablo('Malzemeler')).queryByText('TL/birim')).toBeNull();
    fireEvent.click(within(tablo('Tedarikçiler')).getByRole('button', { name: 'TD1' }));
    const form = screen.getByRole('form', { name: 'Tedarikçi' });
    expect((within(form).getByRole('textbox', { name: /^Kod/ }) as HTMLInputElement).readOnly).toBe(true);
    fireEvent.change(within(form).getByRole('spinbutton', { name: /^Ortalama gecikme/ }), { target: { value: '3' } });
    fireEvent.submit(form);
    expect(degisiklikler.at(-1)).toMatchObject({ ne: 'Tedarikçi güncellendi', secenek: { ayrinti: 'TD1' } });
    expect(satirlar('Siparişlere karşılama')[1]?.textContent).toContain('24.10 Cmt 10:00');
    unmount();
    ekranAc({ maliyet: true });
    bolum('Malzeme');
    expect(within(tablo('Malzemeler')).getByText('TL/birim')).toBeTruthy();
  });

  it('Fason ve aparat: rotada kullanılan aparat silinmez; yeni aparatta kod tekrarı reddedilir, yenisi eklenir', async () => {
    const { degisiklikler } = ekranAc();
    bolum('Fason ve aparat');
    expect(satirlar('Fasoncular')[0]?.textContent).toContain('Sal, Per · 16:00');
    fireEvent.click(within(satirlar('Aparatlar')[0]!).getByRole('button', { name: 'Sil' }));
    expect(await screen.findByText('U1 rotasında kullanılıyor.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yeni aparat' }));
    const form = screen.getByRole('form', { name: 'Aparat' });
    fireEvent.change(within(form).getByRole('textbox', { name: /^Kod/ }), { target: { value: 'AP1' } });
    fireEvent.submit(form);
    expect(within(form).getByRole('alert').textContent).toBe('Ad boş olamaz. AP1 zaten var.');
    fireEvent.change(within(form).getByRole('textbox', { name: /^Kod/ }), { target: { value: 'AP2' } });
    fireEvent.change(within(form).getByRole('textbox', { name: /^Ad/ }), { target: { value: 'Deneme ikinci' } });
    fireEvent.submit(form);
    expect(degisiklikler.at(-1)?.sonra.D.aparatlar).toEqual([{ id: 'AP1', ad: 'Deneme aparat', adet: 2 }, { id: 'AP2', ad: 'Deneme ikinci', adet: 1 }]);
    expect(screen.queryByRole('form', { name: 'Aparat' })).toBeNull();
    fireEvent.click(within(satirlar('Aparatlar')[1]!).getByRole('button', { name: 'Sil' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sil' }));
    expect(degisiklikler.at(-1)).toMatchObject({ ne: 'Aparat silindi', secenek: { ayrinti: 'AP2' } });
  });

  it('Ayar matrisi: boş geçiş sarı, yazma ve silme; köşegen aynı aile katsayısı', () => {
    const { degisiklikler } = ekranAc();
    bolum('Ayar matrisi');
    expect(screen.getByText(/1 geçiş tanımsız\./)).toBeTruthy();
    const ba = screen.getByRole('spinbutton', { name: 'B sonra A ayar dakikası' });
    expect(ba.closest('td')?.getAttribute('data-ton')).toBe('uyari');
    fireEvent.change(ba, { target: { value: '20' } }); fireEvent.blur(ba);
    expect(degisiklikler.at(-1)).toMatchObject({ ne: 'Ayar matrisi', secenek: { ayrinti: 'B → A: 20 dk' } });
    const ab = screen.getByRole('spinbutton', { name: 'A sonra B ayar dakikası' });
    fireEvent.change(ab, { target: { value: '' } }); fireEvent.blur(ab);
    expect(degisiklikler.at(-1)?.sonra.D.ayarMatrisi).toEqual([{ den: 'B', ye: 'A', dk: 20 }]);
    expect(within(tablo('Aileler arası ayar süresi')).getAllByText('× 0,3')).toHaveLength(2);
  });

  it('Ürün ve rota: ürün seçilir; fason adımı rozetle, rota sahibinden (pasif)', () => {
    ekranAc();
    bolum('Ürün ve rota');
    expect(within(tablo('U1 rotası')).getByText('aparat AP1')).toBeTruthy();
    expect(within(tablo('U1 rotası')).getByText('10 (örtüşmeli)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^U2/ }));
    expect(within(tablo('U2 rotası')).getByText('Fason F1')).toBeTruthy();
    expect(pasif(screen.getByRole('button', { name: 'Adım ekle' }))).toEqual(['true', `Adım ekle: ${VERI_NOTU}`]);
  });

  it('Veri denetimi: bulgular türüne göre gruplanır; Düzelt ilgili görünüme gider; çalışma yoksa boş ekran', () => {
    const { unmount } = ekranAc();
    bolum('Veri denetimi');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Operatör sayısı ve yetkinlik grubu, ışıksız tezgâh1', 'Sıraya bağlı ayar (aile matrisi, aynı aile kısalması)1',
      'Alternatif tezgâh, verim, tek tezgâhta tek iş1', 'Sıralı amaç: gecikme > değişiklik > ayar > maliyet1',
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Düzelt' })[1]!);
    expect(document.querySelector('[data-parca="veri"]')?.getAttribute('data-bolum')).toBe('ayar');
    unmount();
    ekranAc({ c: null });
    expect(screen.getByText('Planlama çalışması yok')).toBeTruthy();
  });
});
