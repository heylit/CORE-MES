import { describe, expect, it, vi } from 'vitest';
import { YONETIM_DUGMELERI_BETIGI, yonetimDugmeleriBetigi } from './yonetim-dugmeleri.ts';

// 226 a: betik gerçektir; prototipin profil ve veriler ekranındaki düğmelerle aynı işaretli sahte belgede koşar.
function kur() {
  const belge = document.implementation.createHTMLDocument('t');
  new Function('document', YONETIM_DUGMELERI_BETIGI)(belge);
  belge.body.innerHTML = [
    '<div class="card"><button data-pact="new">Yeni profil</button><button data-pact="dup">Kopyala</button><button data-pact="open" data-pid="p2">Aç</button>',
    '<button data-pact="del" data-pid="p2"><svg><path></path></svg></button><button data-pact="delyes" data-pid="p2">Sil</button></div>',
    '<div class="card"><button data-pact="expall">Yedekle</button><button data-pact="expone">Bu profil</button><button data-pact="imp">Yedek yükle</button>',
    '<input type="file" id="importFile" hidden></div>',
    '<div class="card"><div class="rsl"><label><input type="checkbox" data-rs="sim"></label></div><button data-pact="rsall">Tümünü seç</button>',
    '<button data-pact="rsask">Sıfırla</button><button data-pact="rsyes">Sıfırla</button>',
    '<div class="dz"><button data-pact="wipeask">Tümünü sil</button><button data-pact="wipeyes">Hepsini sil</button></div></div>',
  ].join('');
  // Prototipin tek tıklama dinleyicisi gibi: belgede, kabarma aşamasında.
  const islem = vi.fn();
  belge.addEventListener('click', (e) => { const d = (e.target as Element).closest('[data-pact]'); if (d) islem(d.getAttribute('data-pact')); });
  const degisti = vi.fn();
  belge.addEventListener('change', (e) => { degisti((e.target as Element).id); });
  const tikla = (secici: string) => { (belge.querySelector(secici) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
  return { belge, islem, degisti, tikla };
}

describe('Denetim Hazırlığı yönetim düğmeleri (226 a)', () => {
  it('reddedilen: yönetici olmayanın tıkladığı silme, sıfırlama ve yedekten yükleme prototipe ulaşmaz', () => {
    const { islem, tikla, degisti, belge } = kur();
    for (const a of ['del', 'delyes', 'imp', 'rsall', 'rsask', 'rsyes', 'wipeask', 'wipeyes']) tikla(`[data-pact="${a}"]`);
    tikla('[data-pact="del"] path');
    tikla('[data-rs]');
    belge.querySelector('#importFile')!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(islem).not.toHaveBeenCalled();
    expect(degisti).not.toHaveBeenCalled();
    expect((belge.querySelector('[data-rs]') as HTMLInputElement).checked).toBe(false);
  });

  it('izinli: profil açma, yeni profil, kopyalama ve yedek indirme çalışır', () => {
    const { islem, tikla } = kur();
    for (const a of ['new', 'dup', 'open', 'expall', 'expone']) tikla(`[data-pact="${a}"]`);
    expect(islem.mock.calls.map((c) => c[0])).toEqual(['new', 'dup', 'open', 'expall', 'expone']);
  });

  it('düğmeler ve sıfırlama kartı gizlenir; gizleme kuralı öteki düğmelere dokunmaz', () => {
    const { belge } = kur();
    const stil = belge.head.querySelector('style')?.textContent ?? '';
    expect(stil).toContain('[data-pact="wipeyes"]');
    expect(stil).toContain('.card:has(.rsl){display:none!important}');
    for (const a of ['new', 'dup', 'open', 'expall', 'expone', 'cancel']) expect(stil).not.toContain(`"${a}"`);
  });

  it('yöneticiye betik eklenmez; öteki kişiye satır içi betik olarak eklenir', () => {
    expect(yonetimDugmeleriBetigi(true)).toBe('');
    expect(yonetimDugmeleriBetigi(false)).toMatch(/^<script>\(function \(\) \{[\s\S]*\}\)\(\);<\/script>$/);
  });
});
