import { useState, type ReactNode } from 'react';
import type { MalzemeStokSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, IsaretKutusu, Pencere, Rozet, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { ondalik } from '../../ortak/veri/csv.ts';
import { DURUM_ETIKETI, MALZEME_TURU, birimliMiktar, miktarMetni, zamanMetni } from './gorunum.ts';

// Malzemeler ve tür listeleri aynı tabloyu kullanır: her malzeme tek satır, sütunlar yana kayar; Malzeme solda, işlemler
// sağda sabit. Gizlenebilir sütunların seçimi kişinin tarayıcısında durur (sunucuda kişi ayarı yok).

const KART_DURUMU: Record<NonNullable<MalzemeStokSatiri['kartDurumu']>, { etiket: string; ton: RozetTonu }> = {
  taslak: { etiket: 'Taslak', ton: 'pasif' }, onayda: { etiket: 'Onayda', ton: 'uyari' }, aktif: { etiket: 'Onaylı', ton: 'tamam' },
  pasif: { etiket: 'Pasif', ton: 'pasif' }, iptal: { etiket: 'İptal', ton: 'hata' },
};

// Gizlenebilir sütunlar, tablodaki sırasıyla. Malzeme ve İşlemler hep görünür; türe özel sütunlar türün ekranındadır.
export const GIZLENEBILIR = [
  { anahtar: 'kod', baslik: 'Stok kodu' }, { anahtar: 'tur', baslik: 'Tür' }, { anahtar: 'kategori', baslik: 'Kategori' },
  { anahtar: 'birim', baslik: 'Birim' }, { anahtar: 'serbest', baslik: 'Serbest' }, { anahtar: 'statude', baslik: 'Statüde' },
  { anahtar: 'rezerve', baslik: 'Rezerve' }, { anahtar: 'disi', baslik: 'Kabul / karantina' }, { anahtar: 'toplam', baslik: 'Toplam' },
  { anahtar: 'kritik', baslik: 'Kritik seviye' }, { anahtar: 'durum', baslik: 'Durum' }, { anahtar: 'konum', baslik: 'Konumlar' },
  { anahtar: 'varsayilan', baslik: 'Varsayılan konum' }, { anahtar: 'son', baslik: 'Son hareket' }, { anahtar: 'kart', baslik: 'Kart durumu' },
] as const;
export type GizlenebilirSutun = (typeof GIZLENEBILIR)[number]['anahtar'];

const ANAHTAR = 'coremes.stok-malzeme-sutunlari';
function kayitliGizliler(): ReadonlySet<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ANAHTAR) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}
export function useSutunSecimi() {
  const [gizli, gizliYaz] = useState<ReadonlySet<string>>(kayitliGizliler);
  const degistir = (anahtar: GizlenebilirSutun) => {
    const y = new Set(gizli);
    if (y.has(anahtar)) y.delete(anahtar); else y.add(anahtar);
    gizliYaz(y);
    try { localStorage.setItem(ANAHTAR, JSON.stringify([...y])); } catch { /* depolama kapalı: seçim bu açılışta kalır */ }
  };
  return { gizli, degistir };
}

export function SutunSecici({ gizli, degistir }: ReturnType<typeof useSutunSecimi>) {
  const [acik, acikYaz] = useState(false);
  return (
    <>
      <Dugme simge="grid" aria-expanded={acik} onClick={() => acikYaz(true)}>Sütunlar</Dugme>
      <Pencere acik={acik} kapat={() => acikYaz(false)} baslik="Görünen sütunlar" tur="yan">
        <div className="tc-stok-sutun-secimi">
          {GIZLENEBILIR.map((s) => <IsaretKutusu key={s.anahtar} etiket={s.baslik} checked={!gizli.has(s.anahtar)} onChange={() => degistir(s.anahtar)} />)}
          <p className="tc-stok-not">Malzeme ve işlemler hep görünür. Seçim bu tarayıcıda saklanır.</p>
        </div>
      </Pencere>
    </>
  );
}

const sayiHucresi = (m: string, soluk = Number(m) === 0) => <span className={soluk ? 'tc-stok-soluk' : undefined}>{miktarMetni(m)}</span>;
// Toplamdan serbest ve statüdeki çıkınca kalan: kabul gözünde ya da karantinada bekleyen, kullanılamayan miktar.
export const kullanilamaz = (m: MalzemeStokSatiri): number => Number(m.toplam) - Number(m.serbest) - Number(m.statude);

// `ek`: türe özel sütunlar Kategori'den sonra gelir. `eylem`: satırın işlem düğmeleri (sağda sabit).
export function malzemeSutunlari<S extends MalzemeStokSatiri>(secenek: { gizli: ReadonlySet<string>; ek?: readonly Sutun<S>[]; eylem: (m: S) => ReactNode }): Sutun<S>[] {
  const { gizli, ek = [], eylem } = secenek;
  const tum: (Sutun<S> & { gizlenir?: GizlenebilirSutun })[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', sirala: true, sabit: 'sol', kes: true, csv: (m) => m.ad ?? `Kart ${m.malzemeId}`, hucre: (m) => (
      <span className="tc-stok-ad"><strong>{m.ad ?? `Kart ${m.malzemeId}`}</strong>
        <span>Kart no {m.malzemeId}{m.konumSayisi > 0 ? ` · ${m.konumSayisi} konum` : ''}</span></span>
    ) },
    { anahtar: 'kod', gizlenir: 'kod', baslik: 'Stok kodu', mono: true, hucre: (m) => m.stokKodu },
    { anahtar: 'tur', gizlenir: 'tur', baslik: 'Tür', hucre: (m) => (m.tur ? MALZEME_TURU[m.tur] : null) },
    { anahtar: 'kategori', gizlenir: 'kategori', baslik: 'Kategori', hucre: (m) => m.kategoriAdi ?? null },
    ...ek,
    { anahtar: 'birim', gizlenir: 'birim', baslik: 'Birim', hucre: (m) => m.birim },
    { anahtar: 'serbest', gizlenir: 'serbest', baslik: 'Serbest', hizala: 'sag', sirala: true, csv: (m) => ondalik(m.serbest), hucre: (m) => (
      <strong className={`tc-stok-buyuk-miktar ${m.durum === 'eksi' ? 'tc-stok-eksi' : m.durum === 'kritik' ? 'tc-stok-uyari-yazi' : ''}`}>{birimliMiktar(m.serbest, m.birim)}</strong>
    ) },
    { anahtar: 'statude', gizlenir: 'statude', baslik: 'Statüde', hizala: 'sag', mono: true, csv: (m) => ondalik(m.statude), hucre: (m) => sayiHucresi(m.statude) },
    { anahtar: 'rezerve', gizlenir: 'rezerve', baslik: 'Rezerve', hizala: 'sag', mono: true, csv: (m) => ondalik(m.rezerve), hucre: (m) => sayiHucresi(m.rezerve) },
    { anahtar: 'disi', gizlenir: 'disi', baslik: 'Kabul / karantina', hizala: 'sag', mono: true, csv: (m) => kullanilamaz(m), hucre: (m) => {
      const k = kullanilamaz(m);
      return <span className={k === 0 ? 'tc-stok-soluk' : 'tc-stok-uyari-yazi'}>{miktarMetni(String(k))}</span>;
    } },
    { anahtar: 'toplam', gizlenir: 'toplam', baslik: 'Toplam', hizala: 'sag', mono: true, sirala: true, csv: (m) => ondalik(m.toplam), hucre: (m) => miktarMetni(m.toplam) },
    { anahtar: 'kritik', gizlenir: 'kritik', baslik: 'Kritik seviye', hizala: 'sag', mono: true, sirala: true, csv: (m) => ondalik(m.kritikSeviye), hucre: (m) => (m.kritikSeviye === null ? null : miktarMetni(m.kritikSeviye)) },
    { anahtar: 'durum', gizlenir: 'durum', baslik: 'Durum', csv: (m) => DURUM_ETIKETI[m.durum].etiket, hucre: (m) => <Rozet ton={DURUM_ETIKETI[m.durum].ton}>{DURUM_ETIKETI[m.durum].etiket}</Rozet> },
    { anahtar: 'konum', gizlenir: 'konum', baslik: 'Konumlar', csv: (m) => m.konumlar.map((k) => k.kod).join(' '), hucre: (m) => (m.konumlar.length === 0 ? null : (
      <span className="tc-stok-etiketler">
        {m.konumlar.map((k) => (
          <span key={k.kod} className="tc-stok-etiket">{k.katNo !== null && <span className={`tc-stok-kat tc-stok-kat-${((k.katNo - 1) % 6) + 1}`} />}{k.kod}</span>
        ))}
        {m.konumSayisi > m.konumlar.length && <span className="tc-stok-etiket">+{m.konumSayisi - m.konumlar.length}</span>}
      </span>
    )) },
    { anahtar: 'varsayilan', gizlenir: 'varsayilan', baslik: 'Varsayılan konum', mono: true, hucre: (m) => m.varsayilanKonum ?? null },
    { anahtar: 'son', gizlenir: 'son', baslik: 'Son hareket', sirala: true, kirilmaz: true, csv: (m) => m.sonHareket, hucre: (m) => (m.sonHareket ? zamanMetni(m.sonHareket) : null) },
    { anahtar: 'kart', gizlenir: 'kart', baslik: 'Kart durumu', csv: (m) => (m.kartDurumu ? KART_DURUMU[m.kartDurumu].etiket : null), hucre: (m) => (!m.kartDurumu ? null : <Rozet ton={KART_DURUMU[m.kartDurumu].ton}>{KART_DURUMU[m.kartDurumu].etiket}</Rozet>) },
    { anahtar: 'eylem', baslik: 'İşlemler', sabit: 'sag', csv: false, hucre: eylem },
  ];
  return tum.filter((s) => s.gizlenir === undefined || !gizli.has(s.gizlenir)).map(({ gizlenir: _g, ...s }) => s);
}
