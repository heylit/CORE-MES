import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeklifIstekFormuCevabi, TeklifIstekFormuIcerigi } from '#paylasilan/sozlesme/satin-alma.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, Kart, useBildirim } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { useKurumLogosu } from '../../../ortak/veri/kurum-logosu.ts';
import { antetBosMu, istekFormuHTML, kagidiOlcekle } from '../merkez/istek-formu.ts';
import type { PurchaseRequest, Supplier } from '../merkez/tipler.ts';
import { SURE, cagri } from '../talep/ortak.ts';
import '../merkez/styles.css';
import './istek-formu-ayari.css';

const ANAHTAR = ['satin-alma', 'teklif-istek-formu'] as const;
// Ön izlemenin örnek talebi ve tedarikçisi: uydurma veri; gerçek form teklif iste penceresinde basılır.
const ORNEK_TALEP = {
  no: 'ST-ORN-0001', title: 'ORN- mil işleme için çubuk malzeme', needDate: '2026-12-10',
  items: [
    { id: 'k1', name: 'ORN- Yuvarlak çubuk Ø50', spec: 'ORN- S235, 6000 mm', qty: 400, unit: 'kg' },
    { id: 'k2', name: 'ORN- Sac levha 10 mm', spec: '', qty: 8, unit: 'adet' },
  ],
} as unknown as PurchaseRequest;
const ORNEK_TEDARIKCI = { id: 'orn', name: 'ORN- Tedarikçi A', contact: 'ORN- Yetkili' } as unknown as Supplier;
const ORNEK_SON_TARIH = '2026-11-22';
const ALANLAR = '{TEDARIKCI} {YETKILI} {TALEP_NO} {KONU} {IHTIYAC} {SON_TARIH} {FIRMA}';

interface Taslak { baslik: string; giris: string; istenenler: string; kapanis: string; imza1: string; imza2: string; alt: string }
const taslakOf = (i: TeklifIstekFormuIcerigi): Taslak => ({ ...i, istenenler: i.istenenler.join('\n') });
const icerikOf = (t: Taslak): TeklifIstekFormuIcerigi => ({ ...t, istenenler: t.istenenler.split('\n').map((x) => x.trim()).filter(Boolean) });
const iletisi = (h: unknown) => (h instanceof ApiHatasi && h.durum === 409 ? 'Form bu arada değişti; güncel metin yüklendi, değişikliğinizi yeniden yapın.'
  : h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Form kaydedilemedi; yeniden deneyin.');

// Kağıt merkezdeki teklif iste penceresiyle aynı işlevden basılır (her değer kaçışlı); ön izleme ile çıktı ayrışmasın diye tek kaynak.
function Kagit({ html }: { html: string }) {
  const kap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (kap.current) { kap.current.innerHTML = html; kagidiOlcekle(kap.current); } }, [html]);
  useEffect(() => {
    const k = kap.current;
    if (!k || typeof ResizeObserver !== 'function') return undefined;
    const g = new ResizeObserver(() => { kagidiOlcekle(k); });
    g.observe(k);
    return () => { g.disconnect(); };
  }, []);
  return <div className="sa-kok sa-ifa-kagit" aria-label="Formun ön izlemesi"><div className="doc-wrap" ref={kap} /></div>;
}

// Sistem Ayarları > Formlar > Teklif isteme formu. Antet siparişlerin teklif formundaki firma bilgisidir (orada düzenlenir).
export function IstekFormuAyari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const form = useQuery({ queryKey: ANAHTAR, queryFn: () => cagri.get('/satin-alma-teklif-istek-formu', SURE) });
  const logo = useKurumLogosu();
  const [taslak, taslakYaz] = useState<Taslak | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const kaydet = useMutation({
    mutationFn: ({ surum, icerik }: { surum: number; icerik: TeklifIstekFormuIcerigi }) => cagri.post('/satin-alma-teklif-istek-formu/kaydet', { govde: { surum, icerik }, ...SURE }),
    onSuccess: (c: TeklifIstekFormuCevabi) => { istemci.setQueryData(ANAHTAR, c); taslakYaz(null); hataYaz(null); bildir('tamam', 'Teklif isteme formu kaydedildi.'); },
    onError: (h) => {
      hataYaz(iletisi(h));
      if (h instanceof ApiHatasi && h.durum === 409) { taslakYaz(null); void istemci.invalidateQueries({ queryKey: ANAHTAR }); }
    },
  });
  if (form.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (form.isError) return <DurumKutusu durum="hata" mesaj="Teklif isteme formu alınamadı." yenile={() => { void form.refetch(); }} />;
  const c = form.data;
  const t = taslak ?? taslakOf(c.icerik);
  const degisti = taslak !== null && JSON.stringify(icerikOf(taslak)) !== JSON.stringify(c.icerik);
  const yaz = (ad: keyof Taslak) => (e: { target: { value: string } }) => { taslakYaz({ ...t, [ad]: e.target.value }); };
  return (
    <div className="sa-ifa">
      <Kart baslik="Form metni" simge="edit">
        <div className="sa-ifa-alanlar">
          <p className="sa-ifa-not">Talebin Teklif al adımında "Form hazırla (PDF)" bu metinle açılır; orada bir kerelik değiştirilebilir. Kalemler talepten gelir.
            Antet (firma adı, adres) Formlar &gt; Teklif formu'ndaki firma bilgisidir; logo Sistem Ayarları &gt; Genel'deki kurum logosudur. Kullanılabilen alanlar: {ALANLAR}. Değeri olmayan alanın geçtiği satır basılmaz.</p>
          <Girdi etiket="Başlık" value={t.baslik} maxLength={80} onChange={yaz('baslik')} />
          <CokSatir etiket="Giriş" rows={3} value={t.giris} maxLength={1000} onChange={yaz('giris')} />
          <CokSatir etiket="Teklifte istenen bilgiler" ipucu="Her satır bir madde; en çok 20." rows={7} value={t.istenenler} onChange={yaz('istenenler')} />
          <CokSatir etiket="Kapanış" rows={3} value={t.kapanis} maxLength={1000} onChange={yaz('kapanis')} />
          <div className="sa-ifa-cift">
            <Girdi etiket="İmza 1 başlığı" ipucu="Boşsa imza kutusu basılmaz." value={t.imza1} maxLength={60} onChange={yaz('imza1')} />
            <Girdi etiket="İmza 2 başlığı" value={t.imza2} maxLength={60} onChange={yaz('imza2')} />
          </div>
          <Girdi etiket="Alt bilgi" value={t.alt} maxLength={200} onChange={yaz('alt')} />
          {hata && <p className="sa-ifa-hata" role="alert">{hata}</p>}
          <div className="sa-ifa-dugmeler">
            <Dugme tur="birincil" simge="check" disabled={!degisti} yukleniyor={kaydet.isPending} onClick={() => kaydet.mutate({ surum: c.surum, icerik: icerikOf(t) })}>Kaydet</Dugme>
            <Dugme disabled={taslak === null || kaydet.isPending} onClick={() => { taslakYaz(null); hataYaz(null); }}>Vazgeç</Dugme>
          </div>
        </div>
      </Kart>
      <div className="sa-ifa-sag">
        {antetBosMu(c.kurum) && <p className="sa-ifa-not" role="note">Antet boş; boşken basılmaz. Firma adı ve adresi bu sayfadaki "Teklif formu" sekmesinde, Firma bilgileri bölümünde girilir.</p>}
        {logo.isSuccess && !logo.data.logo && <p className="sa-ifa-not" role="note">Kurum logosu yüklü değil; Sistem Ayarları &gt; Genel'den yükleyin. Yüklenince formun sol üstüne basılır.</p>}
        <Kagit html={istekFormuHTML(ORNEK_TALEP, ORNEK_TEDARIKCI, ORNEK_SON_TARIH, icerikOf(t), c.kurum, '', '2026-11-19', logo.data?.logo ?? null)} />
      </div>
    </div>
  );
}
