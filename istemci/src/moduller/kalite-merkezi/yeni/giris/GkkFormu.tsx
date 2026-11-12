import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KmGirisCevabi, KmGirisGkkGovdesi, KmGirisKaydi, KmGirisKararGovdesi, KmGkkKontrolu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { gkkIskeleti, gkkSablonlari, varsayilanGkkSablonu, type GkkSablonu } from '#paylasilan/gkk-sablonlari.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, GrupluSecim, IsaretKutusu, Kart, OnayPenceresi, Rozet, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { Kopyala } from '../../../../ortak/arayuz/Kopyala.tsx';
import { ApiHatasi, api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { YOK, zamanKisa } from '../bicim.ts';
import { siradakiNo, yeniKimlik } from '../veri.ts';
import { GIRIS_ANAHTARI } from '../bugun/GirisKarari.tsx';
import type { Sablon } from '../tipler.ts';
import { Bilgi, MaddeKarti, MalzemeKarti, OlcuKarti, SablonBolumu, SeriKarti, type GorunenBolum, type MaddeSonucu, type Seri } from './KontrolBolumleri.tsx';
import {
  DURUM_ADI, DURUM_TONU, GIRIS_KAYITLARI_ANAHTARI, GKK_TURU_ADI, KARAR_ADI, SONUC_ADI, girisKaydiAnahtari, gkkSonucu, miktarMetni, sonucMetni,
  type GkkSonucu,
} from './ortak.ts';

type Karar = KmGirisKararGovdesi['karar'];
type Ciddiyet = KmGirisKararGovdesi['ciddiyet'];

const KARARLAR: { deger: Karar; baslik: string }[] = [
  { deger: 'red', baslik: 'Red (tedarikçiye iade)' }, { deger: 'kabul', baslik: 'Kabul (olduğu gibi)' }, { deger: 'sartli_kabul', baslik: 'Şartlı kabul' },
];
const KARAR_SONUCU: Record<Karar, string> = { kabul: 'kabul edildi', sartli_kabul: 'şartlı kabul edildi', red: 'tedarikçiye iade edildi' };
const CIDDIYETLER: readonly Ciddiyet[] = ['Kritik', 'Majör', 'Minör'];
const SONUC_SECENEKLERI = [
  { deger: 'kabul', baslik: 'Kabul', alt: 'Lotun tamamı serbest', simge: 'check' },
  { deger: 'kismi', baslik: 'Kısmi kabul', alt: 'Bir kısmı ret', simge: 'minus' },
  { deger: 'sartli', baslik: 'Şartlı kabul', alt: 'Şartla kullanılır', simge: 'alert' },
  { deger: 'ret', baslik: 'Ret', alt: 'Lotun tamamı iade', simge: 'x' },
] as const;
const SONUC_TONU = { kabul: 'tamam', kismi: 'uyari', sartli: 'uyari', ret: 'hata' } as const;
const MIKTAR = /^\d+(?:[.,]\d{1,3})?$/;
const sade = (m: string): string => m.trim().replace(',', '.');
const sayiMi = (m: string): boolean => MIKTAR.test(m.trim());
// Binde birlik hesap: kayan nokta toplamı 0,1 + 0,2 gibi değerlerde lot miktarını tutturamaz.
const binde = (m: string): number => Math.round(Number(sade(m)) * 1000);
const bindenMetin = (b: number): string => String(b / 1000);

interface Ozellikler {
  id: number;
  ncrler: readonly { no?: unknown }[];
  // Formlar'daki şablon kayıtları (tpl); GKK şablonu bunlardan ve standart dört şablondan seçilir.
  sablonlar: readonly Sablon[];
  // Ölçümlü muayene yalnız muayene yazabilen kişide açılır; GKK kaydına bağlanmaz, yalnız alanları dolu gelir.
  muayeneAc: ((k: KmGirisKaydi) => void) | null;
  kapat: () => void;
}

// 3117, 3118: GKK mal kabul satırına bağlı tam formdur. Kontrol listesi Formlar'daki GKK şablonundan gelir (kartın türünün
// varsayılanı, kayıttan önce başkası seçilebilir); kayıt şablonun o anki halini saklar. Sonuç (Kabul,
// Kısmi kabul, Şartlı kabul, Ret) miktar ve hatalının kararı olarak tek istekte yazılır; karar sonraya bırakılırsa hatalı Karar
// bekleyen'e düşer. Numara kayıtta verilir. Kapanan kayıt aynı formda salt okunur açılır. Başkası önce yazdıysa (409) form yenilenir.
export function GkkFormu({ id, ncrler, sablonlar, muayeneAc, kapat }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const anahtar = girisKaydiAnahtari(id);
  const kayit = useQuery({ queryKey: anahtar, queryFn: () => api.get<KmGirisCevabi>(`/kalite-merkezi/giris/${String(id)}`) });
  const sablonListesi = useMemo(() => gkkSablonlari(sablonlar as readonly Record<string, unknown>[]), [sablonlar]);
  const [sablonKodu, sablonKoduYaz] = useState<string | null>(null);
  const [maddeler, maddelerYaz] = useState<Record<string, MaddeSonucu>>({});
  const [alanlar, alanlarYaz] = useState<Record<string, string>>({});
  const [eksikAlanlar, eksikAlanlarYaz] = useState<ReadonlySet<string>>(new Set());
  const [olculen, olculenYaz] = useState<Record<string, string>>({});
  const [islemler, islemlerYaz] = useState<Record<string, MaddeSonucu>>({});
  const [seriler, serilerYaz] = useState<Seri[]>([]);
  // 2754 a/a: sonuç ve karar seçimsiz açılır; seçilmeden yazılmaz (yanlış varsayılan dalgınlıkla onaylanmasın).
  const [sonuc, sonucYaz] = useState<GkkSonucu | null>(null);
  const [sonucEksik, sonucEksikYaz] = useState(false);
  const [hataliGirdi, hataliGirdiYaz] = useState<string | null>(null);
  const [sonraKarar, sonraKararYaz] = useState(false);
  const [ciddiyet, ciddiyetYaz] = useState<Ciddiyet>('Majör');
  const [gerekce, gerekceYaz] = useState('');
  const [gkkNotu, gkkNotuYaz] = useState('');
  const [onay, onayYaz] = useState(false);
  const [karar, kararYaz] = useState<Karar | ''>('');
  const [kararEksik, kararEksikYaz] = useState(false);

  const yenile = () => {
    void istemci.invalidateQueries({ queryKey: GIRIS_ANAHTARI });
    void istemci.invalidateQueries({ queryKey: GIRIS_KAYITLARI_ANAHTARI });
  };
  const cevapla = (c: KmGirisCevabi) => { istemci.setQueryData<KmGirisCevabi>(anahtar, c); yenile(); };
  const hata = (h: unknown, varsayilan: string) => {
    if (h instanceof ApiHatasi && h.durum === 409) {
      bildir('hata', hataIletisi(h, 'Bu GKK az önce yazıldı; form yenilendi.'));
      void istemci.invalidateQueries({ queryKey: anahtar });
      yenile();
      return;
    }
    bildir('hata', hataIletisi(h, varsayilan));
  };
  const gonder = <G,>(yol: string, govde: G) => tekrarKorumaliGonder((d) => api.post<KmGirisCevabi>(
    yol, govde, { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
  ));
  const gkk = useMutation({
    mutationFn: (g: KmGirisGkkGovdesi) => gonder(`/kalite-merkezi/giris/${String(id)}/gkk`, g),
    onSuccess: (c) => {
      onayYaz(false);
      const s = gkkSonucu(c.kayit);
      bildir('tamam', `${c.kayit.gkkNo === null ? c.kayit.malKabulNo : `${c.kayit.gkkNo} verildi`}: ${s === null ? `${miktarMetni(c.kayit.hataliMiktar)} hatalı karar bekliyor` : sonucMetni({ ...c.kayit, durum: 'kapandi' })}`);
      cevapla(c);
    },
    onError: (h) => { onayYaz(false); hata(h, 'Giriş kontrolü yazılamadı.'); },
  });
  const kararVer = useMutation({
    mutationFn: (g: KmGirisKararGovdesi) => gonder(`/kalite-merkezi/giris/${String(id)}/karar`, g),
    onSuccess: (c, g) => {
      bildir('tamam', `${c.kayit.gkkNo ?? c.kayit.malKabulNo}: ${miktarMetni(c.kayit.hataliMiktar)} hatalı ${KARAR_SONUCU[g.karar]}, ${g.ncrNo} açıldı`);
      cevapla(c);
    },
    onError: (h) => { hata(h, 'Karar verilemedi.'); },
  });

  if (kayit.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (kayit.isError) return <DurumKutusu durum="hata" hata={kayit.error} yenile={() => { void kayit.refetch(); }} />;
  const { kayit: k, ayrinti: a } = kayit.data;
  const parca = k.gkkTuru === 'yari_mamul' || k.gkkTuru === 'mamul';
  const acik = k.durum === 'gkk_bekliyor';
  const kayitli = a.kontrol;
  const varsayilan = varsayilanGkkSablonu(sablonListesi, k.gkkTuru);
  const sablon: GkkSablonu | undefined = sablonListesi.find((x) => x.kod === sablonKodu) ?? varsayilan;
  const iskelet = sablon ? gkkIskeleti(sablon.dsl) : [];
  const anahtarOf = (b: number, i: number) => `${String(b)}_${String(i)}`;
  const bolumler: GorunenBolum[] = acik
    ? iskelet.map((b, bi) => ({
      baslik: b.baslik,
      maddeler: b.liste.map((m, mi) => ({ metin: m, sonuc: maddeler[anahtarOf(bi, mi)] ?? 'bakilmadi' })),
      alanlar: b.alanlar.map((x, ai) => ({ etiket: x.etiket, deger: alanlar[anahtarOf(bi, ai)] ?? '', tanim: x })),
    }))
    : (kayitli?.bolumler ?? []).map((b) => ({ ...b, alanlar: b.alanlar.map((x) => ({ ...x, tanim: null })) }));
  const bolumAcik = (ad: 'olcu' | 'islem' | 'seri'): boolean => (acik
    ? sablon?.gkk[ad] ?? false
    : (ad === 'olcu' ? (kayitli?.olcumler.length ?? 0) : ad === 'islem' ? (kayitli?.islemler.length ?? 0) : (kayitli?.seriler.length ?? 0)) > 0);
  const sablonSec = (kod: string) => { sablonKoduYaz(kod); maddelerYaz({}); alanlarYaz({}); eksikAlanlarYaz(new Set()); };
  const lot = binde(k.miktar);
  const lotMiktari = miktarMetni(k.miktar);
  const birim = k.birim ?? '';
  const bekliyor = gkk.isPending || kararVer.isPending;

  const islemSecimi: Record<string, MaddeSonucu> = acik ? islemler : Object.fromEntries((kayitli?.islemler ?? []).map((m) => [m.ad, m.sonuc]));
  const olcuDegeri: Record<string, string> = acik ? olculen : Object.fromEntries((kayitli?.olcumler ?? []).flatMap((o) => (o.olculen === null ? [] : [[o.ad, o.olculen]])));
  const seriListesi = acik ? seriler : (kayitli?.seriler ?? []);
  const islemAdlari = acik ? a.islemler : (kayitli?.islemler ?? []).map((x) => x.ad);
  const uygunDegil = bolumler.reduce((t, b) => t + b.maddeler.filter((m) => m.sonuc === 'uygun_degil').length, 0) + Object.values(islemSecimi).filter((d) => d === 'uygun_degil').length;
  const hataliSeri = sablon?.gkk.seri ? seriler.filter((s) => s.hatali).length : 0;

  // Hatalı (ret ya da şartlı) miktar: kişi yazana kadar hatalı seri sayısı, yoksa şartlıda lotun tamamı.
  const onerilenHatali = sonuc === 'sartli' ? (hataliSeri > 0 ? String(hataliSeri) : lotMiktari.replace(',', '.')) : hataliSeri > 0 ? String(hataliSeri) : '';
  const hataliMetni = sonuc === 'kabul' ? '0' : sonuc === 'ret' ? bindenMetin(lot) : (hataliGirdi ?? onerilenHatali);
  const hataliGecerli = sayiMi(hataliMetni);
  const hataliB = hataliGecerli ? binde(hataliMetni) : NaN;
  const kabulB = hataliGecerli ? lot - hataliB : NaN;
  const miktarHatasi = sonuc === 'kismi'
    ? (!hataliGecerli || hataliB <= 0 || hataliB >= lot ? `Ret miktarı 0'dan büyük, lot miktarından (${lotMiktari}) küçük olmalı.` : undefined)
    : sonuc === 'sartli'
      ? (!hataliGecerli || hataliB <= 0 || hataliB > lot ? `Şartlı miktar 0'dan büyük, en çok lot miktarı (${lotMiktari}) olmalı.` : undefined)
      : undefined;
  const kararli = sonuc !== null && sonuc !== 'kabul' && !(sonuc === 'kismi' && sonraKarar);
  const gerekceZorunlu = sonuc === 'sartli';

  const kontrolGovdesi = (s: GkkSablonu): KmGkkKontrolu => ({
    sablon: { kod: s.kod, rev: s.rev, ad: s.ad },
    bolumler: bolumler.map((b) => ({ baslik: b.baslik, maddeler: b.maddeler, alanlar: b.alanlar.map((x) => ({ etiket: x.etiket, deger: x.deger.trim() })) })),
    olcumler: s.gkk.olcu ? a.olculer.map((o) => ({ ad: o.ad, istenen: o.deger, olculen: olculen[o.ad]?.trim() || null })) : [],
    islemler: s.gkk.islem ? a.islemler.map((x) => ({ ad: x, sonuc: islemler[x] ?? 'bakilmadi' })) : [],
    seriler: s.gkk.seri ? seriler : [],
  });
  const gkkKaydet = () => {
    const eksik = new Set(iskelet.flatMap((b, bi) => b.alanlar.flatMap((x, ai) => (x.zorunlu && (alanlar[anahtarOf(bi, ai)] ?? '').trim() === '' ? [anahtarOf(bi, ai)] : []))));
    eksikAlanlarYaz(eksik);
    if (eksik.size > 0) { bildir('hata', eksik.size === 1 ? 'Formdaki zorunlu alanı doldurun.' : `Formda ${String(eksik.size)} zorunlu alan boş.`); return; }
    if (sonuc === null) { sonucEksikYaz(true); return; }
    if (miktarHatasi) { bildir('hata', miktarHatasi); return; }
    if (kararli && gerekceZorunlu && gerekce.trim() === '') { bildir('hata', 'Şartlı kabulde şart yazılır.'); return; }
    onayYaz(true);
  };
  const gkkGonder = () => {
    if (sonuc === null) return;
    const kararGovdesi: KmGirisKararGovdesi | null = kararli
      ? { karar: sonuc === 'sartli' ? 'sartli_kabul' : 'red', ciddiyet, not: gerekce.trim() || null, ncrKimlik: yeniKimlik('ncr'), ncrNo: siradakiNo(ncrler, 'NCR') }
      : null;
    gkk.mutate({ kabul: bindenMetin(kabulB), hatali: bindenMetin(hataliB), not: gkkNotu.trim() || null, kontrol: sablon ? kontrolGovdesi(sablon) : null, karar: kararGovdesi });
  };
  const kararYazdir = () => {
    if (karar === '') { kararEksikYaz(true); return; }
    const n = gerekce.trim() || null;
    if (karar === 'sartli_kabul' && n === null) { bildir('hata', 'Şartlı kabulde şart yazılır.'); return; }
    kararVer.mutate({ karar, ciddiyet, not: n, ncrKimlik: yeniKimlik('ncr'), ncrNo: siradakiNo(ncrler, 'NCR') });
  };
  const ozet = sonuc === null ? '' : sonuc === 'kabul'
    ? `${lotMiktari} ${birim} kabul`
    : `${miktarMetni(bindenMetin(kabulB))} ${birim} kabul, ${miktarMetni(bindenMetin(hataliB))} ${birim} ${sonuc === 'sartli' ? 'şartlı kabul' : kararli ? 'ret (iade)' : 'hatalı, karar sonra'}`;
  const kayitliSonuc = gkkSonucu(k);

  return (
    <div className="tc-km-gkk-form">
      <div className="tc-km-gkk-form-ust">
        <Dugme tur="ikincil" simge="chev-left" onClick={kapat}>Listeye dön</Dugme>
        <div className="tc-km-gkk-no" aria-label="GKK numarası">
          <small>GKK no</small>
          {k.gkkNo !== null
            ? <span className="tc-km-gkk-no-deger"><b className="tc-km-gkk-mono">{k.gkkNo}</b><Kopyala metin={k.gkkNo} etiket="GKK numarasını kopyala" /></span>
            : acik
              ? <span className="tc-km-gkk-hucre"><b>Kaydedince verilir</b><small>örnek {a.gkkNoBicimi}</small></span>
              : <b>Numarasız (eski kayıt)</b>}
        </div>
        <div className="tc-km-gkk-kimlik">
          <Rozet ton="bilgi">{GKK_TURU_ADI[k.gkkTuru]}</Rozet>
          <Rozet ton={DURUM_TONU[k.durum]}>{DURUM_ADI[k.durum]}</Rozet>
        </div>
      </div>

      <div className="tc-km-gkk-sutun">
        <Kart baslik={`${k.malKabulNo} · ${k.malzemeKod ?? `#${String(k.malzemeId)}`}`} simge="box">
          <dl className="tc-km-gkk-bilgi">
            <div><dt>Malzeme</dt><dd>{k.malzemeAd ?? YOK}</dd></div>
            <div><dt>Miktar</dt><dd>{lotMiktari} {birim}</dd></div>
            <div><dt>Lot</dt><dd className="tc-km-gkk-mono">{k.partiEtiketi ?? YOK}</dd></div>
            <Bilgi ad="Döküm no" deger={a.dokumNo} mono />
            <Bilgi ad="Tedarikçi parti no" deger={a.tedarikciPartiNo} mono />
            <Bilgi ad="Sertifika no" deger={a.sertifikaNo} mono />
            <div><dt>Tedarikçi</dt><dd>{k.tedarikciAdi ?? YOK}</dd></div>
            <div><dt>Sipariş</dt><dd className="tc-km-gkk-mono">{k.siparisNo ?? YOK}</dd></div>
            <div><dt>Mal kabul</dt><dd>{zamanKisa(k.zaman)}</dd></div>
          </dl>
          <p className="tc-km-gkk-satir">
            {k.sertifikaVar ? <Rozet ton="tamam">Sertifika eklenmiş</Rozet> : <Rozet ton="uyari">Sertifika eklenmemiş</Rozet>}
            {muayeneAc && <Dugme tur="ikincil" simge="ruler" onClick={() => { muayeneAc(k); }}>Ölçümlü giriş muayenesi aç</Dugme>}
          </p>
        </Kart>
        <MalzemeKarti a={a} parca={parca} />
        {bolumAcik('olcu') && <OlcuKarti olculer={a.olculer} olculen={olcuDegeri} yaz={(ad, d) => { olculenYaz((o) => ({ ...o, [ad]: d })); }} kilitli={!acik} />}
      </div>

      <div className="tc-km-gkk-sutun">
        <Kart baslik="Kontrol formu" simge="file">
          {acik
            ? (
              <div className="tc-km-gkk-alanlar">
                <Secim
                  etiket="Kontrol formu" value={sablon?.kod ?? ''} onChange={(e) => { sablonSec(e.target.value); }}
                  secenekler={sablonListesi.map((x) => ({ deger: x.kod, baslik: `${x.kod} ${x.ad} (rev ${x.rev})` }))}
                />
                <p className="tc-km-gkk-soluk">
                  {sablon !== undefined && sablon.kod === varsayilan?.kod ? `${GKK_TURU_ADI[k.gkkTuru]} için varsayılan form. ` : ''}
                  Formlar Kalite Merkezi'nde Formlar sayfasında, Giriş kontrolü altında düzenlenir.
                </p>
              </div>
            )
            : kayitli === null
              ? <p className="tc-km-gkk-soluk">Kontrol maddeleri girilmedi.</p>
              : <p><b className="tc-km-gkk-mono">{kayitli.sablon.kod}</b> rev {kayitli.sablon.rev || '00'} · {kayitli.sablon.ad}</p>}
        </Kart>
        {bolumler.map((b, bi) => (
          <SablonBolumu
            key={`${String(bi)}-${b.baslik}`} b={b} kilitli={!acik}
            madde={(i, d) => { maddelerYaz((x) => ({ ...x, [anahtarOf(bi, i)]: d })); }}
            alan={(i, d) => { alanlarYaz((x) => ({ ...x, [anahtarOf(bi, i)]: d })); }}
            eksik={(i) => eksikAlanlar.has(anahtarOf(bi, i)) && (alanlar[anahtarOf(bi, i)] ?? '').trim() === ''}
          />
        ))}
        {bolumAcik('islem') && (
          <MaddeKarti
            baslik="İşlemler" simge="wrench" anahtarlar={islemAdlari} baslikOf={(x) => x} bos="Kartta işlem (operasyon) yazılı değil."
            secim={islemSecimi} sec={(x, d) => { islemlerYaz((y) => ({ ...y, [x]: d })); }} kilitli={!acik}
          />
        )}
        {bolumAcik('seri') && <SeriKarti seriler={seriListesi} yaz={serilerYaz} kilitli={!acik} />}

        <Kart baslik="Sonuç" simge="clipboard-check">
          {acik
            ? (
              <div className="tc-km-gkk-alanlar">
                <GrupluSecim
                  etiket="GKK sonucu" secili={sonuc} sec={(d) => { sonucYaz(d); sonucEksikYaz(false); }}
                  gruplar={[{ anahtar: 'sonuc', baslik: 'GKK sonucu', secenekler: SONUC_SECENEKLERI }]}
                />
                {sonucEksik && sonuc === null && <p className="tc-km-gkk-hata" role="alert">Sonuç seçin.</p>}
                {sonuc === 'kabul' && uygunDegil > 0 && (
                  <p className="tc-km-gkk-satir"><Rozet ton="uyari">Dikkat</Rozet> {String(uygunDegil)} madde uygun değil işaretli; yine de kabul yazılabilir.</p>
                )}
                {(sonuc === 'kismi' || sonuc === 'sartli') && (
                  <div className="tc-km-gkk-ikili">
                    <Girdi
                      etiket={sonuc === 'kismi' ? (sonraKarar ? 'Hatalı' : 'Ret') : 'Şartlı'} inputMode="decimal" value={hataliMetni}
                      onChange={(e) => { hataliGirdiYaz(e.target.value); }} hata={miktarHatasi}
                    />
                    <div className="tc-km-gkk-hucre"><small>Kabul (kalan)</small><b>{Number.isNaN(kabulB) ? YOK : `${miktarMetni(bindenMetin(kabulB))} ${birim}`}</b></div>
                  </div>
                )}
                {sonuc === 'ret' && <p className="tc-km-gkk-soluk">Lotun tamamı ({lotMiktari} {birim}) ret; tedarikçiye iade çıkışı yazılır.</p>}
                {sonuc === 'kismi' && (
                  <IsaretKutusu etiket="Hatalının kararını sonra ver (Karar bekleyen)" checked={sonraKarar} onChange={(e) => { sonraKararYaz(e.target.checked); }} />
                )}
                {kararli && (
                  <>
                    <Secim etiket="Ciddiyet" value={ciddiyet} onChange={(e) => { ciddiyetYaz(e.target.value as Ciddiyet); }} secenekler={CIDDIYETLER.map((c) => ({ deger: c, baslik: c }))} />
                    <CokSatir
                      etiket={gerekceZorunlu ? 'Şart' : 'Gerekçe'} value={gerekce} maxLength={500} required={gerekceZorunlu}
                      onChange={(e) => { gerekceYaz(e.target.value); }}
                    />
                    <p className="tc-km-gkk-soluk">Hatalı kısım için aynı işlemde NCR açılır.</p>
                  </>
                )}
                <CokSatir etiket="GKK notu" value={gkkNotu} maxLength={500} onChange={(e) => { gkkNotuYaz(e.target.value); }} />
                <div className="tc-km-gkk-eylem">
                  <Dugme tur={sonuc === 'ret' ? 'tehlike' : 'birincil'} simge="check" disabled={bekliyor} yukleniyor={gkk.isPending} onClick={gkkKaydet}>GKK'yı kaydet</Dugme>
                </div>
              </div>
            )
            : (
              <dl className="tc-km-gkk-bilgi">
                <div><dt>Sonuç</dt><dd>{kayitliSonuc === null ? <Rozet ton="hata">Karar bekliyor</Rozet> : <Rozet ton={SONUC_TONU[kayitliSonuc]}>{SONUC_ADI[kayitliSonuc]}</Rozet>}</dd></div>
                <div><dt>Kabul</dt><dd>{miktarMetni(k.kabulMiktar)} {birim}</dd></div>
                <div><dt>Hatalı</dt><dd>{miktarMetni(k.hataliMiktar)} {birim}</dd></div>
                <div><dt>GKK</dt><dd>{k.gkkKisiAd ?? YOK}, {zamanKisa(k.gkkZaman)}</dd></div>
                {k.karar === null && k.not && <div><dt>Not</dt><dd>{k.not}</dd></div>}
              </dl>
            )}
        </Kart>

        {k.durum === 'karar_bekliyor' && (
          <Kart baslik="Hatalı için kalite kararı" simge="alert">
            <div className="tc-km-gkk-alanlar">
              <p className="tc-km-gkk-soluk">{miktarMetni(k.hataliMiktar)} {birim} hatalı. Karar geri alınamaz; aynı işlemde NCR açılır.</p>
              <Secim
                etiket="Karar" value={karar} required bosSecenek="Seçiniz" hata={kararEksik && karar === '' ? 'Karar seçin.' : undefined}
                onChange={(e) => { kararYaz(e.target.value as Karar | ''); }} secenekler={KARARLAR}
              />
              <Secim etiket="Ciddiyet" value={ciddiyet} onChange={(e) => { ciddiyetYaz(e.target.value as Ciddiyet); }} secenekler={CIDDIYETLER.map((c) => ({ deger: c, baslik: c }))} />
              <CokSatir
                etiket={karar === 'sartli_kabul' ? 'Şart' : 'Gerekçe'} value={gerekce} maxLength={500} required={karar === 'sartli_kabul'}
                onChange={(e) => { gerekceYaz(e.target.value); }}
              />
              {karar === 'red' && <p className="tc-km-gkk-soluk">Red, hatalı miktarı tedarikçiye iade çıkışıyla stoktan düşer.</p>}
              <div className="tc-km-gkk-eylem">
                <Dugme tur={karar === 'red' ? 'tehlike' : 'birincil'} disabled={bekliyor} yukleniyor={kararVer.isPending} onClick={kararYazdir}>Kararı yaz</Dugme>
              </div>
            </div>
          </Kart>
        )}

        {k.durum === 'kapandi' && k.karar !== null && (
          <Kart baslik="Kalite kararı" simge="alert">
            <dl className="tc-km-gkk-bilgi">
              <div><dt>Karar</dt><dd>{KARAR_ADI[k.karar]}</dd></div>
              <div><dt>NCR</dt><dd className="tc-km-gkk-mono">{k.ncrNo ?? YOK}</dd></div>
              <div><dt>Veren</dt><dd>{k.kararKisiAd ?? YOK}, {zamanKisa(k.kararZaman)}</dd></div>
              {k.not && <div><dt>{k.karar === 'sartli_kabul' ? 'Şart' : 'Gerekçe'}</dt><dd>{k.not}</dd></div>}
            </dl>
          </Kart>
        )}
      </div>

      <OnayPenceresi
        acik={onay} baslik="GKK'yı kaydet" onayMetni="Kaydet" yukleniyor={gkk.isPending}
        onayla={gkkGonder} vazgec={() => { onayYaz(false); }}
      >
        <p>
          {k.malKabulNo}, lot {k.partiEtiketi ?? YOK}: {sonuc === null ? '' : SONUC_ADI[sonuc]}. {ozet}.
          {kararli ? ' NCR açılır.' : ''} GKK numarası kayıtta verilir; GKK bir kez yazılır, geri alınmaz.
        </p>
      </OnayPenceresi>
    </div>
  );
}
