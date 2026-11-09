import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './constants.ts';
import { S, bump } from './store.ts';
import { onayLimitleriEkrana, onayLimitleriGovdesi } from './tasiyici.ts';
import { setBasamakYazar, setRoller, viewSettings } from './memory.ts';
import { readSettingsForm } from './ui.ts';
import type { Settings } from './tipler.ts';

const SUNUCU = [
  { azamiTutar: '50000.00', seviye: 'Uzman', rolId: 3, rolAdi: 'Deneme uzman rolü' },
  { azamiTutar: null, seviye: 'Genel müdür', rolId: null, rolAdi: null },
];
function ciz(yazar: boolean, ek: Partial<Settings> = {}): HTMLElement {
  setBasamakYazar(yazar);
  S.settings = { ...DEFAULT_SETTINGS, approvalLimits: onayLimitleriEkrana(SUNUCU), onayKademesi: true, ...ek };
  bump();
  document.body.innerHTML = `<div id="settings-form">${viewSettings()}</div>`;
  return document.querySelector<HTMLElement>('[data-sa-basamaklar]')!;
}
afterEach(() => { setBasamakYazar(false); setRoller([]); document.body.innerHTML = ''; });

describe('2397-6 onay basamakları', () => {
  it('sunucudan gelen rol kayıtta geldiği gibi gider; rolAdi gitmez, rolü bilinmeyen basamakta rolId gönderilmez', () => {
    expect(onayLimitleriGovdesi(onayLimitleriEkrana(SUNUCU))).toEqual([
      { azamiTutar: '50000', seviye: 'Uzman', rolId: 3 },
      { azamiTutar: null, seviye: 'Genel müdür', rolId: null },
    ]);
    expect(onayLimitleriGovdesi([{ max: 10, role: 'Eski' }])).toEqual([{ azamiTutar: '10', seviye: 'Eski' }]);
  });

  it('yönetici olmayan salt okunur görür: girdi, ekle ve kaldır yok; rol adı sunucudan; form okununca basamaklar değişmez', () => {
    const p = ciz(false);
    expect(p.textContent).toContain('Salt okunur');
    expect(p.textContent).toContain('Deneme uzman rolü');
    expect(p.textContent).toContain('Basamak denetimi açık');
    expect(p.querySelector('input, select, [data-act="add-ap"], [data-act="rm-ap"]')).toBeNull();
    expect(readSettingsForm().approvalLimits).toEqual(onayLimitleriEkrana(SUNUCU));
  });

  it('yönetici rol seçer: seçili rol formdan rolId olarak okunur, boş seçim rolsüzdür; kaldır düğmesi basamağı adıyla söyler', () => {
    setRoller([{ id: 3, ad: 'Deneme uzman rolü' }, { id: 4, ad: 'Deneme müdür rolü' }]);
    const p = ciz(true);
    expect(p.textContent).not.toContain('Salt okunur');
    const secimler = p.querySelectorAll<HTMLSelectElement>('[data-apk="rolId"]');
    expect([...secimler].map((x) => x.value)).toEqual(['3', '']);
    secimler[1]!.value = '4';
    expect(readSettingsForm().approvalLimits.map((l) => l.rolId)).toEqual([3, 4]);
    expect(p.querySelector('[data-act="rm-ap"]')!.getAttribute('aria-label')).toBe('Uzman: kaldır');
  });

  it('rol listesi gelmese de kayıtlı rol seçimde kalır; denetim kapalıysa öyle yazar', () => {
    const p = ciz(true, { onayKademesi: false });
    const ilk = p.querySelector<HTMLSelectElement>('[data-apk="rolId"]')!;
    expect(ilk.value).toBe('3');
    expect(ilk.selectedOptions[0]!.textContent).toBe('Deneme uzman rolü');
    expect(p.textContent).toContain('Basamak denetimi kapalı');
  });
});
