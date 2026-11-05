import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DosyaListesiCevabi, DosyalarCevabi, GecmisCevabi, GecmisOlayi, Klasor, KlasorAcGovdesi, KlasorDuzeyi, KlasorlerCevabi, OrtakDosya, SurumlerCevabi,
  SurumluGovde, VerilenDuzey, YetkiCevabi, YetkiGovdesi, YukleGovdesi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { DosyaHatasi, dosyaYukle } from '../belge-merkezi/disari.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Sekmeler, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useKorumaliKomut, useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import './ortak-dosyalar.css';

export type Gorunum = 'klasorler' | 'son' | 'arsiv';
type SekmeAdi = 'dosyalar' | 'yetkiler' | 'gecmis';

const DUZEY_ADI: Record<KlasorDuzeyi, string> = { yok: 'Yok', gorur: 'Görür', ekler: 'Ekler', yonetir: 'Yönetir' };
const DUZEY_ACIKLAMASI: Record<KlasorDuzeyi, string> = {
  yok: 'Klasörü görmez', gorur: 'Açar, indirir', ekler: 'Görür, yükler, sürüm ekler', yonetir: 'Ekler, alt klasör açar, arşive kaldırır',
};
const DUZEYLER: readonly KlasorDuzeyi[] = ['yok', 'gorur', 'ekler', 'yonetir'];
const OLAY_ADI: Record<GecmisOlayi, string> = {
  'klasor-acildi': 'Klasör açtı', yuklendi: 'Yükledi', 'yeni-surum': 'Yeni sürüm yükledi', arsivlendi: 'Arşive kaldırdı',
  'geri-alindi': 'Arşivden geri aldı', 'yetki-degisti': 'Yetkiyi değiştirdi',
};
const enAz = (d: KlasorDuzeyi, gereken: KlasorDuzeyi): boolean => DUZEYLER.indexOf(d) >= DUZEYLER.indexOf(gereken);
const boyutMetni = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const dosyaYolu = (d: { klasorId: number; id: number }): string => `/ortak-dosyalar/klasorler/${d.klasorId}/dosyalar/${d.id}`;

// İndirme sunucunun ekli cevabıdır (Content-Disposition); aynı köken ve çerezle bağlantı açılır, denetim kaydı sunucuda yazılır.
function indir(d: { klasorId: number; id: number }, sira: number): void {
  const a = document.createElement('a');
  a.href = `/api${dosyaYolu(d)}/surumler/${sira}/dosya`;
  a.rel = 'noopener';
  a.click();
}

function sirala(liste: readonly Klasor[]): Klasor[] {
  return [...liste].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

function Agac({ klasorler, secili, sec }: { klasorler: readonly Klasor[]; secili: number | null; sec: (id: number) => void }) {
  const dal = (ust: number | null) => {
    const altlar = sirala(klasorler.filter((k) => k.ustId === ust));
    if (altlar.length === 0) return null;
    return (
      <ul role={ust === null ? 'tree' : 'group'} aria-label={ust === null ? 'Klasör ağacı' : undefined}>
        {altlar.map((k) => (
          <li key={k.id}>
            <button type="button" className="tc-od-klasor" aria-current={secili === k.id ? 'true' : undefined} onClick={() => sec(k.id)}>
              <Simge ad="layers" boyut="k" />
              <span>{k.ad}</span>
              {k.ozelYetki && <span className="tc-od-kilit" title="Özel yetki"><Simge ad="lock" boyut="k" /></span>}
            </button>
            {dal(k.id)}
          </li>
        ))}
      </ul>
    );
  };
  return <nav className="tc-od-agac">{dal(null) ?? <p className="tc-od-bos">Görebileceğiniz klasör yok</p>}</nav>;
}

function KlasorPenceresi({ ust, ustAdi, kapat, acildi }: { ust: number | null; ustAdi: string | null; kapat: () => void; acildi: (k: Klasor) => void }) {
  const istemci = useQueryClient();
  const [ad, adYaz] = useState('');
  const komut = useKorumaliKomut<KlasorAcGovdesi, Klasor>({
    gonder: (g, d) => api.post<Klasor>('/ortak-dosyalar/klasorler', g, d),
    onSuccess: async (k) => { await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); acildi(k); },
  });
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Yeni klasör"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={ad.trim() === ''} yukleniyor={komut.isPending} onClick={() => komut.mutate({ ustId: ust, ad: ad.trim() })}>Aç</Dugme>
        </>
      )}
    >
      <div className="tc-od-form">
        <Girdi etiket="Klasör adı" required maxLength={120} value={ad} onChange={(o) => adYaz(o.target.value)} autoFocus />
        <p className="tc-od-ipucu">
          {ust === null
            ? 'Üst düzey klasör özel yetkiyle açılır; yalnız yönetici görür, sonra Yetkiler sekmesinden verin.'
            : `Yeni klasör "${ustAdi ?? ''}" yetkisini alır.`}
        </p>
        {komut.isError && <p className="tc-od-hata" role="alert">{hataIletisi(komut.error, 'Klasör açılamadı')}</p>}
      </div>
    </Pencere>
  );
}

function SurumPenceresi({ dosya, kapat }: { dosya: OrtakDosya; kapat: () => void }) {
  const q = useQuery({
    queryKey: anahtarlar.surumler(dosya.id),
    queryFn: () => api.get<SurumlerCevabi>(`${dosyaYolu(dosya)}/surumler`),
  });
  return (
    <Pencere acik kapat={kapat} baslik={`${dosya.ad} · sürümler`}>
      {q.isPending && <DurumKutusu durum="yukleniyor" />}
      {q.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Sürümler okunamadı')} />}
      {q.data && (
        <ul className="tc-od-olaylar">
          {q.data.surumler.map((s) => (
            <li key={s.sira}>
              <span className="mono">s{s.sira}</span>
              <span>{[s.yukleyenAd, boyutMetni(s.boyut)].filter(Boolean).join(' · ')}</span>
              <span className="tc-od-satir-is">
                <time className="mono">{zamanMetni(s.zaman)}</time>
                <Dugme simge="download" aria-label={`s${s.sira} indir`} title="İndir" onClick={() => indir(dosya, s.sira)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Pencere>
  );
}

function DosyaTablosu({ dosyalar, klasorSutunu, duzey, bosMesaj }: {
  dosyalar: readonly OrtakDosya[]; klasorSutunu: boolean; duzey: (klasorId: number) => KlasorDuzeyi; bosMesaj: string;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [surumleri, surumleriYaz] = useState<OrtakDosya | null>(null);
  const yeniSurum = useRef<{ dosya: OrtakDosya | null; input: HTMLInputElement | null }>({ dosya: null, input: null });
  const yukleme = useYukleme();
  const arsivle = useTekGonderim<OrtakDosya, OrtakDosya>({
    mutationFn: (d) => api.post<OrtakDosya>(`${dosyaYolu(d)}/arsivle`, { surum: d.surum } satisfies SurumluGovde),
    onSuccess: async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); bildir('tamam', 'Arşive kaldırıldı; Arşivden geri alınabilir.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Arşive kaldırılamadı')),
  });
  const sutunlar: Sutun<OrtakDosya>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (d) => <span className="tc-od-ad"><Simge ad="file" boyut="k" /><span title={d.ad}>{d.ad}</span></span> },
    ...(klasorSutunu ? [{ anahtar: 'klasor', baslik: 'Klasör', hucre: (d: OrtakDosya) => d.klasorYolu.join(' / ') }] : []),
    {
      anahtar: 'surum', baslik: 'Sürüm', mono: true,
      hucre: (d) => (d.surumSirasi > 1
        ? <button type="button" className="tc-od-surum" onClick={() => surumleriYaz(d)} title="Sürümleri göster">s{d.surumSirasi}</button>
        : `s${d.surumSirasi}`),
    },
    { anahtar: 'boyut', baslik: 'Boyut', hizala: 'sag', mono: true, hucre: (d) => boyutMetni(d.boyut) },
    { anahtar: 'yukleyen', baslik: 'Yükleyen', hucre: (d) => d.yukleyenAd ?? '' },
    { anahtar: 'tarih', baslik: 'Tarih', mono: true, hucre: (d) => zamanMetni(d.zaman) },
    {
      anahtar: 'is', baslik: '', csv: false,
      hucre: (d) => (
        <span className="tc-od-satir-is">
          <Dugme simge="download" title="İndir" aria-label={`${d.ad} indir`} onClick={() => indir(d, d.surumSirasi)} />
          {enAz(duzey(d.klasorId), 'ekler') && (
            <Dugme
              simge="upload" title="Yeni sürüm yükle" aria-label={`${d.ad} yeni sürüm`} yukleniyor={yukleme.suruyor}
              onClick={() => { yeniSurum.current.dosya = d; yeniSurum.current.input?.click(); }}
            />
          )}
          {enAz(duzey(d.klasorId), 'yonetir') && (
            <Dugme simge="lock" title="Arşive kaldır" aria-label={`${d.ad} arşive kaldır`} onClick={() => arsivle.mutate(d)} />
          )}
        </span>
      ),
    },
  ];
  return (
    <>
      <Tablo etiket="Dosyalar" sutunlar={sutunlar} satirlar={dosyalar} satirAnahtari={(d) => d.id} bosMesaj={bosMesaj} />
      <input
        ref={(e) => { yeniSurum.current.input = e; }} type="file" hidden
        onChange={(o) => { const d = yeniSurum.current.dosya; if (d !== null) void yukleme.yukle(d.klasorId, o, d.ad); }}
      />
      {surumleri && <SurumPenceresi dosya={surumleri} kapat={() => surumleriYaz(null)} />}
    </>
  );
}

// Seçilen her dosya yüklenir (özet, parça) ve klasöre bağlanır. Aynı ad yeni sürüm olur; ad, yeni sürümde mevcut dosyanın adıdır.
function useYukleme() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [suruyor, suruyorYaz] = useState(false);
  const yukle = async (klasorId: number, o: ChangeEvent<HTMLInputElement>, sabitAd?: string): Promise<void> => {
    const secilen = [...(o.target.files ?? [])];
    o.target.value = '';
    if (secilen.length === 0 || suruyor) return;
    suruyorYaz(true);
    let tamam = 0;
    try {
      for (const f of secilen) {
        try {
          const ozet = await dosyaYukle(new Uint8Array(await f.arrayBuffer()), () => {});
          const govde: YukleGovdesi = { ad: sabitAd ?? f.name, ozet };
          await api.post<OrtakDosya>(`/ortak-dosyalar/klasorler/${klasorId}/yukle`, govde, { istekKimligi: yeniIstekKimligi() });
          tamam += 1;
        } catch (h) {
          bildir('hata', `${f.name}: ${h instanceof DosyaHatasi ? h.message : hataIletisi(h, 'Yüklenemedi')}`);
        }
      }
    } finally {
      suruyorYaz(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    }
    if (tamam > 0) bildir('tamam', `${tamam} dosya yüklendi.`);
  };
  return { yukle, suruyor };
}

function DosyalarSekmesi({ klasorId, ara, sec, yeniKlasor }: { klasorId: number; ara: string; sec: (id: number) => void; yeniKlasor: () => void }) {
  const q = useQuery({
    queryKey: anahtarlar.dosyalar(klasorId, ara),
    queryFn: () => api.get<DosyalarCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/dosyalar${ara.trim() === '' ? '' : `?ara=${encodeURIComponent(ara.trim())}`}`),
  });
  const secim = useRef<HTMLInputElement | null>(null);
  const yukleme = useYukleme();
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Klasör okunamadı')} yenile={() => { void q.refetch(); }} />;
  const { klasor, altKlasorler, dosyalar } = q.data;
  return (
    <div>
      <div className="tc-od-arac">
        <Dugme tur="birincil" simge="upload" disabled={!enAz(klasor.duzey, 'ekler')} yukleniyor={yukleme.suruyor} onClick={() => secim.current?.click()}>Dosya yükle</Dugme>
        {enAz(klasor.duzey, 'yonetir') && <Dugme simge="plus" onClick={yeniKlasor}>Alt klasör</Dugme>}
        <span className="tc-od-bilgi"><Simge ad="lock" boyut="k" />Yetkiniz: {DUZEY_ADI[klasor.duzey]}</span>
        <input ref={secim} type="file" multiple hidden onChange={(o) => { void yukleme.yukle(klasor.id, o); }} />
      </div>
      {altKlasorler.length > 0 && (
        <ul className="tc-od-altlar">
          {sirala(altKlasorler).map((k) => (
            <li key={k.id}>
              <button type="button" className="tc-od-klasor" onClick={() => sec(k.id)}><Simge ad="layers" boyut="k" /><span>{k.ad}</span></button>
              <span className="tc-od-ipucu">{k.dosyaSayisi} dosya</span>
            </li>
          ))}
        </ul>
      )}
      <DosyaTablosu
        dosyalar={dosyalar} klasorSutunu={false} duzey={() => klasor.duzey}
        bosMesaj={ara.trim() === '' ? 'Bu klasörde dosya yok.' : 'Aramaya uyan dosya yok.'}
      />
    </div>
  );
}

function YetkilerSekmesi({ klasorId, ustVar }: { klasorId: number; ustVar: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const q = useQuery({ queryKey: anahtarlar.yetki(klasorId), queryFn: () => api.get<YetkiCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/yetki`) });
  const [taslak, taslakYaz] = useState<{ surum: number; ozelYetki: boolean; satirlar: Map<number, VerilenDuzey> } | null>(null);
  const kaydet = useTekGonderim<YetkiGovdesi, YetkiCevabi>({
    mutationFn: (g) => api.post<YetkiCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/yetki`, g),
    onSuccess: async () => {
      taslakYaz(null);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', 'Yetki kaydedildi; denetim kaydına yazıldı.');
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Yetki kaydedilemedi')),
  });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Yetki okunamadı')} />;
  const y = q.data;
  const gecerli = taslak !== null && taslak.surum === y.surum ? taslak : { surum: y.surum, ozelYetki: y.ozelYetki, satirlar: new Map(y.satirlar.map((s) => [s.rolId, s.duzey])) };
  const kirli = taslak !== null && taslak.surum === y.surum;
  const degistir = (yeni: Partial<typeof gecerli>) => taslakYaz({ ...gecerli, ...yeni });
  return (
    <div>
      <div className="tc-od-yetki-ust">
        {ustVar ? (
          <label className="tc-od-anahtar">
            <input type="checkbox" checked={gecerli.ozelYetki} onChange={(o) => degistir({ ozelYetki: o.target.checked })} />
            Özel yetki (üst klasörden alma)
          </label>
        ) : <span>Üst düzey klasör: yetkiyi kendisi taşır.</span>}
        {!gecerli.ozelYetki && ustVar && <Rozet ton="pasif">Kaynak: {y.kaynakAd}</Rozet>}
        <span className="tc-od-sag">
          <Dugme disabled={!kirli} onClick={() => taslakYaz(null)}>Vazgeç</Dugme>
          <Dugme
            tur="birincil" simge="check" disabled={!kirli} yukleniyor={kaydet.isPending}
            onClick={() => kaydet.mutate({
              surum: y.surum, ozelYetki: gecerli.ozelYetki,
              satirlar: gecerli.ozelYetki ? [...gecerli.satirlar].map(([rolId, duzey]) => ({ rolId, duzey })) : [],
            })}
          >
            Kaydet
          </Dugme>
        </span>
      </div>
      <table className="tc-od-yetkiler">
        <thead><tr><th>Rol</th><th>Düzey</th><th>Ne yapabilir</th></tr></thead>
        <tbody>
          {y.roller.map((r) => {
            const v: KlasorDuzeyi = r.yonetici ? 'yonetir' : gecerli.satirlar.get(r.id) ?? 'yok';
            const pasif = !gecerli.ozelYetki;
            return (
              <tr key={r.id}>
                <td>{r.ad}</td>
                <td>
                  {r.yonetici ? <Rozet ton="bilgi">Her klasörü yönetir</Rozet> : (
                    <div className="tc-od-duzey" role="group" aria-label={`${r.ad} yetki düzeyi`} aria-disabled={pasif ? 'true' : undefined}>
                      {DUZEYLER.map((d) => (
                        <button
                          key={d} type="button" aria-pressed={v === d} disabled={pasif}
                          onClick={() => {
                            const m = new Map(gecerli.satirlar);
                            if (d === 'yok') m.delete(r.id); else m.set(r.id, d);
                            degistir({ satirlar: m });
                          }}
                        >
                          {DUZEY_ADI[d]}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="tc-od-ipucu">{DUZEY_ACIKLAMASI[v]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tc-od-ipucu tc-od-aciklama">
        Özel yetkisi olmayan alt klasörler bu ayarı alır. Yetki sunucuda her istekte denetlenir; ekranda gizlemek yetki değildir.
      </p>
    </div>
  );
}

function GecmisSekmesi({ klasorId }: { klasorId: number }) {
  const q = useQuery({ queryKey: anahtarlar.gecmis(klasorId), queryFn: () => api.get<GecmisCevabi>(`/ortak-dosyalar/klasorler/${klasorId}/gecmis`) });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Geçmiş okunamadı')} />;
  if (q.data.olaylar.length === 0) return <p className="tc-od-bos">Bu klasörde kayıtlı olay yok.</p>;
  return (
    <ul className="tc-od-olaylar">
      {q.data.olaylar.map((o, i) => (
        <li key={`${o.zaman}-${i}`}>
          <Simge ad="clock" boyut="k" />
          <span>
            {`${o.kisiAd ?? 'Bilinmeyen kişi'}: ${OLAY_ADI[o.olay]}`}
            {o.dosyaAdi !== null && ` ${o.dosyaAdi}`}
            {o.olay === 'yeni-surum' && o.surumSirasi !== null && ` (s${o.surumSirasi})`}
          </span>
          <time className="mono">{zamanMetni(o.zaman)}</time>
        </li>
      ))}
    </ul>
  );
}

function SonEklenenler({ ara, klasorler }: { ara: string; klasorler: readonly Klasor[] }) {
  const q = useQuery({
    queryKey: anahtarlar.son(ara),
    queryFn: () => api.get<DosyaListesiCevabi>(`/ortak-dosyalar/son-eklenenler${ara.trim() === '' ? '' : `?ara=${encodeURIComponent(ara.trim())}`}`),
  });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Son eklenenler okunamadı')} />;
  const duzey = (id: number): KlasorDuzeyi => klasorler.find((k) => k.id === id)?.duzey ?? 'gorur';
  return <DosyaTablosu dosyalar={q.data.dosyalar} klasorSutunu duzey={duzey} bosMesaj={ara.trim() === '' ? 'Henüz dosya yok.' : 'Aramaya uyan dosya yok.'} />;
}

function Arsiv() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const q = useQuery({ queryKey: anahtarlar.arsiv, queryFn: () => api.get<DosyaListesiCevabi>('/ortak-dosyalar/arsiv') });
  const geriAl = useTekGonderim<OrtakDosya, OrtakDosya>({
    mutationFn: (d) => api.post<OrtakDosya>(`${dosyaYolu(d)}/arsivden-cikar`, { surum: d.surum } satisfies SurumluGovde),
    onSuccess: async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); bildir('tamam', 'Geri alındı.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Geri alınamadı')),
  });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Arşiv okunamadı')} />;
  const sutunlar: Sutun<OrtakDosya>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (d) => <span className="tc-od-ad"><Simge ad="lock" boyut="k" /><span title={d.ad}>{d.ad}</span></span> },
    { anahtar: 'klasor', baslik: 'Klasör', hucre: (d) => d.klasorYolu.join(' / ') },
    { anahtar: 'is', baslik: '', csv: false, hucre: (d) => <Dugme simge="back" onClick={() => geriAl.mutate(d)}>Geri al</Dugme> },
  ];
  return <Tablo etiket="Arşiv" sutunlar={sutunlar} satirlar={q.data.dosyalar} satirAnahtari={(d) => d.id} bosMesaj="Arşivde geri alabileceğiniz dosya yok." />;
}

function yolu(klasorler: readonly Klasor[], id: number | null): Klasor[] {
  const y: Klasor[] = [];
  let k = klasorler.find((x) => x.id === id);
  while (k !== undefined && !y.includes(k)) {
    y.unshift(k);
    const ust = k.ustId;
    k = ust === null ? undefined : klasorler.find((x) => x.id === ust);
  }
  return y;
}

export function OrtakDosyalar({ gorunum }: { gorunum: Gorunum }) {
  const git = useNavigate();
  const [secili, seciliYaz] = useState<number | null>(null);
  const [sekme, sekmeYaz] = useState<SekmeAdi>('dosyalar');
  const [ara, araYaz] = useState('');
  const [agacAcik, agacAcikYaz] = useState(false);
  const [pencere, pencereYaz] = useState<{ ust: number | null } | null>(null);
  const q = useQuery({ queryKey: anahtarlar.klasorler, queryFn: () => api.get<KlasorlerCevabi>('/ortak-dosyalar/klasorler') });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Klasörler okunamadı')} yenile={() => { void q.refetch(); }} />;
  const { klasorler, yonetici } = q.data;
  const ilk = sirala(klasorler.filter((k) => k.ustId === null))[0] ?? null;
  const seciliKlasor = klasorler.find((k) => k.id === secili) ?? ilk;
  const sec = (id: number) => { seciliYaz(id); agacAcikYaz(false); if (gorunum !== 'klasorler') void git('/ortak-dosyalar'); };
  const gecerliSekme: SekmeAdi = !yonetici && sekme === 'yetkiler' ? 'dosyalar' : sekme;
  let govde;
  if (gorunum === 'son') govde = <SonEklenenler ara={ara} klasorler={klasorler} />;
  else if (gorunum === 'arsiv') govde = <Arsiv />;
  else if (seciliKlasor === null) govde = <p className="tc-od-bos">Bu rolün görebildiği klasör yok.</p>;
  else if (gecerliSekme === 'yetkiler') govde = <YetkilerSekmesi key={seciliKlasor.id} klasorId={seciliKlasor.id} ustVar={seciliKlasor.ustId !== null} />;
  else if (gecerliSekme === 'gecmis') govde = <GecmisSekmesi klasorId={seciliKlasor.id} />;
  else govde = <DosyalarSekmesi klasorId={seciliKlasor.id} ara={ara} sec={sec} yeniKlasor={() => pencereYaz({ ust: seciliKlasor.id })} />;
  return (
    <div className="tc-od-sayfa">
      <div className="tc-od-bas">
        <h1><Simge ad="file" />Ortak Dosyalar</h1>
        <label className="tc-od-ara">
          <Simge ad="search" boyut="k" />
          <input type="search" placeholder="Dosya ara" aria-label="Dosya ara" value={ara} onChange={(o) => araYaz(o.target.value)} />
        </label>
      </div>
      <div className="tc-od-izgara">
        <div className={`tc-od-agac-kart${agacAcik ? ' tc-od-acik' : ''}`}>
          <Kart
            baslik="Klasörler" simge="layers"
            sag={yonetici ? <Dugme simge="plus" title="Üst düzeyde klasör aç" aria-label="Üst düzeyde klasör aç" onClick={() => pencereYaz({ ust: null })} /> : undefined}
          >
            <Agac klasorler={klasorler} secili={gorunum === 'klasorler' ? seciliKlasor?.id ?? null : null} sec={sec} />
          </Kart>
        </div>
        <Kart>
          <div className="tc-od-arac tc-od-cizgili">
            <span className="tc-od-agac-ac"><Dugme simge="layers" onClick={() => agacAcikYaz((a) => !a)}>Klasörler</Dugme></span>
            <nav className="tc-od-yol" aria-label="Klasör yolu">
              {gorunum === 'klasorler'
                ? yolu(klasorler, seciliKlasor?.id ?? null).map((k, i) => (
                  <span key={k.id}>
                    {i > 0 && <span aria-hidden="true">/</span>}
                    <button type="button" onClick={() => seciliYaz(k.id)}>{k.ad}</button>
                  </span>
                ))
                : <button type="button">{gorunum === 'son' ? 'Son eklenenler' : 'Arşiv'}</button>}
            </nav>
          </div>
          {gorunum === 'klasorler' && seciliKlasor !== null && (
            <Sekmeler<SekmeAdi>
              etiket="Klasör sekmeleri"
              sekmeler={[
                { anahtar: 'dosyalar', baslik: 'Dosyalar', simge: 'file' },
                ...(yonetici ? [{ anahtar: 'yetkiler' as const, baslik: 'Yetkiler', simge: 'lock' as const }] : []),
                { anahtar: 'gecmis', baslik: 'Geçmiş', simge: 'clock' },
              ]}
              secili={gecerliSekme}
              sec={sekmeYaz}
            />
          )}
          {govde}
        </Kart>
      </div>
      {pencere && (
        <KlasorPenceresi
          ust={pencere.ust}
          ustAdi={klasorler.find((k) => k.id === pencere.ust)?.ad ?? null}
          kapat={() => pencereYaz(null)}
          acildi={(k) => { pencereYaz(null); seciliYaz(k.id); sekmeYaz(k.ustId === null ? 'yetkiler' : 'dosyalar'); }}
        />
      )}
    </div>
  );
}
