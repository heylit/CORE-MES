import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import type { KartKaydi } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { diffItems, kartOzeti, kodlariSabitle, kuralBaglami, newDraft, onayDurum, talepOlustur, talepUygula, type KuralBaglami } from './index.ts';

// Onay akışı açıkken aktif kartta yalnız açıklama elle değişince sihirbaz boş farkta "Kartta değişiklik yok" der ve talep gitmez.
// Fark, talep, onay ve stok özeti zinciri burada uçtan uca ölçülür.

function baglam(): KuralBaglami {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}

function aktifKart(b: KuralBaglami): KartKaydi {
  const d = newDraft(b) as KartKaydi;
  const k = { ...d, id: 'm-elle', fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 } } as KartKaydi;
  const s = kodlariSabitle(k, b) as KartKaydi;
  s.onay = { durum: 'aktif' };
  return s;
}

function elleAciklama(onceki: KartKaydi, metin: string, b: KuralBaglami): KartKaydi {
  const y = structuredClone(onceki);
  y.acManual = [true, false, false];
  y.com.ac1 = metin;
  return kodlariSabitle(y, b) as KartKaydi;
}

describe('onaylı kartta elle açıklama', () => {
  test('elle değişen Açıklama 1 farka girer, otomatik açıklama girmez', () => {
    const b = baglam();
    const onceki = aktifKart(b);
    expect(onayDurum(onceki, b)).toBe('aktif');
    const eski = onceki.com.ac1;
    const yeni = elleAciklama(onceki, 'ELLE YAZILAN ACIKLAMA', b);
    const f = diffItems(onceki, yeni, b) as { f: string; a: string; b: string }[];
    expect(f).toEqual([{ f: 'Açıklama 1', a: eski || '—', b: 'ELLE YAZILAN ACIKLAMA' }]);

    const ayni = kodlariSabitle(structuredClone(onceki), b) as KartKaydi;
    expect(diffItems(onceki, ayni, b)).toEqual([]);
  });

  test('elle açıklama otomatiğe dönünce de fark olur', () => {
    const b = baglam();
    const elle = elleAciklama(aktifKart(b), 'ELLE', b);
    const geri = structuredClone(elle);
    geri.acManual = [false, false, false];
    const f = diffItems(elle, kodlariSabitle(geri, b), b) as { f: string }[];
    expect(f.map((x) => x.f)).toEqual(['Açıklama 1']);
  });

  test('talep açıklamayı taşır; onaylanınca kartta ve stok özetinde aciklama_1 yeni değerdir', () => {
    const b = baglam();
    const onceki = aktifKart(b);
    const eski = kartOzeti(onceki, b).aciklama_1;
    const yeni = elleAciklama(onceki, 'ELLE YAZILAN ACIKLAMA', b);

    const t = talepOlustur(onceki, yeni, b) as KartKaydi;
    expect(t.talep?.farklar.map((x) => x.f)).toEqual(['Açıklama 1']);
    expect(kartOzeti(t, b).aciklama_1).toBe(eski);

    const y = talepUygula(t, 'onayla', '', b) as KartKaydi;
    expect(y.talep).toBeUndefined();
    expect(onayDurum(y, b)).toBe('aktif');
    expect(y.com.ac1).toBe('ELLE YAZILAN ACIKLAMA');
    expect(kartOzeti(y, b).aciklama_1).toBe('ELLE YAZILAN ACIKLAMA');
  });
});
