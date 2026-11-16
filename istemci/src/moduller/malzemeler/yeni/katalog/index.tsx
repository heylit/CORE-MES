import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dugme, DurumKutusu, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { kgFmt, perM2Fmt, perMFmt, YOK } from '../bicim.ts';
import { useKucukResimler } from '../../../cizimler/disari.ts';
import { resimliTur, SatirResmi, type KucukResimler } from '../ortak/ResimAlani.tsx';
import { ONAY, TURLER } from '../sabitler/index.ts';
import * as K from '../kurallar/index.ts';
import { useKuralBaglami, type KuralBaglami } from '../kurallar/index.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { Siralama } from '../../../../ortak/veri/liste-durumu.ts';
import { standartAdlari } from '../standart-adlari.ts';
import { useBirimSistemi, useGizliSutunlar, useKatalogGruplama } from '../tercihler.ts';
import type { KatalogKarti, KartKaydi } from '../tipler.ts';
import { kayitHatasi, useKartIptal, useKartKaydet, useKartlar, useKgFiyatlari } from '../veri.ts';
import { Birlestir } from './Birlestir.tsx';
import { katalogCsvMetni, katalogJsonMetni } from './disa-aktarma.ts';
import { dosyaIndir } from './dosya.ts';
import { ETIKET_SECIM_SINIRI } from '../../gorunumler.ts';
import { ExcelPenceresi } from './ExcelPenceresi.tsx';
import { Karsilastirma } from './Karsilastirma.tsx';
import { KartPenceresi } from './KartPenceresi.tsx';
import {
  karsilastirilabilir, metinListesi, secimiBuda, suzulmus, topluOnaylanabilir, type FiltreSecimi,
} from './liste.ts';
import { kimlikOf } from './liste.ts';
import { useKatalogLogoAramasi } from './LogoAramasi.tsx';
import { OnayRozeti, type OnayIslemi, type TalepIslemi } from './paneller.tsx';
import { QrPenceresi, SahaGorunumu } from './Saha.tsx';
import { AktifSuzgecler, Suzgecler } from './Suzgecler.tsx';
import {
  formMetni, GRUPLAMALAR, grupSayilari, grupYolu, gruplamaMi, kaliteMetni, kategoriAdi, KATEGORISIZ, tabloSirasi, turAdi, turKisa, turOf,
} from './kategori.ts';
import { TurKunyesi, TurluKod } from '../ortak/TurKunyesi.tsx';
import './katalog.css';

type AcikPencere =
  | { tur: 'karsilastir'; kimlikler: string[] }
  | { tur: 'birlestir'; kimlikler: string[] }
  | { tur: 'saha'; kimlik: string }
  | { tur: 'qr' }
  | { tur: 'excel' };

// 465/3: liste 50 satırlık sayfalarla kalır (eski ekranda tek liste).
const SAYFA_BOYU = 50;
// Süzgeç kutusu bu genişliğin altında kapalı açılır (prototip 980). 3275: tablo sütunları 1440 altında kutu açıkken sığmaz;
// kutu kapalıyken liste tam genişliktir.
const DAR_EKRAN = '(max-width: 1439px)';
// Bu genişliğin altında tablo kartlara döner (ortak Tablo uyarlanır); üstünde yatay kayar, Malzeme sütunu yerinde kalır.
const TELEFON = '(max-width: 719px)';

function agirlikAlti(x: KartKaydi, b: KuralBaglami): string {
  const g = x.g ?? {};
  if (x.tur === 'demirbas') return [g.konum, g.durum].filter(Boolean).join(', ');
  if (x.tur === 'sarf') return K.sarfKat(x, b)?.ad ?? '';
  if (x.tur === 'hizmet') return [g.yon, K.hzCesitAdi(x, b) || K.hzKat(x, b)?.ad].filter(Boolean).join(', ');
  const w = K.weight(x, b);
  if (typeof w?.perM === 'number') return perMFmt(w.perM, b.birim);
  if (typeof w?.perM2 === 'number') return perM2Fmt(w.perM2, b.birim);
  return K.isGen(x, b) ? TURLER[x.tur as keyof typeof TURLER]?.ad ?? '' : (b.t.FAMS[x.fam ?? 'diger'] ?? b.t.FAMS.diger)?.ad ?? '';
}

// 3275 a: katalog düz tablodur; kategori grup başlığında, kalite, form ve onay kendi sütununda. Seçim kutusu Malzeme hücresindedir:
// sütun yatay kayarken onunla yerinde kalır, telefonda kartın içinde görünür.
export const GIZLENEBILIR_SUTUNLAR: readonly { anahtar: string; baslik: string }[] = [
  { anahtar: 'kalite', baslik: 'Kalite · sınıf' },
  { anahtar: 'form', baslik: 'Form · ölçü' },
  { anahtar: 'agirlik', baslik: 'Birim ağırlık' },
  { anahtar: 'birim', baslik: 'Stok birimi' },
  { anahtar: 'onay', baslik: 'Onay' },
  { anahtar: 'guncelleme', baslik: 'Güncelleme' },
];

function sutunlar(
  b: KuralBaglami, secili: ReadonlySet<string>, sec: (k: string, acik: boolean) => void, resimler: KucukResimler,
  gizli: ReadonlySet<string>,
): Sutun<KatalogKarti>[] {
  const hepsi: Sutun<KatalogKarti>[] = [
    {
      anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', sirala: true, kartTamSatir: true, csv: (k) => `${k.kayit.com.kod} ${k.kayit.com.ad}`,
      hucre: (k) => {
        const x = k.kayit;
        const tur = turOf(x);
        const kategori = kategoriAdi(x, b);
        return (
          <div className="tc-mk-malzeme" data-tur={tur} data-aile={x.fam}>
            <span onClick={(o) => o.stopPropagation()}>
              <label className="tc-isaret">
                <input type="checkbox" checked={secili.has(k.kimlik)} onChange={(o) => sec(k.kimlik, o.target.checked)} />
                <span className="tc-gizli-etiket">{`${x.com.kod} seç`}</span>
              </label>
            </span>
            <span className="tc-mk-serit" aria-hidden="true" />
            <SatirResmi tur={x.tur} no={k.no} ad={`${x.com.kod} ${x.com.ad}`.trim()} simge={K.kartIkon(x, b)} resimler={resimler} />
            <div>
              <div className="tc-mk-kod-satir">
                <TurluKod kod={x.com.kod} tur={tur} kisa={turKisa(tur, b)} ad={turAdi(tur, b)} />
                {kategori && <span className="tc-tk-kat" title={kategori}>{kategori}</span>}
                {K.talepVar(x, b) && <Rozet ton="uyari">Değişiklik talebi</Rozet>}
              </div>
              <div className="tc-mk-ad" title={x.com.ad}>{x.com.ad}</div>
            </div>
          </div>
        );
      },
    },
    {
      anahtar: 'kalite', baslik: 'Kalite · sınıf', sirala: true,
      hucre: (k) => {
        const m = kaliteMetni(k.kayit, b);
        return m ? <span className="tc-mk-deger">{m.kalite}<small className="tc-mk-alt" title={m.sinif}>{m.sinif}</small></span> : YOK;
      },
    },
    {
      anahtar: 'form', baslik: 'Form · ölçü', sirala: true,
      hucre: (k) => {
        const m = formMetni(k.kayit, b);
        if (!m) return YOK;
        return m.form ? <span className="tc-mk-deger">{m.form}<small className="tc-mk-alt" title={m.olcu}>{m.olcu}</small></span> : m.olcu;
      },
    },
    {
      anahtar: 'agirlik', baslik: 'Birim ağırlık', hizala: 'sag', sirala: true,
      hucre: (k) => {
        const w = K.weight(k.kayit, b);
        return <span className="tc-mk-deger">{w ? kgFmt(w.kg, b.birim) : YOK}<small className="tc-mk-alt" title={agirlikAlti(k.kayit, b)}>{agirlikAlti(k.kayit, b)}</small></span>;
      },
    },
    {
      anahtar: 'birim', baslik: 'Stok birimi', sirala: true,
      hucre: (k) => <span className="tc-mk-deger">{K.finalBirim(k.kayit, b) || YOK}<small className="tc-mk-alt" title={k.kayit.com.ted ?? ''}>{k.kayit.com.ted ?? ''}</small></span>,
    },
    { anahtar: 'onay', baslik: 'Onay', sirala: true, hucre: (k) => <OnayRozeti x={k.kayit} b={b} /> },
    {
      anahtar: 'guncelleme', baslik: 'Güncelleme', hizala: 'sag', kirilmaz: true, sirala: true,
      hucre: (k) => {
        const x = k.kayit;
        return (
          <span className="tc-mk-deger">
            {x.updatedAt ? new Date(x.updatedAt).toLocaleDateString('tr-TR') : YOK}
            <small className="tc-mk-alt">{x.rev?.length ? `${x.rev.length} revizyon` : ''}</small>
          </span>
        );
      },
    },
  ];
  return hepsi.filter((s) => !gizli.has(s.anahtar));
}

function GrupSecimi({ kartlar, secili, sec, etiket }: { kartlar: readonly KatalogKarti[]; secili: ReadonlySet<string>; sec: (l: string[], acik: boolean) => void; etiket: string }) {
  const n = kartlar.filter((k) => secili.has(k.kimlik)).length;
  return (
    <label className="tc-isaret">
      <input
        type="checkbox" checked={n > 0 && n === kartlar.length}
        ref={(el) => { if (el) el.indeterminate = n > 0 && n < kartlar.length; }}
        onChange={(o) => sec(kartlar.map((k) => k.kimlik), o.target.checked)}
      />
      <span className="tc-gizli-etiket">{`Grubu seç: ${etiket}`}</span>
    </label>
  );
}

function useGenisEkran(): boolean {
  const [genis, genisYaz] = useState(() => !(window.matchMedia?.(TELEFON).matches ?? false));
  useEffect(() => {
    const m = window.matchMedia?.(TELEFON);
    if (!m) return undefined;
    const dinle = () => genisYaz(!m.matches);
    m.addEventListener('change', dinle);
    return () => m.removeEventListener('change', dinle);
  }, []);
  return genis;
}

export function Katalog({ ortam, yetki, git }: EkranOzellikleri) {
  const kartlarSorgusu = useKartlar();
  const oturum = useOturum();
  const kaydet = useKartKaydet();
  const iptal = useKartIptal();
  const { bildir } = useBildirim();
  const [birim] = useBirimSistemi();
  const [adres, adresYaz] = useSearchParams();
  const [ara, araYaz] = useState('');
  const [sec, secYaz] = useState<FiltreSecimi>({});
  const [suzgecAcik, suzgecAcikYaz] = useState(() => !(window.matchMedia?.(DAR_EKRAN).matches ?? false));
  const [secili, seciliYaz] = useState<ReadonlySet<string>>(new Set());
  const [sayfa, sayfaYaz] = useState(1);
  const [pencere, pencereYaz] = useState<AcikPencere | null>(null);
  const [gruplama, gruplamaYaz] = useKatalogGruplama();
  const [sutunlarAcik, sutunlarAcikYaz] = useState(false);
  const [gizliListe, gizliYaz] = useGizliSutunlar();
  const [siralama, siralamaYaz] = useState<Siralama | null>(null);
  const genis = useGenisEkran();
  const gizli = useMemo(() => new Set(gizliListe), [gizliListe]);

  const kisiId = oturum.data?.id ?? 0;
  const kisiAd = oturum.data?.ad ?? '';
  const kisi = useMemo(() => ({ id: kisiId, ad: kisiAd }), [kisiId, kisiAd]);
  const kartlar = useMemo(() => kartlarSorgusu.data ?? [], [kartlarSorgusu.data]);
  const kayitlar = useMemo(() => kartlar.map((k) => k.kayit), [kartlar]);
  const b = useKuralBaglami({ ortam, kartlar, kisi, birim, yetki });
  const kgFiyatlari = useKgFiyatlari(kartlar, yetki.kgFiyatiOkur);
  const liste = useMemo(() => tabloSirasi(suzulmus(kartlar, ara, sec, b), b, gruplama, siralama), [kartlar, ara, sec, b, gruplama, siralama]);
  const sayilar = useMemo(() => grupSayilari(liste, b, gruplama), [liste, b, gruplama]);
  const logo = useKatalogLogoAramasi({ metin: ara, yazabilir: yetki.yaz, kartAc: (kimlik) => git.katalog(kimlik) });
  const sayfaSatirlari = useMemo(() => liste.slice((sayfa - 1) * SAYFA_BOYU, sayfa * SAYFA_BOYU), [liste, sayfa]);
  // Küçük resim yalnız görünen sayfanın yarı mamul ve mamul kartları için tek istekle okunur.
  const resimliNolar = useMemo(() => sayfaSatirlari.filter((k) => resimliTur(k.kayit.tur)).map((k) => k.no), [sayfaSatirlari]);
  const resimler = useKucukResimler('malzemeler', resimliNolar);
  const metinTabani = useMemo(() => metinListesi(kartlar, ara, standartAdlari(ortam.malzemeAyari)).map((k) => k.kayit), [kartlar, ara, ortam.malzemeAyari]);

  useEffect(() => { seciliYaz((s) => secimiBuda(s, kartlar)); }, [kartlar]);
  useEffect(() => { sayfaYaz(1); }, [ara, sec, gruplama, siralama]);
  // Üst baştaki "QR okut" katalogu `?qr=1` ile açar; pencere açılınca adres temizlenir.
  const qrIstendi = adres.get('qr') !== null;
  useEffect(() => {
    if (!qrIstendi) return;
    pencereYaz({ tur: 'qr' });
    adresYaz((a) => { const y = new URLSearchParams(a); y.delete('qr'); return y; }, { replace: true });
  }, [qrIstendi, adresYaz]);

  const secimDegistir = (l: readonly string[], acik: boolean) => seciliYaz((s0) => {
    const y = new Set(s0);
    for (const k of l) { if (acik) y.add(k); else y.delete(k); }
    return y;
  });
  const bul = (kimlik: string) => kartlar.find((k) => k.kimlik === kimlik);
  const kartKimligi = adres.get('kart');
  const acikKart = kartKimligi ? bul(kartKimligi) : undefined;
  const kartAc = (kimlik: string) => { pencereYaz(null); adresYaz((a) => { const y = new URLSearchParams(a); y.set('kart', kimlik); return y; }); };
  const kartKapat = () => adresYaz((a) => { const y = new URLSearchParams(a); y.delete('kart'); return y; });

  const yaz = async (kayit: KartKaydi): Promise<boolean> => {
    try {
      await kaydet.mutateAsync({ kayit, ozet: K.kartOzeti(kayit, b) });
      return true;
    } catch (e) {
      bildir('hata', kayitHatasi(e).ileti);
      return false;
    }
  };

  const onayIslemi = async (x: KartKaydi, islem: OnayIslemi, neden?: string) => {
    if (islem === 'onayla' && !K.onayYetkili(x, b)) { bildir('hata', 'Bu kartı onaylama yetkin yok.'); return; }
    const it = K.onayUygula(x, islem, neden ?? '', b);
    if (await yaz(it)) bildir('tamam', `${it.com.kod}: ${ONAY[K.onayDurum(it, b)].ad}.`);
  };

  const talepIslemi = async (x: KartKaydi, islem: TalepIslemi, neden?: string) => {
    if (!K.talepVar(x, b)) return;
    if (islem === 'onayla' && !K.talepYetkili(x, b)) { bildir('hata', 'Bu talebi onaylama yetkin yok.'); return; }
    const y = K.talepUygula(x, islem, neden ?? '', b);
    if (await yaz(y)) bildir('tamam', islem === 'onayla' ? `${y.com.kod} güncellendi.` : islem === 'geri' ? 'Talep geri çekildi.' : 'Talep reddedildi.');
  };

  const topluOnayla = async () => {
    let n = 0;
    for (const k of topluOnaylanabilir(secili, kartlar, b)) {
      if (!(await yaz(K.onayUygula(k.kayit, 'onayla', '', b)))) break;
      n++;
    }
    seciliYaz(new Set());
    bildir('tamam', `${n} kart onaylandı.`);
  };

  const birlestir = async (asil: KartKaydi, diger: KartKaydi[], not: string) => {
    for (const it of K.birlestir(asil, diger, not, b)) if (!(await yaz(it))) return;
    bildir('tamam', `${diger.length} kart ${asil.com.kod} ile birleştirildi.`);
    kartAc(kimlikOf(asil));
  };

  const sil = async (k: KatalogKarti): Promise<boolean> => {
    try {
      const c = await iptal.mutateAsync(k.kimlik);
      bildir('tamam', c.logodaPasifeAliniyor
        ? `${k.kayit.com.kod} Logo'da pasife alınmak üzere sıraya alındı; o sürede pasif. Sonucu Logo gönderimi sayfasında görünür.`
        : `${k.kayit.com.kod} silindi.`);
      return true;
    } catch (e) {
      bildir('hata', kayitHatasi(e).ileti);
      return false;
    }
  };

  // 1288: etiket yalnız Etiket Merkezi'nde basılır; hizmet kartına etiket basılmaz (prototip).
  const etiketAc = (kimlikler: string[]) => {
    const l = kimlikler.map(bul).filter((k): k is KatalogKarti => !!k && k.kayit.tur !== 'hizmet');
    if (!l.length) { if (kimlikler.length) bildir('bilgi', 'Hizmet kartına etiket basılmaz.'); return; }
    if (!git.etiketMerkezi(l.map((k) => k.no))) bildir('bilgi', `Etiket Merkezi'nde bir seferde en çok ${ETIKET_SECIM_SINIRI} kart basılır.`);
  };

  if (kartlarSorgusu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (kartlarSorgusu.isError) return <DurumKutusu durum="hata" yenile={() => void kartlarSorgusu.refetch()} />;

  const gorunenKayitlar = liste.map((k) => k.kayit);
  const onaylanabilir = topluOnaylanabilir(secili, kartlar, b).length;
  const bosKatalog = kartlar.length === 0;
  const suzgecSayisi = K.filtreEtiketleri(sec, b).length;

  const pencereler = (() => {
    if (!pencere) return null;
    const kapat = () => pencereYaz(null);
    const ogeler = 'kimlikler' in pencere ? pencere.kimlikler.map(bul).filter((k): k is KatalogKarti => !!k).map((k) => k.kayit) : [];
    switch (pencere.tur) {
      case 'karsilastir': return <Karsilastirma kayitlar={ogeler} b={b} kapat={kapat} etiket={yetki.etiketMerkezi ? etiketAc : undefined} />;
      case 'birlestir': return <Birlestir kartlar={ogeler} b={b} mesgul={kaydet.isPending} kapat={kapat} birlestir={(a, d, n) => void birlestir(a, d, n)} />;
      case 'qr': return <QrPenceresi kartlar={kartlar} b={b} kapat={kapat} bulundu={(k) => pencereYaz({ tur: 'saha', kimlik: k })} />;
      case 'excel': return <ExcelPenceresi kayitlar={kayitlar} gorunen={gorunenKayitlar} yazabilir={yetki.yaz} b={b} kapat={kapat} kaydet={(g) => kaydet.mutateAsync(g)} />;
      case 'saha': {
        const k = bul(pencere.kimlik);
        if (!k) return null;
        return (
          <SahaGorunumu
            kart={k} b={b} yetki={yetki} kapat={kapat} ac={(i) => pencereYaz({ tur: 'saha', kimlik: i })} tamFoy={() => kartAc(k.kimlik)}
            qr={() => pencereYaz({ tur: 'qr' })} etiketMerkezi={() => { git.etiketMerkezi([k.no]); }}
          />
        );
      }
      default: return null;
    }
  })();

  return (
    <div className="tc-mk">
      <div className="tc-mk-araclar">
        <input
          className="tc-alan-kutu tc-mk-ara" type="search" value={ara} onChange={(o) => araYaz(o.target.value)}
          placeholder="Kod, ad, ERP kodu, açıklama veya tedarikçi ara" aria-label="Katalogda ara"
        />
        {logo.dugme}
        <span className="tc-mk-ara-bosluk" />
        <label className="tc-mk-grupla">
          <span>Grupla</span>
          <select className="tc-alan-kutu" value={gruplama} onChange={(o) => { if (gruplamaMi(o.target.value)) gruplamaYaz(o.target.value); }}>
            {GRUPLAMALAR.map((g) => <option key={g.deger} value={g.deger}>{g.ad}</option>)}
          </select>
        </label>
        <details className="tc-mk-sutunlar" open={sutunlarAcik} onToggle={(o) => sutunlarAcikYaz(o.currentTarget.open)}>
          <summary><Simge ad="grid" boyut="k" />Sütunlar</summary>
          {/* Kapalıyken kutular çizilmez: sayfadaki ilk işaret satırı süzgeçlerinki kalır (ortak yoğunluk ölçüsü). */}
          {sutunlarAcik && <fieldset>
            <legend className="tc-gizli-etiket">Görünen sütunlar</legend>
            {GIZLENEBILIR_SUTUNLAR.map((s) => (
              <label key={s.anahtar} className="tc-isaret tc-mk-sutun">
                <input
                  type="checkbox" checked={!gizli.has(s.anahtar)}
                  onChange={(o) => gizliYaz(o.target.checked ? gizliListe.filter((a) => a !== s.anahtar) : [...gizliListe, s.anahtar])}
                />
                <span>{s.baslik}</span>
              </label>
            ))}
          </fieldset>}
        </details>
        <div className="tc-mk-aktarma">
          <Dugme tur="birincil" onClick={() => pencereYaz({ tur: 'excel' })}>Excel: şablon, dışa ve içe aktar</Dugme>
          <Dugme disabled={bosKatalog} onClick={() => dosyaIndir('malzeme-katalogu.csv', katalogCsvMetni(gorunenKayitlar, b))}>CSV dışa aktar</Dugme>
          <Dugme disabled={bosKatalog} onClick={() => dosyaIndir('malzeme-katalogu.json', katalogJsonMetni(gorunenKayitlar, b))}>JSON dışa aktar</Dugme>
        </div>
      </div>
      {logo.serit}
      {bosKatalog ? (
        <DurumKutusu durum="bos" mesaj="Katalog boş.">
          {yetki.yaz && <Dugme tur="birincil" simge="plus" onClick={() => git.yeniKart()}>Yeni malzeme</Dugme>}
        </DurumKutusu>
      ) : (
        <div className="tc-mk-duzen">
          <details className="tc-mk-yan" open={suzgecAcik} onToggle={(o) => suzgecAcikYaz(o.currentTarget.open)}>
            <summary>Süzgeçler{suzgecSayisi ? ` (${suzgecSayisi})` : ''}</summary>
            {suzgecAcik && <aside aria-label="Süzgeçler"><Suzgecler liste={metinTabani} sec={sec} degistir={secYaz} b={b} /></aside>}
          </details>
          <div className="tc-mk-ana">
            <AktifSuzgecler sec={sec} adet={liste.length} degistir={secYaz} b={b} />
            {secili.size > 0 && (
              <div className="tc-mk-secim" role="region" aria-label="Seçili kartlar">
                <span>{secili.size} kayıt seçili</span>
                <Dugme tur="birincil" disabled={!karsilastirilabilir(secili.size)} onClick={() => pencereYaz({ tur: 'karsilastir', kimlikler: [...secili] })}>
                  {secili.size > 4 ? 'Karşılaştırma en fazla 4 kayıt' : 'Karşılaştır'}
                </Dugme>
                {yetki.etiketMerkezi && <Dugme simge="printer" onClick={() => etiketAc([...secili])}>Etiket Merkezi'nde bas</Dugme>}
                {yetki.yaz && onaylanabilir > 0 && (
                  <Dugme simge="check" yukleniyor={kaydet.isPending} onClick={() => void topluOnayla()}>Seçilenleri onayla ({onaylanabilir})</Dugme>
                )}
                <button type="button" className="tc-mk-bag" onClick={() => seciliYaz(new Set())}>Seçimi kaldır</button>
              </div>
            )}
            <Tablo
              etiket="Malzeme kataloğu"
              sutunlar={sutunlar(b, secili, (k, acik) => secimDegistir([k], acik), resimler, gizli)}
              kip={genis ? 'kaydir' : 'uyarlanir'}
              siralama={siralama}
              siralamaDegistir={siralamaYaz}
              grup={gruplama === 'yok' ? undefined : {
                yol: (k) => grupYolu(k.kayit, b, gruplama),
                baslik: (yol) => (yol.length === 1
                  ? <TurKunyesi tur={yol[0]!} kisa={turKisa(yol[0]!, b)} ad={turAdi(yol[0]!, b)} tamAd />
                  : <span className="tc-mk-grup-kat" data-tur={yol[0]} data-kategorisiz={yol[1] === KATEGORISIZ ? '' : undefined}>{yol[1]}</span>),
                sayi: sayilar,
                on: (yol) => {
                  const grupKartlari = liste.filter((k) => grupYolu(k.kayit, b, gruplama).slice(0, yol.length).join('\u001f') === yol.join('\u001f'));
                  return <GrupSecimi kartlar={grupKartlari} secili={secili} sec={secimDegistir} etiket={yol.length === 1 ? turAdi(yol[0]!, b) : yol[1]!} />;
                },
              }}
              satirlar={sayfaSatirlari}
              satirAnahtari={(k) => k.kimlik}
              satirSec={(k) => kartAc(k.kimlik)}
              bosMesaj="Arama ve süzgeçlerle eşleşen kart yok."
              sayfalama={{ sayfa, sayfaBoyu: SAYFA_BOYU, toplam: liste.length, degistir: sayfaYaz }}
            />
          </div>
        </div>
      )}
      {acikKart && (
        <KartPenceresi
          kart={acikKart} kartlar={kartlar} yetki={yetki} b={b} git={git} kgFiyati={kgFiyatlari ? kgFiyatlari.get(acikKart.kimlik) ?? null : undefined} mesgul={kaydet.isPending || iptal.isPending}
          kapat={kartKapat} ac={kartAc} onayIslemi={(x, i, n) => void onayIslemi(x, i, n)} talepIslemi={(x, i, n) => void talepIslemi(x, i, n)}
          birlestir={(l) => { kartKapat(); pencereYaz({ tur: 'birlestir', kimlikler: l }); }}
          saha={(k) => { kartKapat(); pencereYaz({ tur: 'saha', kimlik: k }); }} sil={sil}
        />
      )}
      {pencereler}
    </div>
  );
}
