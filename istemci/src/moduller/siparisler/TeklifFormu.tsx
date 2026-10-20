import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { TeklifAyrintiCevabi, TeklifEkleGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaSecici, type SecilenFirma } from './FirmaSecici.tsx';
import { BELIRSIZ_SAYI, belirsizSayi, bosYap, girdiMetni, sayiGirdisi } from './gorunum.ts';
import { MalzemeSecici, type SecilenKart } from './MalzemeSecici.tsx';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { eskiyseYenile, useKorumaliGonderim } from './yazma.ts';
import './siparisler.css';

interface SatirDegeri {
  anahtar: number;
  // Kalem katalogdan seçilir; kartı henüz açılmamış parça tanımla girilir ve siparişe dönüşmeden kart seçilir.
  kart: SecilenKart | null;
  tanim: string;
  miktar: string;
}

interface Degerler {
  firma: SecilenFirma | null;
  baslik: string;
  paraBirimi: string;
  istenenTarih: string;
  aciklama: string;
  satirlar: SatirDegeri[];
}

let satirSayaci = 0;
const bosSatir = (): SatirDegeri => ({ anahtar: ++satirSayaci, kart: null, tanim: '', miktar: '' });

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
      kart: s.malzemeNo === null ? null : { no: s.malzemeNo, kod: s.malzemeKodu, ad: s.tanim, birim: s.birim },
      tanim: s.tanim,
      miktar: girdiMetni(s.miktar),
    })),
  };
}

function dogrula(d: Degerler): AlanHatalari {
  const hata: AlanHatalari = {};
  if (d.firma === null) hata['firma'] = 'Firma seçin.';
  if (d.baslik.trim() === '') hata['baslik'] = 'Başlık zorunlu.';
  if (d.paraBirimi.trim() === '') hata['paraBirimi'] = 'Para birimi zorunlu.';
  d.satirlar.forEach((s, i) => {
    if (s.tanim.trim() === '') hata[`satirlar.${i}.tanim`] = 'Satır tanımı zorunlu.';
    if (s.miktar.trim() === '') hata[`satirlar.${i}.miktar`] = 'Miktar zorunlu.';
    else if (belirsizSayi(s.miktar)) hata[`satirlar.${i}.miktar`] = BELIRSIZ_SAYI;
  });
  return hata;
}

const alanEsle = (alan: string): string => (alan === 'firmaId' ? 'firma' : alan.replace(/^(satirlar\.\d+)\.malzemeNo$/, '$1.kart'));

function govdeKur(d: Degerler) {
  return {
    firmaId: d.firma?.id ?? 0,
    baslik: d.baslik.trim(),
    paraBirimi: d.paraBirimi.trim().toUpperCase(),
    istenenTarih: d.istenenTarih === '' ? null : d.istenenTarih,
    aciklama: bosYap(d.aciklama),
    satirlar: d.satirlar.map((s) => ({ malzemeNo: s.kart?.no ?? null, tanim: s.tanim.trim(), miktar: sayiGirdisi(s.miktar) })),
  } satisfies TeklifEkleGovdesi;
}

function Form({ teklif }: { teklif: TeklifAyrintiCevabi | null }) {
  const gezin = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliGonderim();
  const [acilisSurumu] = useState(teklif?.surum ?? null);
  const [secilecek, secilecekYaz] = useState<number | null>(null);

  const form = useForm<Degerler, TeklifAyrintiCevabi>({
    ilk: ilkDegerler(teklif),
    dogrula,
    alanEsle,
    hataIletisi: 'Teklif kaydedilemedi.',
    kaydet: (d) => {
      const govde = govdeKur(d);
      if (teklif === null || acilisSurumu === null) return ekle<TeklifAyrintiCevabi>('/siparisler/teklifler/ekle', govde);
      return api.post<TeklifAyrintiCevabi>(`/siparisler/teklifler/${teklif.id}/guncelle`, { ...govde, surum: acilisSurumu });
    },
    basarili: (cevap) => {
      istemci.setQueryData(anahtarlar.teklif(cevap.id), cevap);
      void istemci.invalidateQueries({ queryKey: anahtarlar.teklifListeleri });
      bildir('tamam', teklif === null ? 'Teklif talebi açıldı.' : 'Teklif talebi güncellendi.');
      void gezin(`/siparisler/teklifler/${cevap.id}`);
    },
    hatada: (hata) => { if (teklif !== null) eskiyseYenile(istemci, anahtarlar.teklif(teklif.id), hata); },
  });
  const d = form.degerler;

  const satirDegistir = (i: number, yama: Partial<SatirDegeri>) =>
    form.degistir({ satirlar: d.satirlar.map((s, j) => (j === i ? { ...s, ...yama } : s)) });
  const geri = teklif === null ? '/siparisler/teklifler' : `/siparisler/teklifler/${teklif.id}`;

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik={teklif === null ? 'Yeni teklif' : `Düzenle: ${teklif.no}`}
        alt={teklif === null ? 'Müşteri adına teklif talebi açın; ardından fiyatları girip sürüm verin.' : 'Talep yalnız ilk sürüm verilmeden düzenlenir.'}
        geriYol={geri}
        geriMetni={teklif === null ? 'Tekliflere dön' : 'Teklife dön'}
      />
      <form className="tc-sp-form" onSubmit={form.gonder} noValidate>
        {form.genelHata !== null && <p className="tc-sp-hata" role="alert">{form.eskiSurum ? 'Kayıt başkası tarafından değişti, yeniden yükleyin.' : form.genelHata}</p>}
        <Kart baslik="Talep bilgileri">
          <div className="tc-sp-izgara">
            <FirmaSecici etiket="Müşteri" zorunlu deger={d.firma} degistir={(f) => form.degistir({ firma: f })} {...(form.hata('firma') === undefined ? {} : { hata: form.hata('firma') })} />
            <Girdi etiket="Konu" required autoComplete="off" placeholder="Örnek: 2027 yılı braket ihtiyacı" {...form.alan('baslik')} />
            <Girdi etiket="İstenen teslim tarihi" type="date" {...form.alan('istenenTarih')} />
            <Girdi etiket="Para birimi" required autoComplete="off" maxLength={3} {...form.alan('paraBirimi')} />
          </div>
          <CokSatir etiket="Açıklama" placeholder="Teknik resim revizyonu, malzeme, kaplama, teslim yeri" {...form.alan('aciklama')} />
        </Kart>

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
                <div className="tc-sp-izgara">
                  <Girdi
                    etiket={`Kalem ${i + 1} tanım`}
                    required
                    autoComplete="off"
                    placeholder="Ürün ya da hizmet; ölçü, kalite, standart"
                    value={s.tanim}
                    onChange={(o) => satirDegistir(i, { tanim: o.target.value })}
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
                </div>
                <div className="tc-sp-kart-sec">
                  <Dugme simge="search" onClick={() => secilecekYaz(i)}>{s.kart === null ? 'Malzemeden seç' : 'Malzemeyi değiştir'}</Dugme>
                  {s.kart !== null && <Dugme aria-label={`Kalem ${i + 1} kartını kaldır`} simge="x" onClick={() => satirDegistir(i, { kart: null })} />}
                  <span className={form.hata(`satirlar.${i}.kart`) === undefined ? 'tc-sp-secili' : 'tc-sp-secili tc-sp-hata'} role={form.hata(`satirlar.${i}.kart`) === undefined ? undefined : 'alert'}>
                    {form.hata(`satirlar.${i}.kart`) ?? (s.kart === null ? 'Katalogda yoksa tanımı yazın; siparişe dönüşmeden malzeme seçilir.' : `${s.kart.kod ?? ''} ${s.kart.ad}${s.kart.birim ? ` (${s.kart.birim})` : ''}`.trim())}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Kart>

        <div className="tc-sp-alt-cubuk">
          <Dugme onClick={() => { void gezin(geri); }} disabled={form.gonderiliyor}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" simge="check" yukleniyor={form.gonderiliyor}>{teklif === null ? 'Talebi aç' : 'Kaydet'}</Dugme>
        </div>
      </form>
      <MalzemeSecici
        acik={secilecek !== null}
        kapat={() => secilecekYaz(null)}
        sec={(kart) => {
          if (secilecek !== null) {
            const satir = d.satirlar[secilecek];
            // Tanım boşsa ya da önceki kartın adıysa yeni kartın adı yazılır; elle yazılan tanım korunur.
            const kendiliginden = satir !== undefined && (satir.tanim.trim() === '' || satir.tanim === satir.kart?.ad);
            satirDegistir(secilecek, { kart, ...(kendiliginden ? { tanim: kart.ad } : {}) });
          }
          secilecekYaz(null);
        }}
      />
    </section>
  );
}

export function TeklifFormu({ duzenle = false }: { duzenle?: boolean }) {
  const id = Number(useParams()['id']);
  const teklif = useQuery({
    queryKey: anahtarlar.teklifDuzenle(id),
    queryFn: () => api.get<TeklifAyrintiCevabi>(`/siparisler/teklifler/${id}`),
    enabled: duzenle,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  if (!duzenle) return <Form teklif={null} />;
  if (teklif.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (teklif.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(teklif.error, 'Teklif alınamadı')} yenile={() => { void teklif.refetch(); }} />;
  if (teklif.data.durum !== 'yeni') return <DurumKutusu durum="bos" mesaj="Talep yalnız ilk sürüm verilmeden düzenlenir." />;
  return <Form teklif={teklif.data} />;
}
