import { useEffect, useState } from 'react';
import { Girdi, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { Simge } from '../../../../ortak/arayuz/Simge.tsx';
import { para, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { Personel } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { adSoyadMetni, bugun, sayi, ucretTarihte, ucretUygula, uzunTarih, ZAM_NEDENLERI } from './kurallar.ts';
import { useYazma } from './yazma.ts';

type Yontem = 'tutar' | 'yuzde';
const YONTEMLER = [{ deger: 'tutar', baslik: 'Yeni brüt tutar' }, { deger: 'yuzde', baslik: 'Yüzde artış' }] as const;

// Gelecek ayın ilk günü önerilir (bugünkü pencere).
function onerilenTarih(gun: string): string {
  const [y, a] = gun.split('-').map(Number) as [number, number];
  return a === 12 ? `${y + 1}-01-01` : `${y}-${String(a + 1).padStart(2, '0')}-01`;
}

export function yeniBrut(mevcut: number, yontem: Yontem, deger: number): number {
  return yontem === 'yuzde' ? Math.round(mevcut * (1 + deger / 100) * 100) / 100 : deger;
}

// Ücret değişikliği: ileri tarihli olursa planlı satır olarak yazılır; kesinleşmiş bordrolar değişmez.
export function UcretPenceresi({ acik, kapat, p, o }: { acik: boolean; kapat: () => void; p: Personel; o: IkEkranOzellikleri }) {
  const komut = useIkKomutu();
  const yaz = useYazma();
  const gun = bugun();
  const mevcut = ucretTarihte(p, gun);
  const [tarih, tarihYaz] = useState(onerilenTarih(gun));
  const [yontem, yontemYaz] = useState<Yontem>('tutar');
  const [deger, degerYaz] = useState(String(mevcut));
  const [neden, nedenYaz] = useState<string>(ZAM_NEDENLERI[0]);
  const [not, notYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => {
    if (!acik) return;
    tarihYaz(onerilenTarih(gun)); yontemYaz('tutar'); degerYaz(String(mevcut)); nedenYaz(ZAM_NEDENLERI[0]); notYaz(''); hataYaz(null);
  }, [acik]);

  const nb = yeniBrut(mevcut, yontem, sayi(deger));
  const fark = mevcut ? Math.round((nb / mevcut - 1) * 1000) / 10 : null;
  const kilitli = Boolean(tarih) && o.depo.tur('pay').some((r) => r.snap && r.empId === p.id && `${r.donem ?? ''}-01` >= `${tarih.slice(0, 7)}-01`);

  const kaydet = async () => {
    if (!tarih || !(nb > 0)) { hataYaz('Tarih ve geçerli bir tutar girin.'); return; }
    if (p.iseGiris && tarih < p.iseGiris) { hataYaz('Yürürlük tarihi işe girişten önce olamaz.'); return; }
    const tamam = await yaz(
      komut.kaydet(ucretUygula(p, tarih, nb, neden, not.trim(), gun)),
      tarih > gun ? `Ücret değişikliği ${uzunTarih(tarih)} için planlandı.` : 'Ücret güncellendi.',
      'Ücret değişikliği kaydedilemedi.',
    );
    if (tamam) kapat();
  };

  return (
    <Pencere
      acik={acik} kapat={kapat} baslik={`${adSoyadMetni(p)}: ücret değişikliği`}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" yukleniyor={komut.calisiyor} onClick={() => { void kaydet(); }}>Kaydet</Dugme>
        </>
      )}
    >
      <div className="tc-ikp-form-alanlar">
        <Girdi etiket="Yürürlük tarihi" type="date" ipucu="Ayın ilk günü önerilir." value={tarih} onChange={(e) => { tarihYaz(e.target.value); }} />
        <Secim
          etiket="Yöntem" value={yontem} secenekler={YONTEMLER}
          onChange={(e) => { const y = e.target.value as Yontem; yontemYaz(y); degerYaz(y === 'yuzde' ? '10' : String(mevcut)); }}
        />
        <Girdi etiket="Değer" type="number" step="any" inputMode="decimal" value={deger} onChange={(e) => { degerYaz(e.target.value); }} />
        <Secim etiket="Neden" value={neden} secenekler={ZAM_NEDENLERI.map((n) => ({ deger: n, baslik: n }))} onChange={(e) => { nedenYaz(e.target.value); }} />
        <Girdi etiket="Not" className="tc-ikp-genis" placeholder="İsteğe bağlı" value={not} onChange={(e) => { notYaz(e.target.value); }} />
      </div>
      <dl className="tc-ikp-onizleme" aria-live="polite">
        <div><dt>Mevcut</dt><dd>{para(mevcut)}</dd></div>
        <div><dt>Yeni</dt><dd>{para(nb)}</dd></div>
        <div><dt>Fark</dt><dd>{fark === null ? YOK : `${fark >= 0 ? '+' : ''}${fark.toLocaleString('tr-TR')}%`}</dd></div>
      </dl>
      {kilitli && (
        <p className="tc-ikp-kilit">
          <Simge ad="lock" boyut="k" />
          <span>Bu tarihten sonra kesinleşmiş bordro var; o aylar değişmez. Fark ödemesini ilgili bordroya ek ödeme olarak girin.</span>
        </p>
      )}
      {hata && <p className="tc-ikp-hata" role="alert">{hata}</p>}
    </Pencere>
  );
}
