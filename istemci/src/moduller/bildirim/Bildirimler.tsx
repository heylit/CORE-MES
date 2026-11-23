import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useOturum } from '../../ortak/veri/oturum.ts';
import type {
  Bildirim, BildirimListeCevabi, BildirimListeDurumu, BildirimSayacCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import type { GecikenlerimCevabi } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { DurumKutusu, Dugme, Pencere, Sayfalama, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { Hazirla } from './Hazirla.tsx';
import { BildirimSatiri, BosListe, SecimKutusu, useBildirimKomutlari } from './ortak.tsx';
import { Yayinlar } from './Yayinlar.tsx';
import './bildirim.css';

// Hazırla ve Yayınlar yalnız işlemi olana açılır (2147-2 c); veri yetkisi uçlardadır. Menüyü Bildirim Merkezi'nin ikinci menüsü çizer.
const SEKME_ISLEMLERI: Record<'yayinlar', readonly string[]> = {
  yayinlar: ['bildirim.yayinla', 'bildirim.yayin-oku'],
};

// 3456-2 a: cipler yalnız durumdur, tür ayrı seçimdedir. Sunucu tek durum aldığından tür seçilince durum cipi "Hepsi"ye döner.
const DURUM_CIPLERI: readonly { anahtar: BildirimListeDurumu; baslik: string }[] = [
  { anahtar: 'gelen', baslik: 'Hepsi' },
  { anahtar: 'okunmamis', baslik: 'Okunmamış' },
  { anahtar: 'onay-bekleyen', baslik: 'Onay bekleyen' },
  { anahtar: 'yapildi', baslik: 'Yapıldı' },
  { anahtar: 'arsiv', baslik: 'Arşiv' },
];
const TURLER: readonly { deger: BildirimListeDurumu; baslik: string }[] = [
  { deger: 'gorev', baslik: 'Sizden bekleniyor' },
  { deger: 'hatirlatma', baslik: 'Hatırlatmalar' },
  { deger: 'onemli', baslik: 'Uyarı ve acil' },
  { deger: 'duyuru', baslik: 'Duyuru' },
  { deger: 'bilgi', baslik: 'Bilgi' },
];
const SUZGECLER: readonly string[] = [...DURUM_CIPLERI.map((c) => c.anahtar), ...TURLER.map((t) => t.deger)];
const suzgecMi = (d: string | null): d is BildirimListeDurumu => d !== null && SUZGECLER.includes(d);
const BOS_METIN: Partial<Record<BildirimListeDurumu, string>> = {
  okunmamis: 'Okunmamış bildirim yok.', 'onay-bekleyen': 'Onay bekleyen bildirim yok.', gorev: 'Sizden beklenen iş yok.',
  hatirlatma: 'Bekleyen hatırlatma yok.', yapildi: 'Yapılmış görev yok.', arsiv: 'Arşiv boş.',
};

function Cerceve({ children }: { children: React.ReactNode }) {
  return <div className="tc-bildirim-sayfa">{children}</div>;
}

// Gün başlığı yerel takvime göredir: bugün, dün, daha önce.
export function gunBasligi(olusturuldu: string, simdi: Date): 'Bugün' | 'Dün' | 'Daha önce' {
  const an = new Date(olusturuldu);
  const gun = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const fark = Math.round((gun(simdi) - gun(an)) / 86_400_000);
  return fark <= 0 ? 'Bugün' : fark === 1 ? 'Dün' : 'Daha önce';
}
const GUNLER = ['Bugün', 'Dün', 'Daha önce'] as const;

const onayBekliyor = (b: Bildirim): boolean => b.onayIstenir && b.onaylandi === null;

function Liste({ durum }: { durum: BildirimListeDurumu }) {
  const [sayfa, sayfaYaz] = useState(1);
  const [secili, seciliYaz] = useState<ReadonlySet<number>>(new Set());
  const [sonuc, sonucYaz] = useState<string | null>(null);
  const [calisiyor, calisiyorYaz] = useState(false);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const { arsivle } = useBildirimKomutlari();
  const arsivde = durum === 'arsiv';
  const liste = useQuery({
    queryKey: anahtarlar.liste(durum, sayfa),
    queryFn: () => api.get<BildirimListeCevabi>(`/bildirimler?durum=${durum}&sayfa=${sayfa}`),
  });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const v = liste.data;
  if (v.satirlar.length === 0) return <BosListe metin={BOS_METIN[durum] ?? 'Bildirim yok.'} />;

  const degistir = (idler: readonly number[], acik: boolean) => {
    const yeni = new Set(secili);
    for (const id of idler) { if (acik) yeni.add(id); else yeni.delete(id); }
    seciliYaz(yeni);
    sonucYaz(null);
  };
  // Seçim yalnız bu sayfadaki satırları sayar; yenilemede düşen satır sayılmaz.
  const durumu = (grup: readonly Bildirim[]): 'hepsi' | 'kismen' | 'yok' => {
    const n = grup.filter((b) => secili.has(b.id)).length;
    return n === 0 ? 'yok' : n === grup.length ? 'hepsi' : 'kismen';
  };
  const seciliSayisi = v.satirlar.filter((b) => secili.has(b.id)).length;
  const bos = seciliSayisi === 0;
  // Toplu iş tek tek uca gider (toplu uç yok); onay bekleyen arşive kaldırılmaz, sayısı ve nedeni sonuçta yazılır.
  const toplu = async (is: 'okundu' | 'arsivle') => {
    const satirlar = v.satirlar.filter((b) => secili.has(b.id));
    const hedef = is === 'arsivle' ? satirlar.filter((b) => !onayBekliyor(b)) : satirlar.filter((b) => b.okundu === null);
    const atlanan = is === 'arsivle' ? satirlar.length - hedef.length : 0;
    calisiyorYaz(true);
    let yapilan = 0;
    try {
      for (const b of hedef) {
        await api.post<Bildirim>(`/bildirimler/${String(b.id)}/${is}`);
        yapilan += 1;
      }
    } catch (h) {
      bildir('hata', hataIletisi(h, 'İşlem yarıda kaldı.'));
    } finally {
      calisiyorYaz(false);
      seciliYaz(new Set());
      void istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    }
    sonucYaz(is === 'okundu' ? `${String(yapilan)} bildirim okundu yapıldı.`
      : `${String(yapilan)} bildirim arşive kaldırıldı.${atlanan > 0 ? ` ${String(atlanan)} bildirim onay beklediği için kaldırılmadı; önce "Okudum, anladım" deyin.` : ''}`);
  };

  const simdi = new Date();
  return (
    <>
      {sonuc !== null && <p className="tc-bildirim-not" role="status">{sonuc}</p>}
      <div className="tc-bildirim-toplu" role="toolbar" aria-label="Seçili bildirimler">
        <SecimKutusu etiket="Bu sayfadakilerin tümünü seç" durum={durumu(v.satirlar)} disabled={calisiyor}
          degistir={(a) => degistir(v.satirlar.map((b) => b.id), a)} />
        <span>{`${String(seciliSayisi)} seçili`}</span>
        <Dugme simge="check" onClick={() => { void toplu('okundu'); }} yukleniyor={calisiyor} disabled={bos}>Okundu yap</Dugme>
        {!arsivde && <Dugme simge="layers" onClick={() => { void toplu('arsivle'); }} disabled={bos || calisiyor}>Arşive kaldır</Dugme>}
        <Dugme simge="x" onClick={() => seciliYaz(new Set())} disabled={bos || calisiyor}>Seçimi bırak</Dugme>
      </div>
      {GUNLER.map((g) => {
        const grup = v.satirlar.filter((b) => gunBasligi(b.olusturuldu, simdi) === g);
        if (grup.length === 0) return null;
        return (
          <section key={g} className="tc-bildirim-gun" aria-label={g}>
            <h3 className="tc-bildirim-gun-baslik">
              <SecimKutusu etiket={`${g}: tümünü seç`} durum={durumu(grup)} disabled={calisiyor} degistir={(a) => degistir(grup.map((b) => b.id), a)} />
              {g}
            </h3>
            <ul className="tc-bildirim-liste tc-bildirim-kutu">
              {grup.map((b) => (
                <BildirimSatiri key={b.id} b={b} arsivle={arsivde ? undefined : () => arsivle.mutate(b.id)}
                  secim={{ secili: secili.has(b.id), degistir: (a) => degistir([b.id], a) }} />
              ))}
            </ul>
          </section>
        );
      })}
      <Sayfalama sayfa={v.sayfa} sayfaBoyu={v.sayfaBoyu} toplam={v.toplam} satirSayisi={v.satirlar.length} degistir={(s) => { seciliYaz(new Set()); sayfaYaz(s); }} />
    </>
  );
}

// Üstte yalnız geciken işler durur; sayı yoksa ya da alınamazsa satır çıkmaz.
function GecikenBaglantisi() {
  const d = useQuery({ queryKey: anahtarlar.gecikenlerim, queryFn: () => api.get<GecikenlerimCevabi>('/bildirim-kademe/gecikenlerim') });
  const n = d.data?.kayitlar.length ?? 0;
  if (n === 0) return null;
  return (
    <Link className="tc-bildirim-geciken" to="/bildirim-merkezi/gecikenlerim">
      <Simge ad="clock" />
      <span>{`${String(n)} geciken işiniz · Gecikenlerim`}</span>
      <Simge ad="chev-right" />
    </Link>
  );
}

export function Gelenler() {
  const [ara, araYaz] = useSearchParams();
  const ham = ara.get('durum');
  const durum: BildirimListeDurumu = suzgecMi(ham) ? ham : 'gelen';
  const tur = TURLER.some((t) => t.deger === durum) ? durum : '';
  const { tumu } = useBildirimKomutlari();
  const sayac = useQuery({ queryKey: anahtarlar.sayac, queryFn: () => api.get<BildirimSayacCevabi>('/bildirimler/sayac') });
  const sec = (d: BildirimListeDurumu) => {
    const yeni = new URLSearchParams(ara);
    if (d === 'gelen') yeni.delete('durum'); else yeni.set('durum', d);
    araYaz(yeni, { replace: true });
  };
  const okunmamis = sayac.data?.okunmamis ?? 0;
  return (
    <Cerceve>
      <GecikenBaglantisi />
      <div className="tc-bildirim-suzgec">
        {DURUM_CIPLERI.map((c) => (
          <button key={c.anahtar} type="button" className="tc-bildirim-cip" aria-pressed={durum === c.anahtar || (c.anahtar === 'gelen' && tur !== '')} onClick={() => sec(c.anahtar)}>
            {c.baslik}
            {c.anahtar === 'okunmamis' && okunmamis > 0 && <span className="tc-bildirim-cip-sayi">{` · ${String(okunmamis)}`}</span>}
          </button>
        ))}
        <span className="tc-bildirim-ara" />
        <Secim etiket="Tür" value={tur} bosSecenek="Hepsi" secenekler={TURLER} onChange={(o) => sec(suzgecMi(o.target.value) ? o.target.value : 'gelen')} />
        {durum !== 'arsiv' && <Dugme simge="check" onClick={() => tumu.mutate()} yukleniyor={tumu.isPending}>Tümünü okundu yap</Dugme>}
      </div>
      <Liste key={durum} durum={durum} />
      <p className="tc-bildirim-not">Başlığa basınca okundu olur ve kayıt açılır. Kaldırdıklarınız Arşiv'de durur; bildirim silinmez.</p>
    </Cerceve>
  );
}

// Bildirim Merkezi her rolün sayfasıdır; bu görünüm yalnız veri işlemi olana açılır.
function YetkiliSekme({ gorunum, children }: { gorunum: 'yayinlar'; children: (kisiId: number | null) => React.ReactNode }) {
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

// 3456-2 a: duyuru tek sayfadır; "Yeni duyuru" yalnız bildirim.yayinla olana çıkar ve yan pencerede açılır. Eski Hazırla adresi buraya gelir.
export function YayinlarSayfasi() {
  const [ara, araYaz] = useSearchParams();
  const oturum = useOturum();
  const ilk = Number(ara.get('yayin'));
  const [secili, seciliYaz] = useState<number | null>(Number.isInteger(ilk) && ilk > 0 ? ilk : null);
  const yeniAcik = ara.get('yeni') === '1';
  const yazabilir = ((oturum.data?.islemler ?? []) as readonly string[]).includes('bildirim.yayinla');
  const yeniYaz = (acik: boolean) => {
    const y = new URLSearchParams(ara);
    if (acik) y.set('yeni', '1'); else y.delete('yeni');
    araYaz(y, { replace: true });
  };
  const yeni = yazabilir ? <Dugme tur="birincil" simge="plus" onClick={() => yeniYaz(true)}>Yeni duyuru</Dugme> : undefined;
  return (
    <YetkiliSekme gorunum="yayinlar">
      {(kisiId) => (
        <>
          <Yayinlar key={secili ?? 0} kisiId={kisiId} secili={secili} yeni={yeni} />
          {yazabilir && (
            <Pencere acik={yeniAcik} kapat={() => yeniYaz(false)} baslik="Yeni duyuru" tur="yan" genis>
              <Hazirla yayinlandi={(y) => { seciliYaz(y.id); yeniYaz(false); }} />
            </Pencere>
          )}
        </>
      )}
    </YetkiliSekme>
  );
}
