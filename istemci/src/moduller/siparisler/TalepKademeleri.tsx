import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BirimSecenekleriCevabi, TeklifAyrintiCevabi, TeklifEkleGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, Girdi, Kart, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useForm, useHataOdagi, type AlanHatalari } from '../../ortak/veri/form.ts';
import { anahtarlar } from './anahtarlar.ts';
import type { SecilenFirma } from './FirmaSecici.tsx';
import { GonderimHatasi } from './GonderimHatasi.tsx';
import { BELIRSIZ_SAYI, belirsizSayi, bosYap, girdiMetni, miktarMetni, paraBirimiSecenekleri, sayiGirdisi } from './gorunum.ts';
import { KalemTanimi } from './KalemTanimi.tsx';
import { MalzemeSecici, secilenKartMetni, type SecilenKart } from './MalzemeSecici.tsx';
import { MusteriArama } from './MusteriArama.tsx';
import { eskiyseYenile, useKorumaliGonderim } from './yazma.ts';

interface SatirDegeri {
  anahtar: number;
  // Kalem katalogdan seçilir; kartı henüz açılmamış parça tanımla girilir ve siparişe dönüşmeden kart seçilir.
  kart: SecilenKart | null;
  tanim: string;
  miktar: string;
  // 3400-2: kartsız kalemin birimi; karta bağlı kalemde kartın birimi geçerlidir.
  birim: string;
  // 3400-3: kartta oran yoksa kalemde girilen yerlilik oranı (yüzde).
  yerlilik: string;
}

interface Degerler {
  firma: SecilenFirma | null;
  baslik: string;
  paraBirimi: string;
  istenenTarih: string;
  aciklama: string;
  satirlar: SatirDegeri[];
}

export type TalepKademesi = 1 | 2;

let satirSayaci = 0;
const VARSAYILAN_BIRIM = 'adet';
const bosSatir = (): SatirDegeri => ({ anahtar: ++satirSayaci, kart: null, tanim: '', miktar: '', birim: VARSAYILAN_BIRIM, yerlilik: '' });

function ilkDegerler(t: TeklifAyrintiCevabi | null): Degerler {
  if (t === null) return { firma: null, baslik: '', paraBirimi: 'TRY', istenenTarih: '', aciklama: '', satirlar: [bosSatir()] };
  return {
    firma: { id: t.firmaId, ad: t.firmaAd ?? `Firma ${t.firmaId}` },
    baslik: t.baslik,
    paraBirimi: t.paraBirimi,
    istenenTarih: t.istenenTarih ?? '',
    aciklama: t.aciklama ?? '',
    satirlar: t.satirlar.map((s) => ({
      anahtar: ++satirSayaci,
      kart: s.malzemeNo === null ? null : { no: s.malzemeNo, kod: s.malzemeKodu, ad: s.malzemeAdi ?? s.tanim, birim: s.birim, aciklamalar: s.aciklamalar, yerlilikOrani: null },
      tanim: s.tanim,
      miktar: girdiMetni(s.miktar),
      birim: s.malzemeNo === null ? (s.birim ?? '') : '',
      yerlilik: s.yerlilikOrani === null ? '' : girdiMetni(s.yerlilikOrani),
    })),
  };
}

// 3400-2: liste Logo karşılığı tanımlı birimlerdir; hiçbirinin karşılığı yoksa (Logo kapalı kurulum) bütün aktif birimler.
// Kalemin kayıtlı birimi listede değilse yine gösterilir, seçim kaybolmaz.
type Birimler = BirimSecenekleriCevabi['birimler'] | undefined;
function birimSecenekleri(birimler: Birimler, secili: string) {
  const tum = birimler ?? [];
  const logolu = tum.filter((b) => b.logo !== null);
  const liste = (logolu.length > 0 ? logolu : tum).map((b) => ({ deger: b.kod, baslik: b.kod }));
  if (secili !== '' && !liste.some((b) => b.deger === secili)) liste.unshift({ deger: secili, baslik: secili });
  return liste;
}
function birimIpucu(birimler: Birimler, secili: string): string | undefined {
  const b = birimler?.find((x) => x.kod === secili);
  if (b === undefined) return undefined;
  return b.logo === null ? 'Logo karşılığı yok' : `Logo: ${b.logo}`;
}

// Kademe 1 yalnız talep bilgilerini, kademe 2 bütün talebi denetler (kalemlerde Devam talebi kaydeder).
function dogrula(kademe: TalepKademesi) {
  return (d: Degerler): AlanHatalari => {
    const hata: AlanHatalari = {};
    if (d.firma === null) hata['firma'] = 'Firma seçin.';
    if (d.baslik.trim() === '') hata['baslik'] = 'Başlık zorunlu.';
    if (d.paraBirimi.trim() === '') hata['paraBirimi'] = 'Para birimi zorunlu.';
    if (kademe === 1) return hata;
    d.satirlar.forEach((s, i) => {
      // Malzemeden seçilen kalemde tanım isteğe bağlıdır: boşsa kartın adı gider.
      if (s.kart === null && s.tanim.trim() === '') hata[`satirlar.${i}.tanim`] = 'Malzeme seçin ya da tanımı yazın.';
      if (s.miktar.trim() === '') hata[`satirlar.${i}.miktar`] = 'Miktar zorunlu.';
      else if (belirsizSayi(s.miktar)) hata[`satirlar.${i}.miktar`] = BELIRSIZ_SAYI;
      if (s.yerlilik.trim() !== '' && !yerlilikGecerli(sayiGirdisi(s.yerlilik))) hata[`satirlar.${i}.yerlilikOrani`] = YERLILIK_HATASI;
    });
    return hata;
  };
}

const YERLILIK_HATASI = 'Yerlilik oranı 0 ile 100 arasında, en çok iki ondalıklı olmalı.';
const yerlilikGecerli = (v: string): boolean => /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/.test(v);
// Kartın oranı geçerliyse kalem oranı gönderilmez (sunucu kartınkini yazar).
const karttanOran = (s: SatirDegeri): boolean => s.kart !== null && s.kart.yerlilikOrani !== null;

const alanEsle = (alan: string): string => (alan === 'firmaId' ? 'firma' : alan.replace(/^(satirlar\.\d+)\.malzemeNo$/, '$1.kart'));
const kalemAdi = (yol: string): string | null => { const i = /^satirlar\.(\d+)\./.exec(yol)?.[1]; return i === undefined ? null : `Kalem ${String(Number(i) + 1)}`; };

function govdeKur(d: Degerler) {
  return {
    firmaId: d.firma?.id ?? 0,
    baslik: d.baslik.trim(),
    paraBirimi: d.paraBirimi.trim().toUpperCase(),
    istenenTarih: d.istenenTarih === '' ? null : d.istenenTarih,
    aciklama: bosYap(d.aciklama),
    satirlar: d.satirlar.map((s) => ({
      malzemeNo: s.kart?.no ?? null, tanim: s.tanim.trim() || (s.kart?.ad ?? ''), miktar: sayiGirdisi(s.miktar),
      birim: s.kart === null ? bosYap(s.birim) : null,
      yerlilikOrani: karttanOran(s) ? null : bosYap(sayiGirdisi(s.yerlilik)),
    })),
  } satisfies TeklifEkleGovdesi;
}

interface Ozellikler {
  teklif: TeklifAyrintiCevabi | null;
  kademe: TalepKademesi;
  kademeYaz: (k: TalepKademesi) => void;
  // Fiyat yetkisi olan Devam ile kademe 3'e geçer; olmayanın talebi burada biter ("Talebi aç").
  fiyatVerir: boolean;
  // Talep kaydedildi (açıldı ya da güncellendi): sayfa teklifin adresine geçer.
  kaydedildi: (cevap: TeklifAyrintiCevabi) => void;
}

// 3301 (D): teklif vermenin ilk iki kademesi, talep bilgileri ve kalemler. Talep yalnız ilk sürüm verilmeden düzenlenir (TKL-03).
export function TalepKademeleri({ teklif, kademe, kademeYaz, fiyatVerir, kaydedildi }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliGonderim();
  const [acilisSurumu] = useState(teklif?.surum ?? null);
  const [secilecek, secilecekYaz] = useState<number | null>(null);
  const birimler = useQuery({
    queryKey: anahtarlar.birimSecenekleri,
    queryFn: () => api.get<BirimSecenekleriCevabi>('/siparisler/birim-secenekleri'),
    staleTime: 5 * 60_000,
  });
  const kademeRef = useRef(kademe);
  kademeRef.current = kademe;

  const form = useForm<Degerler, TeklifAyrintiCevabi | null>({
    ilk: ilkDegerler(teklif),
    dogrula: (d) => dogrula(kademeRef.current)(d),
    alanEsle,
    hataIletisi: 'Teklif talebi kaydedilemedi.',
    // Kademe 1'de kayıt yoktur: denetim geçince kalemlere geçilir.
    kaydet: (d) => {
      if (kademeRef.current === 1) return Promise.resolve(null);
      const govde = govdeKur(d);
      if (teklif === null || acilisSurumu === null) return ekle<TeklifAyrintiCevabi>('/siparisler/teklifler/ekle', govde);
      return api.post<TeklifAyrintiCevabi>(`/siparisler/teklifler/${String(teklif.id)}/guncelle`, { ...govde, surum: acilisSurumu });
    },
    basarili: (cevap) => {
      if (cevap === null) { kademeYaz(2); return; }
      istemci.setQueryData(anahtarlar.teklif(cevap.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.teklifListeleri });
      bildir('tamam', teklif === null ? 'Teklif talebi açıldı.' : 'Teklif talebi güncellendi.');
      kaydedildi(cevap);
    },
    hatada: (hata) => { if (teklif !== null) eskiyseYenile(istemci, anahtarlar.teklif(teklif.id), hata); },
  });
  const d = form.degerler;
  const kok = useRef<HTMLFormElement>(null);
  useHataOdagi(form.hataNo, kok);

  const satirDegistir = (i: number, yama: Partial<SatirDegeri>) =>
    form.degistir({ satirlar: d.satirlar.map((s, j) => (j === i ? { ...s, ...yama } : s)) });
  // Listeden seçilince tanım boşsa ya da önceki kartın adıysa yeni kartın adı yazılır; elle yazılan tanım korunur.
  // Tanımdan aranıp seçilince yazılan metin arama metnidir: kartın adı yazılır.
  const kartSec = (i: number, kart: SecilenKart, aramadan = true) => {
    const satir = d.satirlar[i];
    const kendiliginden = aramadan || (satir !== undefined && (satir.tanim.trim() === '' || satir.tanim === satir.kart?.ad));
    satirDegistir(i, { kart, ...(kendiliginden ? { tanim: kart.ad } : {}) });
  };
  const birincil = kademe === 1 ? 'Devam' : fiyatVerir ? 'Kaydet ve devam' : teklif === null ? 'Talebi aç' : 'Kaydet';

  return (
    <form ref={kok} className="tc-sp-form" onSubmit={form.gonder} noValidate aria-label={kademe === 1 ? 'Müşteri ve konu' : 'Kalemler'}>
      {kademe === 1 && (
        <Kart baslik="Talep bilgileri">
          <div className="tc-sp-izgara">
            <MusteriArama deger={d.firma} degistir={(f) => form.degistir({ firma: f })} {...(form.hata('firma') === undefined ? {} : { hata: form.hata('firma') })} />
            <Girdi etiket="Konu" required autoComplete="off" placeholder="Örnek: 2027 yılı braket ihtiyacı" {...form.alan('baslik')} />
            <Girdi etiket="İstenen teslim tarihi" type="date" {...form.alan('istenenTarih')} />
            <Secim etiket="Para birimi" required secenekler={paraBirimiSecenekleri(d.paraBirimi)} {...form.alan('paraBirimi')} />
          </div>
          <CokSatir etiket="Açıklama" placeholder="Teknik resim revizyonu, malzeme, kaplama, teslim yeri" {...form.alan('aciklama')} />
        </Kart>
      )}

      {kademe === 2 && (
        <Kart baslik="Kalemler" sag={<Dugme simge="plus" onClick={() => form.degistir({ satirlar: [...d.satirlar, bosSatir()] })}>Kalem ekle</Dugme>}>
          <ol className="tc-sp-kalemler">
            {d.satirlar.map((s, i) => (
              <li key={s.anahtar} className="tc-sp-kalem" aria-label={`Kalem ${i + 1}`}>
                <div className="tc-sp-kalem-ust">
                  <strong>{`Kalem ${i + 1}`}</strong>
                  {d.satirlar.length > 1 && (
                    <Dugme simge="trash" aria-label={`Kalem ${i + 1} sil`} onClick={() => form.degistir({ satirlar: d.satirlar.filter((_, j) => j !== i) })} />
                  )}
                </div>
                <div className="tc-sp-kalem-izgara">
                  <KalemTanimi
                    etiket={s.kart === null ? `Kalem ${i + 1} tanım` : `Kalem ${i + 1} tanım (isteğe bağlı)`}
                    tanim={s.tanim}
                    tanimYaz={(t) => satirDegistir(i, { tanim: t })}
                    karta={s.kart !== null}
                    sec={(kart) => kartSec(i, kart)}
                    {...(form.hata(`satirlar.${i}.tanim`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.tanim`) })}
                  />
                  <Girdi
                    etiket={`Kalem ${i + 1} miktar`}
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    value={s.miktar}
                    onChange={(o) => satirDegistir(i, { miktar: o.target.value })}
                    {...(form.hata(`satirlar.${i}.miktar`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.miktar`) })}
                  />
                  {s.kart !== null
                    ? <Girdi etiket={`Kalem ${i + 1} birim`} readOnly value={s.kart.birim ?? '—'} ipucu="Kartın birimi" />
                    : (
                      <Secim
                        etiket={`Kalem ${i + 1} birim`}
                        bosSecenek="Birim yok"
                        secenekler={birimSecenekleri(birimler.data?.birimler, s.birim)}
                        value={s.birim}
                        onChange={(o) => satirDegistir(i, { birim: o.target.value })}
                        {...(birimIpucu(birimler.data?.birimler, s.birim) === undefined ? {} : { ipucu: birimIpucu(birimler.data?.birimler, s.birim) })}
                        {...(form.hata(`satirlar.${i}.birim`) === undefined ? {} : { hata: form.hata(`satirlar.${i}.birim`) })}
                      />
                    )}
                  {karttanOran(s)
                    ? <Girdi etiket={`Kalem ${i + 1} yerlilik (%)`} readOnly value={miktarMetni(s.kart?.yerlilikOrani ?? null)} ipucu="Karttan" />
                    : (
                      <Girdi
                        etiket={`Kalem ${i + 1} yerlilik (%)`}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0-100"
                        value={s.yerlilik}
                        onChange={(o) => satirDegistir(i, { yerlilik: o.target.value })}
                        {...(form.hata(`satirlar.${i}.yerlilikOrani`) === undefined
                          ? { ipucu: s.kart === null ? 'İsteğe bağlı' : 'Kartta yok; burada girin' }
                          : { hata: form.hata(`satirlar.${i}.yerlilikOrani`) })}
                      />
                    )}
                </div>
                <div className="tc-sp-kart-sec">
                  <Dugme simge="search" onClick={() => secilecekYaz(i)}>{s.kart === null ? 'Listeden seç' : 'Malzemeyi değiştir'}</Dugme>
                  {s.kart !== null && <Dugme aria-label={`Kalem ${i + 1} kartını kaldır`} simge="x" onClick={() => satirDegistir(i, { kart: null })} />}
                  <span className={form.hata(`satirlar.${i}.kart`) === undefined ? 'tc-sp-secili' : 'tc-sp-secili tc-sp-hata'} role={form.hata(`satirlar.${i}.kart`) === undefined ? undefined : 'alert'}>
                    {form.hata(`satirlar.${i}.kart`) ?? (s.kart === null ? 'Kartsız kalem: siparişe dönüşmeden malzeme seçilir.' : secilenKartMetni(s.kart))}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Kart>
      )}

      <div className="tc-sp-kademe-cubuk">
        <GonderimHatasi form={form} etiket={kalemAdi} />
        <div className="tc-sp-alt-cubuk">
          {kademe === 2 && <Dugme simge="back" onClick={() => kademeYaz(1)} disabled={form.gonderiliyor}>Geri</Dugme>}
          <Dugme tur="birincil" type="submit" simge={kademe === 1 || fiyatVerir ? 'next' : 'check'} yukleniyor={form.gonderiliyor}>{birincil}</Dugme>
        </div>
      </div>
      <MalzemeSecici
        acik={secilecek !== null}
        kapat={() => secilecekYaz(null)}
        sec={(kart) => {
          if (secilecek !== null) kartSec(secilecek, kart, false);
          secilecekYaz(null);
        }}
      />
    </form>
  );
}
