import { useQuery } from '@tanstack/react-query';
import type { FaizTuru, OranOzeti } from '#paylasilan/sozlesme/finans.ts';
import { FAIZ_TURLERI, ORAN_ESKIME_GUNU } from '#paylasilan/sozlesme/finansman.ts';
import { Kart, Rozet, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { kisaTarih, sayiMetni, tarih } from '../bicim.ts';
import { sayi } from '../donustur.ts';
import { FAIZ_ADI, oranEskiMi } from '../../KurFaizSeridi.tsx';

// 2238: Ayarlar > Kurlar ve faiz'in matris görünümü; kullanıcının dosyasıyla aynı düzen (satır oran, sütun para birimi).
const MATRIS_BIRIMLERI = ['TRY', 'USD', 'EUR', 'GBP'] as const;
type Hucre = { deger: string; gun: string; eski: boolean } | null;
interface MatrisSatiri { anahtar: string; ad: string; not: string | null; basamak: number; hucre: (p: string) => Hucre }

function matrisSatirlari(o: OranOzeti): MatrisSatiri[] {
  const kur = (alan: 'alis' | 'satis') => (p: string): Hucre => {
    const k = o.kurlar.find((x) => x.paraBirimi === p);
    return k ? { deger: k[alan], gun: k.tarih, eski: false } : null;
  };
  const faiz = (t: FaizTuru) => (p: string): Hucre => {
    const f = o.faizler.find((x) => x.tur === t && x.paraBirimi === p);
    return f ? { deger: f.yillikYuzde, gun: f.gecerlilikBaslangic, eski: oranEskiMi(f.gecerlilikBaslangic, o.bugun) } : null;
  };
  return [
    { anahtar: 'alis', ad: 'Kur alış (TL)', not: null, basamak: 4, hucre: kur('alis') },
    { anahtar: 'satis', ad: 'Kur satış (TL)', not: null, basamak: 4, hucre: kur('satis') },
    ...FAIZ_TURLERI.map((t) => ({ anahtar: t, ad: `${FAIZ_ADI[t]} faizi yıllık %`, not: t === 'mevduat' ? 'stopaj sonrası' : null, basamak: 2, hucre: faiz(t) })),
  ];
}

export function OranMatrisiKarti({ bugun }: { bugun: string }) {
  const ozet = useQuery({ queryKey: ['finans', 'oran-ozeti'], queryFn: () => api.get<OranOzeti>('/finans/oran-ozeti') });
  const o = ozet.data;
  const satirlar = o ? matrisSatirlari(o) : [];
  const eskiler = satirlar.flatMap((s) => MATRIS_BIRIMLERI.filter((p) => s.hucre(p)?.eski).map((p) => `${s.ad.split(' ')[0]} ${p}`));
  const sutunlar: Sutun<MatrisSatiri>[] = [
    { anahtar: 'oran', baslik: 'Oran', hucre: (s) => <span><b>{s.ad}</b>{s.not && <small className="tc-fa-alt-satir">{s.not}</small>}</span>, csv: (s) => s.ad },
    ...MATRIS_BIRIMLERI.map((p): Sutun<MatrisSatiri> => ({
      anahtar: p, baslik: p, hizala: 'sag', mono: true,
      csv: (s) => { const h = s.hucre(p); return h ? sayiMetni(sayi(h.deger), s.basamak) : ''; },
      hucre: (s) => {
        const h = s.hucre(p);
        if (!h) return <span className="tc-fa-soluk">—</span>;
        return (
          <span>
            {sayiMetni(sayi(h.deger), s.basamak)}
            <small className="tc-fa-alt-satir">{h.eski ? <Rozet ton="uyari">{kisaTarih(h.gun)} · eski</Rozet> : kisaTarih(h.gun)}</small>
          </span>
        );
      },
    })),
  ];
  return (
    <Kart baslik="Güncel oranlar" simge="grid" baslikEki={<span className="tc-fa-soluk">Hücrede değer ve geçerlilik günü{o ? `; bugün ${tarih(bugun)}` : ''}</span>}>
      {eskiler.length > 0 && (
        <p className="tc-fa-not" role="status">
          <Rozet ton="uyari">{eskiler.length} oran {ORAN_ESKIME_GUNU} günden eski</Rozet> {eskiler.join(', ')}. Eski oranla hesap sürer; yenisini girin.
        </p>
      )}
      <Tablo etiket="Güncel oranlar" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.anahtar} bosMesaj={ozet.isError ? 'Oranlar okunamadı.' : 'Yükleniyor.'} />
      <p className="tc-fa-not">Yeni oran başlangıç gününden sonrasını etkiler; eski oran silinmez. Faiz yıllık yüzdedir, günlük karşılık yıllık / 365.</p>
    </Kart>
  );
}

interface Kullanim { yer: string; oran: string }
// Kural sistemde sabittir (paylasilan/sozlesme/finansman.ts ORAN_KULLANIMLARI; kararlar 2238-1..5); burada yalnız gösterilir.
const KULLANIMLAR: Kullanim[] = [
  { yer: 'Muhasebe kaydı, değerleme', oran: 'Kur alış' },
  { yer: 'Satın alma maliyeti', oran: 'Kur satış' },
  { yer: 'Satın alma vadesi', oran: 'Kredi faizi (borçlu) ve mevduat faizi (nakit fazlası) yan yana' },
  { yer: 'Plan ve proje maliyetinde bekleme', oran: 'TRY kredi faizi' },
  { yer: 'Politika faizi', oran: 'Bilgi için tutulur; satış vadesi ve sözleşme endeksi ayrı işte gelecek' },
];
const KULLANIM_SUTUNLARI: Sutun<Kullanim>[] = [
  { anahtar: 'yer', baslik: 'Nerede', hucre: (k) => k.yer },
  { anahtar: 'oran', baslik: 'Hangi oran', hucre: (k) => k.oran },
];

export function KullanimKarti() {
  return (
    <Kart baslik="Hangi oran nerede kullanılır" simge="list" baslikEki={<span className="tc-fa-soluk">Salt okunur; kural sistemde sabittir</span>}>
      <Tablo etiket="Oranların kullanım yeri" sutunlar={KULLANIM_SUTUNLARI} satirlar={KULLANIMLAR} satirAnahtari={(k) => k.yer} bosMesaj="" />
    </Kart>
  );
}
