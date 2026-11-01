import type { CalismaKomutu } from '../kayit.ts';
import type { SihirbazDegeri, SihirbazTanimi } from '../ortak/sade/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { fasonTerminiYaz, gunYaz, tarihGirdisi, type FasonSatiri } from './kurallar.ts';

// P2'nin "Veri gir" sihirbazı (zz25-sade-takvim SADE.terminler fason). Çizimi ortak sade kabuğu
// yapar; açılımdan sipariş ya da iş dolu açılır. Yazma yalnız komut.degistir ile; termin ve öncelik sahibinindir, burada form yoktur (222 a);
// siparişin elle çarpanı ve tutarı da yazılmaz (815, 699/3 a).

const metin = (v: string | boolean | undefined): string => (typeof v === 'string' ? v : '');

export function fasonTanimi(c: PlanlamaCalismasi, L: readonly FasonSatiri[], komut: CalismaKomutu): SihirbazTanimi {
  const D = c.D;
  const l = [...L].sort((a, b) => (a.T == null ? 0 : 1) - (b.T == null ? 0 : 1) || a.r.S - b.r.S);
  const bul = (id: string) => l.find((x) => x.id === id);
  return {
    id: 'fason', ad: 'Fason dönüş tarihi gir', simge: 'truck', ne: 'Fasoncunun söz verdiği dönüş günü.',
    alanlar: (d: SihirbazDegeri) => {
      const sec = bul(metin(d.is));
      return [
        { k: 'is', ad: 'Fason işi', tur: 'secim', zorunlu: true, secenekler: l.map((x) => [x.id, `${x.id} · ${x.f?.ad ?? x.r.m} · çıkış ${gunYaz(D, x.r.S)} · ${x.T == null ? 'tarih yok' : `dönüş ${gunYaz(D, x.T)}`}`] as const) },
        { k: 't', ad: 'Dönüş tarihi', tur: 'tarih', zorunlu: true, ipucu: sec ? `Sonraki adım ${gunYaz(D, sec.ger)} başlıyor; sipariş gecikmeden en geç ${gunYaz(D, sec.enGec)}` : 'Fasoncunun söz verdiği gün' },
      ];
    },
    adimlar: [{ ad: 'Hangi iş', ne: 'Tarihi olmayanlar başta.', k: ['is'] }, { ad: 'Dönüş tarihi', k: ['t'] }],
    ilk: () => ({}),
    ileri: (d, i) => { const x = i === 0 ? bul(metin(d.is)) : undefined; return x ? { ...d, t: tarihGirdisi(D, x.T) } : undefined; },
    sonuc: 'iş plana bu dönüş tarihiyle girer.',
    kaydet: (d) => {
      const id = metin(d.is); const t = metin(d.t);
      komut.degistir('Fason dönüş termini girildi', (taslak) => { fasonTerminiYaz(taslak, id, t); }, { ayrinti: `${id}: ${t}` });
    },
    bitti: (d) => `${metin(d.is)} dönüşü ${metin(d.t)} oldu`,
  };
}
