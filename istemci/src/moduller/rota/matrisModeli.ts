import type { PlanCevabi, PlanYerlesimi } from '#paylasilan/sozlesme/plan.ts';
import { dalla } from './gorunum.ts';
import {
  gorunenEmirler, gorunenKaynaklar, gorunenYerlesimler, gunDakikasiToplami, gundeMi, istasyonuOlan, toplamla, ufukSirasi, yukSinifi,
  type Pencere, type Suzgec, type YukSinifi,
} from './planGorunumu.ts';

export type MatrisKip = 'istasyon' | 'personel' | 'kaynak' | 'emir';

export const KIP_ADI: Record<MatrisKip, string> = { istasyon: 'İstasyon yükü', personel: 'Personel', kaynak: 'Makine ve kişi', emir: 'Emir planı' };

export interface MatrisHucre {
  tarih: string;
  // Yük kipinde dakika; emir kipinde dolu iş sayısıdır. Ufuk dışında ve kapasitesizlikte null.
  dolu: number | null;
  kapasite: number | null;
  sinif: YukSinifi | null;
  // Plan cevabı bu günü kapsamıyor (ufkun dışı): boş bırakılır, sıfır yazılmaz.
  veriYok: boolean;
  // Hücrenin günündeki işler; iş merkezi düzeyindeki personel yükünde cevap iş ilişkisi vermez.
  isler: PlanYerlesimi[] | null;
}
export interface MatrisToplami { dolu: number; kapasite: number; oran: number | null }
export interface MatrisSatiri { anahtar: string; baslik: string; alt: string | null; derinlik: number; hucreler: MatrisHucre[]; toplam: MatrisToplami }
export interface MatrisModeli { yuk: boolean; satirlar: MatrisSatiri[]; gunToplamlari: MatrisToplami[]; genel: MatrisToplami }

const bosHucre = (tarih: string): MatrisHucre => ({ tarih, dolu: null, kapasite: null, sinif: null, veriYok: true, isler: null });

function yukHucresi(tarih: string, dolu: number | null, kapasite: number | null, isler: PlanYerlesimi[] | null, kapasitesizYuk: boolean): MatrisHucre {
  if (dolu === null || kapasite === null) return bosHucre(tarih);
  if (kapasite <= 0 && dolu <= 0) return { tarih, dolu: null, kapasite: null, sinif: null, veriYok: false, isler };
  // İhtiyaç var, kapasite yok: oran tanımsızdır, en yüksek sınıf olarak işaretlenir; kapasite uydurulmaz.
  const sinif = kapasite <= 0 ? (kapasitesizYuk ? 4 : null) : yukSinifi(dolu / kapasite);
  return { tarih, dolu, kapasite: kapasite > 0 ? kapasite : null, sinif, veriYok: false, isler };
}

const toplamHucreler = (h: readonly MatrisHucre[]): MatrisToplami => {
  const t = toplamla(h.filter((x) => x.dolu !== null && x.kapasite !== null).map((x) => ({ dolu: x.dolu!, kapasite: x.kapasite! })));
  return { dolu: t.dolu, kapasite: t.kapasite, oran: t.oran };
};

export function matrisKur(p: PlanCevabi, kip: MatrisKip, pencere: Pencere, suzgec: Suzgec): MatrisModeli {
  const gunler = pencere.gunler;
  const gorunen = gorunenYerlesimler(p, suzgec);
  let satirlar: MatrisSatiri[];

  if (kip === 'istasyon') {
    const kaynakIstasyon = new Map(p.kaynaklar.map((k) => [`${k.tur}:${k.id}`, istasyonuOlan(k)]));
    satirlar = p.istasyonYuku.filter((s) => suzgec.istasyonId === null || s.istasyonId === suzgec.istasyonId).map((s) => {
      const isleri = p.yerlesimler.filter((y) => kaynakIstasyon.get(`${y.kaynak.tur}:${y.kaynak.id}`) === s.istasyonId);
      const hucreler = gunler.map((t) => {
        const i = ufukSirasi(p, t);
        return i === null ? bosHucre(t) : yukHucresi(t, s.dolu[i] ?? 0, s.kapasite[i] ?? 0, isleri.filter((y) => gundeMi(y, t)), false);
      });
      return { anahtar: `istasyon:${s.istasyonId}`, baslik: `${s.kod} ${s.ad}`, alt: `en çok ${Math.round(Math.max(0, ...s.kapasite) / 60)} sa/gün`, derinlik: 0, hucreler, toplam: toplamHucreler(hucreler) };
    });
  } else if (kip === 'personel') {
    satirlar = p.personelYuku.map((m) => {
      const hucreler = gunler.map((t) => {
        const i = ufukSirasi(p, t);
        return i === null ? bosHucre(t) : yukHucresi(t, m.ihtiyac[i] ?? 0, m.kapasite[i] ?? 0, null, true);
      });
      return { anahtar: `merkez:${m.isMerkeziId}`, baslik: `${m.kod} ${m.ad}`, alt: 'kişi-saat', derinlik: 0, hucreler, toplam: toplamHucreler(hucreler) };
    });
  } else if (kip === 'kaynak') {
    satirlar = gorunenKaynaklar(p, suzgec).map((k) => {
      const isleri = gorunen.filter((y) => y.kaynak.tur === k.tur && y.kaynak.id === k.id);
      const hucreler = gunler.map((t) => {
        const gunIsleri = isleri.filter((y) => gundeMi(y, t));
        const h = gunDakikasiToplami(gunIsleri, t);
        return yukHucresi(t, h.dolu, h.kapasite, gunIsleri, false);
      });
      return { anahtar: `${k.tur}:${k.id}`, baslik: `${k.tur === 'makine' ? '' : 'Kişi: '}${k.tur === 'makine' ? `${k.kod ?? ''} ${k.ad}`.trim() : k.ad}`, alt: k.istasyon?.kod ?? null, derinlik: 0, hucreler, toplam: toplamHucreler(hucreler) };
    });
  } else {
    const emirIsleri = new Map<number, PlanYerlesimi[]>();
    for (const y of p.yerlesimler) emirIsleri.set(y.uretimEmriId, [...(emirIsleri.get(y.uretimEmriId) ?? []), y]);
    const emirler = gorunenEmirler(p, suzgec).filter((e) => emirIsleri.has(e.uretimEmriId));
    satirlar = dalla(emirler, (e) => e.uretimEmriId, (e) => e.ustEmirId ?? null).map(({ e, derinlik }) => {
      const isleri = emirIsleri.get(e.uretimEmriId) ?? [];
      const hucreler = gunler.map((t) => {
        const gunIsleri = isleri.filter((y) => gundeMi(y, t));
        return { tarih: t, dolu: gunIsleri.length, kapasite: null, sinif: null, veriYok: false, isler: gunIsleri };
      });
      const penceredekiler = isleri.filter((y) => Date.parse(y.bitis) > pencere.baslangic && Date.parse(y.baslangic) < pencere.bitis).length;
      return { anahtar: `emir:${e.uretimEmriId}`, baslik: e.emirNo, alt: e.urunKodu, derinlik, hucreler, toplam: { dolu: penceredekiler, kapasite: 0, oran: null } };
    });
  }

  const yuk = kip !== 'emir';
  const gunToplamlari = gunler.map((_, g) => {
    if (yuk) return toplamHucreler(satirlar.map((s) => s.hucreler[g]!));
    return { dolu: satirlar.reduce((t, s) => t + (s.hucreler[g]!.dolu ?? 0), 0), kapasite: 0, oran: null };
  });
  const genel = yuk ? toplamHucreler(satirlar.flatMap((s) => s.hucreler)) : { dolu: satirlar.reduce((t, s) => t + s.toplam.dolu, 0), kapasite: 0, oran: null };
  return { yuk, satirlar, gunToplamlari, genel };
}

const GUN_ADI = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
// Tarih metni gün ortasından okunur: hangi saat dilimi olursa olsun haftanın günü değişmez.
export const gunBasligi = (tarih: string): string => GUN_ADI[new Date(`${tarih}T12:00:00Z`).getUTCDay()]!;
export const haftaSonuMu = (tarih: string): boolean => { const g = new Date(`${tarih}T12:00:00Z`).getUTCDay(); return g === 0 || g === 6; };
