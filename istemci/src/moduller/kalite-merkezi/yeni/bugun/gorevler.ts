import { butunAnahtarlar, DURDURULDU } from '../aql.ts';
import { sayiMetni, trd } from '../bicim.ts';
import { devDurumu, gunKaldi, karantina } from '../kurallar.ts';
import { KAPALI } from '../sabitler.ts';
import { KALIBRASYON_YOLU, STUDYO_YOLU } from '../sekmeler.ts';
import type { FormKaydi, KmGecis, KmGorunum } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';

export type GorevEylemi =
  | { tur: 'gorunum'; gorunum: KmGorunum; gecis?: KmGecis }
  | { tur: 'yol'; yol: string }
  | { tur: 'formOnayi'; kayit: FormKaydi };

// Öncelik uygulamadakiyle aynıdır: 0 en acil (kırmızı), 1 acil (sarı), 4 hazırlık.
export interface Gorev {
  oncelik: number;
  grup: string;
  baslik: string;
  alt: string;
  eylemMetni: string;
  eylem: GorevEylemi;
}

export const yarimMi = (i: { adimli?: boolean; sonuc?: string }): boolean => !!i.adimli && i.sonuc === 'Devam ediyor';

const dolu = (v: unknown): boolean => String(v ?? '').trim() !== '';

// Form onayı mühendis işidir; onaylayamayan kişi aynı satırda kaydı görüntüler.
export function bugunGorevleri(veri: KmVerisi, onaylayabilir: boolean): Gorev[] {
  const T: Gorev[] = [];
  for (const i of veri.insp.filter(yarimMi)) {
    const kar = i.chars ?? [];
    const olculen = kar.filter((c) => (c.olcumler ?? [c.olcum]).every(dolu)).length;
    T.push({
      oncelik: 1, grup: 'Yarım kalan ölçümler', baslik: `${i.parcaNo ?? ''}: ${i.no ?? ''} ${i.tur ?? ''}`,
      alt: `${String(olculen)}/${String(kar.length)} ölçüldü | ${i.muayeneci ?? ''} | ${trd(i.tarih)}`,
      eylemMetni: 'Devam et', eylem: { tur: 'yol', yol: STUDYO_YOLU },
    });
  }
  for (const q of karantina(veri)) {
    T.push({
      oncelik: q.ton === 'kotu' ? 0 : 2, grup: 'Karar bekleyen ürünler', baslik: `${q.parcaNo}: ${q.baslik}`,
      alt: `${q.ref}${q.lot ? ` | lot ${q.lot}` : ''} | ${sayiMetni(q.miktar)} adet | ${String(q.yas)} gündür bekliyor`,
      eylemMetni: q.eylem, eylem: { tur: 'gorunum', gorunum: q.hedef, gecis: q.gecis },
    });
  }
  for (const c of veri.capa) {
    const k = c.durum === KAPALI ? null : gunKaldi(c.termin);
    if (k === null || k > 7) continue;
    T.push({
      oncelik: k < 0 ? 0 : 3, grup: 'Düzeltici faaliyetler', baslik: `${c.no ?? ''}: ${c.baslik ?? ''}`,
      alt: k < 0 ? `Termin ${String(-k)} gün geçti | ${c.sorumlu ?? ''}` : `Termine ${String(k)} gün | ${c.sorumlu ?? ''}`,
      eylemMetni: 'Aç', eylem: { tur: 'gorunum', gorunum: 'dof', gecis: { ac: c._id } },
    });
  }
  for (const d of veri.dev) {
    if (d.kullanimDisi) continue;
    const s = devDurumu(d);
    const ad = `${d.kod ?? ''} ${d.ad ?? ''}`;
    const eylem: GorevEylemi = { tur: 'yol', yol: KALIBRASYON_YOLU };
    if (s.ton === 'kotu') T.push({ oncelik: 1, grup: 'Ölçüm cihazları', baslik: ad, alt: 'Kalibrasyonu geçersiz, ölçümde kullanılamaz', eylemMetni: 'Kalibrasyon kaydet', eylem });
    else if (s.ton === 'uyari') T.push({ oncelik: 4, grup: 'Ölçüm cihazları', baslik: ad, alt: `Kalibrasyona ${String(s.kalan ?? '')} gün`, eylemMetni: 'Kalibrasyon kaydet', eylem });
  }
  for (const r of veri.frm.filter((x) => x.durum === 'Onay bekliyor')) {
    T.push({
      oncelik: 3, grup: 'Onay bekleyen formlar', baslik: `${r.kod ?? ''} ${r.ad ?? ''}`, alt: `${trd(r.tarih)} | ${r.dolduran ?? ''}`,
      ...(onaylayabilir
        ? { eylemMetni: 'Onayla', eylem: { tur: 'formOnayi', kayit: r } }
        : { eylemMetni: 'Görüntüle', eylem: { tur: 'gorunum', gorunum: 'formlar', gecis: { ac: r._id } } }),
    });
  }
  for (const d of veri.cizim.filter((x) => !(x.balonlar ?? []).length)) {
    T.push({
      oncelik: 4, grup: 'Hazırlık', baslik: `${d.parcaNo ?? ''}: ${d.dosyaTip === 'step' ? '3D model' : 'teknik resim'} balonlanmamış`, alt: d.dosyaAdi ?? '',
      eylemMetni: 'Balonla', eylem: { tur: 'yol', yol: STUDYO_YOLU },
    });
  }
  for (const b of veri.belge) {
    const k = gunKaldi(b.gecerlilik);
    if (k === null || k > 30) continue;
    T.push({
      oncelik: k < 0 ? 1 : 4, grup: 'Belgeler ve sertifikalar', baslik: `${b.tur ?? ''}: ${b.belgeNo || b.ad || ''}`,
      alt: k < 0 ? `Süresi ${String(-k)} gün önce doldu` : `${String(k)} gün içinde doluyor`,
      eylemMetni: 'Görüntüle', eylem: { tur: 'gorunum', gorunum: 'belgeler', gecis: { ac: b._id } },
    });
  }
  for (const { son, s } of butunAnahtarlar(veri.lot)) {
    if (s.st !== DURDURULDU) continue;
    T.push({
      oncelik: 1, grup: 'Lot kabul', baslik: `${son.parcaNo ?? ''}: kabul muayenesi durduruldu`, alt: s.sonraki,
      eylemMetni: 'Görüntüle', eylem: { tur: 'gorunum', gorunum: 'lot-kabul' },
    });
  }
  // Sıralama kararlıdır: aynı öncelikte ekleme sırası (uygulamadaki grup sırası) korunur.
  return T.sort((a, b) => a.oncelik - b.oncelik);
}

export interface GorevGrubu {
  grup: string;
  oncelik: number;
  gorevler: Gorev[];
}

// Grup, içindeki en acil görevin önceliğiyle sıralanır; grup içi sıra görev sırasıdır.
export function gruplara(gorevler: readonly Gorev[]): GorevGrubu[] {
  const gruplar: GorevGrubu[] = [];
  for (const g of gorevler) {
    let grup = gruplar.find((x) => x.grup === g.grup);
    if (!grup) { grup = { grup: g.grup, oncelik: g.oncelik, gorevler: [] }; gruplar.push(grup); }
    grup.gorevler.push(g);
    grup.oncelik = Math.min(grup.oncelik, g.oncelik);
  }
  return gruplar.sort((a, b) => a.oncelik - b.oncelik);
}

export interface BugunOzeti {
  acikNcr: number;
  karantinada: number;
  yarim: number;
  gecersizCihaz: number;
}

export function bugunOzeti(veri: KmVerisi): BugunOzeti {
  return {
    acikNcr: veri.ncr.filter((x) => x.durum !== KAPALI).length,
    karantinada: karantina(veri).length,
    yarim: veri.insp.filter(yarimMi).length,
    gecersizCihaz: veri.dev.filter((d) => !d.kullanimDisi && devDurumu(d).ton === 'kotu').length,
  };
}
