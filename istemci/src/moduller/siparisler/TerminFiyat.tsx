import { useEffect, useRef } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MaliyetKalemi, TeklifAyrintiCevabi, TerminDenemesiCevabi, TerminDenemesiKalemi, TerminYerlesimi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, Girdi, Kart, Rozet, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useForm, useHataOdagi, type AlanHatalari } from '../../ortak/veri/form.ts';
import { AdetTablosu } from './AdetTablosu.tsx';
import { anahtarlar } from './anahtarlar.ts';
import {
  BELIRSIZ_SAYI, ISKONTO_ONAY_ESIGI, belirsizSayi, bosYap, fiyatMetni, miktarMetni, paraMetni, sayiGirdisi, tarihMetni, zamanMetni,
} from './gorunum.ts';
import { ODEME_TURLERI, VADE_BIRIMLERI, odemeHatasi, odemeMetni, odemeSecimi, vadeli, type OdemeSecimi, type OdemeTuru } from './odeme-kosulu.ts';
import { PlanSeridi } from './PlanSeridi.tsx';
import { FIYAT_ONERISI_YOK, GIZLI } from './gizli.ts';
import { GonderimHatasi } from './GonderimHatasi.tsx';
import { eskiyseYenile, useKorumaliGonderim, useMaliyetOkur, useTerminDener, yazmaIletisi } from './yazma.ts';

// 3301 (D): kademe 3 termin ve fiyat, kademe 4 koşullar ve gönder; ikisi tek formdur, sürüm kademe 4'ten verilir.
export type FiyatKademesi = 3 | 4;

interface Degerler {
  // Talep satırlarıyla aynı sırada; her satıra bir birim fiyat.
  fiyatlar: string[];
  iskontoOrani: string;
  teslimGun: string;
  terminTarihi: string;
  // Ödeme koşulu seçimle kurulur (odeme-kosulu.ts); düz metin alanlar form.alan'a bağlanır, gönderimde metne çevrilir.
  odemeTuru: string;
  odemeSure: string;
  odemeBirim: string;
  odemeKosulu: string;
  gecerlilik: string;
  aciklama: string;
  yerlesim: TerminYerlesimi;
  istenenTermin: string;
  kar: string;
}

// Önizlemedeki hazır kâr oranları (maliyet üstü yüzde); başka oran elle girilir.
// Sunucudaki GERIYE_TERMIN_ZORUNLU ile aynı ileti (istemci sözleşmeden değer ithal etmez).
const GERIYE_TERMIN_ZORUNLU = 'Terminden geriye yerleşimde istenen termin zorunlu.';
const KARLAR = ['10', '15', '20', '25', '30', '40'] as const;
const VARSAYILAN_KAR = '25';

const odemeDegerleri = (metin: string | null) => {
  const o = odemeSecimi(metin);
  return { odemeTuru: o.tur, odemeSure: o.sure, odemeBirim: o.birim, odemeKosulu: o.metin };
};
const odemeSecimiOku = (d: Degerler): OdemeSecimi => ({
  tur: d.odemeTuru as OdemeTuru, sure: d.odemeSure, birim: d.odemeBirim === 'ay' ? 'ay' : 'gun', metin: d.odemeKosulu,
});

const MALIYET_TURU: Record<MaliyetKalemi['tur'], string> = {
  malzeme: 'Malzeme', isleme: 'İşlem (ayar dahil)', fason: 'Fason', 'genel-gider': 'Genel gider',
};

// Önceki sürümün değerleri doldurulur (prototip: "Önceki sürümün değerleri dolduruldu").
function ilkDegerler(t: TeklifAyrintiCevabi): Degerler {
  const son = t.surumler.at(-1);
  const fiyat = new Map((son?.fiyatlar ?? []).map((f) => [f.satirId, f.birimFiyat]));
  return {
    fiyatlar: t.satirlar.map((s) => { const f = fiyat.get(s.id); return f === undefined || f === null ? '' : miktarMetni(f).replace(/\./g, ''); }),
    iskontoOrani: son?.iskontoOrani ? miktarMetni(son.iskontoOrani) : '0',
    teslimGun: son?.teslimGun == null ? '' : String(son.teslimGun),
    terminTarihi: son?.terminTarihi ?? '',
    ...odemeDegerleri(son?.odemeKosulu ?? null),
    gecerlilik: son?.gecerlilik ?? '',
    aciklama: son?.aciklama ?? '',
    // V6: varsayılan planın arkasına ekle; kimseyi kaydırmaz.
    yerlesim: 'arkaya',
    istenenTermin: '',
    kar: VARSAYILAN_KAR,
  };
}

const karSayisi = (k: string): number | null => {
  const v = sayiGirdisi(k);
  return /^\d{1,3}(\.\d{1,2})?$/.test(v) ? Number(v) : null;
};
const sayi = (m: string | null): number | null => (m === null ? null : Number(m));
// Önerilen fiyat ekrana virgüllü yazılır; sunucuya sayiGirdisi ile noktalı gider.
const fiyatGirdisi = (n: number): string => n.toFixed(2).replace('.', ',');
const tutarMetni = (n: number | null, pb: string): string => (n === null || !Number.isFinite(n) ? '—' : paraMetni(n.toFixed(2), pb));

// Kademe 3'ün alanları (geçerlilik yalnız termin denenirken); kademe 4'ten gönderimde bunlardan biri hatalıysa kademe 3 açılır.
const KADEME3_ALANI = /^(fiyatlar\.|kar$|istenenTermin$|gecerlilik$)/;

function dogrula(planli: boolean, kademe: FiyatKademesi, denenir: boolean) {
  return (d: Degerler): AlanHatalari => {
    const hata: AlanHatalari = {};
    d.fiyatlar.forEach((f, i) => {
      if (f.trim() === '') hata[`fiyatlar.${i}.birimFiyat`] = 'Birim fiyat zorunlu.';
      else if (belirsizSayi(f)) hata[`fiyatlar.${i}.birimFiyat`] = BELIRSIZ_SAYI;
    });
    if (planli) {
      if (d.gecerlilik === '') hata['gecerlilik'] = 'Satış taslağı geçerlilik tarihine kadar yer tutar; geçerlilik tarihi zorunlu.';
      if (karSayisi(d.kar) === null) hata['kar'] = 'Kâr en çok iki ondalıklı bir yüzde olmalı.';
    }
    if (denenir && d.yerlesim === 'geriye' && d.istenenTermin === '') hata['istenenTermin'] = GERIYE_TERMIN_ZORUNLU;
    if (kademe === 3) return hata;
    if (belirsizSayi(d.iskontoOrani)) hata['iskontoOrani'] = BELIRSIZ_SAYI;
    const gun = d.teslimGun.trim();
    if (gun !== '' && !/^\d+$/.test(gun)) hata['teslimGun'] = 'Teslim süresi gün olarak tam sayı yazılır.';
    const odeme = odemeHatasi(odemeSecimiOku(d));
    if (odeme !== null) hata['odemeSure'] = odeme;
    return hata;
  };
}

interface Ozellikler {
  teklif: TeklifAyrintiCevabi;
  kademe: FiyatKademesi;
  kademeYaz: (k: FiyatKademesi) => void;
  // Kademe 3'ün Geri düğmesi: kalemlere döner (kayıt yapmaz).
  geri: () => void;
  // Sürüm verildi: sayfa sonucu (onay bekliyor ya da teklif formu) gösterir.
  verildi: (cevap: TeklifAyrintiCevabi) => void;
}

// 44: teklif sürümü planlama tezgâhının denemesiyle verilir. Termin ve maliyet aynı yerleşimden gelir; satışçı kârı seçer, fiyat
// önerilir ve değiştirilebilir. Motor yoksa, kalemlerin kartı yoksa ya da termin deneme yetkisi yoksa fiyat ve termin elle girilir.
export function TerminFiyat({ teklif, kademe, kademeYaz, geri, verildi }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const terminDener = useTerminDener();
  const maliyetOkur = useMaliyetOkur();
  const korumali = useKorumaliGonderim();
  const ilk = teklif.surumler.length === 0;
  const pb = teklif.paraBirimi;
  const kartli = teklif.satirlar.some((s) => s.malzemeNo !== null);
  const denenir = terminDener && kartli;

  // Plan denemesi yapılacaksa doğrulama ve gövde plan taslaklıdır; karar deneme cevabından sonra, her çizimde verilir.
  const planliRef = useRef(false);
  const kademeRef = useRef(kademe);
  kademeRef.current = kademe;
  const form = useForm<Degerler, TeklifAyrintiCevabi | null>({
    ilk: ilkDegerler(teklif),
    dogrula: (d) => dogrula(planliRef.current, kademeRef.current, denenir)(d),
    hataIletisi: 'Sürüm verilemedi.',
    // Kademe 3'te kayıt yoktur: denetim geçince koşullara geçilir.
    kaydet: (d) => {
      if (kademeRef.current === 3) return Promise.resolve(null);
      const planli = planliRef.current;
      return api.post<TeklifAyrintiCevabi>(`/siparisler/teklifler/${teklif.id}/surum-ver`, {
        surum: teklif.surum,
        fiyatlar: teklif.satirlar.map((s, i) => ({ satirId: s.id, birimFiyat: sayiGirdisi(d.fiyatlar[i] ?? '') })),
        iskontoOrani: sayiGirdisi(d.iskontoOrani) || '0',
        teslimGun: planli || d.teslimGun.trim() === '' ? null : Number(d.teslimGun),
        odemeKosulu: odemeMetni(odemeSecimiOku(d)),
        gecerlilik: d.gecerlilik === '' ? null : d.gecerlilik,
        aciklama: bosYap(d.aciklama),
        terminTarihi: planli || d.terminTarihi === '' ? null : d.terminTarihi,
        planTaslagi: planli ? { karOrani: sayiGirdisi(d.kar), istenenTermin: d.istenenTermin === '' ? null : d.istenenTermin, yerlesim: d.yerlesim } : null,
      });
    },
    basarili: (cevap) => {
      if (cevap === null) { kademeYaz(4); return; }
      istemci.setQueryData(anahtarlar.teklif(cevap.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.teklifListeleri });
      void istemci.invalidateQueries({ queryKey: anahtarlar.planTaslaklari(cevap.id) });
      void istemci.invalidateQueries({ queryKey: anahtarlar.atolyeTaslaklari });
      const no = cevap.sonSurumNo === null ? 'Sürüm verildi' : `Sürüm ${cevap.sonSurumNo} verildi`;
      bildir('tamam', cevap.durum === 'onay-bekliyor' ? `${no}; onay bekliyor.` : planliRef.current ? `${no}; satış taslağı planda yer tutuyor.` : `${no}.`);
      verildi(cevap);
    },
    hatada: (hata) => eskiyseYenile(istemci, anahtarlar.teklif(teklif.id), hata),
  });
  const d = form.degerler;
  const kok = useRef<HTMLFormElement>(null);
  // Kademe 4'ten gönderimde fiyat ya da termin hatası çıkarsa (sunucunun bağladığı dahil) kademe 3 açılır; odak sonra alana gider.
  const kademe3Hatasi = Object.keys(form.hatalar).some((y) => KADEME3_ALANI.test(y) && (denenir || y !== 'gecerlilik'));
  useEffect(() => { if (kademe === 4 && kademe3Hatasi) kademeYaz(3); }, [form.hataNo]);
  useHataOdagi(form.hataNo, kok);
  const istenen = d.istenenTermin !== '' ? d.istenenTermin : null;
  const sorgu = { gecerlilik: d.gecerlilik, istenenTermin: istenen, yerlesim: d.yerlesim };

  const deneme = useQuery({
    queryKey: anahtarlar.teklifDenemesi(teklif.id, sorgu),
    queryFn: () => {
      const p = new URLSearchParams();
      if (d.gecerlilik !== '') p.set('gecerlilik', d.gecerlilik);
      if (istenen !== null) p.set('istenenTermin', istenen);
      p.set('yerlesim', d.yerlesim);
      return api.get<TerminDenemesiCevabi>(`/siparisler/teklifler/${teklif.id}/termin-denemesi?${p.toString()}`);
    },
    enabled: denenir && (d.yerlesim === 'arkaya' || istenen !== null),
    // Geçerlilik ya da termin değişirken önceki sonuç kalır: form o arada elle yola düşmez. Sürüm sunucuda yeniden denenir.
    placeholderData: keepPreviousData,
  });
  const deneniyor = denenir && deneme.isFetching;
  const c = deneme.data;
  const planli = terminDener && c !== undefined && c.durum === 'hazir' && c.planTermini !== null;
  planliRef.current = planli;
  const kar = karSayisi(d.kar);

  // Kâr ya da deneme değişince planlı kalemlerin fiyatı yeniden önerilir; satışçı sonra elle değiştirebilir.
  useEffect(() => {
    if (!planli || c === undefined || kar === null) return;
    const maliyet = new Map(c.kalemler.map((k) => [k.satirId, sayi(k.birimMaliyet)]));
    const yeni = teklif.satirlar.map((s, i) => {
      const m = maliyet.get(s.id);
      return m === null || m === undefined ? (form.degerler.fiyatlar[i] ?? '') : fiyatGirdisi(m * (1 + kar / 100));
    });
    if (yeni.some((f, i) => f !== form.degerler.fiyatlar[i])) form.degistir({ fiyatlar: yeni });
    // form her çizimde yenidir; öneri yalnız deneme ve kâr değişince yazılır, elle girilen fiyat başka değişiklikte korunur.
  }, [c, kar, planli]);

  const taslakAc = async () => {
    if (!planli || kar === null) return;
    try {
      await korumali(`/siparisler/teklifler/${teklif.id}/deneme-taslagi`, {
        gecerlilik: d.gecerlilik === '' ? null : d.gecerlilik, istenenTermin: istenen, yerlesim: d.yerlesim, karOrani: sayiGirdisi(d.kar),
      });
      void istemci.invalidateQueries({ queryKey: anahtarlar.planTaslaklari(teklif.id) });
      bildir('tamam', 'Deneme taslağı kaydedildi; planda yer tutmaz.');
    } catch (h) {
      bildir('hata', yazmaIletisi(h, 'Deneme taslağı kaydedilemedi.'));
    }
  };

  // Fiyat özeti: maliyeti bilinen kalemlerle; biri bilinmiyorsa kâr yazılmaz (sıfır uydurulmaz).
  const fiyatlar = teklif.satirlar.map((s, i) => {
    const f = sayiGirdisi(d.fiyatlar[i] ?? '');
    return f === '' || Number.isNaN(Number(f)) ? null : Number(f) * Number(s.miktar);
  });
  const fiyatsiz = fiyatlar.filter((f) => f === null).length;
  const satis = fiyatsiz > 0 ? null : fiyatlar.reduce<number>((a, f) => a + (f ?? 0), 0);
  const maliyet = c === undefined ? null : sayi(c.maliyetToplami);
  // 2661 a, 2669 b: gizli oranlı ayda maliyet "Gizli"; fiyat önerilmez, genel gider hariç maliyet de gösterilmez.
  const gizli = c?.genelGiderGizli === true;
  const tumMaliyet = c !== undefined && c.kalemler.every((k) => k.plansiz || k.toplamMaliyet !== null) && !c.kalemler.some((k) => k.plansiz);
  // Kâr yalnız maliyeti bilinen kaleme eklenir; bilinmeyen kalem sessiz kalmasın diye adıyla yazılır (gizli ayda öneri hiç yoktur).
  const karsiz = c === undefined || gizli ? [] : c.kalemler.filter((k) => !k.plansiz && k.birimMaliyet === null);
  const karsizEksik = [...new Set(karsiz.flatMap((k) => k.eksikVeri))];
  const iskonto = Number(sayiGirdisi(d.iskontoOrani) || '0');
  const net = satis === null ? null : satis * (1 - iskonto / 100);
  // Fiyatsız kalem varken kademe 3'ten geçilmez; neden alt çubukta yazar (Ne değişti 8).
  const gecilmez = kademe === 3 && fiyatsiz > 0 ? `${String(fiyatsiz)} kalemin birim fiyatı yok; fiyat girilince devam edilir.` : null;
  const yerlesimSec = (y: TerminYerlesimi) =>
    form.degistir({ yerlesim: y, ...(y === 'geriye' && d.istenenTermin === '' && teklif.istenenTarih !== null ? { istenenTermin: teklif.istenenTarih } : {}) });

  const kalemSutunlari: Sutun<{ s: TeklifAyrintiCevabi['satirlar'][number]; k: TerminDenemesiKalemi | undefined; i: number }>[] = [
    {
      anahtar: 'kalem', baslik: 'Kalem', hucre: ({ s, k }) => (
        <span className="tc-sp-ad">
          <strong>{s.tanim}</strong>
          <span className="tc-sp-soluk">{`${miktarMetni(s.miktar)}${s.birim ? ` ${s.birim}` : ''}`}</span>
          {k?.plansiz && <Rozet ton="uyari">Plansız: elle fiyat</Rozet>}
          {k !== undefined && !k.plansiz && !gizli && k.birimMaliyet === null && <Rozet ton="uyari">Maliyet yok: kâr eklenmez, elle fiyat</Rozet>}
        </span>
      ),
    },
    { anahtar: 'bitis', baslik: 'Plan bitişi', hizala: 'sag', kirilmaz: true, hucre: ({ k }) => (k?.plansiz ? '—' : tarihMetni(k?.bitis ?? null)) },
    { anahtar: 'maliyet', baslik: 'Birim maliyet', hizala: 'sag', kirilmaz: true, hucre: ({ k }) => (gizli && k !== undefined && !k.plansiz ? GIZLI : fiyatMetni(k?.birimMaliyet ?? null, pb)) },
    {
      anahtar: 'fiyat', baslik: 'Birim fiyat', hucre: ({ s, i }) => (
        <Girdi
          etiket={`${s.tanim} birim fiyat (${pb})`}
          required
          inputMode="decimal"
          autoComplete="off"
          value={d.fiyatlar[i] ?? ''}
          onChange={(o) => form.degistir({ fiyatlar: d.fiyatlar.map((f, j) => (j === i ? o.target.value : f)) })}
          {...(form.hata(`fiyatlar.${i}.birimFiyat`) === undefined ? {} : { hata: form.hata(`fiyatlar.${i}.birimFiyat`) })}
        />
      ),
    },
  ];

  return (
    <form ref={kok} className="tc-sp-form" onSubmit={form.gonder} noValidate aria-label={kademe === 3 ? 'Termin ve fiyat' : 'Koşullar ve gönder'}>
      {kademe === 3 && (
        <Kart baslik="Termin ve fiyat">
          <p className="tc-sp-ipucu">
            {planli
              ? 'Termin ve maliyet aynı plan denemesinden gelir. Kârı seçin, fiyat önerilir; isterseniz değiştirin.'
              : ilk ? 'Her kaleme birim fiyat girin.' : 'Önceki sürümün değerleri dolduruldu; değiştirip yeni sürüm olarak verin.'}
          </p>
          {denenir && (
            <section className="tc-sp-tf" aria-label="Termin">
              <div className="tc-sp-izgara">
                <Girdi etiket="Geçerlilik tarihi" type="date" ipucu="Satış taslağı bu tarihe kadar planda yer tutar; geçince plandan kalkar." {...form.alan('gecerlilik')} />
                <fieldset className="tc-sp-secim">
                  <legend>Termin yerleşimi</legend>
                  <label><input type="radio" name="yerlesim" checked={d.yerlesim === 'arkaya'} onChange={() => yerlesimSec('arkaya')} /> Planın arkasına ekle</label>
                  <label><input type="radio" name="yerlesim" checked={d.yerlesim === 'geriye'} onChange={() => yerlesimSec('geriye')} /> Terminden geriye</label>
                </fieldset>
                <Girdi
                  etiket="İstenen termin"
                  type="date"
                  {...(d.yerlesim === 'geriye' ? { required: true } : {})}
                  ipucu={d.yerlesim === 'arkaya'
                    ? 'İsteğe bağlı: girilirse planın yetişip yetişmediği yazılır. Plan dondurulur, hiçbir sipariş kaymaz.'
                    : 'İş terminden geriye en geç başlamayla yerleşir; başka sipariş gecikirse plancı onayı gerekir.'}
                  {...form.alan('istenenTermin')}
                />
              </div>
              <TerminSonucu deneme={deneme.isFetching && c === undefined ? 'yukleniyor' : deneme.isError ? hataIletisi(deneme.error, 'Termin denemesi yapılamadı.') : c} />
              {planli && c !== undefined && (c.plan === null
                ? <p className="tc-sp-ipucu">Planlama motoru plan verisi vermedi; şerit çizilmez.</p>
                : <PlanSeridi plan={c.plan} termin={c.termin} gecerlilik={c.gecerlilik} />)}
            </section>
          )}

          {planli && c !== undefined ? (
            <>
              <Tablo
                etiket="Kalemler, maliyet ve fiyat"
                sutunlar={kalemSutunlari}
                satirlar={teklif.satirlar.map((s, i) => ({ s, k: c.kalemler.find((k) => k.satirId === s.id), i }))}
                satirAnahtari={(r) => r.s.id}
                bosMesaj="Kalem yok."
              />
              {maliyetOkur && <MaliyetDokumu deneme={c} paraBirimi={pb} />}
              {gizli && (
                <p className="tc-sp-bildirim" role="note"><Rozet ton="bilgi"><Simge ad="lock" boyut="k" /> {GIZLI}</Rozet> {FIYAT_ONERISI_YOK}</p>
              )}
              <div className="tc-sp-kar" role="group" aria-label="Kâr oranı">
                <span className="tc-sp-etiket">Kâr (maliyet üstü)</span>
                <div className="tc-sp-kar-dugmeler">
                  {KARLAR.map((k) => (
                    <Dugme key={k} tur={karSayisi(d.kar) === Number(k) ? 'birincil' : 'ikincil'} aria-pressed={karSayisi(d.kar) === Number(k)} onClick={() => form.degistir({ kar: k })}>{`%${k}`}</Dugme>
                  ))}
                </div>
                <Girdi etiket="Başka oran (%)" inputMode="decimal" autoComplete="off" {...form.alan('kar')} />
              </div>
              {karsiz.length > 0 && (
                <p className="tc-sp-bildirim" role="status">
                  <strong>{`Kâr ${String(karsiz.length)} kalemin fiyatına eklenmedi`}</strong>
                  {` Bu kalemlerin maliyeti hesaplanamadı${karsizEksik.length > 0 ? ` (eksik: ${karsizEksik.join('; ')})` : ''}; fiyatı elle girin ya da eksik veriyi tamamlayın.`}
                </p>
              )}
              <dl className="tc-sp-toplamlar" aria-label="Fiyat özeti">
                <div><dt>Maliyet</dt><dd>{gizli ? GIZLI : tumMaliyet ? tutarMetni(maliyet, pb) : '—'}</dd></div>
                <div><dt>Teklif tutarı</dt><dd>{tutarMetni(satis, pb)}</dd></div>
                <div className="tc-sp-genel"><dt>Net kâr (iskontosuz)</dt><dd>{gizli ? GIZLI : tumMaliyet && satis !== null && maliyet !== null ? tutarMetni(satis - maliyet, pb) : '—'}</dd></div>
              </dl>
              {!tumMaliyet && !gizli && <p className="tc-sp-ipucu">Maliyeti bilinmeyen kalem var; kâr hesaplanmaz, fiyatı kontrol edin.</p>}
              <AdetTablosu teklifId={teklif.id} gecerlilik={d.gecerlilik} kar={kar} paraBirimi={pb} />
              <div className="tc-sp-satir-sag">
                <Dugme simge="file" disabled={deneniyor} onClick={() => { void taslakAc(); }}>Deneme taslağı kaydet</Dugme>
                <span className="tc-sp-ipucu">Deneme taslağı planda yer tutmaz; verilen teklif satış taslağı olarak yer tutar.</span>
              </div>
            </>
          ) : (
            <ol className="tc-sp-kalemler">
              {teklif.satirlar.map((s, i) => (
                <li key={s.id} className="tc-sp-kalem" aria-label={`Kalem ${i + 1}`}>
                  <div className="tc-sp-kalem-ust">
                    <strong>{s.tanim}</strong>
                    <span className="tc-sp-soluk">{`${miktarMetni(s.miktar)}${s.birim ? ` ${s.birim}` : ''}`}</span>
                  </div>
                  <Girdi
                    etiket={`${s.tanim} birim fiyat (${pb})`}
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    value={d.fiyatlar[i] ?? ''}
                    ipucu={ilk ? undefined : `Önceki: ${fiyatMetni(teklif.surumler.at(-1)?.fiyatlar.find((f) => f.satirId === s.id)?.birimFiyat, pb)}`}
                    onChange={(o) => form.degistir({ fiyatlar: d.fiyatlar.map((f, j) => (j === i ? o.target.value : f)) })}
                    {...(form.hata(`fiyatlar.${i}.birimFiyat`) === undefined ? {} : { hata: form.hata(`fiyatlar.${i}.birimFiyat`) })}
                  />
                </li>
              ))}
            </ol>
          )}
        </Kart>
      )}

      {kademe === 4 && (
        <Kart baslik="Koşullar ve gönder">
          <div className="tc-sp-izgara">
            <Girdi etiket="İskonto (%)" inputMode="decimal" autoComplete="off" ipucu={`%${ISKONTO_ONAY_ESIGI} üstü iskonto müdür onayından sonra müşteriye gider.`} {...form.alan('iskontoOrani')} />
            {!planli && <Girdi etiket="Teslim süresi (gün)" inputMode="numeric" autoComplete="off" {...form.alan('teslimGun')} />}
            {!planli && <Girdi etiket="Termin tarihi" type="date" {...form.alan('terminTarihi')} />}
            <Secim etiket="Ödeme koşulu" bosSecenek="Belirtilmedi" secenekler={ODEME_TURLERI} {...form.alan('odemeTuru')} />
            {vadeli(d.odemeTuru as OdemeTuru) && (
              <div className="tc-sp-vade" role="group" aria-label="Vade seçimi">
                <Girdi etiket="Vade" inputMode="numeric" autoComplete="off" {...form.alan('odemeSure')} />
                <Secim etiket="Vade birimi" secenekler={VADE_BIRIMLERI} {...form.alan('odemeBirim')} />
              </div>
            )}
            {d.odemeTuru === 'diger' && <Girdi etiket="Ödeme koşulu metni" autoComplete="off" placeholder="Örnek: %50 avans, kalan teslimde" {...form.alan('odemeKosulu')} />}
            {!denenir && <Girdi etiket="Geçerlilik tarihi" type="date" {...form.alan('gecerlilik')} />}
          </div>
          <CokSatir etiket="Müşteriye not" placeholder="Fiyata kaplama dahildir, nakliye alıcıya aittir vb." {...form.alan('aciklama')} />
          {planli && c !== undefined && (
            <p className="tc-sp-ipucu">{`Termin ${tarihMetni(c.termin)} (${d.yerlesim === 'arkaya' ? 'planın arkasına' : 'terminden geriye'}). Verilen teklif planda satış taslağı olarak yer tutar; yalnız termin ya da yerleşim değişirse yeniden yerleşir.`}</p>
          )}
        </Kart>
      )}

      <div className="tc-sp-kademe-cubuk">
        <GonderimHatasi form={form} etiket={(yol) => { const i = /^fiyatlar\.(\d+)\./.exec(yol)?.[1]; return i === undefined ? null : (teklif.satirlar[Number(i)]?.tanim ?? null); }} />
        {gecilmez !== null && <p className="tc-sp-ipucu" role="status">{gecilmez}</p>}
        <div className="tc-sp-alt-cubuk">
          <dl className="tc-sp-cubuk-tutar" aria-label="Tutar">
            <div><dt>Teklif tutarı</dt><dd>{tutarMetni(satis, pb)}</dd></div>
            <div><dt>{`İskontolu (%${miktarMetni(sayiGirdisi(d.iskontoOrani) || '0')})`}</dt><dd>{tutarMetni(net, pb)}</dd></div>
          </dl>
          <Dugme simge="back" onClick={() => (kademe === 4 ? kademeYaz(3) : geri())} disabled={form.gonderiliyor}>Geri</Dugme>
          {kademe === 3
            ? <Dugme tur="birincil" type="submit" simge="next" disabled={deneniyor || gecilmez !== null}>Devam</Dugme>
            : <Dugme tur="birincil" type="submit" simge="check" yukleniyor={form.gonderiliyor} disabled={deneniyor}>{ilk ? 'Teklifi ver' : `Sürüm ${(teklif.sonSurumNo ?? 0) + 1} olarak ver`}</Dugme>}
        </div>
      </div>
    </form>
  );
}

function TerminSonucu({ deneme }: { deneme: TerminDenemesiCevabi | 'yukleniyor' | string | undefined }) {
  if (deneme === undefined) return null;
  if (deneme === 'yukleniyor') return <p className="tc-sp-ipucu" role="status">Plan deneniyor…</p>;
  if (typeof deneme === 'string') return <p className="tc-sp-hata" role="alert">{deneme}</p>;
  if (deneme.durum === 'cozucu-yok') {
    return <p className="tc-sp-bildirim" role="status"><strong>Termin denemesi kullanılamıyor</strong> Planlama motoru bağlı değil; fiyat ve termini elle girin.</p>;
  }
  if (deneme.planTermini === null) {
    const eksik = [...new Set(deneme.kalemler.flatMap((k) => k.eksikVeri))];
    return (
      <p className="tc-sp-bildirim tc-sp-bildirim-hata" role="status">
        <strong>Termin hesaplanamadı</strong> Motor kalemlerin hepsini yerleştiremedi; termin ve maliyet boş kalır, fiyat ve termini elle girin.
        {eksik.length > 0 && ` Eksik: ${eksik.join('; ')}.`}
      </p>
    );
  }
  const gec = deneme.kayanlar.filter((k) => k.gecikir);
  const gelis = deneme.kalemler.map((k) => k.malzemeGelisi).filter((g): g is string => g !== null).sort().at(-1) ?? null;
  return (
    <div className="tc-sp-yigin">
      <dl className="tc-sp-termin" aria-label="Termin sonucu">
        <div className="tc-sp-termin-ana">
          <dt>{deneme.istenenTermin === null || deneme.termin !== deneme.istenenTermin ? 'Termin (plandan)' : 'Girilen termin'}</dt>
          <dd>{tarihMetni(deneme.termin)}</dd>
          {deneme.terminGun !== null && <dd className="tc-sp-soluk">{`Geçerlilik tarihinden itibaren ${deneme.terminGun} gün`}</dd>}
        </div>
        {deneme.istenenTermin !== null && deneme.termin !== deneme.planTermini && <div><dt>Plandan</dt><dd>{tarihMetni(deneme.planTermini)}</dd></div>}
        {deneme.istenenTermin !== null && deneme.termin !== deneme.istenenTermin && <div><dt>İstenen</dt><dd>{tarihMetni(deneme.istenenTermin)}</dd></div>}
        {gelis !== null && <div><dt>Malzeme gelişi</dt><dd>{zamanMetni(gelis)}</dd></div>}
      </dl>
      <div className="tc-sp-rozetler">
        {deneme.yetisir === true && <Rozet ton="tamam">Atölye bu termine yetiştirir</Rozet>}
        {deneme.yetisir === false && (deneme.yerlesim === 'arkaya'
          ? <Rozet ton="hata">İstenen termine yetişmiyor; teklife plan termini yazılır</Rozet>
          : <Rozet ton="hata">Plan bu termine yetişmiyor</Rozet>)}
        {deneme.satinalmaGerekli && <Rozet ton="uyari">Malzeme satın alma ister</Rozet>}
        {deneme.onayGerekli && <Rozet ton="uyari">Plancı onayı gerekir</Rozet>}
      </div>
      {deneme.istenenTermin !== null && (
        <Tablo
          etiket="Bitişi değişen siparişler"
          sutunlar={[
            { anahtar: 'siparis', baslik: 'Sipariş', hucre: (k) => <span className="mono">{k.siparis}</span> },
            { anahtar: 'once', baslik: 'Önce', hizala: 'sag', kirilmaz: true, hucre: (k) => tarihMetni(k.once) },
            { anahtar: 'sonra', baslik: 'Sonra', hizala: 'sag', kirilmaz: true, hucre: (k) => tarihMetni(k.sonra) },
            { anahtar: 'termin', baslik: 'Termin', hizala: 'sag', kirilmaz: true, hucre: (k) => tarihMetni(k.termin) },
            { anahtar: 'durum', baslik: '', hucre: (k) => (k.gecikir ? <Rozet ton="hata">Gecikir</Rozet> : null) },
          ]}
          satirlar={deneme.kayanlar}
          satirAnahtari={(k) => k.siparis}
          bosMesaj="Bitişi değişen sipariş yok."
        />
      )}
      {gec.length > 0 && (
        <p className="tc-sp-bildirim tc-sp-bildirim-hata" role="status">
          <Simge ad="alert" />
          <strong>{`${gec.length} sipariş terminini kaçırır`}</strong> Teklif verilirse satış taslağı plancı onayına kadar yer tutar; teklif onaydan sonra müşteriye gider.
        </p>
      )}
    </div>
  );
}

function MaliyetDokumu({ deneme, paraBirimi }: { deneme: TerminDenemesiCevabi; paraBirimi: string }) {
  const satirlar = deneme.kalemler.flatMap((k) => (k.dokum ?? []).map((m, i) => ({ ...m, anahtar: `${k.satirId}-${i}`, kalem: k.tanim })));
  if (satirlar.length === 0) return null;
  return (
    <Tablo
      etiket="Maliyet dökümü"
      sutunlar={[
        { anahtar: 'kalem', baslik: 'Kalem', hucre: (m) => m.kalem },
        { anahtar: 'tur', baslik: 'Tür', hucre: (m) => `${MALIYET_TURU[m.tur]}${m.tezgah ? ` · ${m.tezgah}` : ''}` },
        { anahtar: 'saat', baslik: 'Saat', hizala: 'sag', kirilmaz: true, hucre: (m) => miktarMetni(m.saat) },
        {
          anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', kirilmaz: true,
          hucre: (m) => (deneme.genelGiderGizli ? GIZLI
            : m.tutar === null ? <Rozet ton="uyari">Bilinmiyor</Rozet> : paraMetni(m.tutar, paraBirimi)),
        },
      ]}
      satirlar={satirlar}
      satirAnahtari={(m) => m.anahtar}
      bosMesaj="Döküm yok."
    />
  );
}
