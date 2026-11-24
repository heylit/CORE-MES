import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MotorAyarlari, PlanSistemAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { sahteTaslak } from '../kokpit/taslak-test-yardim.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { yetkiKur } from '../yetki.ts';
import { AyarlarGovdesi } from './Sayfa.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

// Veriler uydurmadır (ORN-): çalışma örnek çalışmadır, kişiler ve sürümler uydurma.
const MOTOR: MotorAyarlari = { amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3, fasonGun: 7 };
const motorCevabi = { guncel: { surumId: 14, degerler: MOTOR, yazan: 'ORN-Kişi-02', zaman: '2026-11-18T09:40:00.000Z' }, taslak: null };
const sayi = (anahtar: string, baslik: string, deger: number, enAz: number, enCok: number) => ({ ayar: { anahtar, baslik, aciklama: `${baslik} açıklaması.`, tur: 'sayi' as const, deger, enAz, enCok, ondalik: 0 }, guncelleyen: null, zaman: null });
const SISTEM: PlanSistemAyarlariCevabi = {
  ayarlar: [
    { ayar: { anahtar: 'plan.dort-goz', baslik: 'Plan onayında dört göz kuralı', aciklama: 'Dört göz açıklaması.', tur: 'boolean', deger: false }, guncelleyen: 'ORN-Kişi-01', zaman: '2026-11-03T10:20:00.000Z' },
    sayi('plan.motor-ufuk-gun', 'Plan motorunun ufku (gün)', 120, 28, 182),
    { ayar: { anahtar: 'plan.motor-dilim-dk', baslik: 'Plan motorunun zaman dilimi', aciklama: 'Dilim açıklaması.', tur: 'secim', deger: '15', secenekler: [{ deger: '15', etiket: '15 dakika' }, { deger: '30', etiket: '30 dakika' }] }, guncelleyen: null, zaman: null },
    { ayar: { anahtar: 'plan.tipli-girdi', baslik: 'Plan girdisinin kaynakları tipli yoldan', aciklama: 'Tipli açıklaması.', tur: 'boolean', deger: false }, guncelleyen: null, zaman: null },
    { ayar: { anahtar: 'plan.bakim-girdisi', baslik: 'Periyodik bakım plana girsin', aciklama: 'Bakım açıklaması.', tur: 'boolean', deger: true }, guncelleyen: null, zaman: null },
  ],
};
const BEDEL = { tabanBedelSaat: null, finansmanOraniGun: null, karRiskiOraniGun: null, yuksekEsigi: 1.5, dusukEsigi: 0.5, yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5 };

const PLAN_YAZAR = ['plan.planlama-oku', 'plan.yaz', 'plan.motor-ayari'];
function kur(islemler: string[], bolum: string | null, c: PlanlamaCalismasi | null = ornekCalisma(), taslakVar = true, sistem: PlanSistemAyarlariCevabi = SISTEM) {
  vi.spyOn(api, 'get').mockImplementation(((yol: string) => {
    if (yol === '/plan/motor-ayarlari') return Promise.resolve(motorCevabi);
    if (yol === '/plan/sistem-ayarlari') return Promise.resolve(sistem);
    if (yol === '/plan/bedel-ayari') return Promise.resolve(BEDEL);
    return Promise.reject(new Error(`beklenmeyen ${yol}`));
  }) as typeof api.get);
  const { t, yazilan } = sahteTaslak(c?.dataVer ?? 1);
  const yenile = vi.fn();
  const o = { yetki: yetkiKur(islemler), yenile } as unknown as PlanlamaEkranOzellikleri;
  render(
    <MemoryRouter initialEntries={[bolum === null ? '/plan/ayarlar' : `/plan/ayarlar?bolum=${bolum}`]}>
      <BildirimSaglayici><AyarlarGovdesi o={o} ortak={c} c={c} taslak={c !== null && taslakVar ? t : null} /></BildirimSaglayici>
    </MemoryRouter>,
  );
  return { t, yazilan, yenile };
}

describe('Planlama ayarları sayfası (3561)', () => {
  it('gruplar listesi yedi bölümü taşır; seçili bölüm adresten gelir ve işaretlenir', () => {
    kur(PLAN_YAZAR, 'tampon');
    const liste = screen.getByRole('navigation', { name: 'Ayar grupları' });
    expect(within(liste).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Kontrol: tüm ayarlar', 'Planlama yönü ve zaman', 'Tampon ve risk', 'Kısıtlar', 'Motor', 'Öncelik ve bedel', 'Sistem']);
    expect(within(liste).getByRole('link', { name: 'Tampon ve risk' }).getAttribute('aria-current')).toBe('page');
    expect(within(liste).getByRole('link', { name: 'Tampon ve risk' }).getAttribute('href')).toBe('/plan/ayarlar?bolum=tampon');
  });

  it('Kontrol: her ayarın geçerli değeri, kaynağı ve son değiştireni; taslakta fark ayrı sütunda ve süzülebilir', async () => {
    const ortak = ornekCalisma();
    const gorunum: PlanlamaCalismasi = { ...ortak, w: { ...ortak.w, dondurma: 9 } };
    vi.spyOn(api, 'get').mockImplementation(((yol: string) => Promise.resolve(yol === '/plan/motor-ayarlari' ? motorCevabi : yol === '/plan/sistem-ayarlari' ? SISTEM : BEDEL)) as typeof api.get);
    const { t } = sahteTaslak(ortak.dataVer);
    render(<MemoryRouter initialEntries={['/plan/ayarlar?bolum=kontrol']}><BildirimSaglayici><AyarlarGovdesi o={{ yetki: yetkiKur(PLAN_YAZAR), yenile: vi.fn() } as unknown as PlanlamaEkranOzellikleri} ortak={ortak} c={gorunum} taslak={t} /></BildirimSaglayici></MemoryRouter>);
    const tablo = await screen.findByRole('table');
    await within(tablo).findByText('Plan onayında dört göz kuralı');
    const satir = (ad: string | RegExp) => within(tablo).getByRole('link', { name: ad }).closest('tr')!;
    // Dondurulmuş bölge: çalışmada 4 sa, taslakta 9 sa; kaynak Çalışma.
    const d = within(satir(/Dondurulmuş bölge/)).getAllByRole('cell').map((x) => x.textContent);
    expect(d.slice(0, 3)).toEqual(['4 sa', '9 sa', 'Çalışma · Planlama yönü ve zaman']);
    // Motor ve sistem satırları kaydı yazanla gelir; hiç değiştirilmemiş ayarda "—".
    expect(within(satir('Sıralama kuralı')).getAllByRole('cell').map((x) => x.textContent)).toEqual(['ATCS (öncelik, termin ve süre birlikte)', '—', 'Motor', expect.stringContaining('ORN-Kişi-02')]);
    expect(within(satir('Plan onayında dört göz kuralı')).getAllByRole('cell').map((x) => x.textContent)).toEqual(['kapalı', '—', 'Sistem', expect.stringContaining('ORN-Kişi-01')]);
    expect(within(satir('Plan motorunun ufku (gün)')).getAllByRole('cell')[3]!.textContent).toBe('—');
    // Özet: taslakta bir fark; kısıt sayısı geçerli kayıttan.
    expect(screen.getByLabelText('Kontrol özeti').textContent).toContain('1 taslakta fark');
    expect(screen.getByRole('status').textContent).toContain('Taslakta 1 ayar farkı');
    fireEvent.click(screen.getByRole('button', { name: 'Taslakta fark' }));
    expect(within(tablo).getAllByRole('row')).toHaveLength(2);
  });

  it('çalışma ayarı: Etkisini gör taslağa komut yazar ve etkiyi gösterir; Uygula dizmeyi yazar (taslak ayar akışı değişmedi)', async () => {
    const { t, yazilan } = kur(PLAN_YAZAR, 'zaman');
    fireEvent.blur(screen.getByLabelText(/Dondurulmuş bölge/), { target: { value: '8' } });
    expect(screen.getByText('Dondurulmuş bölge: 4 sa → 8 sa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Etkisini gör \(1\)/ }));
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    expect(yazilan).toEqual([{ tur: 'ayar', ayar: { w: { dondurma: 8 }, param: {}, ac: [], kapat: [] }, ayrinti: 'Dondurulmuş bölge: 4 sa → 8 sa' }]);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['*'] });
    expect(within(etki).getByText('1 / 2 → 0 / 2')).toBeTruthy();
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
  });

  it('sınır dışı değer hata verir; değişiklik ve düğme çubuğu yalnız değişiklik varken görünür', () => {
    kur(PLAN_YAZAR, 'zaman');
    expect(screen.queryByRole('button', { name: /Etkisini gör/ })).toBeNull();
    fireEvent.blur(screen.getByLabelText(/Dondurulmuş bölge/), { target: { value: '100' } });
    expect(screen.getByRole('alert').textContent).toBe('0 ile 72 arasında olmalı.');
    fireEvent.blur(screen.getByLabelText(/Dondurulmuş bölge/), { target: { value: '8' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Vazgeç ayarı taslaktan geri alır; plan yoksa ayar yalnız taslağa yazılır', async () => {
    const a = kur(PLAN_YAZAR, 'kisitlar');
    fireEvent.click(screen.getByLabelText('Operatör sayısı'));
    fireEvent.click(screen.getByRole('button', { name: /Etkisini gör/ }));
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    fireEvent.click(within(etki).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(a.t.geriAl).toHaveBeenCalledWith(false, false); });
    expect(a.t.dizmeyiYaz).not.toHaveBeenCalled();
    cleanup();
    const b = kur(PLAN_YAZAR, 'kisitlar', { ...ornekCalisma(), plan: null });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Ölçü aleti' })).getByRole('radio', { name: 'Kapalı' }));
    expect(screen.getByText('Ölçü aleti: Açık → Kapalı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(b.yazilan).toHaveLength(1); });
    expect(b.t.degerlendir).not.toHaveBeenCalled();
  });

  it('yazamayan kişi (üretim müdürü) bölümü salt okunur görür: alan yok, değer düz metin, tek satır kimin değiştirdiği yazar', () => {
    kur(['plan.planlama-oku'], 'zaman', ornekCalisma(), false);
    expect(screen.getByText(/Bu bölümü planlamacı, müdür ve üstü değiştirir; değerler salt okunur\./)).toBeTruthy();
    expect(screen.queryByLabelText(/Dondurulmuş bölge/)).toBeNull();
    expect(screen.getByText('4 sa')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Etkisini gör/ })).toBeNull();
  });

  it('kısıtlar bölümü: 17 kısıt açılıp kapanır, aparat, takım ve ölçü aleti Açık | Uyarı | Kapalı seçer (3650, 3652); yazamayan değeri yazıyla görür', () => {
    kur(PLAN_YAZAR, 'kisitlar');
    expect(screen.getAllByRole('checkbox')).toHaveLength(17);
    for (const ad of ['Aparat', 'Takım', 'Ölçü aleti']) {
      const g = screen.getByRole('radiogroup', { name: ad });
      expect(within(g).getByRole('radio', { name: 'Açık' }).getAttribute('aria-checked')).toBe('true');
      expect(within(g).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Açık', 'Uyarı', 'Kapalı']);
      expect(within(g).getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
    }
    // Ok tuşu seçimi değiştirir ve odağı taşır.
    const olcu = within(screen.getByRole('radiogroup', { name: 'Ölçü aleti' }));
    fireEvent.keyDown(olcu.getByRole('radio', { name: 'Açık' }), { key: 'ArrowRight' });
    expect(screen.getByText('Ölçü aleti: Açık → Uyarı')).toBeTruthy();
    expect(olcu.getByRole('radio', { name: 'Uyarı' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Uyarı: plan ölçü aletini sınırlamaz; kullanım izlenir/)).toBeTruthy();
    fireEvent.click(olcu.getByRole('radio', { name: 'Kapalı' }));
    expect(screen.getByText('Ölçü aleti: Açık → Kapalı')).toBeTruthy();
    expect(screen.getByText(/Kapalı: plan ölçü aletini hiç saymaz, uyarı da yazmaz/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Kısıtlar' })[0]).toBeTruthy();
    cleanup();
    kur(['plan.planlama-oku'], 'kisitlar', ornekCalisma(), false);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(screen.getByRole('radiogroup', { name: 'Ölçü aleti' })).getAllByRole('radio').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByText(/Arıza ve planlı bakım:/).textContent).toContain('açık');
  });

  it('motor bölümü: plan.motor-ayari olan değiştirir, olmayan okur', async () => {
    kur(PLAN_YAZAR, 'motor');
    expect(await screen.findByRole('group', { name: 'Motor ayarları' })).toBeTruthy();
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Sürüm 14: ORN-Kişi-02');
    cleanup();
    kur(['plan.planlama-oku', 'plan.yaz'], 'motor');
    expect(await screen.findByText('ATCS (öncelik, termin ve süre birlikte)')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Motor ayarları' })).toBeNull();
    expect(screen.getByText(/Bu bölümü planlamacı, müdür ve üstü değiştirir/)).toBeTruthy();
  });

  it('3560: planlama müdürü ufku ve dilimi kaydeder, dört göz ve tipli girdi ve bakım girdisi yalnız okunur', async () => {
    kur([...PLAN_YAZAR, 'plan.sistem-ayari'], 'sistem');
    expect(await screen.findByLabelText('Plan motorunun ufku (gün)')).toBeTruthy();
    expect(screen.getByLabelText('Plan motorunun zaman dilimi')).toBeTruthy();
    expect(screen.queryByLabelText('Plan onayında dört göz kuralı')).toBeNull();
    expect(screen.getByText('Plan onayında dört göz kuralı')).toBeTruthy();
    expect(screen.getAllByText('Bu ayarı sistem yöneticisi değiştirir.')).toHaveLength(3);
    expect(screen.getByText(/Son değiştiren: ORN-Kişi-01, 0?3\.11\.2026 13:20\./)).toBeTruthy();
  });

  it('sistem ayarı okunan değerle (beklenen) yazılır, cevap ekrana işlenir; 409 güncel değeri yeniden okutur', async () => {
    kur([...PLAN_YAZAR, 'plan.sistem-ayari'], 'sistem');
    const alan = await screen.findByLabelText('Plan motorunun ufku (gün)');
    const kaydet = within(alan.closest('.tc-pya-alan') as HTMLElement).getByRole('button', { name: 'Kaydet' });
    expect(kaydet.hasAttribute('disabled')).toBe(true);
    fireEvent.change(alan, { target: { value: '500' } });
    expect(screen.getByRole('alert').textContent).toBe('28 ile 182 arasında olmalı.');
    expect(kaydet.hasAttribute('disabled')).toBe(true);
    fireEvent.change(alan, { target: { value: '90' } });
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce({ ...SISTEM.ayarlar[1]!, ayar: { ...SISTEM.ayarlar[1]!.ayar, deger: 90 }, guncelleyen: 'ORN-Kişi-03', zaman: '2026-11-22T12:00:00.000Z' });
    fireEvent.click(kaydet);
    await waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/sistem-ayarlari/plan.motor-ufuk-gun/degistir', { deger: 90, beklenen: 120 }); });
    expect(await screen.findByText(/Son değiştiren: ORN-Kişi-03/)).toBeTruthy();
    // Arada başkası değiştirdi: sunucu 409 der, değer yeniden okunur.
    const yeniden = vi.mocked(api.get).mock.calls.filter(([y]) => y === '/plan/sistem-ayarlari').length;
    post.mockRejectedValueOnce(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Ayar başkası tarafından değiştirildi.' }));
    const alan2 = screen.getByLabelText('Plan motorunun ufku (gün)');
    fireEvent.change(alan2, { target: { value: '100' } });
    fireEvent.click(within(alan2.closest('.tc-pya-alan') as HTMLElement).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Ayar başkası tarafından değiştirildi.')).toBeTruthy();
    await waitFor(() => { expect(vi.mocked(api.get).mock.calls.filter(([y]) => y === '/plan/sistem-ayarlari').length).toBeGreaterThan(yeniden); });
  });

  it('yönetici dört göze yazar; yalnız plan.sistem-ayari olan yazamaz (ekran gizler, denetim uçta)', async () => {
    kur(['plan.planlama-oku', 'ayarlar.yaz'], 'sistem');
    expect(await screen.findByLabelText('Plan onayında dört göz kuralı')).toBeTruthy();
    expect(screen.queryByText('Bu ayarı sistem yöneticisi değiştirir.')).toBeNull();
  });

  it('öncelik ve bedel: para alanı maliyet göremeyene "Yetkin yok" yazılır; yazma düğmesi yok, düzenleme Reçete ve Rota\'da', async () => {
    kur([...PLAN_YAZAR, 'sayfa.recete-rota'], 'oncelik');
    expect(await screen.findByText('Taban bedel')).toBeTruthy();
    expect(screen.getAllByText('Yetkin yok')).toHaveLength(3);
    expect(screen.getByText('Yüksek öncelik eşiği').nextSibling!.textContent).toBe('1,5');
    expect(screen.getByText(/Bu bölümü müdür ve üstü değiştirir/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Reçete ve Rota/ }).getAttribute('href')).toBe('/recete-rota/ayarlar');
  });

  it('planlama çalışması yoksa çalışma bölümleri yazılmaz ama motor ve sistem bölümleri açılır', async () => {
    kur(PLAN_YAZAR, 'zaman', null);
    expect(screen.getByText(/Planlama çalışması henüz açılmadı/)).toBeTruthy();
    cleanup();
    kur(PLAN_YAZAR, 'motor', null);
    expect(await screen.findByRole('group', { name: 'Motor ayarları' })).toBeTruthy();
  });

  it('sistem uyarısı sunucu açıklamasındaki cümleyi yinelemez (Z6)', async () => {
    const { SISTEM_UYARILARI } = await import('./bolumler.ts');
    for (const u of Object.values(SISTEM_UYARILARI)) expect(u).toBe('Değişiklik sonraki Planı güncelle ile plana girer.');
  });

  it('listeye dönüşte odak önceki gruba gider (R1)', async () => {
    kur(PLAN_YAZAR, 'motor');
    await screen.findByLabelText('Sıralama kuralı');
    fireEvent.click(screen.getByRole('link', { name: /Gruplar/ }));
    await vi.waitFor(() => { expect(document.activeElement?.getAttribute('href')).toMatch(/bolum=motor$/); });
  });
});
