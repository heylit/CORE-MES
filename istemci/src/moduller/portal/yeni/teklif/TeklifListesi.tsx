import { useState } from 'react';
import { DurumKutusu, SayfaBasligi, SayiKarti, Sekmeler, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { gunFarki, kisaPara, para, sayi, tarih, yuzde, YOK } from '../bicim.ts';
import { talepDurumu } from '../kurallar.ts';
import type { GorunumOzellikleri } from '../sekmeler.ts';
import type { Depo, KoleksiyonAdi, TeklifTalebi } from '../tipler.ts';
import { usePortal, usePortalDeposu } from '../veri.ts';
import { DurumRozeti, sonSurumu, talepler, tutar, type Talep } from './ortak.tsx';
import './teklif.css';

// Müşteri teklif talepleri (prototip salesList): dört sayı, süzgeç sekmeleri ve talep listesi.

const KOLEKSIYONLAR: readonly KoleksiyonAdi[] = ['requests', 'parties'];

type Suzgec = 'all' | 'wait' | 'sent' | 'done';
const durum = (q: Talep, simdi: number) => talepDurumu(q as TeklifTalebi, simdi);
export const SUZGECLER: readonly (readonly [Suzgec, string, (q: Talep, simdi: number) => boolean])[] = [
  ['all', 'Tümü', () => true],
  ['wait', 'Sizden yanıt bekleyen', (q) => q.status === 'new' || q.status === 'revision'],
  ['sent', 'Müşteride', (q, s) => ['quoted', 'expired'].includes(durum(q, s))],
  ['done', 'Sonuçlanan', (q) => ['accepted', 'ordered', 'rejected'].includes(q.status)],
];

export interface ListeSayilari { bekleyen: number; kazanma: number | null; ilkYanit: number | null; musteride: number }

export function listeSayilari(d: Depo, simdi: number): ListeSayilari {
  const hepsi = talepler(d);
  const sonuclanan = hepsi.filter((q) => ['accepted', 'ordered', 'rejected'].includes(q.status));
  const kazanilan = sonuclanan.filter((q) => q.status !== 'rejected');
  const yanitlar = hepsi.flatMap((q) => {
    const ilk = q.versions?.[0]?.createdAt;
    return ilk ? [gunFarki(ilk, q.createdAt)] : [];
  });
  const musteride = hepsi.filter((q) => durum(q, simdi) === 'quoted').reduce((t, q) => {
    const v = sonSurumu(q);
    return v ? t + tutar(q, v).net : t;
  }, 0);
  return {
    bekleyen: hepsi.filter((q) => q.status === 'new' || q.status === 'revision').length,
    kazanma: sonuclanan.length ? (kazanilan.length / sonuclanan.length) * 100 : null,
    ilkYanit: yanitlar.length ? yanitlar.reduce((a, b) => a + b, 0) / yanitlar.length : null,
    musteride,
  };
}

export function TeklifListesi(_: GorunumOzellikleri) {
  const p = usePortal();
  const { depo, yukleniyor, hata, yenile } = usePortalDeposu(KOLEKSIYONLAR);
  const [suzgec, setSuzgec] = useState<Suzgec>('all');
  const { simdi, izin } = p;

  if (yukleniyor) return <DurumKutusu durum="yukleniyor" mesaj="Teklif talepleri yükleniyor…" />;
  if (hata) return <DurumKutusu durum="hata" mesaj="Teklif talepleri okunamadı." yenile={yenile} />;

  const hepsi = talepler(depo);
  const secili = SUZGECLER.find((s) => s[0] === suzgec) ?? SUZGECLER[0];
  const liste = hepsi.filter((q) => secili?.[2](q, simdi) ?? true).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const s = listeSayilari(depo, simdi);
  const firma = (id: string) => depo.parties[id]?.name ?? 'Silinmiş firma';

  const sutunlar: Sutun<Talep>[] = [
    {
      anahtar: 'talep', baslik: 'Talep',
      hucre: (q) => (
        <span className="tc-pt-teklif-hucre">
          <b>{q.title}</b>
          <small>{`${q.no} · ${String(q.items.length)} kalem${q.photos?.length ? ` · ${String(q.photos.length)} ek` : ''}`}</small>
        </span>
      ),
      csv: (q) => `${q.title} (${q.no})`,
    },
    { anahtar: 'musteri', baslik: 'Müşteri', hucre: (q) => firma(q.customerId) },
    { anahtar: 'istenen', baslik: 'İstenen teslim', kirilmaz: true, hucre: (q) => tarih(q.neededBy) },
    {
      anahtar: 'surum', baslik: 'Son sürüm (KDV hariç)', hizala: 'sag', kirilmaz: true,
      hucre: (q) => {
        const v = sonSurumu(q);
        return v ? <span className="tc-pt-teklif-hucre"><b>{para(tutar(q, v).net, q.currency)}</b><small>{`sürüm ${String(v.v)}`}</small></span> : YOK;
      },
      csv: (q) => { const v = sonSurumu(q); return v ? tutar(q, v).net : ''; },
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (q) => <DurumRozeti q={q} simdi={simdi} />, csv: (q) => durum(q, simdi) },
  ];

  return (
    <div className="tc-pt-teklif">
      <SayfaBasligi
        baslik="Müşteri teklif talepleri" simge="tag"
        alt="Müşterilerinizin portaldan açtığı ve satış ekibinin müşteri adına açtığı talepler. Her yanıt sürüm olarak saklanır; müşteri hangi sürümü kabul ettiyse o kayıtlıdır."
        birincil={izin.gonderimAcik('newsale') ? { etiket: 'Yeni teklif', simge: 'plus', yap: () => p.git('newsale') } : undefined}
      />
      <div className="tc-pt-sayilar">
        <SayiKarti baslik="Yanıt bekleyen" simge="clock" sayi={s.bekleyen} ton="uyari" />
        <SayiKarti baslik="Kazanma oranı" simge="target" {...(s.kazanma === null ? { sayi: null } : { metin: yuzde(s.kazanma, 0) })} />
        <SayiKarti baslik="Ortalama ilk yanıt süresi" simge="clock" {...(s.ilkYanit === null ? { sayi: null } : { metin: `${sayi(s.ilkYanit, 1)} gün` })} />
        <SayiKarti baslik="Müşteride bekleyen teklif tutarı" simge="lira" metin={kisaPara(s.musteride)} />
      </div>
      <Sekmeler
        etiket="Teklif süzgeci"
        sekmeler={SUZGECLER.map(([k, ad, f]) => ({ anahtar: k, baslik: `${ad} (${String(hepsi.filter((q) => f(q, simdi)).length)})` }))}
        secili={suzgec}
        sec={setSuzgec}
      />
      <Tablo
        etiket="Teklif talepleri" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(q) => q.id}
        satirSec={(q) => p.git('sale', q.id)} bosMesaj="Bu filtrede talep yok."
      />
    </div>
  );
}
