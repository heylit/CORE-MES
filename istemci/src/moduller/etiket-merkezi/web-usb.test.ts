import { afterEach, describe, expect, it, vi } from 'vitest';
import { eslesmeKaldirilabilir, eslesmeyiKaldir, eslesmisYazici, usbDestekli, usbHatasi, usbyeGonder, yaziciDegistir, yaziciEsle, type UsbAygit } from './web-usb.ts';

function sahteAygit(durum: 'ok' | 'stall' = 'ok') {
  const giden: Uint8Array[] = [];
  const cagrilar: string[] = [];
  const a: UsbAygit = {
    productName: 'Deneme yazıcısı',
    opened: false,
    configuration: {
      interfaces: [
        { interfaceNumber: 0, alternate: { interfaceClass: 3, endpoints: [{ endpointNumber: 1, direction: 'out', type: 'interrupt' }] } },
        { interfaceNumber: 1, alternate: { interfaceClass: 7, endpoints: [{ endpointNumber: 2, direction: 'in', type: 'bulk' }, { endpointNumber: 3, direction: 'out', type: 'bulk' }] } },
      ],
    },
    open: vi.fn(async () => { cagrilar.push('open'); a.opened = true; }),
    close: vi.fn(async () => { cagrilar.push('close'); a.opened = false; }),
    selectConfiguration: vi.fn(async () => { cagrilar.push('config'); }),
    claimInterface: vi.fn(async (no: number) => { cagrilar.push(`claim ${String(no)}`); }),
    releaseInterface: vi.fn(async (no: number) => { cagrilar.push(`release ${String(no)}`); }),
    transferOut: vi.fn(async (uc: number, veri: BufferSource) => {
      cagrilar.push(`out ${String(uc)}`);
      giden.push(new Uint8Array(veri as ArrayBuffer));
      return { status: durum };
    }),
  };
  return Object.assign(a, { giden, cagrilar });
}

function usbKur(aygitlar: UsbAygit[], guvenli = true) {
  vi.stubGlobal('isSecureContext', guvenli);
  const usb = { getDevices: vi.fn(async () => aygitlar), requestDevice: vi.fn(async () => aygitlar[0]) };
  Object.defineProperty(navigator, 'usb', { value: usb, configurable: true });
  return usb;
}

function usbKaldir() {
  Reflect.deleteProperty(navigator, 'usb');
}

afterEach(() => { usbKaldir(); vi.unstubAllGlobals(); });

describe('web-usb (2954)', () => {
  it('HTTPS değilse ya da tarayıcıda USB yoksa desteklenmez; eşleşmiş aygıt aranmaz', async () => {
    expect(usbDestekli()).toBe(false);
    usbKur([sahteAygit()], false);
    expect(usbDestekli()).toBe(false);
    expect(await eslesmisYazici()).toBeNull();
    usbKaldir();
    usbKur([sahteAygit()], true);
    expect(usbDestekli()).toBe(true);
  });

  it('eşleşme yoksa null döner: başka bilgisayardaki izin bu bilgisayarda geçmez', async () => {
    usbKur([]);
    expect(await eslesmisYazici()).toBeNull();
  });

  it('komut UTF-8 olarak yazıcı arayüzünün bulk çıkışına gider; arayüz bırakılır ve aygıt kapanır', async () => {
    const a = sahteAygit();
    await usbyeGonder(a, '\nN\nA10,10,0,3,1,1,N,"Ş"\nP1\n');
    expect(a.cagrilar).toEqual(['open', 'claim 1', 'out 3', 'release 1', 'close']);
    expect(new TextDecoder().decode(a.giden[0])).toBe('\nN\nA10,10,0,3,1,1,N,"Ş"\nP1\n');
  });

  it('yazıcı veriyi kabul etmezse hata verir ve yine de aygıtı kapatır', async () => {
    const a = sahteAygit('stall');
    await expect(usbyeGonder(a, 'P1')).rejects.toThrow('Yazıcı veriyi kabul etmedi.');
    expect(a.cagrilar.slice(-2)).toEqual(['release 1', 'close']);
  });

  it('yazıcı arayüzü olmayan aygıta gönderilmez', async () => {
    const a = sahteAygit();
    a.configuration = { interfaces: [{ interfaceNumber: 0, alternate: { interfaceClass: 3, endpoints: [] } }] };
    await expect(usbyeGonder(a, 'P1')).rejects.toThrow('yazıcı çıkışı yok');
    expect(a.transferOut).not.toHaveBeenCalled();
  });

  it('E1: tarayıcı hataları adına göre Türkçe ve eylemli metne çevrilir; ham hata cause içinde kalır', async () => {
    const tutulan = sahteAygit();
    const ham = new DOMException('Unable to claim interface.', 'SecurityError');
    tutulan.claimInterface = vi.fn(async () => { throw ham; });
    const hata = await usbyeGonder(tutulan, 'P1').catch((h: unknown) => h);
    expect((hata as Error).message).toMatch(/^Yazıcıya erişilemedi\. Yazıcıyı kullanan başka bir program varsa kapatın; Sorun sürerse bu bilgisayarın yazıcı sürücüsü tarayıcıdan basıma ayarlanmamıştır; sistem yöneticisine haber verin/);
    expect((hata as Error).cause).toBe(ham);
    expect(usbHatasi(new DOMException('x', 'NetworkError')).message).toMatch(/^Yazıcıya erişilemedi/);
    expect(usbHatasi(new DOMException('x', 'NotFoundError')).message).toBe('USB yazıcı bulunamadı. Kabloyu takıp yeniden deneyin.');
    expect(usbHatasi(new Error('Failed to execute')).message).toBe('Yazıcı yanıt vermedi. Kabloyu ve yazıcının açık olduğunu kontrol edin.');
  });

  it('E1: eşleştirmede vazgeçmek hata değildir; öteki hata Türkçe döner', async () => {
    const usb = usbKur([]);
    usb.requestDevice.mockRejectedValueOnce(new DOMException('No device selected.', 'NotFoundError'));
    expect(await yaziciEsle()).toBeNull();
    usb.requestDevice.mockRejectedValueOnce(new DOMException('Access denied.', 'SecurityError'));
    await expect(yaziciEsle()).rejects.toThrow(/^Yazıcıya erişilemedi/);
  });

  it('ek: metin depocunun görmediği belgeye işaret etmez', () => {
    expect(usbHatasi(new DOMException('x', 'SecurityError')).message).not.toMatch(/tarif|WinUSB/);
  });

  it('ek (Test 4 N3): claimInterface reddedilirse arayüz bırakılmaya çalışılmaz ama aygıt kapanır', async () => {
    const a = sahteAygit();
    a.claimInterface = vi.fn(async () => { a.cagrilar.push('claim red'); throw new DOMException('busy', 'NetworkError'); });
    await expect(usbyeGonder(a, 'P1')).rejects.toThrow(/^Yazıcıya erişilemedi/);
    expect(a.cagrilar).toEqual(['open', 'claim red', 'close']);
    expect(a.opened).toBe(false);
  });

  it('ek: selectConfiguration reddedilirse de aygıt kapanır', async () => {
    const a = sahteAygit();
    a.configuration = null;
    a.selectConfiguration = vi.fn(async () => { throw new DOMException('x', 'InvalidStateError'); });
    await expect(usbyeGonder(a, 'P1')).rejects.toThrow(/^Yazıcıya erişilemedi/);
    expect(a.cagrilar).toEqual(['open', 'close']);
  });

  it('ek (Arayüz N1): başka yazıcı seçilince eskisinin izni kaldırılır; aynısı seçilirse kaldırılmaz; vazgeçilirse null', async () => {
    const eski = Object.assign(sahteAygit(), { forget: vi.fn(async () => undefined) });
    const yeni = sahteAygit();
    const usb = usbKur([eski]);
    usb.requestDevice.mockResolvedValueOnce(yeni);
    expect(await yaziciDegistir(eski)).toBe(yeni);
    expect(eski.forget).toHaveBeenCalledTimes(1);
    usb.requestDevice.mockResolvedValueOnce(eski);
    expect(await yaziciDegistir(eski)).toBe(eski);
    expect(eski.forget).toHaveBeenCalledTimes(1);
    usb.requestDevice.mockRejectedValueOnce(new DOMException('No device selected.', 'NotFoundError'));
    expect(await yaziciDegistir(eski)).toBeNull();
    expect(eski.forget).toHaveBeenCalledTimes(1);
  });

  it('ek (Arayüz N1): eşleşme forget ile kaldırılır; forget yoksa kaldırılamaz sayılır', async () => {
    const a = Object.assign(sahteAygit(), { forget: vi.fn(async () => undefined) });
    expect(eslesmeKaldirilabilir(a)).toBe(true);
    await eslesmeyiKaldir(a);
    expect(a.forget).toHaveBeenCalledTimes(1);
    expect(eslesmeKaldirilabilir(sahteAygit())).toBe(false);
  });
});
