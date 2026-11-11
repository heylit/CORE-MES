// Kart 2954 (ADR 0014 eki): ağ girişi olmayan, tek bilgisayara USB ile bağlı etiket yazıcısına tarayıcıdan basım. Komutu sunucu
// üretir ve deftere yazar (indirme ucu); burası yalnız o komutu eşleşmiş USB aygıtına aktarır. TypeScript'in DOM kütüphanesinde
// WebUSB tipi olmadığından ve yeni paket alınmadığından yalnız kullanılan alanlar burada tanımlıdır.

interface UsbUcNokta { endpointNumber: number; direction: 'in' | 'out'; type: 'bulk' | 'interrupt' | 'isochronous' }
interface UsbAlternatif { interfaceClass: number; endpoints: UsbUcNokta[] }
interface UsbArayuz { interfaceNumber: number; alternate: UsbAlternatif }
interface UsbYapilandirma { interfaces: UsbArayuz[] }
export interface UsbAygit {
  productName?: string;
  opened: boolean;
  configuration: UsbYapilandirma | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(deger: number): Promise<void>;
  claimInterface(no: number): Promise<void>;
  releaseInterface(no: number): Promise<void>;
  transferOut(uc: number, veri: BufferSource): Promise<{ status: 'ok' | 'stall' | 'babble' }>;
  // Eski tarayıcılarda yoktur; yoksa izin tarayıcının site ayarlarından kaldırılır.
  forget?(): Promise<void>;
}
interface UsbErisimi {
  getDevices(): Promise<UsbAygit[]>;
  requestDevice(secim: { filters: { classCode?: number }[] }): Promise<UsbAygit>;
}

// USB yazıcı sınıfı (7). Aygıt WinUSB sürücüsüne geçse de tanımlayıcısı aynı kalır; seçim penceresinde yalnız yazıcılar görünür.
const YAZICI_SINIFI = 7;

function erisim(): UsbErisimi | null {
  if (typeof window === 'undefined' || !window.isSecureContext) return null;
  return (navigator as Navigator & { usb?: UsbErisimi }).usb ?? null;
}

// HTTPS ve Chrome/Edge yoksa false: ekran bugünkü indirme yoluyla kalır.
export function usbDestekli(): boolean {
  return erisim() !== null;
}

// İzin tarayıcıda, bu bilgisayarda tutulur: başka bilgisayarda eşleşme yoksa USB ile basılmaz.
export async function eslesmisYazici(): Promise<UsbAygit | null> {
  const usb = erisim();
  if (!usb) return null;
  const aygitlar = await usb.getDevices();
  return aygitlar.find((a) => yaziciArayuzu(a) !== null || a.configuration === null) ?? null;
}

export class UsbHatasi extends Error {}

// Tarayıcının hata metni İngilizce ve teknik; ekrandaki metin depocunun yapacağı işi söyler. Ham hata `cause` içinde kalır.
export function usbHatasi(h: unknown): UsbHatasi {
  if (h instanceof UsbHatasi) return h;
  const ad = h instanceof DOMException ? h.name : '';
  const metin = ad === 'SecurityError' || ad === 'NetworkError' || ad === 'InvalidStateError'
    ? 'Yazıcıya erişilemedi. Yazıcıyı kullanan başka bir program varsa kapatın; Sorun sürerse bu bilgisayarın yazıcı sürücüsü tarayıcıdan basıma ayarlanmamıştır; sistem yöneticisine haber verin.'
    : ad === 'NotFoundError'
      ? 'USB yazıcı bulunamadı. Kabloyu takıp yeniden deneyin.'
      : 'Yazıcı yanıt vermedi. Kabloyu ve yazıcının açık olduğunu kontrol edin.';
  return new UsbHatasi(metin, { cause: h });
}

// Kullanıcı pencereyi kapatırsa null; tarayıcı bunu hata olarak bildirir.
export async function yaziciEsle(): Promise<UsbAygit | null> {
  const usb = erisim();
  if (!usb) return null;
  try {
    return await usb.requestDevice({ filters: [{ classCode: YAZICI_SINIFI }] });
  } catch (h) {
    if (h instanceof DOMException && h.name === 'NotFoundError') return null;
    throw usbHatasi(h);
  }
}

// Yeni aygıt seçilirse eskisinin izni kaldırılır: açılışta getDevices tek yazıcı döner, iki yazıcı arasında yanlışına basılmaz.
export async function yaziciDegistir(eski: UsbAygit | null): Promise<UsbAygit | null> {
  const yeni = await yaziciEsle();
  if (yeni && eski && yeni !== eski) await eski.forget?.().catch(() => undefined);
  return yeni;
}

// Tarayıcı izni kaldırmayı desteklemiyorsa false: ekran düğmeyi göstermez.
export function eslesmeKaldirilabilir(a: UsbAygit): boolean {
  return typeof a.forget === 'function';
}

export async function eslesmeyiKaldir(a: UsbAygit): Promise<void> {
  try {
    await a.forget?.();
  } catch (h) {
    throw usbHatasi(h);
  }
}

function yaziciArayuzu(a: UsbAygit): { no: number; uc: number } | null {
  for (const ar of a.configuration?.interfaces ?? []) {
    const uc = ar.alternate.endpoints.find((u) => u.direction === 'out' && u.type === 'bulk');
    if (ar.alternate.interfaceClass === YAZICI_SINIFI && uc) return { no: ar.interfaceNumber, uc: uc.endpointNumber };
  }
  return null;
}

export async function usbyeGonder(a: UsbAygit, komut: string): Promise<void> {
  try {
    await aktar(a, komut);
  } catch (h) {
    throw usbHatasi(h);
  }
}

async function aktar(a: UsbAygit, komut: string): Promise<void> {
  if (!a.opened) await a.open();
  let tutulan: number | null = null;
  // Aygıt açıldıktan sonraki her hatada kapatılır; açık kalırsa sonraki denemede tarayıcı aygıtı meşgul sayar.
  try {
    if (a.configuration === null) await a.selectConfiguration(1);
    const hedef = yaziciArayuzu(a);
    if (!hedef) throw new UsbHatasi('Seçilen aygıtta yazıcı çıkışı yok.');
    await a.claimInterface(hedef.no);
    tutulan = hedef.no;
    // Ağ yolu (gonderici.ts) ile aynı kodlama: yazıcıya giden bayt dizisi iki yolda da aynıdır.
    const sonuc = await a.transferOut(hedef.uc, new TextEncoder().encode(komut));
    if (sonuc.status !== 'ok') throw new UsbHatasi('Yazıcı veriyi kabul etmedi.');
  } finally {
    if (tutulan !== null) await a.releaseInterface(tutulan).catch(() => undefined);
    await a.close().catch(() => undefined);
  }
}
