import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AyarlarCevabi, MevcutAcCevabi, MevcutAcGovdesi, MevcutCevabi, SablonGovdesi, TopluGeriAlCevabi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { AyarDegistirGovdesi } from '#paylasilan/sozlesme/ayarlar.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';

// Kayda bağlı klasörlerin ayarları (kart 3288; yalnız `ortak-dosyalar.yetki-ver`): kök, alt klasör şablonu, açılamayan klasörler,
// mevcut kayıtlar için toplu komut ve toplu işin geri alınması. Sunucu her komutu yeniden denetler.

// Ön izlemedeki gibi her ekleme ve kaldırma hemen kaydedilir; ad girdisi yalnız "Alt klasör ekle" ile açılır.
function SablonListesi({ baslik, adlar, degistir, bekliyor }: { baslik: string; adlar: readonly string[]; degistir: (a: string[]) => void; bekliyor: boolean }) {
  const [yeni, yeniYaz] = useState<string | null>(null);
  const ekle = () => { if (yeni !== null && yeni.trim() !== '') { degistir([...adlar, yeni.trim()]); yeniYaz(null); } };
  return (
    <div className="tc-od-sablon">
      <p className="tc-od-ipucu">{baslik}</p>
      <ul>
        {adlar.map((ad, i) => (
          <li key={`${ad}-${i}`}>
            <Simge ad="layers" boyut="k" /><span>{ad}</span>
            <Dugme simge="x" aria-label={`${ad} kaldır`} title="Kaldır" disabled={bekliyor} onClick={() => degistir(adlar.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      {yeni === null
        ? <div className="tc-od-sablon-ekle"><Dugme simge="plus" disabled={bekliyor} onClick={() => yeniYaz('')}>Alt klasör ekle</Dugme></div>
        : (
          <div className="tc-od-sablon-ekle">
            <Girdi etiket="Alt klasör adı" maxLength={120} value={yeni} autoFocus onChange={(o) => yeniYaz(o.target.value)}
              onKeyDown={(o) => { if (o.key === 'Enter') ekle(); else if (o.key === 'Escape') yeniYaz(null); }} />
            <Dugme onClick={() => yeniYaz(null)}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" disabled={yeni.trim() === '' || bekliyor} onClick={ekle}>Ekle</Dugme>
          </div>
        )}
    </div>
  );
}

function Sablon({ ayar }: { ayar: AyarlarCevabi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const kaydet = useTekGonderim<SablonGovdesi, AyarlarCevabi>({
    mutationFn: (g) => api.post<AyarlarCevabi>('/ortak-dosyalar/ayarlar/sablon', g),
    onSuccess: async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); bildir('tamam', 'Şablon kaydedildi.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Şablon kaydedilemedi')),
  });
  const s = ayar.sablon;
  return (
    <Kart baslik="Alt klasör şablonu" simge="layers" sag={<Rozet ton="bilgi">Yalnız yönetici</Rozet>}>
      <div className="tc-od-ayar-govde">
        <SablonListesi baslik="Sipariş klasörü açılınca" adlar={s.siparis} bekliyor={kaydet.isPending} degistir={(siparis) => kaydet.mutate({ ...s, siparis })} />
        <SablonListesi baslik="Proje klasörü açılınca" adlar={s.proje} bekliyor={kaydet.isPending} degistir={(proje) => kaydet.mutate({ ...s, proje })} />
        <p className="tc-od-ipucu">Değişiklik yalnız bundan sonra açılan klasörlere uygulanır; açılmış klasörlere dokunmaz.</p>
      </div>
    </Kart>
  );
}

function Acilamayanlar({ ayar }: { ayar: AyarlarCevabi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const dene = useTekGonderim<{ tur: string; id: number }, AyarlarCevabi>({
    mutationFn: (k) => api.post<AyarlarCevabi>(`/ortak-dosyalar/ayarlar/acilamayan/${k.tur}/${k.id}/yeniden-dene`, {}),
    onSuccess: async (a, k) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      const kaldi = a.acilamayan.some((x) => x.tur === k.tur && x.id === k.id);
      bildir(kaldi ? 'hata' : 'tamam', kaldi ? 'Klasör yine açılamadı; nedeni listede.' : 'Klasör açıldı.');
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Yeniden denenemedi')),
  });
  return (
    <Kart baslik="Açılamayan klasörler" simge="alert" sag={ayar.acilamayan.length > 0 ? <Rozet ton="uyari">{ayar.acilamayan.length}</Rozet> : undefined}>
      {ayar.acilamayan.length === 0 ? <p className="tc-od-bos">Açılamayan klasör yok.</p> : (
        <table className="tc-od-acilamayan">
          <thead><tr><th scope="col">Kayıt</th><th scope="col" className="tc-od-mobil-gizle">Neden</th><th scope="col" aria-label="İşlem" /></tr></thead>
          <tbody>
            {ayar.acilamayan.map((a) => (
              <tr key={`${a.tur}-${a.id}`}>
                <td><strong>{a.etiket}</strong><span className="tc-od-ipucu tc-od-alt-satir"><time className="mono">{zamanMetni(a.zaman)}</time></span></td>
                <td className="tc-od-mobil-gizle tc-od-ipucu">{a.neden}</td>
                <td className="tc-od-hucre-is"><Dugme simge="rotate" onClick={() => dene.mutate({ tur: a.tur, id: a.id })}>Yeniden dene</Dugme></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tc-od-ipucu tc-od-aciklama">Klasör açılamasa da kayıt yazılır; burada yeniden denenir.</p>
    </Kart>
  );
}

// Toplu komut gruplar halinde ilerler: her çağrı bir grup açar; ilk çağrı onaylanan sayıyı taşır, sayı değişmişse sunucu durdurur.
function Mevcut({ kokVar }: { kokVar: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const q = useQuery({ queryKey: [...anahtarlar.kok, 'mevcut'], queryFn: () => api.get<MevcutCevabi>('/ortak-dosyalar/ayarlar/mevcut') });
  const [onay, onayYaz] = useState(false);
  const [suruyor, suruyorYaz] = useState(false);
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Sayı okunamadı')} yenile={() => { void q.refetch(); }} />;
  const m = q.data;
  const toplam = m.klasorsuz.firma + m.klasorsuz.siparis + m.klasorsuz.proje;
  const calistir = async () => {
    suruyorYaz(true);
    const topluIs = yeniIstekKimligi();
    let acilan = 0;
    let acilamayan = 0;
    try {
      let beklenen: MevcutAcGovdesi['beklenen'] = m.klasorsuz;
      for (;;) {
        const c = await api.post<MevcutAcCevabi>('/ortak-dosyalar/ayarlar/mevcut/ac', { topluIs, beklenen } satisfies MevcutAcGovdesi, { istekKimligi: yeniIstekKimligi() });
        acilan += c.acilan;
        acilamayan += c.acilamayan;
        beklenen = null;
        if (c.kalan === 0 || c.acilan + c.acilamayan === 0) break;
      }
      bildir(acilamayan > 0 ? 'hata' : 'tamam', `${toplam} kayıt gösterildi; ${acilan} klasör açıldı${acilamayan > 0 ? `, ${acilamayan} açılamadı (listede)` : ''}.`);
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Klasörler açılamadı'));
    } finally {
      suruyorYaz(false);
      onayYaz(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    }
  };
  return (
    <Kart baslik="Mevcut kayıtlar için klasör aç" simge="layers">
      {!m.bagli ? <p className="tc-od-bos">Kayıt kaynağı henüz bağlı değil.</p> : (
        <div className="tc-od-ayar-govde">
          <div className="tc-od-sayilar">
            <div><strong>{m.klasorsuz.firma}</strong><span>müşteri klasörsüz</span></div>
            <div><strong>{m.klasorsuz.siparis}</strong><span>sipariş klasörsüz</span></div>
            <div><strong>{m.klasorsuz.proje}</strong><span>proje klasörsüz</span></div>
          </div>
          <div className="tc-od-arac">
            <Dugme tur="birincil" simge="layers" disabled={!kokVar || toplam === 0} onClick={() => onayYaz(true)}>Klasörleri aç</Dugme>
            <span className="tc-od-ipucu">{kokVar ? 'Önce sayıyı gösterir, onaydan sonra açar. Var olan veriye dokunmaz.' : 'Önce "Müşteriler" klasörünü açın.'}</span>
          </div>
        </div>
      )}
      <Pencere
        acik={onay} kapat={() => { if (!suruyor) onayYaz(false); }} baslik="Mevcut kayıtlar için klasör açılsın mı?"
        alt={(
          <>
            <Dugme disabled={suruyor} onClick={() => onayYaz(false)}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="layers" yukleniyor={suruyor} onClick={() => { void calistir(); }}>{toplam} klasörü aç</Dugme>
          </>
        )}
      >
        <div className="tc-od-form">
          <div className="tc-od-sayilar">
            <div><strong>{m.klasorsuz.firma}</strong><span>müşteri</span></div>
            <div><strong>{m.klasorsuz.siparis}</strong><span>sipariş</span></div>
            <div><strong>{m.klasorsuz.proje}</strong><span>proje</span></div>
          </div>
          <p>{`${toplam} klasör ve şablondaki alt klasörleri açılacak. Var olan klasör ve dosyalara dokunulmaz. Açılan klasörler arşive kaldırılarak geri alınır.`}</p>
          <p className="tc-od-uyari"><Simge ad="alert" boyut="k" />İptal edilmiş siparişlerin klasörü arşivde açılır.</p>
        </div>
      </Pencere>
    </Kart>
  );
}

// Kalıcı silmede dört göz (3443 a, 5): genel ayar ucuyla yazılır (ayar yazma yetkisi, denetime girer). `beklenen` ekranın gördüğü
// değerdir: arada başkası değiştirdiyse sunucu reddeder.
const DORT_GOZ = 'ortak-dosyalar.silme-dort-goz';
function DortGoz({ acik }: { acik: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const degistir = useTekGonderim<boolean, unknown>({
    mutationFn: (deger) => api.post(`/ayarlar/${encodeURIComponent(DORT_GOZ)}/degistir`, { deger, beklenen: acik } satisfies AyarDegistirGovdesi),
    onSuccess: async (_c, deger) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', deger ? 'Dört göz açıldı: kalıcı silme başka bir Yönetir kişinin onayıyla olur.' : 'Dört göz kapatıldı; bekleyen istekler yine ikinci kişiyle sonuçlanır.');
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Ayar değiştirilemedi')),
  });
  return (
    <Kart baslik="Kalıcı silme" simge="trash" sag={<Rozet ton="bilgi">Yalnız yönetici</Rozet>}>
      <div className="tc-od-ayar-govde">
        <label className="tc-od-anahtar">
          <input type="checkbox" checked={acik} disabled={degistir.isPending} onChange={(o) => degistir.mutate(o.target.checked)} />
          Ortak Dosyalar'da kalıcı silmeye dört göz
        </label>
        <p className="tc-od-ipucu">
          {acik
            ? 'Açık: kalıcı silme bir istek açar; klasörde Yönetir düzeyi olan başka bir kişi onaylayınca dosya silinir.'
            : 'Kapalı (varsayılan): Yönetir düzeyi olan kişi Arşiv\'deki dosyayı adını yazarak tek başına siler.'}
        </p>
        <p className="tc-od-ipucu">Arşive kaldırma ve geri alma dört göze girmez; sistem hiçbir dosyayı kendiliğinden kalıcı silmez.</p>
      </div>
    </Kart>
  );
}

function TopluIsler({ ayar }: { ayar: AyarlarCevabi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const komut = useTekGonderim<{ id: string; arsiv: boolean }, TopluGeriAlCevabi>({
    mutationFn: (k) => api.post<TopluGeriAlCevabi>(`/ortak-dosyalar/ayarlar/toplu/${k.id}/${k.arsiv ? 'arsivle' : 'arsivden-cikar'}`, {}),
    onSuccess: async (c, k) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', k.arsiv
        ? `${c.arsivlenen} klasör arşive kaldırıldı${c.atlanan > 0 ? `; içinde dosya olan ${c.atlanan} klasör atlandı` : ''}.`
        : `${c.arsivlenen} klasör arşivden geri alındı.`);
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Toplu iş değiştirilemedi')),
  });
  if (ayar.topluIsler.length === 0) return null;
  return (
    <Kart baslik="Toplu işler" simge="clock">
      <ul className="tc-od-olaylar">
        {ayar.topluIsler.map((t) => (
          <li key={t.id}>
            <Simge ad="layers" boyut="k" />
            <span>{`${t.klasorSayisi} klasör${t.arsivde > 0 ? ` · ${t.arsivde} arşivde` : ''}`}</span>
            <span className="tc-od-satir-is">
              <time className="mono">{zamanMetni(t.zaman)}</time>
              {t.arsivde < t.klasorSayisi && <Dugme simge="lock" onClick={() => komut.mutate({ id: t.id, arsiv: true })}>Arşive kaldır</Dugme>}
              {t.arsivde > 0 && <Dugme simge="back" onClick={() => komut.mutate({ id: t.id, arsiv: false })}>Geri al</Dugme>}
            </span>
          </li>
        ))}
      </ul>
    </Kart>
  );
}

export function Ayarlar() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const q = useQuery({ queryKey: [...anahtarlar.kok, 'ayarlar'], queryFn: () => api.get<AyarlarCevabi>('/ortak-dosyalar/ayarlar') });
  const kokAc = useTekGonderim<void, AyarlarCevabi>({
    mutationFn: () => api.post<AyarlarCevabi>('/ortak-dosyalar/ayarlar/kok-ac', {}, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.kok }); bildir('tamam', '"Müşteriler" klasörü açıldı.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Klasör açılamadı')),
  });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Ayarlar okunamadı')} yenile={() => { void q.refetch(); }} />;
  const ayar = q.data;
  return (
    <div className="tc-od-ayarlar">
      <div className="tc-od-ayar-sutun">
        <Kart baslik="Müşteriler klasörü" simge="pin">
          <div className="tc-od-ayar-govde">
            {ayar.kok === null ? (
              <>
                <p>Müşteri, sipariş ve proje klasörleri bu klasörün altında açılır ve yetkisini ondan alır.</p>
                <div className="tc-od-arac"><Dugme tur="birincil" simge="plus" yukleniyor={kokAc.isPending} onClick={() => kokAc.mutate()}>"Müşteriler" klasörünü aç</Dugme></div>
              </>
            ) : <p><Rozet ton="tamam">Açık</Rozet> Rol düzeyleri klasörün Yetkiler sekmesinden değişir.</p>}
          </div>
        </Kart>
        <Sablon ayar={ayar} />
        <DortGoz acik={ayar.silmeDortGoz} />
      </div>
      <div className="tc-od-ayar-sutun">
        <Acilamayanlar ayar={ayar} />
        <Mevcut kokVar={ayar.kok !== null} />
        <TopluIsler ayar={ayar} />
      </div>
    </div>
  );
}
