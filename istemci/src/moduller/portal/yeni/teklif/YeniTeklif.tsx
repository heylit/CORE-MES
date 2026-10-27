import { useState, type FormEvent } from 'react';
import { CokSatir, Dugme, DurumKutusu, Girdi, SayfaBasligi, Secim } from '../../../../ortak/arayuz/index.ts';
import { gunEkle, isoGun, sayiOku } from '../bicim.ts';
import type { GorunumOzellikleri } from '../sekmeler.ts';
import type { Kalem, KoleksiyonAdi } from '../tipler.ts';
import { belgeNoAl, hataMetni, usePortal, usePortalDeposu, yeniKimlik } from '../veri.ts';
import { BIRIMLER, musteriler, talepYaz, type Talep } from './ortak.tsx';
import './teklif.css';

// Yeni teklif (prototip newSale): satış ekibi müşteri adına talep açar; açılınca teklif hazırlama ekranına geçilir.

const KOLEKSIYONLAR: readonly KoleksiyonAdi[] = ['parties'];
const ISTENEN_GUN = 30;

export interface Satir { ad: string; miktar: string; birim: string }
const bosSatir = (): Satir => ({ ad: '', miktar: '', birim: BIRIMLER[0] });

// Prototip readRows: tamamen boş satır atlanır; dolu satırda ad ve sıfırdan büyük miktar gerekir.
export function satirlariOku(satirlar: readonly Satir[]): { kalemler: Kalem[] } | { hata: string } {
  const kalemler: Kalem[] = [];
  for (const [i, s] of satirlar.entries()) {
    const ad = s.ad.trim();
    const miktar = sayiOku(s.miktar);
    if (!ad && Number.isNaN(miktar)) continue;
    if (!ad || !(miktar > 0)) return { hata: `${String(i + 1)}. kalemde ad ve sıfırdan büyük miktar gerekli.` };
    kalemler.push({ name: ad, qty: miktar, unit: s.birim, spec: '', price: null });
  }
  return kalemler.length ? { kalemler } : { hata: 'En az bir kalem ekleyin.' };
}

export function YeniTeklif(_: GorunumOzellikleri) {
  const p = usePortal();
  const { depo, yukleniyor, hata: okumaHatasi, yenile } = usePortalDeposu(KOLEKSIYONLAR);
  const liste = musteriler(depo);
  const [musteri, setMusteri] = useState('');
  const [konu, setKonu] = useState('');
  const [istenen, setIstenen] = useState(() => gunEkle(p.simdi, ISTENEN_GUN));
  const [not, setNot] = useState('');
  const [satirlar, setSatirlar] = useState<Satir[]>([bosSatir()]);
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  if (yukleniyor) return <DurumKutusu durum="yukleniyor" mesaj="Müşteriler yükleniyor…" />;
  if (okumaHatasi) return <DurumKutusu durum="hata" mesaj="Müşteriler okunamadı." yenile={yenile} />;
  if (!p.izin.gonderimAcik('newsale')) return <DurumKutusu durum="bos" mesaj="Teklif talebi açma yetkiniz yok." />;

  const secilen = musteri || liste[0]?.id || '';
  const satirDegistir = (i: number, alan: keyof Satir, deger: string) => {
    setSatirlar((s) => s.map((x, j) => (j === i ? { ...x, [alan]: deger } : x)));
  };

  const gonder = async (o: FormEvent) => {
    o.preventDefault();
    if (gonderiliyor) return;
    if (!secilen || !depo.parties[secilen]) { setHata('Müşteri seçin.'); return; }
    if (!konu.trim()) { setHata('Konu yazın.'); return; }
    const okunan = satirlariOku(satirlar);
    if ('hata' in okunan) { setHata(okunan.hata); return; }
    setHata(null);
    setGonderiliyor(true);
    try {
      const an = new Date().toISOString();
      const q: Omit<Talep, 'surum'> = {
        id: yeniKimlik('q'), no: await belgeNoAl('requests', 'TKL', 3), customerId: secilen, title: konu.trim(), currency: 'TRY',
        neededBy: istenen, createdAt: an, status: 'new', items: okunan.kalemler, note: not.trim(), photos: [], versions: [],
        history: [{ at: an, by: 'firm', u: p.kisiKimligi, text: 'Teklif talebi satış ekibince müşteri adına açıldı' }],
      };
      await talepYaz(q);
      p.git('sale', q.id);
    } catch (e) {
      setHata(hataMetni(e, 'Talep açılamadı.'));
      setGonderiliyor(false);
    }
  };

  return (
    <div className="tc-pt-teklif">
      <Dugme className="tc-pt-teklif-don" simge="chev-left" onClick={() => p.git('sales')}>Teklif taleplerine dön</Dugme>
      <SayfaBasligi baslik="Yeni teklif" simge="tag" alt="Müşteri adına teklif talebi açın; ardından fiyatları girip teklifi gönderin." />
      <form className="tc-pt-pano tc-pt-teklif-form" aria-label="Yeni teklif" noValidate onSubmit={(o) => { void gonder(o); }}>
        <div className="tc-pt-teklif-satir">
          <Secim
            etiket="Müşteri" required value={secilen} onChange={(o) => setMusteri(o.target.value)}
            secenekler={liste.map((f) => ({ deger: f.id, baslik: f.name }))}
          />
          <Girdi etiket="Konu" required value={konu} onChange={(o) => setKonu(o.target.value)} placeholder="2027 yılı braket ihtiyacı" />
          <Girdi etiket="İstenen teslim tarihi" type="date" min={isoGun(p.simdi)} value={istenen} onChange={(o) => setIstenen(o.target.value)} />
        </div>
        <h3>Kalemler</h3>
        <div className="tc-pt-teklif-kaydir">
          <table className="tc-pt-teklif-tablo tc-pt-teklif-kalemler">
            <thead><tr><th>Kalem</th><th>Miktar</th><th>Birim</th></tr></thead>
            <tbody>
              {satirlar.map((s, i) => (
                // Satırlar yalnız sondan eklenip silinir; sıra kimliktir (prototip itemRowsEditor).
                <tr key={i}>
                  <td>
                    <input
                      className="tc-alan-kutu" type="text" aria-label={`Kalem ${String(i + 1)} adı`} placeholder="Ürün veya hizmet"
                      value={s.ad} onChange={(o) => satirDegistir(i, 'ad', o.target.value)}
                    />
                  </td>
                  <td className="tc-pt-teklif-miktar">
                    <input
                      className="tc-alan-kutu" type="text" inputMode="decimal" aria-label={`Kalem ${String(i + 1)} miktar`} placeholder="Miktar"
                      value={s.miktar} onChange={(o) => satirDegistir(i, 'miktar', o.target.value)}
                    />
                  </td>
                  <td className="tc-pt-teklif-birim">
                    <select className="tc-alan-kutu" aria-label={`Kalem ${String(i + 1)} birim`} value={s.birim} onChange={(o) => satirDegistir(i, 'birim', o.target.value)}>
                      {BIRIMLER.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tc-pt-teklif-eylemler">
          <Dugme simge="plus" onClick={() => setSatirlar((s) => [...s, bosSatir()])}>Kalem ekle</Dugme>
          {satirlar.length > 1 && <Dugme simge="minus" onClick={() => setSatirlar((s) => s.slice(0, -1))}>Son kalemi sil</Dugme>}
        </div>
        <CokSatir etiket="Açıklama" value={not} onChange={(o) => setNot(o.target.value)} placeholder="Teknik resim revizyonu, malzeme, kaplama, teslim yeri" />
        {hata && <p className="tc-pt-teklif-hata" role="alert">{hata}</p>}
        <div className="tc-pt-teklif-alt">
          <span className="tc-pt-teklif-ipucu">Talep açılınca teklif hazırlama ekranı açılır.</span>
          <Dugme tur="birincil" type="submit" yukleniyor={gonderiliyor}>Talebi aç</Dugme>
        </div>
      </form>
    </div>
  );
}
