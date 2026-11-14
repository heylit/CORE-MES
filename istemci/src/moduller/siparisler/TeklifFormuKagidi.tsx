import { forwardRef } from 'react';
import type { TeklifFormuDili, TeklifFormuIcerigi, TeklifFormuKurumu } from '#paylasilan/sozlesme/siparisler.ts';
import { FORM_SOZLERI, alanlariDoldur, formSayisi, formTarihi, hitap } from './teklif-formu.ts';

export interface FormSatiri { id: number; kod: string | null; ad: string; miktar: string; birim: string | null; birimFiyat: string | null; iskontoluFiyat: string | null; tutar: string | null }
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
  musteri: { ad: string | null; adres: string | null; vergiNo: string | null };
  ilgili: string;
  toplam: { araToplam: string; iskontoTutari: string; kdvHaric: string; kdvOrani: string; kdvTutari: string; genelToplam: string } | null;
}

interface Ozellikler { dil: TeklifFormuDili; icerik: TeklifFormuIcerigi; kurum: TeklifFormuKurumu; logo: string | null; veri: FormVerisi }

// A4 teklif formu (3245 d, prototipte "A Klasik antet"): logo solda, firma sağda; müşteri ve teklif kutuları, kalemler, toplamlar,
// koşullar, şartlar, imzalar. Kâğıt her temada açık renklidir (data-theme="light"); boş giriş, şart ve imza bölümü basılmaz.
export const TeklifFormuKagidi = forwardRef<HTMLElement, Ozellikler>(function TeklifFormuKagidi({ dil, icerik, kurum, logo, veri }, ref) {
  const z = FORM_SOZLERI[dil];
  const ilgili = hitap(veri.ilgili, veri.musteri.ad, dil);
  const doldur = (m: string) => alanlariDoldur(m, {
    musteri: veri.musteri.ad ?? '', yetkili: ilgili, teklifNo: veri.no, gecerlilik: formTarihi(veri.gecerlilik, dil),
    teslimGun: veri.teslimGun === null ? '—' : String(veri.teslimGun),
  });
  const giris = doldur(icerik.giris).trim();
  const alt = doldur(icerik.alt).trim();
  const iskontolu = veri.iskontoOrani !== null && Number(veri.iskontoOrani) > 0;
  const para = veri.paraBirimi;
  const kurumSatirlari = [kurum.adres, [kurum.telefon && `${z.tel} ${kurum.telefon}`, kurum.eposta].filter(Boolean).join(' · '), kurum.vergi].filter((x) => x !== '');
  return (
    <article ref={ref} className="tc-tf-kagit" data-theme="light" lang={dil} aria-label={`${z.teklif} ${veri.no}`}>
      <header className="tc-tf-ust">
        {logo ? <img className="tc-tf-logo" src={logo} alt="" /> : <span className="tc-tf-logo-yok">{kurum.unvan}</span>}
        <div className="tc-tf-kurum">
          {kurum.unvan !== '' && <strong>{kurum.unvan}</strong>}
          {kurumSatirlari.map((s) => <span key={s}>{s}</span>)}
        </div>
      </header>
      <div className="tc-tf-ust tc-tf-ust-alt">
        <h1 className="tc-tf-baslik">{icerik.baslik}</h1>
        <dl className="tc-tf-meta">
          <div><dt>{z.no}</dt><dd>{veri.no}</dd></div>
          <div><dt>{z.surum}</dt><dd>{veri.surumNo}</dd></div>
          <div><dt>{z.tarih}</dt><dd>{formTarihi(veri.tarih, dil)}</dd></div>
          <div><dt>{z.gecerlilik}</dt><dd>{formTarihi(veri.gecerlilik, dil)}</dd></div>
        </dl>
      </div>
      <div className="tc-tf-kutular">
        <section className="tc-tf-kutu">
          <h2>{z.musteri}</h2>
          <strong>{veri.musteri.ad ?? '—'}</strong>
          {veri.musteri.adres !== null && <span className="tc-tf-satirli">{veri.musteri.adres}</span>}
          {veri.musteri.vergiNo !== null && <span>{`${z.vergi}: ${veri.musteri.vergiNo}`}</span>}
          {veri.ilgili.trim() !== '' && <span>{`${z.ilgili}: ${veri.ilgili.trim()}`}</span>}
        </section>
        <section className="tc-tf-kutu">
          <h2>{z.teklif}</h2>
          <strong>{veri.baslik}</strong>
          <span>{`${z.para}: ${para}`}</span>
          {veri.teslimGun !== null && <span>{`${z.teslim}: ${String(veri.teslimGun)} ${z.gun}`}</span>}
        </section>
      </div>
      {giris !== '' && <p className="tc-tf-giris">{giris}</p>}
      <table className="tc-tf-tablo">
        <thead>
          <tr>
            <th className="tc-tf-sag">#</th><th>{z.kalem}</th><th className="tc-tf-sag">{z.miktar}</th><th className="tc-tf-sag">{z.birimFiyat}</th>
            {iskontolu && <th className="tc-tf-sag">{z.iskontolu}</th>}<th className="tc-tf-sag">{`${z.tutar} (${para})`}</th>
          </tr>
        </thead>
        <tbody>
          {veri.satirlar.map((s, i) => (
            <tr key={s.id}>
              <td className="tc-tf-sag">{i + 1}</td>
              <td>{s.kod !== null && <span className="tc-tf-kod">{s.kod}</span>}{s.ad}</td>
              <td className="tc-tf-sag">{`${formSayisi(s.miktar, dil, 'miktar')}${s.birim ? ` ${s.birim}` : ''}`}</td>
              <td className="tc-tf-sag">{formSayisi(s.birimFiyat, dil, 'fiyat')}</td>
              {iskontolu && <td className="tc-tf-sag">{formSayisi(s.iskontoluFiyat, dil, 'fiyat')}</td>}
              <td className="tc-tf-sag">{formSayisi(s.tutar, dil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {veri.toplam !== null && (
        <dl className="tc-tf-toplam">
          {iskontolu && <div><dt>{z.ara}</dt><dd>{formSayisi(veri.toplam.araToplam, dil)}</dd></div>}
          {iskontolu && <div><dt>{`${z.iskonto} (%${formSayisi(veri.iskontoOrani, dil, 'miktar')})`}</dt><dd>{`−${formSayisi(veri.toplam.iskontoTutari, dil)}`}</dd></div>}
          <div><dt>{z.kdvHaric}</dt><dd>{formSayisi(veri.toplam.kdvHaric, dil)}</dd></div>
          <div><dt>{`${z.kdv} (%${formSayisi(veri.toplam.kdvOrani, dil, 'miktar')})`}</dt><dd>{formSayisi(veri.toplam.kdvTutari, dil)}</dd></div>
          <div className="tc-tf-genel"><dt>{z.genel}</dt><dd>{`${formSayisi(veri.toplam.genelToplam, dil)} ${para}`}</dd></div>
        </dl>
      )}
      <section className="tc-tf-bolum">
        <h2>{z.kosullar}</h2>
        <dl className="tc-tf-meta">
          <div><dt>{z.teslim}</dt><dd>{veri.teslimGun === null ? '—' : `${String(veri.teslimGun)} ${z.gun}`}</dd></div>
          {veri.terminTarihi !== null && <div><dt>{z.termin}</dt><dd>{formTarihi(veri.terminTarihi, dil)}</dd></div>}
          <div><dt>{z.odeme}</dt><dd>{veri.odemeKosulu ?? '—'}</dd></div>
          <div><dt>{z.gecerlilik}</dt><dd>{formTarihi(veri.gecerlilik, dil)}</dd></div>
        </dl>
      </section>
      {icerik.sartlar.length > 0 && (
        <section className="tc-tf-bolum">
          <h2>{z.sartlar}</h2>
          <ol className="tc-tf-sartlar">{icerik.sartlar.map((s, i) => <li key={`${String(i)}-${s}`}>{s}</li>)}</ol>
        </section>
      )}
      {(icerik.imza1 !== '' || icerik.imza2 !== '') && (
        <div className="tc-tf-imzalar">
          <div className="tc-tf-imza">{icerik.imza1}<small>{kurum.unvan}</small></div>
          <div className="tc-tf-imza">{icerik.imza2}<small>{veri.musteri.ad ?? ''}</small></div>
        </div>
      )}
      <footer className="tc-tf-alt"><span>{alt}</span><span>{`${veri.no} · ${z.surum} ${String(veri.surumNo)}`}</span></footer>
    </article>
  );
});
