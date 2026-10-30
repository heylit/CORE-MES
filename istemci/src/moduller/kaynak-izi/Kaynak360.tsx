import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Istasyon360Cevabi, KaynakAramaCevabi, KaynakTuru, Kisi360Cevabi, Makine360Cevabi } from '#paylasilan/sozlesme/kaynak-izi.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import './kaynak-izi.css';

type AramaSatiri = KaynakAramaCevabi['satirlar'][number];
const TUR_ADI: Record<KaynakTuru, string> = { istasyon: 'İstasyon', makine: 'Makine', kisi: 'Kişi' };
const UC: Record<KaynakTuru, string> = { istasyon: 'istasyonlar', makine: 'makineler', kisi: 'kisiler' };
const DURUM: Record<string, { ad: string; ton: RozetTonu }> = {
  calisir: { ad: 'Çalışır', ton: 'tamam' }, ariza: { ad: 'Arızalı', ton: 'hata' }, bakim: { ad: 'Bakımda', ton: 'uyari' },
};
const adres = (tur: KaynakTuru, id: number) => `/kaynak-izi/${tur}/${String(id)}`;
const yuzdeMetni = (y: string) => `%${String(Number(y))}`;
const oranMetni = (o: number | null) => (o === null ? '—' : `%${(o * 100).toFixed(1)}`);
const paraMetni = (m: { saatMaliyeti: string; paraBirimi: string } | null) => (m === null ? 'Girilmemiş' : `${m.saatMaliyeti} ${m.paraBirimi}/saat`);

const ARAMA_SUTUNLARI: readonly Sutun<AramaSatiri>[] = [
  { anahtar: 'tur', baslik: 'Tür', kirilmaz: true, hucre: (s) => TUR_ADI[s.tur] },
  { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (s) => s.kod ?? '—' },
  { anahtar: 'ad', baslik: 'Ad', hucre: (s) => <><Link to={adres(s.tur, s.id)}>{s.ad}</Link>{!s.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</> },
  { anahtar: 'ust', baslik: 'Bağlı olduğu', mono: true, hucre: (s) => s.ust ?? '—' },
];

// Giriş: istasyon, makine ya da kişiyi kod ya da adla bulup 360'ını açmak.
export function KaynakSec() {
  const git = useNavigate();
  const [ara, araYaz] = useState('');
  const [metin, metinYaz] = useState('');
  useEffect(() => { const t = setTimeout(() => { metinYaz(ara.trim()); }, 300); return () => clearTimeout(t); }, [ara]);
  const l = useQuery({
    queryKey: anahtarlar.arama(metin),
    queryFn: () => api.get<KaynakAramaCevabi>(`/kaynak-izi/kaynaklar?${new URLSearchParams(metin ? { metin } : {}).toString()}`),
  });
  return (
    <section className="tc-kiz">
      <p className="tc-kiz-alt">Bir istasyon, makine ya da kişi seçin: atama, yetkinlik, durum ve üretim tek ekranda. Bu sayfa yalnız okur.</p>
      <div className="tc-kiz-arac"><Girdi etiket="Kod ya da ad ara" value={ara} onChange={(e) => araYaz(e.target.value)} /></div>
      {l.isError ? <DurumKutusu durum="hata" yenile={() => { void l.refetch(); }} /> : (
        <Kart>
          <Tablo etiket="Kaynaklar" sutunlar={ARAMA_SUTUNLARI} satirlar={l.data?.satirlar ?? []} satirAnahtari={(s) => `${s.tur}-${String(s.id)}`} mesgul={l.isPending}
            satirSec={(s) => { void git(adres(s.tur, s.id)); }} bosMesaj="Bu aramaya uyan kaynak yok." />
          {l.data?.dahaVar && <p className="tc-kiz-not">İlk sonuçlar gösteriliyor; aramayı daraltın.</p>}
        </Kart>
      )}
    </section>
  );
}

function useKaynak<T>(tur: KaynakTuru) {
  const { id } = useParams();
  const no = Number(id);
  const gecerli = Number.isInteger(no) && no > 0;
  const v = useQuery({ queryKey: anahtarlar.kaynak(tur, no), queryFn: () => api.get<T>(`/kaynak-izi/${UC[tur]}/${String(no)}`), enabled: gecerli });
  return { gecerli, v };
}

function Durum<T>({ q, gecerli, cocuk }: { q: ReturnType<typeof useKaynak<T>>['v']; gecerli: boolean; cocuk: (d: T) => ReactNode }) {
  if (!gecerli) return <DurumKutusu durum="bos" mesaj="Kaynak bulunamadı." />;
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" yenile={() => { void q.refetch(); }} />;
  return <>{cocuk(q.data)}</>;
}

function Bas({ baslik, alt, aktif, eylemler }: { baslik: string; alt: ReactNode; aktif: boolean; eylemler?: ReactNode }) {
  return (
    <header className="tc-kiz-bas">
      <div>
        <h2 className="tc-kiz-baslik">{baslik}</h2>
        <p className="tc-kiz-alt">{alt}{!aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}</p>
      </div>
      <div className="tc-kiz-eylemler">
        <Link to="/kaynak-izi"><Dugme simge="search">Başka kaynak</Dugme></Link>
        {eylemler}
      </div>
    </header>
  );
}

function KisiCipleri({ kisiler, etiket, bos }: { kisiler: readonly { kisiId: number; ad: string; yuzde?: string }[]; etiket: string; bos: string }) {
  if (kisiler.length === 0) return <p className="tc-kiz-not">{bos}</p>;
  return (
    <ul className="tc-kiz-cipler" aria-label={etiket}>
      {kisiler.map((k) => (
        <li key={k.kisiId} className="tc-kiz-cip"><Link to={adres('kisi', k.kisiId)}>{k.ad}</Link>{k.yuzde !== undefined && <span className="tc-kiz-mono">{yuzdeMetni(k.yuzde)}</span>}</li>
      ))}
    </ul>
  );
}

function KaynakCipleri({ kaynaklar, etiket, bos }: { kaynaklar: readonly { tur: KaynakTuru; id: number; kod: string | null; ad: string; aktif: boolean }[]; etiket: string; bos: string }) {
  if (kaynaklar.length === 0) return <p className="tc-kiz-not">{bos}</p>;
  return (
    <ul className="tc-kiz-cipler" aria-label={etiket}>
      {kaynaklar.map((k) => (
        <li key={`${k.tur}-${String(k.id)}`} className="tc-kiz-cip"><Link to={adres(k.tur, k.id)}><span className="tc-kiz-mono">{k.kod}</span> {k.ad}</Link>{!k.aktif && <Rozet ton="pasif">Pasif</Rozet>}</li>
      ))}
    </ul>
  );
}

const durumRozeti = (d: { durum: string; aciklama: string | null } | null) => {
  if (d === null) return <Rozet ton="pasif">Durum girilmemiş</Rozet>;
  const x = DURUM[d.durum] ?? { ad: d.durum, ton: 'bilgi' as const };
  return <span title={d.aciklama ?? undefined}><Rozet ton={x.ton}>{x.ad}</Rozet></span>;
};

const GIZLI = 'Bu bölüm yetkinizle görünmüyor.';

export function Istasyon360() {
  const { gecerli, v } = useKaynak<Istasyon360Cevabi>('istasyon');
  return <Durum q={v} gecerli={gecerli} cocuk={(d) => (
    <section className="tc-kiz">
      <Bas baslik={d.kaynak.ad} aktif={d.kaynak.aktif}
        alt={<><span className="tc-kiz-mono">{d.kaynak.kod}</span> · İstasyon{d.isMerkezi && <> · {d.isMerkezi.kod} {d.isMerkezi.ad}</>}</>}
        eylemler={<Link to="/istasyonlar/is-merkezleri"><Dugme simge="grid">İstasyonlar</Dugme></Link>} />
      <div className="tc-kiz-izgara">
        <Kart baslik="Makineler" simge="cpu">
          {d.tesis === null ? <p className="tc-kiz-not">{GIZLI}</p> : d.tesis.makineler.length === 0 ? <p className="tc-kiz-not">Bu istasyona bağlı makine yok.</p> : (
            <ul className="tc-kiz-cipler" aria-label="Makineler">
              {d.tesis.makineler.map((m) => (
                <li key={m.id} className="tc-kiz-cip"><Link to={adres('makine', m.id)}><span className="tc-kiz-mono">{m.kod}</span> {m.ad}</Link>{durumRozeti(m.durum)}</li>
              ))}
            </ul>
          )}
        </Kart>
        <Kart baslik="Personel" simge="users">
          {d.tesis === null ? <p className="tc-kiz-not">{GIZLI}</p> : (
            <>
              <KisiCipleri kisiler={d.tesis.atananlar} etiket="Atananlar" bos="Atanmış kişi yok." />
              <p className="tc-kiz-not">Yetkin kişiler</p>
              <KisiCipleri kisiler={d.tesis.yetkinler} etiket="Yetkin kişiler" bos="Yetkinliği girilmiş kişi yok." />
            </>
          )}
        </Kart>
        <Kart baslik="OEE (son 7 gün)" simge="gauge">
          {d.oee === null ? <p className="tc-kiz-not">{GIZLI}</p> : (
            <dl className="tc-kiz-olcu">
              <div><dt>OEE</dt><dd>{oranMetni(d.oee.oee)}</dd></div>
              <div><dt>Kullanılabilirlik</dt><dd>{oranMetni(d.oee.kullanilabilirlik)}</dd></div>
              <div><dt>Performans</dt><dd>{oranMetni(d.oee.performans)}</dd></div>
              <div><dt>Kalite</dt><dd>{oranMetni(d.oee.kalite)}</dd></div>
            </dl>
          )}
        </Kart>
        <Kart baslik="Saat maliyeti" simge="lira">
          <p className="tc-kiz-not">{d.gorunurBolumler.includes('maliyet') ? paraMetni(d.maliyet) : GIZLI}</p>
        </Kart>
      </div>
    </section>
  )} />;
}

export function Makine360() {
  const { gecerli, v } = useKaynak<Makine360Cevabi>('makine');
  return <Durum q={v} gecerli={gecerli} cocuk={(d) => (
    <section className="tc-kiz">
      <Bas baslik={d.kaynak.ad} aktif={d.kaynak.aktif}
        alt={<><span className="tc-kiz-mono">{d.kaynak.kod}</span> · Makine{d.istasyon && <> · <Link to={adres('istasyon', d.istasyon.id)}>{d.istasyon.kod} {d.istasyon.ad}</Link></>}</>}
        eylemler={<Link to="/istasyonlar/makineler"><Dugme simge="cpu">Makineler</Dugme></Link>} />
      <div className="tc-kiz-izgara">
        <Kart baslik="Durum" simge="wrench">
          {d.tesis === null ? <p className="tc-kiz-not">{GIZLI}</p> : (
            <p className="tc-kiz-not">{durumRozeti(d.tesis.durum)} {d.tesis.durum?.aciklama}</p>
          )}
          <p className="tc-kiz-not">Bakım ve arıza geçmişi Arkon'dan gelecek.</p>
        </Kart>
        <Kart baslik="Personel" simge="users">
          {d.tesis === null ? <p className="tc-kiz-not">{GIZLI}</p> : (
            <>
              <KisiCipleri kisiler={d.tesis.atananlar} etiket="Bakan kişiler" bos="Bu makineye atanmış kişi yok." />
              <p className="tc-kiz-not">Bu makinede yetkin kişiler</p>
              <KisiCipleri kisiler={d.tesis.yetkinler} etiket="Yetkin kişiler" bos="Makine yetkinliği girilmiş kişi yok." />
            </>
          )}
        </Kart>
      </div>
    </section>
  )} />;
}

type KisiIsi = NonNullable<Kisi360Cevabi['isler']>[number];
const IS_SUTUNLARI: readonly Sutun<KisiIsi>[] = [
  { anahtar: 'emir', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (i) => i.emirNo },
  { anahtar: 'parca', baslik: 'Parça', hucre: (i) => i.parca || '—' },
  { anahtar: 'saglam', baslik: 'Sağlam', hizala: 'sag', hucre: (i) => (i.saglam === null ? '—' : String(i.saglam)) },
  { anahtar: 'hurda', baslik: 'Hurda', hizala: 'sag', hucre: (i) => (i.hurda === null ? '—' : String(i.hurda)) },
];

export function Kisi360() {
  const { gecerli, v } = useKaynak<Kisi360Cevabi>('kisi');
  return <Durum q={v} gecerli={gecerli} cocuk={(d) => (
    <section className="tc-kiz">
      <Bas baslik={d.kaynak.ad} aktif={d.kaynak.aktif} alt={<>Kişi{d.gorev && <> · {d.gorev}</>}</>}
        eylemler={<Link to="/istasyonlar/personel"><Dugme simge="users">Personel</Dugme></Link>} />
      <div className="tc-kiz-izgara">
        <Kart baslik="Atama ve yetkinlik" simge="layers">
          {d.tesis === null ? <p className="tc-kiz-not">{GIZLI}</p> : (
            <>
              {d.tesis.atamalar.length === 0 ? <p className="tc-kiz-not">Atanmamış.</p> : (
                <ul className="tc-kiz-cipler" aria-label="Atamalar">
                  {d.tesis.atamalar.map((a) => (
                    <li key={`${a.tur}-${String(a.id)}`} className="tc-kiz-cip"><Link to={adres(a.tur, a.id)}><span className="tc-kiz-mono">{a.kod}</span> {a.ad}</Link><span className="tc-kiz-mono">{yuzdeMetni(a.yuzde)}</span></li>
                  ))}
                </ul>
              )}
              <p className="tc-kiz-not">Çalışabildiği istasyonlar</p>
              <KaynakCipleri kaynaklar={d.tesis.istasyonYetkinlikleri} etiket="İstasyon yetkinlikleri" bos="Yetkinlik girilmemiş." />
              <p className="tc-kiz-not">Baktığı makineler</p>
              <KaynakCipleri kaynaklar={d.tesis.makineYetkinlikleri} etiket="Makine yetkinlikleri" bos="Makine seçilmemiş." />
            </>
          )}
        </Kart>
        <Kart baslik="Vardiya ve izin" simge="calendar">
          <p className="tc-kiz-not">
            {!d.gorunurBolumler.includes('vardiya') ? GIZLI : d.vardiya ? `${d.vardiya.ad} ${d.vardiya.baslangic}-${d.vardiya.bitis}` : 'Vardiyası seçilmemiş: bütün açık vardiyalarda sayılır.'}
          </p>
          <p className="tc-kiz-not">{d.izin === null ? 'İzin bilgisi yetkinizle görünmüyor.' : d.izin.bugunIzinli ? <Rozet ton="uyari">Bugün izinli</Rozet> : 'Bugün izinli değil.'}</p>
        </Kart>
        <Kart baslik="Son 7 günün işleri" simge="list">
          {d.isler === null ? <p className="tc-kiz-not">{GIZLI}</p> : (
            <Tablo etiket="Son işler" sutunlar={IS_SUTUNLARI} satirlar={d.isler} satirAnahtari={(i) => `${i.emirNo}-${String(i.isEmriId)}`} bosMesaj="Son 7 günde sayımı ya da katılımı yok." />
          )}
        </Kart>
        <Kart baslik="Saat maliyeti" simge="lira">
          <p className="tc-kiz-not">{d.gorunurBolumler.includes('maliyet') ? paraMetni(d.maliyet) : GIZLI}</p>
        </Kart>
      </div>
    </section>
  )} />;
}
