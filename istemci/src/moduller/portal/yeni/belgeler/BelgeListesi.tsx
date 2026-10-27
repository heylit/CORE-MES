import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CubukListesiKarti, Dugme, DurumKutusu, GrafikKarti, Rozet, SayfaBasligi, SayiKarti, Sekmeler, Tablo, type RozetTonu, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { AYLAR, ayAnahtari, kalanGun, kisaTarih, sureMetni, YOK } from '../bicim.ts';
import { belgeUyumu, degerler, firmaBlokta } from '../kurallar.ts';
import type { GorunumOzellikleri } from '../sekmeler.ts';
import type { Depo, KoleksiyonAdi } from '../tipler.ts';
import { usePortal, usePortalDeposu } from '../veri.ts';
import { BelgeKarari } from './BelgeKarari.tsx';
import { BelgeYukle } from './BelgeYukle.tsx';
import type { BelgeKaydi } from './gorseller.ts';
import './belgeler.css';

// Belge takibi (prototip docsView): sayılar, geçerlilik takvimi, firma bazında uyum, eksik zorunlu belgeler ve süzgeçli liste.
// Firma kartı taşınmadı (230 a); firma adı firma görünümüne gider, kabuk onu sahibinde açar.

const KOLEKSIYONLAR: readonly KoleksiyonAdi[] = ['docs', 'parties'];
// "Dikkat gerektiren" ve sayı kartındaki yaklaşan süre sınırı (prototip 60 gün).
const YAKLASAN_GUN = 60;
const TAKVIM_AY = 12;

export type BelgeSuzgeci = 'attention' | 'pending' | 'expired' | 'all';

const sureli = (b: BelgeKaydi): b is BelgeKaydi & { expiresAt: string } => Boolean(b.expiresAt);
const kalan = (b: BelgeKaydi, simdi: number): number | null => kalanGun(b.expiresAt, simdi);

export const SUZGECLER: Readonly<Record<BelgeSuzgeci, readonly [string, (b: BelgeKaydi, simdi: number) => boolean]>> = {
  attention: ['Dikkat gerektiren', (b, simdi) => b.status === 'pending' || (b.status === 'approved' && sureli(b) && (kalan(b, simdi) ?? 0) <= YAKLASAN_GUN)],
  pending: ['Onay bekleyen', (b) => b.status === 'pending'],
  expired: ['Süresi dolmuş', (b, simdi) => b.status === 'approved' && sureli(b) && (kalan(b, simdi) ?? 0) < 0],
  all: ['Tümü', () => true],
};
const SUZGEC_SIRASI: readonly BelgeSuzgeci[] = ['attention', 'pending', 'expired', 'all'];

export function belgeDurumu(b: BelgeKaydi, simdi: number): readonly [string, RozetTonu] {
  if (b.status === 'pending') return ['Onay bekliyor', 'uyari'];
  if (b.status === 'rejected') return ['Reddedildi', 'hata'];
  if (sureli(b) && (kalan(b, simdi) ?? 0) < 0) return ['Süresi doldu', 'hata'];
  return ['Geçerli', 'tamam'];
}

// Süresi olmayan belge en sona; süresi en yakın olan başa.
export function suzulmusBelgeler(belgeler: readonly BelgeKaydi[], suzgec: BelgeSuzgeci, simdi: number): BelgeKaydi[] {
  const [, kosul] = SUZGECLER[suzgec];
  return belgeler.filter((b) => kosul(b, simdi)).sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
}

export interface EksikBelge { firmaId: string; firma: string; tur: string }

export function eksikBelgeler(d: Depo, simdi: number): EksikBelge[] {
  return degerler(d.parties).flatMap((p) => belgeUyumu(d, p.id, simdi).missing.map((tur) => ({ firmaId: p.id, firma: p.name, tur })));
}

// Bu aydan başlayarak önümüzdeki aylar; anahtar YYYY-AA.
export function gelecekAylar(n: number, simdi: number): { anahtar: string; etiket: string }[] {
  const d = new Date(simdi);
  return Array.from({ length: n }, (_, k) => {
    const x = new Date(d.getFullYear(), d.getMonth() + k, 1);
    return { anahtar: `${String(x.getFullYear())}-${String(x.getMonth() + 1).padStart(2, '0')}`, etiket: AYLAR[x.getMonth()] ?? '' };
  });
}

export function belgeSayilari(d: Depo, simdi: number) {
  const hepsi = degerler(d.docs) as BelgeKaydi[];
  return {
    bekleyen: hepsi.filter((b) => SUZGECLER.pending[1](b, simdi)).length,
    yaklasan: hepsi.filter((b) => b.status === 'approved' && sureli(b) && (kalan(b, simdi) ?? -1) >= 0 && (kalan(b, simdi) ?? 0) <= YAKLASAN_GUN).length,
    dolan: hepsi.filter((b) => SUZGECLER.expired[1](b, simdi)).length,
    eksik: eksikBelgeler(d, simdi).length,
    blokta: degerler(d.parties).filter((p) => p.type === 'supplier' && firmaBlokta(d, p.id, simdi)).length,
  };
}

interface Karar { belge: BelgeKaydi; onay: boolean }

export function BelgeListesi(_: GorunumOzellikleri) {
  const { izin, simdi, yol, git } = usePortal();
  const { depo, yukleniyor, hata, yenile } = usePortalDeposu(KOLEKSIYONLAR);
  const [suzgec, suzgecYaz] = useState<BelgeSuzgeci>('attention');
  const [yukle, yukleYaz] = useState(false);
  const [karar, kararYaz] = useState<Karar | null>(null);

  const hepsi = useMemo(() => degerler(depo.docs) as BelgeKaydi[], [depo.docs]);
  const sayilar = useMemo(() => belgeSayilari(depo, simdi), [depo, simdi]);
  const eksikler = useMemo(() => eksikBelgeler(depo, simdi), [depo, simdi]);
  const liste = useMemo(() => suzulmusBelgeler(hepsi, suzgec, simdi), [hepsi, suzgec, simdi]);
  const takvim = useMemo(() => gelecekAylar(TAKVIM_AY, simdi).map((a) => ({
    etiket: a.etiket,
    deger: hepsi.filter((b) => b.status === 'approved' && sureli(b) && ayAnahtari(b.expiresAt) === a.anahtar).length,
  })), [hepsi, simdi]);
  const uyum = useMemo(() => degerler(depo.parties)
    .map((p) => { const u = belgeUyumu(depo, p.id, simdi); return { etiket: p.name, deger: Math.round(u.pct), ton: u.ok ? undefined : ('uyari' as const) }; })
    .sort((a, b) => a.deger - b.deger), [depo, simdi]);

  const karara = izin.eylemAcik('docdecide');
  const firmaAdi = (id: string): string => depo.parties[id]?.name ?? YOK;

  const sutunlar: Sutun<BelgeKaydi>[] = [
    { anahtar: 'firma', baslik: 'Firma', hucre: (b) => <Link to={yol('party', b.partyId)}>{firmaAdi(b.partyId)}</Link>, csv: (b) => firmaAdi(b.partyId) },
    {
      anahtar: 'belge', baslik: 'Belge', csv: (b) => b.type,
      hucre: (b) => <span className="tc-pt-belgeler-iki"><span>{b.type}</span><small>{`no ${b.no || YOK}`}</small></span>,
    },
    {
      anahtar: 'gecerlilik', baslik: 'Geçerlilik', kirilmaz: true, csv: (b) => b.expiresAt ?? '',
      hucre: (b) => (sureli(b) ? (
        <span className="tc-pt-belgeler-iki">
          <span>{kisaTarih(b.expiresAt)}</span>
          <small data-gecti={(kalan(b, simdi) ?? 0) < 0 || undefined}>{sureMetni(b.expiresAt, simdi)}</small>
        </span>
      ) : 'Süresiz'),
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (b) => { const [m, t] = belgeDurumu(b, simdi); return <Rozet ton={t}>{m}</Rozet>; }, csv: (b) => belgeDurumu(b, simdi)[0] },
    {
      anahtar: 'eylem', baslik: 'İşlem', hizala: 'sag', kirilmaz: true, csv: false,
      hucre: (b) => (karara && b.status === 'pending' ? (
        <span className="tc-pt-belgeler-eylem">
          <Dugme simge="check" onClick={() => kararYaz({ belge: b, onay: true })}>Onayla</Dugme>
          <Dugme simge="x" tur="tehlike" onClick={() => kararYaz({ belge: b, onay: false })}>Reddet</Dugme>
        </span>
      ) : null),
    },
  ];

  // Prototipte satır firma kartına gider; firma kartı taşınmadı, kabuk onu sahibinde açar.
  const eksikSutunlari: Sutun<EksikBelge>[] = [
    { anahtar: 'firma', baslik: 'Firma', hucre: (x) => <Link to={yol('party', x.firmaId)}>{x.firma}</Link>, csv: (x) => x.firma },
    { anahtar: 'tur', baslik: 'Belge', hucre: (x) => x.tur },
    { anahtar: 'durum', baslik: 'Durum', hucre: () => <Rozet ton="hata">Eksik</Rozet>, csv: false },
  ];

  const baslik = (
    <SayfaBasligi
      baslik="Belge takibi" simge="file"
      alt="Firmaların zorunlu belgeleri ve geçerlilik süreleri. Süresi dolan veya eksik zorunlu belgesi olan tedarikçiye yeni satın alma siparişi açılamaz."
      birincil={izin.eylemAcik('adddoc') ? { etiket: 'Belge ekle', simge: 'upload', yap: () => { yukleYaz(true); } } : undefined}
    />
  );

  if (yukleniyor) return <>{baslik}<DurumKutusu durum="yukleniyor" /></>;
  if (hata) return <>{baslik}<DurumKutusu durum="hata" mesaj="Belgeler okunamadı." yenile={yenile} /></>;

  return (
    <div className="tc-pt-belgeler">
      {baslik}
      <div className="tc-pt-sayilar">
        <SayiKarti baslik="Onay bekleyen" simge="clock" sayi={sayilar.bekleyen} ton="uyari" />
        <SayiKarti baslik="60 gün içinde dolacak" simge="clock" sayi={sayilar.yaklasan} ton="uyari" />
        <SayiKarti baslik="Süresi dolmuş" simge="alert" sayi={sayilar.dolan} ton="hata" />
        <SayiKarti baslik="Eksik zorunlu belge" simge="file" sayi={sayilar.eksik} ton="hata" />
        <SayiKarti baslik="Blokajdaki tedarikçi" simge="lock" sayi={sayilar.blokta} ton="hata" />
      </div>
      <div className="tc-pt-grafikler">
        <GrafikKarti baslik="Geçerlilik takvimi" simge="chart" tur="cubuk" noktalar={takvim} altMetin="Önümüzdeki 12 ayda süresi dolacak belge" />
        <CubukListesiKarti baslik="Firma bazında belge uyumu" simge="building" satirlar={uyum} birim="%" enUst={100} />
      </div>
      {eksikler.length > 0 && (
        <section className="tc-pt-pano" aria-labelledby="tc-pt-belgeler-eksik">
          <div className="tc-pt-pano-bas"><h3 id="tc-pt-belgeler-eksik">Eksik zorunlu belgeler</h3></div>
          <Tablo
            etiket="Eksik zorunlu belgeler" sutunlar={eksikSutunlari} satirlar={eksikler} satirAnahtari={(x) => `${x.firmaId}:${x.tur}`}
            satirSec={(x) => { git('party', x.firmaId); }}
          />
        </section>
      )}
      <Sekmeler
        etiket="Belge süzgeci"
        sekmeler={SUZGEC_SIRASI.map((k) => ({ anahtar: k, baslik: `${SUZGECLER[k][0]} (${String(suzulmusBelgeler(hepsi, k, simdi).length)})` }))}
        secili={suzgec}
        sec={suzgecYaz}
      />
      <Tablo etiket="Firma belgeleri" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(b) => b.id} bosMesaj="Kayıt yok." />
      <BelgeYukle acik={yukle} kapat={() => { yukleYaz(false); }} firmalar={degerler(depo.parties)} />
      <BelgeKarari karar={karar} firmaAdi={karar ? firmaAdi(karar.belge.partyId) : ''} kapat={() => { kararYaz(null); }} />
    </div>
  );
}
