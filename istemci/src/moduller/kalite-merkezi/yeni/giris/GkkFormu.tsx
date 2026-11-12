import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KmGirisCevabi, KmGirisGkkGovdesi, KmGirisKaydi, KmGirisKararGovdesi, KmGkkKontrolu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, GrupluSecim, IsaretKutusu, Kart, OnayPenceresi, Rozet, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import { YOK, zamanKisa } from '../bicim.ts';
import { siradakiNo, yeniKimlik } from '../veri.ts';
import { GIRIS_ANAHTARI } from '../bugun/GirisKarari.tsx';
import { Bilgi, MaddeKarti, MalzemeKarti, OlcuKarti, SeriKarti, maddeBasligi, type MaddeSonucu, type Seri } from './KontrolBolumleri.tsx';
import {
  DURUM_ADI, DURUM_TONU, GIRIS_KAYITLARI_ANAHTARI, GKK_TURU_ADI, KARAR_ADI, SONUC_ADI, girisKaydiAnahtari, gkkSonucu, miktarMetni, sonucMetni,
  type GkkSonucu,
} from './ortak.ts';

type Karar = KmGirisKararGovdesi['karar'];
type Ciddiyet = KmGirisKararGovdesi['ciddiyet'];

// Sözleşmedeki KM_GKK_MADDELERI ile aynı; istemci paylaşılanı yalnız tip olarak ithal eder (zod istemci paketine girmesin).
const MADDELER = {
  hammadde: ['irsaliye', 'sertifika', 'dokum', 'kimlik', 'olcu', 'miktar', 'gorsel', 'markalama'],
  yari_mamul: ['irsaliye', 'resim', 'rapor', 'olcu', 'miktar', 'yuzey', 'ambalaj'],
} as const;
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
  // Ölçümlü muayene yalnız muayene yazabilen kişide açılır; GKK kaydına bağlanmaz, yalnız alanları dolu gelir.
  muayeneAc: ((k: KmGirisKaydi) => void) | null;
  kapat: () => void;
}

// 3117, 3118: GKK mal kabul satırına bağlı tam formdur; kartın türüne göre hammadde ya da yarı mamul biçimindedir. Sonuç (Kabul,
// Kısmi kabul, Şartlı kabul, Ret) miktar ve hatalının kararı olarak tek istekte yazılır; karar sonraya bırakılırsa hatalı Karar
// bekleyen'e düşer. Numara kayıtta verilir. Kapanan kayıt aynı formda salt okunur açılır. Başkası önce yazdıysa (409) form yenilenir.
export function GkkFormu({ id, ncrler, muayeneAc, kapat }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const anahtar = girisKaydiAnahtari(id);
  const kayit = useQuery({ queryKey: anahtar, queryFn: () => api.get<KmGirisCevabi>(`/kalite-merkezi/giris/${String(id)}`) });
  const [maddeler, maddelerYaz] = useState<Record<string, MaddeSonucu>>({});
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
      bildir('hata', 'Bu GKK az önce yazıldı; form yenilendi.');
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
      bildir('tamam', `${c.kayit.gkkNo ?? c.kayit.malKabulNo}: ${s === null ? `${miktarMetni(c.kayit.hataliMiktar)} hatalı karar bekliyor` : sonucMetni({ ...c.kayit, durum: 'kapandi' })}`);
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
  const parca = k.gkkTuru === 'yari_mamul';
  const acik = k.durum === 'gkk_bekliyor';
  const kayitli = a.kontrol;
  const lot = binde(k.miktar);
  const lotMiktari = miktarMetni(k.miktar);
  const birim = k.birim ?? '';
  const bekliyor = gkk.isPending || kararVer.isPending;

  const maddeSecimi: Record<string, MaddeSonucu> = acik ? maddeler : Object.fromEntries((kayitli?.maddeler ?? []).map((m) => [m.anahtar, m.sonuc]));
  const islemSecimi: Record<string, MaddeSonucu> = acik ? islemler : Object.fromEntries((kayitli?.islemler ?? []).map((m) => [m.ad, m.sonuc]));
  const olcuDegeri: Record<string, string> = acik ? olculen : Object.fromEntries((kayitli?.olcumler ?? []).flatMap((o) => (o.olculen === null ? [] : [[o.ad, o.olculen]])));
  const seriListesi = acik ? seriler : (kayitli?.seriler ?? []);
  const islemAdlari = acik ? a.islemler : (kayitli?.islemler ?? []).map((x) => x.ad);
  const uygunDegil = Object.values(maddeSecimi).filter((d) => d === 'uygun_degil').length + Object.values(islemSecimi).filter((d) => d === 'uygun_degil').length;
  const hataliSeri = seriler.filter((s) => s.hatali).length;

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

  const kontrolGovdesi = (): KmGkkKontrolu => ({
    maddeler: MADDELER[k.gkkTuru].map((m) => ({ anahtar: m, sonuc: maddeler[m] ?? 'bakilmadi' })),
    olcumler: a.olculer.map((o) => ({ ad: o.ad, istenen: o.deger, olculen: olculen[o.ad]?.trim() || null })),
    islemler: parca ? a.islemler.map((x) => ({ ad: x, sonuc: islemler[x] ?? 'bakilmadi' })) : [],
    seriler: parca ? seriler : [],
  });
  const gkkKaydet = () => {
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
    gkk.mutate({ kabul: bindenMetin(kabulB), hatali: bindenMetin(hataliB), not: gkkNotu.trim() || null, kontrol: kontrolGovdesi(), karar: kararGovdesi });
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
        <div className="tc-km-gkk-kimlik">
          {k.gkkNo === null ? <span className="tc-km-gkk-soluk">{acik ? 'Numara kaydedince verilir' : 'Numarasız GKK'}</span> : <b className="tc-km-gkk-mono">{k.gkkNo}</b>}
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
        <OlcuKarti olculer={a.olculer} olculen={olcuDegeri} yaz={(ad, d) => { olculenYaz((o) => ({ ...o, [ad]: d })); }} kilitli={!acik} />
      </div>

      <div className="tc-km-gkk-sutun">
        {!acik && kayitli === null
          ? <Kart baslik="Kontrol maddeleri" simge="list"><p className="tc-km-gkk-soluk">Kontrol maddeleri girilmedi.</p></Kart>
          : (
            <MaddeKarti
              baslik="Kontrol maddeleri" simge="list" anahtarlar={acik ? MADDELER[k.gkkTuru] : (kayitli?.maddeler ?? []).map((m) => m.anahtar)}
              baslikOf={maddeBasligi} secim={maddeSecimi} sec={(m, d) => { maddelerYaz((x) => ({ ...x, [m]: d })); }} kilitli={!acik}
            />
          )}
        {parca && (
          <MaddeKarti
            baslik="İşlemler" simge="wrench" anahtarlar={islemAdlari} baslikOf={(x) => x} bos="Kartta işlem (operasyon) yazılı değil."
            secim={islemSecimi} sec={(x, d) => { islemlerYaz((y) => ({ ...y, [x]: d })); }} kilitli={!acik}
          />
        )}
        {parca && <SeriKarti seriler={seriListesi} yaz={serilerYaz} kilitli={!acik} />}

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
