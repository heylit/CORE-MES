import { bellekDepo, kukla } from '../kukla.ts';
import qrcode from 'qrcode-generator';

// Çekirdek tarayıcının ortak durumuna dokunmaz: prototipin belge, pencere ve depo bağları burada boşa düşer; yerel depo bellektedir
// (kişisel tercihler tercihler.ts'te). Arayüz çizen ve gezinen işlevler yeni ekranda yoktur.
export const document = kukla;
export const window = kukla;
export const $ = (_secici?: string): unknown => kukla;
export const localStorage = bellekDepo();
export { qrcode };
export function hideTip(): void { /* arayüz yok */ }
export function showTip(): void { /* arayüz yok */ }

let iletiler: string[] | undefined;
export function iletileriBagla(hedef: string[] | undefined): void { iletiler = hedef; }
export function toast(m: unknown): void { iletiler?.push(String(m)); }

export interface Kopru { on: boolean; ayar: Record<string, unknown>; kullaniciAd: string; sunucuAyar: boolean; istek: (islem: string, veri?: unknown) => Promise<unknown> }
export const Host: Kopru = { on: false, ayar: {}, kullaniciAd: '', sunucuAyar: false, istek: () => Promise.reject(new Error('Yeni ekranda köprü yok.')) };

export function renderCatalog(): void { /* arayüz yok */ }
export function renderCatalogCount(): void { /* arayüz yok */ }
export function renderKilavuz(): void { /* arayüz yok */ }
export function renderMAyar(): void { /* arayüz yok */ }
export function renderOpView(): void { /* arayüz yok */ }
export function renderPreview(): void { /* arayüz yok */ }
export function renderSteps(): void { /* arayüz yok */ }
export function renderTplView(): void { /* arayüz yok */ }
export function renderWizard(): void { /* arayüz yok */ }
export function goStep(_i?: number): void { /* arayüz yok */ }
export function setView(_v?: string): void { /* arayüz yok */ }
