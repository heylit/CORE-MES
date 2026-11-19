import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOturum } from '../../ortak/veri/oturum.ts';
import type {
  BildirimListeCevabi, BildirimListeDurumu,
} from '#paylasilan/sozlesme/bildirim.ts';
import { DurumKutusu, Dugme, Sayfalama } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { Hazirla } from './Hazirla.tsx';
import { BildirimSatiri, BosListe, useBildirimKomutlari } from './ortak.tsx';
import { Yayinlar } from './Yayinlar.tsx';
import './bildirim.css';

// Hazırla ve Yayınlar yalnız işlemi olana açılır (2147-2 c); veri yetkisi uçlardadır. Menüyü Bildirim Merkezi'nin ikinci menüsü çizer.
const SEKME_ISLEMLERI: Record<'hazirla' | 'yayinlar', readonly string[]> = {
  hazirla: ['bildirim.yayinla'],
  yayinlar: ['bildirim.yayinla', 'bildirim.yayin-oku'],
};

type Suzgec = Exclude<BildirimListeDurumu, 'arsiv'>;
const SUZGECLER: readonly { anahtar: Suzgec; baslik: string }[] = [
  { anahtar: 'gelen', baslik: 'Hepsi' },
  { anahtar: 'gorev', baslik: 'İş bildirimleri' },
  { anahtar: 'hatirlatma', baslik: 'Hatırlatmalar' },
  { anahtar: 'okunmamis', baslik: 'Okunmamış' },
  { anahtar: 'onay-bekleyen', baslik: 'Onay bekleyen' },
  { anahtar: 'onemli', baslik: 'Uyarı ve acil' },
  { anahtar: 'duyuru', baslik: 'Duyuru' },
  { anahtar: 'bilgi', baslik: 'Bilgi' },
  { anahtar: 'yapildi', baslik: 'Yapıldı' },
];
const BOS_METIN: Partial<Record<BildirimListeDurumu, string>> = {
  okunmamis: 'Okunmamış bildirim yok.', 'onay-bekleyen': 'Onay bekleyen bildirim yok.', gorev: 'Bekleyen iş bildirimi yok.',
  hatirlatma: 'Bekleyen hatırlatma yok.', yapildi: 'Yapılmış görev yok.',
};

function Cerceve({ children }: { children: React.ReactNode }) {
  return <div className="tc-bildirim-sayfa">{children}</div>;
}

function Liste({ durum, arsivde }: { durum: BildirimListeDurumu; arsivde: boolean }) {
  const [sayfa, sayfaYaz] = useState(1);
  const { arsivle } = useBildirimKomutlari();
  const liste = useQuery({
    queryKey: anahtarlar.liste(durum, sayfa),
    queryFn: () => api.get<BildirimListeCevabi>(`/bildirimler?durum=${durum}&sayfa=${sayfa}`),
  });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const v = liste.data;
  if (v.satirlar.length === 0) {
    return <BosListe metin={arsivde ? 'Arşiv boş.' : BOS_METIN[durum] ?? 'Bildirim yok.'} />;
  }
  return (
    <>
      <ul className="tc-bildirim-liste tc-bildirim-kutu">
        {v.satirlar.map((b) => <BildirimSatiri key={b.id} b={b} arsivle={arsivde ? undefined : () => arsivle.mutate(b.id)} />)}
      </ul>
      <Sayfalama sayfa={v.sayfa} sayfaBoyu={v.sayfaBoyu} toplam={v.toplam} satirSayisi={v.satirlar.length} degistir={sayfaYaz} />
    </>
  );
}

export function Gelenler() {
  const [suzgec, suzgecYaz] = useState<Suzgec>('gelen');
  const { tumu } = useBildirimKomutlari();
  return (
    <Cerceve>
      <div className="tc-bildirim-suzgec">
        {SUZGECLER.map((s) => (
          <button key={s.anahtar} type="button" className="tc-bildirim-cip" aria-pressed={suzgec === s.anahtar} onClick={() => suzgecYaz(s.anahtar)}>
            {s.baslik}
          </button>
        ))}
        <span className="tc-bildirim-ara" />
        <Dugme simge="check" onClick={() => tumu.mutate()} yukleniyor={tumu.isPending}>Tümünü okundu yap</Dugme>
      </div>
      <Liste key={suzgec} durum={suzgec} arsivde={false} />
      <p className="tc-bildirim-not">Satıra basınca okundu olur ve kayıt açılır. Kaldırdıklarınız Arşiv'de durur; bildirim silinmez.</p>
    </Cerceve>
  );
}

export function Arsiv() {
  return (
    <Cerceve>
      <Liste durum="arsiv" arsivde />
    </Cerceve>
  );
}

// Bildirim Merkezi her rolün sayfasıdır; bu görünüm yalnız veri işlemi olana açılır.
function YetkiliSekme({ gorunum, children }: { gorunum: 'hazirla' | 'yayinlar'; children: (kisiId: number | null) => React.ReactNode }) {
  const oturum = useOturum();
  const islemler = oturum.data?.islemler ?? [];
  const acik = SEKME_ISLEMLERI[gorunum].some((i) => (islemler as readonly string[]).includes(i));
  return (
    <Cerceve>
      {oturum.isPending ? <DurumKutusu durum="yukleniyor" />
        : acik ? children(oturum.data?.id ?? null)
        : <DurumKutusu durum="bos" mesaj="Bu sekme için yetkiniz yok. Yöneticiniz rol yönetiminden verebilir." />}
    </Cerceve>
  );
}

export function HazirlaSayfasi() {
  const git = useNavigate();
  return <YetkiliSekme gorunum="hazirla">{() => <Hazirla yayinlandi={(y) => { void git(`/bildirim-merkezi/yayinlar?yayin=${String(y.id)}`); }} />}</YetkiliSekme>;
}

export function YayinlarSayfasi() {
  const [ara] = useSearchParams();
  const ilk = Number(ara.get('yayin'));
  return <YetkiliSekme gorunum="yayinlar">{(kisiId) => <Yayinlar kisiId={kisiId} secili={Number.isInteger(ilk) && ilk > 0 ? ilk : null} />}</YetkiliSekme>;
}
