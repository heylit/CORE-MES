import { useState } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { calismaOku } from '../../durum.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { CalismaKomutu, DegisiklikSecenegi } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { yetkiKur } from '../../yetki.ts';
import { VeriVeKisitlar } from './index.tsx';

// "Veri ve kısıtlar" testlerinin uydurma çalışması. Ad, kod ve sayılar uydurmadır. Başlangıç 2026-10-19 Pazartesi 00:00.
// Kısıt sürümü güncel (kisitSurum 2): kapalı liste kullanıcının kararıdır, personel kısıtı açıktır (561 2 a). Planda bütün adımlar var (plandan biten adım çıkarılmaz). Freze grubunda V1'de kimse yok (personel bulgusu), T1'de A ve B aileleri var ve B → A geçişi tanımsız, S3'ün ürünü yok ve termini yok.
export const CALISMA_DEGERI = {
  surum: 2,
  dataVer: 3,
  D: {
    meta: { baslangic: '2026-10-19' },
    vardiyalar: [{ id: 'V1', bas: '07:00', bit: '15:00' }, { id: 'V2', bas: '23:00', bit: '07:00' }],
    calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'] },
    tatiller: ['2026-10-29'],
    tezgahlar: [
      { id: 'T1', ad: 'Deneme torna', grup: 'Torna', ucret: 500 },
      { id: 'T2', ad: 'Deneme freze', grup: 'Freze', vardiyalar: ['V1'], opOran: 0.5 },
    ],
    personel: [{ id: 'P1', ad: 'Deneme kisi', vardiya: 'V1', gruplar: ['Torna'], ayar: true }],
    devamsizlik: [{ personel: 'P1', gun: '2026-10-20' }],
    urunler: [
      { id: 'U1', ad: 'Deneme parca', rota: [
        { k: '10', ad: 'Torna', aile: 'A', tezgahlar: [{ id: 'T1', cevrim: 2, ayar: 30 }] },
        { k: '20', ad: 'Freze', aile: 'B', bag: [['10', 'o']], tezgahlar: [{ id: 'T2', cevrim: 3, ayar: 20 }], aparat: 'AP1', fai: true },
      ] },
      { id: 'U2', ad: 'Deneme govde', rota: [
        { k: '10', ad: 'Torna', aile: 'B', tezgahlar: [{ id: 'T1', cevrim: 1, ayar: 10 }] },
        { k: '20', ad: 'Kaplama', fason: 'F1', bag: [['10', 'b']] },
      ] },
    ],
    malzemeler: [{ kod: 'M1', ad: 'Deneme cubuk', birim: 'kg', stok: 5, birimFiyat: 40, tedarikGun: 3 }],
    satinalma: [{ kod: 'M1', miktar: 10, gelis: '2026-10-21 10:00', tedarikci: 'TD1' }],
    tedarikciler: [{ id: 'TD1', ad: 'Deneme tedarikci', ortGecikmeGun: 1 }],
    aparatlar: [{ id: 'AP1', ad: 'Deneme aparat', adet: 2 }],
    fasoncular: [{ id: 'F1', ad: 'Deneme fason', kapasite: 2, sureGun: 2, cikisGunleri: ['sal', 'per'], cikisSaat: 16 }],
    ayarMatrisi: [{ den: 'A', ye: 'B', dk: 15 }],
    ayarlar: { tasimaSaat: 0.5 },
    siparisler: [
      { id: 'S1', urun: 'U1', adet: 2, termin: '2026-10-23 17:00', oncelik: 1, malzeme: [{ kod: 'M1', miktar: 2 }] },
      { id: 'S2', urun: 'U2', adet: 5, termin: '2026-10-30 17:00', oncelik: 2, malzeme: [{ kod: 'M1', miktar: 2 }] },
      { id: 'S3', urun: 'U9', adet: 1, termin: null },
    ],
  },
  down: [{ m: 'T1', from: 31, to: 39 }],
  ekMesai: [{ m: 'T2', gun: 5, vardiya: 'V1' }],
  kapali: ['tatil'],
  kisitSurum: 2,
  bedel: { dataVer: 3, temel: { wT: 10, late: 1 }, zaman: null, liste: [{ id: 'tatil', dW: 0.2 }, { id: 'ariza', dW: 4 }] },
  plan: { dataVer: 3, ops: {
    'S1.10': { job: 'S1', m: 'T1', S: 7, C: 20 }, 'S1.20': { job: 'S1', m: 'T2', S: 20, C: 90 },
    'S2.10': { job: 'S2', m: 'T1', S: 20, C: 40 }, 'S2.20': { job: 'S2', m: '@F1', S: 40, C: 100, fas: 1 },
  }, ozet: { wT: 5, late: 1, n: 2 }, J: { S1: { C: 90, T: 3 }, S2: { C: 100, T: 0 } } },
};

export const calismaKur = (degisiklik: (c: typeof CALISMA_DEGERI) => void = () => undefined): PlanlamaCalismasi => {
  const c = structuredClone(CALISMA_DEGERI); degisiklik(c);
  const x = calismaOku(c); if (x === null) throw new Error('test çalışması okunamadı');
  return x;
};

export interface Degisiklik { ne: string; secenek: DegisiklikSecenegi | undefined; sonra: PlanlamaCalismasi }

const DEPO: PlanlamaDeposu = {
  ben: { kisi: { id: 1, ad: 'Deneme Yonetici' }, yazabilir: true }, calisma: null, calismaSurumu: 1, receteRotaKaydi: null,
  durum: null, planSurumu: null, senaryolar: null, motorUyarilari: null, okunamayan: [],
} as unknown as PlanlamaDeposu;

export const PLANCI = ['sayfa.recete-rota', PLANLAMA_ISLEMI, 'plan.yaz'];
export const OKUYAN = ['sayfa.recete-rota', PLANLAMA_ISLEMI];

// Ekranı çalışmanın durumunu tutan bir kapla çizer: komut değişikliği kopyaya uygular, kaydeder ve ekranı yeni çalışmayla yeniden çizer
// (sayfadaki CalismaYazici gibi). `islemler` yoksa yalnız okuyan planlamacıdır (komut null).
export function ekranAc(secenek: { c?: PlanlamaCalismasi | null; islemler?: string[]; maliyet?: boolean } = {}) {
  const degisiklikler: Degisiklik[] = [];
  const git = vi.fn(); const sec = vi.fn();
  const islemler = [...(secenek.islemler ?? PLANCI), ...(secenek.maliyet ? [MALIYET_ISLEMI] : [])];
  const yetki = yetkiKur(islemler, { yazabilir: true });
  function Kap() {
    const [c, cYaz] = useState<PlanlamaCalismasi | null>(secenek.c === undefined ? calismaKur() : secenek.c);
    const komut: CalismaKomutu | null = c && yetki.calismaYazabilir ? {
      degistir: (ne, fn, s) => {
        const t = structuredClone(c); if (fn(t) === false) return false;
        degisiklikler.push({ ne, secenek: s, sonra: t }); cYaz(t); return true;
      },
      geriAl: () => false, geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => false, kaydet: () => Promise.resolve(null),
    } : null;
    const o: PlanlamaEkranOzellikleri = {
      depo: DEPO, calisma: c, komut, yetki, git, yenile: () => undefined, olcek: ACILIS_OLCEGI, olcekSec: () => undefined, kaydir: () => undefined,
      secim: BOS_SECIM, sec,
    };
    return <VeriVeKisitlar {...o} />;
  }
  const r = render(<BildirimSaglayici><Kap /></BildirimSaglayici>);
  return { ...r, degisiklikler, git, sec };
}
