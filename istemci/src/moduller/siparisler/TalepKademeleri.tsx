import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TeklifAyrintiCevabi, TeklifEkleGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, Girdi, Kart, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useForm, useHataOdagi, type AlanHatalari } from '../../ortak/veri/form.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaSecici, type SecilenFirma } from './FirmaSecici.tsx';
import { GonderimHatasi } from './GonderimHatasi.tsx';
import { BELIRSIZ_SAYI, belirsizSayi, bosYap, girdiMetni, paraBirimiSecenekleri, sayiGirdisi } from './gorunum.ts';
import { MalzemeSecici, secilenKartMetni, type SecilenKart } from './MalzemeSecici.tsx';
import { eskiyseYenile, useKorumaliGonderim } from './yazma.ts';

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

export type TalepKademesi = 1 | 2;

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
      kart: s.malzemeNo === null ? null : { no: s.malzemeNo, kod: s.malzemeKodu, ad: s.malzemeAdi ?? s.tanim, birim: s.birim, aciklamalar: s.aciklamalar },
      tanim: s.tanim,
      miktar: girdiMetni(s.miktar),
    })),
  };
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
    });
    return hata;
  };
}

const alanEsle = (alan: string): string => (alan === 'firmaId' ? 'firma' : alan.replace(/^(satirlar\.\d+)\.malzemeNo$/, '$1.kart'));
const kalemAdi = (yol: string): string | null => { const i = /^satirlar\.(\d+)\./.exec(yol)?.[1]; return i === undefined ? null : `Kalem ${String(Number(i) + 1)}`; };

function govdeKur(d: Degerler) {
  return {
    firmaId: d.firma?.id ?? 0,
    baslik: d.baslik.trim(),
    paraBirimi: d.paraBirimi.trim().toUpperCase(),
    istenenTarih: d.istenenTarih === '' ? null : d.istenenTarih,
    aciklama: bosYap(d.aciklama),
    satirlar: d.satirlar.map((s) => ({ malzemeNo: s.kart?.no ?? null, tanim: s.tanim.trim() || (s.kart?.ad ?? ''), miktar: sayiGirdisi(s.miktar) })),
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
  const birincil = kademe === 1 ? 'Devam' : fiyatVerir ? 'Kaydet ve devam' : teklif === null ? 'Talebi aç' : 'Kaydet';

  return (
    <form ref={kok} className="tc-sp-form" onSubmit={form.gonder} noValidate aria-label={kademe === 1 ? 'Müşteri ve konu' : 'Kalemler'}>
      {kademe === 1 && (
        <Kart baslik="Talep bilgileri">
          <div className="tc-sp-izgara">
            <FirmaSecici etiket="Müşteri" zorunlu deger={d.firma} degistir={(f) => form.degistir({ firma: f })} {...(form.hata('firma') === undefined ? {} : { hata: form.hata('firma') })} />
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
                <div className="tc-sp-kart-sec">
                  <Dugme simge="search" onClick={() => secilecekYaz(i)}>{s.kart === null ? 'Malzemeden seç' : 'Malzemeyi değiştir'}</Dugme>
                  {s.kart !== null && <Dugme aria-label={`Kalem ${i + 1} kartını kaldır`} simge="x" onClick={() => satirDegistir(i, { kart: null })} />}
                  <span className={form.hata(`satirlar.${i}.kart`) === undefined ? 'tc-sp-secili' : 'tc-sp-secili tc-sp-hata'} role={form.hata(`satirlar.${i}.kart`) === undefined ? undefined : 'alert'}>
                    {form.hata(`satirlar.${i}.kart`) ?? (s.kart === null ? 'Katalogda yoksa aşağıya tanımı yazın; siparişe dönüşmeden malzeme seçilir.' : secilenKartMetni(s.kart))}
                  </span>
                </div>
                <div className="tc-sp-izgara">
                  <Girdi
                    etiket={s.kart === null ? `Kalem ${i + 1} tanım` : `Kalem ${i + 1} tanım (isteğe bağlı)`}
                    required={s.kart === null}
                    autoComplete="off"
                    placeholder={s.kart === null ? 'Ürün ya da hizmet; ölçü, kalite, standart' : 'Boşsa malzeme adı yazılır'}
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
          if (secilecek !== null) {
            const satir = d.satirlar[secilecek];
            // Tanım boşsa ya da önceki kartın adıysa yeni kartın adı yazılır; elle yazılan tanım korunur.
            const kendiliginden = satir !== undefined && (satir.tanim.trim() === '' || satir.tanim === satir.kart?.ad);
            satirDegistir(secilecek, { kart, ...(kendiliginden ? { tanim: kart.ad } : {}) });
          }
          secilecekYaz(null);
        }}
      />
    </form>
  );
}
