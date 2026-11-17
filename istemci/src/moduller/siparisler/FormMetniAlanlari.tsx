import { useState } from 'react';
import type { TeklifFormuIcerigi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, Girdi } from '../../ortak/arayuz/index.ts';
import { FORM_ALANLARI, SART_EN_COK } from './teklif-formu.ts';

interface Ozellikler { icerik: TeklifFormuIcerigi; degistir: (p: Partial<TeklifFormuIcerigi>) => void }

// Teklif formu metninin alanları: şablon ayarı (Sistem Ayarları) ve teklife özel metin (teklif formu penceresi) aynı parçayı kullanır.
export function FormMetniAlanlari({ icerik, degistir }: Ozellikler) {
  const [imlec, imlecYaz] = useState<{ alan: 'giris' | 'alt'; konum: number } | null>(null);
  const baslikHatasi = icerik.baslik.trim() === '' ? 'Form başlığı boş olamaz.' : undefined;
  const alanEkle = (alan: string) => {
    const hedef = imlec?.alan ?? 'giris';
    const metin = icerik[hedef];
    const konum = Math.min(imlec?.konum ?? metin.length, metin.length);
    degistir({ [hedef]: `${metin.slice(0, konum)}${alan}${metin.slice(konum)}` });
    imlecYaz({ alan: hedef, konum: konum + alan.length });
  };
  const imlecTut = (alan: 'giris' | 'alt') => (o: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => imlecYaz({ alan, konum: o.currentTarget.selectionStart ?? o.currentTarget.value.length });
  return (
    <>
      <Girdi etiket="Form başlığı" required autoComplete="off" maxLength={80} value={icerik.baslik} hata={baslikHatasi} onChange={(o) => degistir({ baslik: o.target.value })} />
      <CokSatir
        etiket="Giriş metni"
        ipucu="Boş bırakılırsa basılmaz."
        rows={7}
        maxLength={1000}
        value={icerik.giris}
        onChange={(o) => { degistir({ giris: o.target.value }); imlecTut('giris')(o); }}
        onSelect={imlecTut('giris')}
      />
      <div className="tc-tf-cipler" role="group" aria-label="Alan ekle">
        {FORM_ALANLARI.map((a) => <button key={a} type="button" className="tc-tf-cip" aria-label={`${a} alanını ekle`} onClick={() => alanEkle(a)}>{a}</button>)}
      </div>
      <p className="tc-tf-ipucu">Alan, imlecin durduğu yere eklenir; basarken teklifin bilgisiyle dolar.</p>
      <Girdi etiket="İmza 1 (firma)" ipucu="Onay başlığının altında, çizginin altına basılır: ad ya da ünvan." autoComplete="off" maxLength={60} value={icerik.imza1} onChange={(o) => degistir({ imza1: o.target.value })} />
      <Girdi etiket="İmza 2 (müşteri)" ipucu="Çizginin altına basılır: ad ya da ünvan." autoComplete="off" maxLength={60} value={icerik.imza2} onChange={(o) => degistir({ imza2: o.target.value })} />
      <Girdi
        etiket="Alt bilgi"
        autoComplete="off"
        maxLength={200}
        value={icerik.alt}
        onChange={(o) => { degistir({ alt: o.target.value }); imlecTut('alt')(o); }}
        onSelect={imlecTut('alt')}
      />
    </>
  );
}

export function SartAlanlari({ icerik, degistir }: Ozellikler) {
  const [yeniSart, yeniSartYaz] = useState('');
  const sartlar = icerik.sartlar;
  const sartTasi = (i: number, yon: -1 | 1) => {
    const s = [...sartlar];
    const j = i + yon;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j] ?? '', s[i] ?? ''];
    degistir({ sartlar: s });
  };
  const sartEkle = () => {
    const metin = yeniSart.trim();
    if (metin === '' || sartlar.length >= SART_EN_COK) return;
    degistir({ sartlar: [...sartlar, metin] });
    yeniSartYaz('');
  };
  return (
    <>
      {sartlar.length > 0 && (
        <ol className="tc-tf-sartlar-liste">
          {sartlar.map((s, i) => (
            <li key={`${String(i)}-${s}`}>
              <span>{s}</span>
              <Dugme simge="up" aria-label={`${String(i + 1)}. şartı yukarı al`} disabled={i === 0} onClick={() => sartTasi(i, -1)} />
              <Dugme simge="down" aria-label={`${String(i + 1)}. şartı aşağı al`} disabled={i === sartlar.length - 1} onClick={() => sartTasi(i, 1)} />
              <Dugme simge="trash" aria-label={`${String(i + 1)}. şartı sil`} onClick={() => degistir({ sartlar: sartlar.filter((_, j) => j !== i) })} />
            </li>
          ))}
        </ol>
      )}
      <div className="tc-tf-ekle">
        <Girdi
          etiket="Yeni şart"
          autoComplete="off"
          maxLength={300}
          value={yeniSart}
          onChange={(o) => yeniSartYaz(o.target.value)}
          onKeyDown={(o) => { if (o.key === 'Enter') { o.preventDefault(); sartEkle(); } }}
        />
        <Dugme simge="plus" onClick={sartEkle} disabled={yeniSart.trim() === '' || sartlar.length >= SART_EN_COK}>Ekle</Dugme>
      </div>
    </>
  );
}
