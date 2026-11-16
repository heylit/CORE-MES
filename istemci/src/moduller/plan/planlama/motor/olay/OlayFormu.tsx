import { useCallback, useState, type ReactNode } from 'react';
import { Pencere, Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { AtolyeOlayi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { KaynakAdlari } from '../../kaynak-kodu.tsx';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { useAtolyeKomutlari, useOtomatikUygula } from '../atolye/gonder.ts';
import { saatOku, simdiSaati } from '../kurallar.ts';
import '../motor.css';

// Olay ekle (1982 a; 3308-1 a): arıza, acil sipariş, malzeme gecikmesi, personel eksikliği ya da fason gecikmesi. Form her planlama sayfasının
// üstündeki şeritten açılır; olay sunucuda çalışmaya yazılır, motor planı kurarken uygular.
export type OlayTuru = AtolyeOlayi['tip'];
type OlayAlani = 'm' | 'bas' | 'saat' | 'urun' | 'adet' | 'termin' | 'kod' | 'gun' | 'vardiya' | 'grup' | 'n' | 'f' | 'tarih';
const OLAY_TURLERI: [OlayTuru, string][] = [['ariza', 'Arıza'], ['acil', 'Acil sipariş'], ['malzeme', 'Malzeme gecikmesi'], ['eksik', 'Personel eksik'], ['fason', 'Fason gecikmesi']];
const gunFarki = (bas: string | undefined, gun: string): number | null => {
  const a = Date.parse(`${(bas ?? '').slice(0, 10)}T00:00:00Z`), b = Date.parse(`${gun}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
};

interface FormOzellikleri { c: PlanlamaCalismasi; ad: KaynakAdlari; ekle: (o: AtolyeOlayi) => Promise<boolean>; kapat: () => void; on?: OlayTuru | undefined }

export function OlayFormu({ c, ad, ekle, kapat, on }: FormOzellikleri) {
  const D = c.D;
  const tezgahlar = D.tezgahlar; const urunler = D.urunler; const malzemeler = D.malzemeler ?? []; const fasoncular = D.fasoncular ?? [];
  const vardiyalar = (D.vardiyalar ?? []).flatMap((v) => (typeof v.id === 'string' ? [{ id: v.id, ad: typeof v.ad === 'string' ? v.ad : v.id }] : []));
  const gruplar = [...new Set(tezgahlar.map((t) => (typeof t.grup === 'string' ? t.grup : '')).filter(Boolean))];
  const [tur, setTur] = useState<OlayTuru>(on ?? 'ariza');
  const [f, setF] = useState<Record<OlayAlani, string>>({ m: tezgahlar[0]?.id ?? '', bas: '', saat: '8', urun: urunler[0]?.id ?? '', adet: '1', termin: '',
    kod: malzemeler[0]?.kod ?? '', gun: '1', vardiya: vardiyalar[0]?.id ?? '', grup: gruplar[0] ?? 'ayar', n: '1', f: fasoncular[0]?.id ?? '', tarih: '' });
  const [gidiyor, setGidiyor] = useState(false);
  const al = (k: OlayAlani) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sayi = (k: OlayAlani) => Number(f[k]);
  // Boş başlangıç "şimdi" demektir; geçmiş bir an seçilse de olay şimdiden başlar (2506 a).
  const basSaati = f.bas ? saatOku(D, f.bas.replace('T', ' ')) : null;
  const basGecerli = !f.bas || basSaati !== null;
  const olay = ((): AtolyeOlayi | null => {
    switch (tur) {
      case 'ariza': return f.m && sayi('saat') > 0 && basGecerli ? { tip: 'ariza', m: f.m, bas: basSaati ?? simdiSaati(c, Date.now()), saat: sayi('saat') } : null;
      case 'acil': return f.urun && Number.isInteger(sayi('adet')) && sayi('adet') > 0 && f.termin ? { tip: 'acil', urun: f.urun, adet: sayi('adet'), termin: f.termin.replace('T', ' ') } : null;
      case 'malzeme': return f.kod && Number.isInteger(sayi('gun')) && sayi('gun') >= 1 ? { tip: 'malzeme', kod: f.kod, gun: sayi('gun') } : null;
      case 'eksik': {
        const g = f.tarih ? gunFarki(D.meta?.baslangic, f.tarih) : null;
        return g !== null && g >= 0 && f.vardiya && Number.isInteger(sayi('n')) && sayi('n') >= 1 ? { tip: 'eksik', gun: g, vardiya: f.vardiya, grup: f.grup, n: sayi('n') } : null;
      }
      case 'fason': return f.f && Number.isInteger(sayi('gun')) && sayi('gun') >= 1 ? { tip: 'fason', f: f.f, gun: sayi('gun') } : null;
    }
  })();
  const gonder = async () => {
    if (!olay || gidiyor) return;
    setGidiyor(true);
    // Arızanın başlangıcı gönderme anının saatinden (2506 a): form uzun açık kalsa da olay geçmişe yazılmaz.
    const x = olay.tip === 'ariza' ? { ...olay, bas: Math.max(simdiSaati(c, Date.now()), basSaati ?? 0) } : olay;
    if (await ekle(x)) kapat(); else setGidiyor(false);
  };
  const alan = (k: OlayAlani, etiket: string, ic: ReactNode) => <><label htmlFor={`tc-pym-of-${k}`}>{etiket}</label>{ic}</>;
  const secim = (k: OlayAlani, l: { id: string; ad: string }[]) => (
    <select id={`tc-pym-of-${k}`} value={f[k]} onChange={al(k)}>{l.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}</select>
  );
  const giris = (k: OlayAlani, tip: 'number' | 'date' | 'datetime-local', min?: number) => (
    <input id={`tc-pym-of-${k}`} type={tip} min={min} value={f[k]} onChange={al(k)} />
  );
  return (
    <div className="tc-pym-of">
      <div className="tc-pym-of-tur" role="group" aria-label="Olay türü">
        {OLAY_TURLERI.map(([t, etiket]) => <button key={t} type="button" aria-pressed={tur === t} onClick={() => setTur(t)}>{etiket}</button>)}
      </div>
      {tur === 'ariza' && <>
        {alan('m', 'Tezgâh', secim('m', tezgahlar.map((t) => { const k = ad.kaynak(t.id); return { id: t.id, ad: t.ad && t.ad !== k ? `${k} · ${t.ad}` : k }; })))}
        {alan('bas', 'Başlangıç (boşsa şimdi)', giris('bas', 'datetime-local'))}
        {alan('saat', 'Süre (saat)', giris('saat', 'number', 1))}
      </>}
      {tur === 'acil' && <>
        {alan('urun', 'Ürün', secim('urun', urunler.map((u) => ({ id: u.id, ad: u.ad ?? u.id }))))}
        {alan('adet', 'Adet', giris('adet', 'number', 1))}
        {alan('termin', 'Termin', giris('termin', 'datetime-local'))}
      </>}
      {tur === 'malzeme' && <>
        {alan('kod', 'Malzeme', secim('kod', malzemeler.map((x) => ({ id: x.kod, ad: x.ad ?? x.kod }))))}
        {alan('gun', 'Gecikme (gün)', giris('gun', 'number', 1))}
      </>}
      {tur === 'eksik' && <>
        {alan('tarih', 'Gün', giris('tarih', 'date'))}
        {alan('vardiya', 'Vardiya', secim('vardiya', vardiyalar))}
        {alan('grup', 'Kim eksik', secim('grup', [...gruplar.map((g) => ({ id: g, ad: `${ad.grup(g)} personeli` })), { id: 'ayar', ad: 'Ayarcı' }]))}
        {alan('n', 'Kişi sayısı', giris('n', 'number', 1))}
      </>}
      {tur === 'fason' && <>
        {alan('f', 'Fasoncu', secim('f', fasoncular.map((x) => ({ id: x.id, ad: x.ad ?? x.id }))))}
        {alan('gun', 'Gecikme (gün)', giris('gun', 'number', 1))}
      </>}
      <p className="tc-pym-of-not">Olay çalışmaya yazılır; plan bir sonraki uygulamada hesaba katar.</p>
      <div className="tc-pym-of-eylem">
        <button type="button" className="tc-dugme" onClick={kapat}>Vazgeç</button>
        <button type="button" className="tc-dugme tc-dugme-birincil" aria-disabled={!olay || gidiyor} onClick={() => void gonder()}>
          <Simge ad="plus" boyut="k" />{gidiyor ? 'Ekleniyor' : 'Olayı ekle'}
        </button>
      </div>
    </div>
  );
}

// Şeridin "Olay ekle" düğmesinin penceresi; yazamayan için açılmaz (çağıran düğmeyi pasif bırakır). Olay çalışmayı değiştirdiyse plan
// kendiliğinden uygulanır (2053-1 a); pencere iskelette her sayfada durduğu için kanca burada bir kez kurulur.
export function OlayPenceresi({ o, c, ad, on, kapat }: {
  o: Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'yenile' | 'calisma' | 'depo'>; c: PlanlamaCalismasi; ad: KaynakAdlari; on: OlayTuru | null; kapat: () => void;
}) {
  const { bildir } = useBildirim();
  const uyar = useCallback((ileti: string) => bildir('hata', ileti), [bildir]);
  useOtomatikUygula(o, uyar);
  const { olayEkle } = useAtolyeKomutlari(o, c);
  return (
    <Pencere acik={on !== null} kapat={kapat} baslik="Olay ekle">
      {on !== null && (olayEkle
        ? <OlayFormu key={on} c={c} ad={ad} ekle={olayEkle} kapat={kapat} on={on} />
        : <p className="tc-pym-of-not">Olay eklemek plan yazma yetkisi ister.</p>)}
    </Pencere>
  );
}
