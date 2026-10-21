import { useEffect, useRef } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MaliyetKalemi, TeklifAyrintiCevabi, TerminDenemesiCevabi, TerminDenemesiKalemi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, Girdi, Kart, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  BELIRSIZ_SAYI, ISKONTO_ONAY_ESIGI, belirsizSayi, bosYap, fiyatMetni, miktarMetni, paraMetni, sayiGirdisi, tarihMetni, zamanMetni,
} from './gorunum.ts';
import { eskiyseYenile, useKorumaliGonderim, useMaliyetOkur, useTerminDener, yazmaIletisi } from './yazma.ts';

type TerminTuru = 'plan' | 'farkli';

interface Degerler {
  // Talep satırlarıyla aynı sırada; her satıra bir birim fiyat.
  fiyatlar: string[];
  iskontoOrani: string;
  teslimGun: string;
  terminTarihi: string;
  odemeKosulu: string;
  gecerlilik: string;
  aciklama: string;
  terminTuru: TerminTuru;
  istenenTermin: string;
  kar: string;
}

// Önizlemedeki hazır kâr oranları (maliyet üstü yüzde); başka oran elle girilir.
const KARLAR = ['10', '15', '20', '25', '30', '40'] as const;
const VARSAYILAN_KAR = '25';

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
    odemeKosulu: son?.odemeKosulu ?? '',
    gecerlilik: son?.gecerlilik ?? '',
    aciklama: son?.aciklama ?? '',
    terminTuru: 'plan',
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

function dogrula(planli: boolean) {
  return (d: Degerler): AlanHatalari => {
    const hata: AlanHatalari = {};
    d.fiyatlar.forEach((f, i) => {
      if (f.trim() === '') hata[`fiyatlar.${i}.birimFiyat`] = 'Birim fiyat zorunlu.';
      else if (belirsizSayi(f)) hata[`fiyatlar.${i}.birimFiyat`] = BELIRSIZ_SAYI;
    });
    if (belirsizSayi(d.iskontoOrani)) hata['iskontoOrani'] = BELIRSIZ_SAYI;
    const gun = d.teslimGun.trim();
    if (gun !== '' && !/^\d+$/.test(gun)) hata['teslimGun'] = 'Teslim süresi gün olarak tam sayı yazılır.';
    if (planli) {
      if (d.gecerlilik === '') hata['gecerlilik'] = 'Satış taslağı geçerlilik tarihine kadar yer tutar; geçerlilik tarihi zorunlu.';
      if (d.terminTuru === 'farkli' && d.istenenTermin === '') hata['istenenTermin'] = 'Başka termin için tarih seçin.';
      if (karSayisi(d.kar) === null) hata['kar'] = 'Kâr en çok iki ondalıklı bir yüzde olmalı.';
    }
    return hata;
  };
}

// 44: teklif sürümü planlama tezgâhının denemesiyle verilir. Termin ve maliyet aynı yerleşimden gelir; satışçı kârı seçer, fiyat
// önerilir ve değiştirilebilir. Motor yoksa, kalemlerin kartı yoksa ya da termin deneme yetkisi yoksa fiyat ve termin elle girilir.
export function TerminFiyat({ teklif }: { teklif: TeklifAyrintiCevabi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const terminDener = useTerminDener();
  const maliyetOkur = useMaliyetOkur();
  const korumali = useKorumaliGonderim();
  const ilk = teklif.surumler.length === 0;
  const pb = teklif.paraBirimi;
  const kartli = teklif.satirlar.some((s) => s.malzemeNo !== null);

  // Plan denemesi yapılacaksa doğrulama ve gövde plan taslaklıdır; karar deneme cevabından sonra, her çizimde verilir.
  const planliRef = useRef(false);
  const form = useForm<Degerler, TeklifAyrintiCevabi>({
    ilk: ilkDegerler(teklif),
    dogrula: (d) => dogrula(planliRef.current)(d),
    hataIletisi: 'Sürüm verilemedi.',
    kaydet: (d) => { const planli = planliRef.current; return api.post<TeklifAyrintiCevabi>(`/siparisler/teklifler/${teklif.id}/surum-ver`, {
      surum: teklif.surum,
      fiyatlar: teklif.satirlar.map((s, i) => ({ satirId: s.id, birimFiyat: sayiGirdisi(d.fiyatlar[i] ?? '') })),
      iskontoOrani: sayiGirdisi(d.iskontoOrani) || '0',
      teslimGun: planli || d.teslimGun.trim() === '' ? null : Number(d.teslimGun),
      odemeKosulu: bosYap(d.odemeKosulu),
      gecerlilik: d.gecerlilik === '' ? null : d.gecerlilik,
      aciklama: bosYap(d.aciklama),
      terminTarihi: planli || d.terminTarihi === '' ? null : d.terminTarihi,
      planTaslagi: planli ? { karOrani: sayiGirdisi(d.kar), istenenTermin: d.terminTuru === 'farkli' ? d.istenenTermin : null } : null,
    }); },
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.teklif(cevap.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.teklifListeleri });
      void istemci.invalidateQueries({ queryKey: anahtarlar.planTaslaklari(cevap.id) });
      const no = cevap.sonSurumNo === null ? 'Sürüm verildi' : `Sürüm ${cevap.sonSurumNo} verildi`;
      bildir('tamam', cevap.durum === 'onay-bekliyor' ? `${no}; onay bekliyor.` : planliRef.current ? `${no}; satış taslağı planda yer tutuyor.` : `${no}.`);
    },
    hatada: (hata) => eskiyseYenile(istemci, anahtarlar.teklif(teklif.id), hata),
  });
  const d = form.degerler;
  const istenen = d.terminTuru === 'farkli' && d.istenenTermin !== '' ? d.istenenTermin : null;
  const sorgu = { gecerlilik: d.gecerlilik, istenenTermin: istenen };

  const deneme = useQuery({
    queryKey: anahtarlar.teklifDenemesi(teklif.id, sorgu),
    queryFn: () => {
      const p = new URLSearchParams();
      if (d.gecerlilik !== '') p.set('gecerlilik', d.gecerlilik);
      if (istenen !== null) p.set('istenenTermin', istenen);
      const q = p.toString();
      return api.get<TerminDenemesiCevabi>(`/siparisler/teklifler/${teklif.id}/termin-denemesi${q ? `?${q}` : ''}`);
    },
    enabled: terminDener && kartli && (d.terminTuru === 'plan' || istenen !== null),
    // Geçerlilik ya da termin değişirken önceki sonuç kalır: form o arada elle yola düşmez. Sürüm sunucuda yeniden denenir.
    placeholderData: keepPreviousData,
  });
  const deneniyor = terminDener && kartli && deneme.isFetching;
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
        gecerlilik: d.gecerlilik === '' ? null : d.gecerlilik, istenenTermin: istenen, karOrani: sayiGirdisi(d.kar),
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
  const satis = fiyatlar.some((f) => f === null) ? null : fiyatlar.reduce<number>((a, f) => a + (f ?? 0), 0);
  const maliyet = c === undefined ? null : sayi(c.maliyetToplami);
  const tumMaliyet = c !== undefined && c.kalemler.every((k) => k.plansiz || k.toplamMaliyet !== null) && !c.kalemler.some((k) => k.plansiz);
  const iskonto = Number(sayiGirdisi(d.iskontoOrani) || '0');
  const net = satis === null ? null : satis * (1 - iskonto / 100);

  const kalemSutunlari: Sutun<{ s: TeklifAyrintiCevabi['satirlar'][number]; k: TerminDenemesiKalemi | undefined; i: number }>[] = [
    {
      anahtar: 'kalem', baslik: 'Kalem', hucre: ({ s, k }) => (
        <span className="tc-sp-ad">
          <strong>{s.tanim}</strong>
          <span className="tc-sp-soluk">{`${miktarMetni(s.miktar)}${s.birim ? ` ${s.birim}` : ''}`}</span>
          {k?.plansiz && <Rozet ton="uyari">Plansız: elle fiyat</Rozet>}
        </span>
      ),
    },
    { anahtar: 'bitis', baslik: 'Plan bitişi', hizala: 'sag', kirilmaz: true, hucre: ({ k }) => (k?.plansiz ? '—' : tarihMetni(k?.bitis ?? null)) },
    { anahtar: 'maliyet', baslik: 'Birim maliyet', hizala: 'sag', kirilmaz: true, hucre: ({ k }) => fiyatMetni(k?.birimMaliyet ?? null, pb) },
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
    <Kart baslik={ilk ? 'Teklif hazırla' : 'Yeni sürüm hazırla'}>
      <p className="tc-sp-ipucu">
        {planli
          ? 'Teklif planın arkasına denendi; termin ve maliyet aynı yerleşimden. Kârı seçin, fiyat önerilir.'
          : ilk ? 'Her kaleme birim fiyat girin; toplamlar kayıttan sonra sunucudan gelir.' : 'Önceki sürümün değerleri dolduruldu; değiştirip yeni sürüm olarak verin.'}
      </p>
      <form className="tc-sp-form" onSubmit={form.gonder} noValidate aria-label="Sürüm formu">
        {form.genelHata !== null && <p className="tc-sp-hata" role="alert">{form.eskiSurum ? 'Kayıt başkası tarafından değişti, yeniden yükleyin.' : form.genelHata}</p>}

        {terminDener && kartli && (
          <section className="tc-sp-tf" aria-label="Termin">
            <div className="tc-sp-izgara">
              <Girdi etiket="Geçerlilik tarihi" type="date" ipucu="Satış taslağı bu tarihe kadar planda yer tutar; geçince plandan kalkar." {...form.alan('gecerlilik')} />
              <fieldset className="tc-sp-secim">
                <legend>Termin</legend>
                <label><input type="radio" name="terminTuru" checked={d.terminTuru === 'plan'} onChange={() => form.degistir({ terminTuru: 'plan' })} /> Plana göre (arkaya ekle)</label>
                <label><input type="radio" name="terminTuru" checked={d.terminTuru === 'farkli'} onChange={() => form.degistir({ terminTuru: 'farkli' })} /> Başka termin</label>
              </fieldset>
              {d.terminTuru === 'farkli' && <Girdi etiket="İstenen termin" type="date" {...form.alan('istenenTermin')} />}
            </div>
            <TerminSonucu deneme={deneme.isFetching && c === undefined ? 'yukleniyor' : deneme.isError ? hataIletisi(deneme.error, 'Termin denemesi yapılamadı.') : c} />
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
            <div className="tc-sp-kar" role="group" aria-label="Kâr oranı">
              <span className="tc-sp-etiket">Kâr (maliyet üstü)</span>
              <div className="tc-sp-kar-dugmeler">
                {KARLAR.map((k) => (
                  <Dugme key={k} tur={karSayisi(d.kar) === Number(k) ? 'birincil' : 'ikincil'} aria-pressed={karSayisi(d.kar) === Number(k)} onClick={() => form.degistir({ kar: k })}>{`%${k}`}</Dugme>
                ))}
              </div>
              <Girdi etiket="Başka oran (%)" inputMode="decimal" autoComplete="off" {...form.alan('kar')} />
            </div>
            <dl className="tc-sp-toplamlar" aria-label="Fiyat özeti">
              <div><dt>Maliyet</dt><dd>{tumMaliyet ? tutarMetni(maliyet, pb) : '—'}</dd></div>
              <div><dt>Teklif tutarı</dt><dd>{tutarMetni(satis, pb)}</dd></div>
              <div><dt>{`İskontolu tutar (%${miktarMetni(sayiGirdisi(d.iskontoOrani) || '0')})`}</dt><dd>{tutarMetni(net, pb)}</dd></div>
              <div className="tc-sp-genel"><dt>İskontolu net kâr</dt><dd>{tumMaliyet && net !== null && maliyet !== null ? tutarMetni(net - maliyet, pb) : '—'}</dd></div>
            </dl>
            {!tumMaliyet && <p className="tc-sp-ipucu">Maliyeti bilinmeyen kalem var; kâr hesaplanmaz, fiyatı kontrol edin.</p>}
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

        <div className="tc-sp-izgara">
          <Girdi etiket="İskonto (%)" inputMode="decimal" autoComplete="off" ipucu={`%${ISKONTO_ONAY_ESIGI} üstü iskonto müdür onayından sonra müşteriye gider.`} {...form.alan('iskontoOrani')} />
          {!planli && <Girdi etiket="Teslim süresi (gün)" inputMode="numeric" autoComplete="off" {...form.alan('teslimGun')} />}
          {!planli && <Girdi etiket="Termin tarihi" type="date" {...form.alan('terminTarihi')} />}
          <Girdi etiket="Ödeme koşulu" autoComplete="off" placeholder="Örnek: 30 gün vadeli" {...form.alan('odemeKosulu')} />
          {!(terminDener && kartli) && <Girdi etiket="Geçerlilik tarihi" type="date" {...form.alan('gecerlilik')} />}
        </div>
        <CokSatir etiket="Müşteriye not" placeholder="Fiyata kaplama dahildir, nakliye alıcıya aittir vb." {...form.alan('aciklama')} />
        <div className="tc-sp-alt-cubuk">
          {planli && <Dugme simge="file" disabled={deneniyor} onClick={() => { void taslakAc(); }}>Deneme taslağı kaydet</Dugme>}
          <Dugme tur="birincil" type="submit" simge="check" yukleniyor={form.gonderiliyor} disabled={deneniyor}>{ilk ? 'Teklifi ver' : `Sürüm ${(teklif.sonSurumNo ?? 0) + 1} olarak ver`}</Dugme>
        </div>
        {planli && <p className="tc-sp-ipucu">Verilen teklif planda satış taslağı olarak yer tutar; yeri sabittir, yalnız termin değişirse yeniden yerleşir. Deneme taslağı yer tutmaz.</p>}
      </form>
    </Kart>
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
          <dt>{deneme.istenenTermin === null ? 'Termin (plandan)' : 'Girilen termin'}</dt>
          <dd>{tarihMetni(deneme.termin)}</dd>
          {deneme.terminGun !== null && <dd className="tc-sp-soluk">{`Geçerlilik tarihinden itibaren ${deneme.terminGun} gün`}</dd>}
        </div>
        {deneme.istenenTermin !== null && <div><dt>Plandan</dt><dd>{tarihMetni(deneme.planTermini)}</dd></div>}
        {gelis !== null && <div><dt>Malzeme gelişi</dt><dd>{zamanMetni(gelis)}</dd></div>}
      </dl>
      <div className="tc-sp-rozetler">
        {deneme.yetisir === true && <Rozet ton="tamam">Atölye bu termine yetiştirir</Rozet>}
        {deneme.yetisir === false && <Rozet ton="hata">Plan bu termine yetişmiyor</Rozet>}
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
        { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, hucre: (m) => (m.tutar === null ? <Rozet ton="uyari">Bilinmiyor</Rozet> : paraMetni(m.tutar, paraBirimi)) },
      ]}
      satirlar={satirlar}
      satirAnahtari={(m) => m.anahtar}
      bosMesaj="Döküm yok."
    />
  );
}
