import { forwardRef } from 'react';
import type { TeklifFormuAlanAnahtari, TeklifFormuDili, TeklifFormuIcerigi, TeklifFormuKurumu } from '#paylasilan/sozlesme/siparisler.ts';
import { FORM_SOZLERI, alanBasilir, alanDegeri, alanEtiketi, alanlariDoldur, formSayisi, formTarihi, hitap } from './teklif-formu.ts';

export interface FormSatiri { id: number; kod: string | null; ad: string; miktar: string; birim: string | null; yerlilik: string | null; birimFiyat: string | null; iskontoluFiyat: string | null; tutar: string | null }
export interface FormVerisi {
  no: string;
  surumNo: number;
  tarih: string;
  gecerlilik: string | null;
  baslik: string;
  paraBirimi: string;
  teslimGun: number | null;
  terminTarihi: string | null;
  odemeKosulu: string | null;
  iskontoOrani: string | null;
  satirlar: readonly FormSatiri[];
  musteri: { ad: string | null; adres: string | null; vergiDairesi: string | null; vergiNo: string | null };
  ilgili: string;
  toplam: { araToplam: string; iskontoTutari: string; kdvHaric: string; kdvOrani: string; kdvTutari: string; genelToplam: string } | null;
}

interface Ozellikler { dil: TeklifFormuDili; icerik: TeklifFormuIcerigi; kurum: TeklifFormuKurumu; logo: string | null; veri: FormVerisi }

// 3356: imza adı çizginin altındaki ad ya da ünvandır. Eski şablonlarda (varsayılan şablon 'Müşteri onayı') imza adı başlık olarak yazılmıştı;
// onay başlığını tekrarlayan ad basılmaz.
const ONAY_ADLARI = new Set(['müşteri onayı', 'firma onayı', 'onay', 'customer confirmation', 'company confirmation', 'customer approval']);
const imzaAdi = (ad: string): string => (ONAY_ADLARI.has(ad.trim().toLocaleLowerCase('tr')) ? '' : ad);

// A4 teklif formu (3245 d; 3328 düzeni kullanıcının verdiği örnek formdan, sistemin diliyle): antette logo solda, başlık ortada, sağda
// doküman kontrol kutusu (şablonda doluysa; yoksa firma bilgisi). Altında müşteri ve teklif bilgisi iki sütun etiket-değer; kalemler kod,
// açıklama, miktar, birim, fiyat ve tutar sütunlarıyla; toplamlar, koşullar, şartlar, imzalar. Kâğıt her temada açık renklidir
// (data-theme="light"); boş giriş, şart, imza ve doküman kutusu basılmaz.
export const TeklifFormuKagidi = forwardRef<HTMLElement, Ozellikler>(function TeklifFormuKagidi({ dil, icerik, kurum, logo, veri }, ref) {
  const z = FORM_SOZLERI[dil];
  // 3794: alanın etiketi, görünümü ve (metin alanında) bu forma yazılan değeri içerikten gelir.
  const b = (k: TeklifFormuAlanAnahtari) => alanBasilir(icerik, k);
  const e = (k: TeklifFormuAlanAnahtari) => alanEtiketi(icerik, k, dil);
  const musteriAd = alanDegeri(icerik, 'musteriUnvan', veri.musteri.ad);
  const ilgili = hitap(veri.ilgili, musteriAd, dil);
  const doldur = (m: string) => alanlariDoldur(m, {
    musteri: musteriAd ?? '', yetkili: ilgili, teklifNo: veri.no, gecerlilik: formTarihi(veri.gecerlilik, dil),
    teslimGun: veri.teslimGun === null ? '—' : String(veri.teslimGun),
  });
  const giris = doldur(icerik.giris).trim();
  const alt = doldur(icerik.alt).trim();
  const iskontolu = veri.iskontoOrani !== null && Number(veri.iskontoOrani) > 0;
  const kodlu = b('sutunKod') && veri.satirlar.some((s) => s.kod !== null);
  // 3400-3: hiçbir kalemde yerlilik yoksa sütun basılmaz.
  const yerli = b('sutunYerlilik') && veri.satirlar.some((s) => s.yerlilik !== null);
  const iskontoSutunu = iskontolu && b('sutunIskontolu');
  const para = veri.paraBirimi;
  const kurumSatirlari = [kurum.adres, [kurum.telefon && `${z.tel} ${kurum.telefon}`, kurum.eposta].filter(Boolean).join(' · '), kurum.vergi].filter((x) => x !== '');
  const belge = icerik.belge;
  const belgeSatirlari = belge === undefined ? [] : ([[z.dokumanNo, belge.no], [z.yayin, belge.yayin], [z.revTarihi, belge.revTarihi], [z.revNo, belge.revNo]] as const)
    .filter(([, d]) => d.trim() !== '');
  // Logo yoksa ünvan zaten antetin solundadır; doküman kutulu antette alt satırda tekrarlanmaz.
  const kurumAlti = [logo ? kurum.unvan : '', ...kurumSatirlari].filter((k) => k !== '');
  const satirlar = (l: [TeklifFormuAlanAnahtari, string | null][]) => l.flatMap(([k, dd]) => (dd === null || !b(k) ? [] : [[k, e(k), dd] as const]));
  const musteriSatirlari = satirlar([
    ['musteriUnvan', musteriAd ?? '—'], ['musteriAdres', alanDegeri(icerik, 'musteriAdres', veri.musteri.adres)],
    ['musteriVergiDairesi', alanDegeri(icerik, 'musteriVergiDairesi', veri.musteri.vergiDairesi)], ['musteriVergiNo', alanDegeri(icerik, 'musteriVergiNo', veri.musteri.vergiNo)],
    ['musteriIlgili', veri.ilgili.trim() === '' ? null : veri.ilgili.trim()],
  ]);
  const teklifSatirlari = satirlar([
    ['teklifNo', veri.no], ['teklifTur', alanDegeri(icerik, 'teklifTur', z.satisTeklifi)], ['teklifSurum', String(veri.surumNo)],
    ['teklifTarih', formTarihi(veri.tarih, dil)], ['teklifGecerlilik', formTarihi(veri.gecerlilik, dil)],
    ['teklifKonu', alanDegeri(icerik, 'teklifKonu', veri.baslik)], ['teklifPara', para],
  ]);
  const kosulSatirlari = satirlar([
    ['kosulTeslim', veri.teslimGun === null ? '—' : `${String(veri.teslimGun)} ${z.gun}`],
    ['kosulTermin', veri.terminTarihi === null ? null : formTarihi(veri.terminTarihi, dil)],
    ['kosulOdeme', veri.odemeKosulu !== null && veri.odemeKosulu.trim() !== '' ? veri.odemeKosulu : null],
    ['kosulGecerlilik', formTarihi(veri.gecerlilik, dil)],
  ]);
  const toplam = veri.toplam;
  const toplamSatirlari = toplam === null ? [] : satirlar([
    ['toplamAra', iskontolu ? formSayisi(toplam.araToplam, dil) : null],
    ['toplamIskonto', iskontolu ? `−${formSayisi(toplam.iskontoTutari, dil)}` : null],
    ['toplamKdvHaric', formSayisi(toplam.kdvHaric, dil)],
    ['toplamKdv', formSayisi(toplam.kdvTutari, dil)],
    ['toplamGenel', `${formSayisi(toplam.genelToplam, dil)} ${para}`],
  ]);
  const toplamEtiketi = (k: TeklifFormuAlanAnahtari, et: string): string => {
    if (k === 'toplamIskonto') return `${et} (%${formSayisi(veri.iskontoOrani, dil, 'miktar')})`;
    if (k === 'toplamKdv' && toplam !== null) return `${et} (%${formSayisi(toplam.kdvOrani, dil, 'miktar')})`;
    return et;
  };
  const sutunlar = {
    aciklama: b('sutunAciklama'), miktar: b('sutunMiktar'), birim: b('sutunBirim'), fiyat: b('sutunBirimFiyat'), tutar: b('sutunTutar'),
  };
  const imzalar = ([['imzaFirma', icerik.imza1, kurum.unvan], ['imzaMusteri', icerik.imza2, musteriAd ?? '']] as const).filter(([k]) => b(k));
  return (
    <article ref={ref} className="tc-tf-kagit" data-theme="light" lang={dil} aria-label={`${z.teklif} ${veri.no}`}>
      <header className="tc-tf-ust tc-tf-bant">
        {logo ? <img className="tc-tf-logo" src={logo} alt="" /> : <span className="tc-tf-logo-yok">{kurum.unvan}</span>}
        <h1 className="tc-tf-baslik">{icerik.baslik}</h1>
        {belgeSatirlari.length > 0
          ? <dl className="tc-tf-belge">{belgeSatirlari.map(([dt, dd]) => <div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
          : (
            <div className="tc-tf-kurum">
              {kurum.unvan !== '' && <strong>{kurum.unvan}</strong>}
              {kurumSatirlari.map((k) => <span key={k}>{k}</span>)}
            </div>
          )}
      </header>
      {belgeSatirlari.length > 0 && kurumAlti.length > 0 && <p className="tc-tf-kurum-satir">{kurumAlti.join(' · ')}</p>}
      <div className="tc-tf-bilgi">
        <section>
          <h2>{z.musteri}</h2>
          <dl className="tc-tf-meta">
            {musteriSatirlari.map(([k, dt, dd]) => <div key={k}><dt>{dt}</dt><dd className="tc-tf-satirli">{dd}</dd></div>)}
          </dl>
        </section>
        <section>
          <h2>{z.teklif}</h2>
          <dl className="tc-tf-meta">
            {teklifSatirlari.map(([k, dt, dd]) => <div key={k}><dt>{dt}</dt><dd className="tc-tf-satirli">{dd}</dd></div>)}
          </dl>
        </section>
      </div>
      {giris !== '' && <p className="tc-tf-giris">{giris}</p>}
      <table className="tc-tf-tablo">
        <thead>
          <tr>
            <th className="tc-tf-sag">#</th>{kodlu && <th>{e('sutunKod')}</th>}{sutunlar.aciklama && <th>{e('sutunAciklama')}</th>}
            {sutunlar.miktar && <th className="tc-tf-sag">{e('sutunMiktar')}</th>}{sutunlar.birim && <th className="tc-tf-birim">{e('sutunBirim')}</th>}
            {yerli && <th className="tc-tf-sag">{e('sutunYerlilik')}</th>}{sutunlar.fiyat && <th className="tc-tf-sag">{e('sutunBirimFiyat')}</th>}
            {iskontoSutunu && <th className="tc-tf-sag">{e('sutunIskontolu')}</th>}{sutunlar.tutar && <th className="tc-tf-sag">{`${e('sutunTutar')} (${para})`}</th>}
          </tr>
        </thead>
        <tbody>
          {veri.satirlar.map((s, i) => (
            <tr key={s.id}>
              <td className="tc-tf-sag">{i + 1}</td>
              {kodlu && <td className="tc-tf-kod">{s.kod ?? ''}</td>}
              {sutunlar.aciklama && <td>{s.ad}</td>}
              {sutunlar.miktar && <td className="tc-tf-sag">{formSayisi(s.miktar, dil, 'miktar')}</td>}
              {sutunlar.birim && <td className="tc-tf-birim">{s.birim ?? ''}</td>}
              {yerli && <td className="tc-tf-sag">{s.yerlilik === null ? '' : `%${formSayisi(s.yerlilik, dil, 'miktar')}`}</td>}
              {sutunlar.fiyat && <td className="tc-tf-sag">{formSayisi(s.birimFiyat, dil, 'fiyat')}</td>}
              {iskontoSutunu && <td className="tc-tf-sag">{formSayisi(s.iskontoluFiyat, dil, 'fiyat')}</td>}
              {sutunlar.tutar && <td className="tc-tf-sag">{formSayisi(s.tutar, dil)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {toplamSatirlari.length > 0 && (
        <dl className="tc-tf-toplam">
          {toplamSatirlari.map(([k, dt, dd]) => <div key={k} className={k === 'toplamGenel' ? 'tc-tf-genel' : undefined}><dt>{toplamEtiketi(k, dt)}</dt><dd>{dd}</dd></div>)}
        </dl>
      )}
      {kosulSatirlari.length > 0 && (
        <section className="tc-tf-bolum">
          <h2>{z.kosullar}</h2>
          <dl className="tc-tf-meta">
            {kosulSatirlari.map(([k, dt, dd]) => <div key={k}><dt>{dt}</dt><dd>{dd}</dd></div>)}
          </dl>
        </section>
      )}
      {icerik.sartlar.length > 0 && (
        <section className="tc-tf-bolum">
          <h2>{z.sartlar}</h2>
          <ol className="tc-tf-sartlar">{icerik.sartlar.map((s, i) => <li key={`${String(i)}-${s}`}>{s}</li>)}</ol>
        </section>
      )}
      {imzalar.length > 0 && (
        <div className="tc-tf-imzalar">
          {imzalar.map(([k, ad, alti]) => <div key={k} className="tc-tf-imza"><span className="tc-tf-onay">{e(k)}</span>{imzaAdi(ad)}<small>{alti}</small></div>)}
        </div>
      )}
      <footer className="tc-tf-alt"><span>{alt}</span><span>{`${veri.no} · ${z.surum} ${String(veri.surumNo)}`}</span></footer>
    </article>
  );
});
