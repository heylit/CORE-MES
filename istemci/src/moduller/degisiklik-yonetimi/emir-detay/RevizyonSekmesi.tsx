import type { EmirCevabi, EmirKalemi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { CEVAPLAR, type Cevap } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, Kart, Rozet, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { useForm } from '../../../ortak/veri/form.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { yeniParcaNoOnizleme } from './emir-adimlari.ts';
import { useEmirKomutu } from './emir-veri.ts';

const CEVAP_SECENEKLERI = CEVAPLAR.map((c) => ({ deger: c, baslik: c === 'evet' ? 'Evet' : 'Hayır' }));
const malzemeMetni = (k: EmirKalemi) => k.malzeme.kod ?? `Malzeme ${k.malzeme.malzemeId}`;
const etiket = (bag: EmirKalemi['eskiCizimRevizyonu']) => bag?.etiket ?? (bag ? `#${bag.id}` : null);

// Prototipin ecoRevTab ve itemSheet'i. Yeni çizim ve rota revizyonu sahibi modülde açılır, burada bağlanır (1121 a).
export function RevizyonSekmesi({ emir }: { emir: EmirCevabi }) {
  if (emir.durum === 'acik') {
    return (
      <Kart baslik="Etkilenen kalemler" simge="layers">
        <ul className="dy-liste">
          {emir.kalemler.map((k) => (
            <li key={k.id}>
              <span className="dy-kod">{malzemeMetni(k)}</span>
              {etiket(k.eskiCizimRevizyonu) && <> rev <span className="dy-kod">{etiket(k.eskiCizimRevizyonu)}</span></>}
              , yürürlükteki rota {etiket(k.eskiRotaRevizyonu) ?? '—'}
            </li>
          ))}
        </ul>
        <p className="dy-not">Hazırlığı başlatınca yürürlükteki revizyonlar kaleme bağlanır. Taslak, yayınlanana kadar üretimi etkilemez.</p>
      </Kart>
    );
  }
  if (emir.kalemler.length === 0) return <DurumKutusu durum="bos" mesaj="Bu değişiklik emrinde kalem yok." />;
  return <div className="dy-kalemler">{emir.kalemler.map((k) => <KalemKarti key={k.id} emir={emir} kalem={k} />)}</div>;
}

interface KalemDegerleri {
  eskiYeniyeUyar: Cevap | null;
  yeniEskiyeUyar: Cevap | null;
  yeniParcaNo: string;
  yeniParcaAdi: string;
  ozet: string;
}

function KalemKarti({ emir, kalem }: { emir: EmirCevabi; kalem: EmirKalemi }) {
  const yetki = useYetki();
  const { bildir } = useBildirim();
  const kaydet = useEmirKomutu(emir.id, 'kalemKaydet');
  const duzenlenir = emir.durum === 'revizyon_hazirlaniyor' && yetki.var('degisiklik-yonetimi.revizyon-hazirla');
  const tasarim = emir.sinif === 'D1' || emir.sinif === 'D2';
  const form = useForm<KalemDegerleri>({
    ilk: {
      eskiYeniyeUyar: kalem.eskiYeniyeUyar, yeniEskiyeUyar: kalem.yeniEskiyeUyar,
      yeniParcaNo: kalem.yeniParcaNo ?? '', yeniParcaAdi: kalem.yeniParcaAdi ?? '', ozet: kalem.ozet,
    },
    hataIletisi: 'Kalem kaydedilemedi.',
    kaydet: (d) => kaydet.mutateAsync({
      kalemId: kalem.id, yeniCizimRevizyonuId: kalem.yeniCizimRevizyonu?.id ?? null, yeniRotaRevizyonuId: kalem.yeniRotaRevizyonu?.id ?? null,
      eskiYeniyeUyar: d.eskiYeniyeUyar, yeniEskiyeUyar: d.yeniEskiyeUyar, yeniParcaNo: d.yeniParcaNo, yeniParcaAdi: d.yeniParcaAdi, ozet: d.ozet,
      surum: emir.surum,
    }),
    basarili: () => bildir('tamam', `${malzemeMetni(kalem)} kaydedildi.`),
  });
  const d = form.degerler;
  // Düzenlerken cevaplardan önizlenir; kayıtlı halde sunucunun hesabı gösterilir.
  const yeniNo = tasarim ? (duzenlenir ? yeniParcaNoOnizleme(d.eskiYeniyeUyar, d.yeniEskiyeUyar) : kalem.yeniParcaNoGerekir) : false;
  const sonra = tasarim
    ? yeniNo ? <><span className="dy-kod">{kalem.yeniParcaNo ?? (d.yeniParcaNo || 'Yeni parça no')}</span> rev <span className="dy-kod">A</span></>
      : <><span className="dy-kod">{malzemeMetni(kalem)}</span> rev <span className="dy-kod">{etiket(kalem.yeniCizimRevizyonu) ?? 'bağlanacak'}</span></>
    : <><span className="dy-kod">{malzemeMetni(kalem)}</span> rev <span className="dy-kod">{etiket(kalem.eskiCizimRevizyonu) ?? '—'}</span></>;
  const tur = !tasarim ? <Rozet>Rota revizyonu</Rozet> : yeniNo ? <Rozet ton="hata">Yeni parça numarası</Rozet> : <Rozet>Revizyon</Rozet>;
  const cevapSec = (alan: 'eskiYeniyeUyar' | 'yeniEskiyeUyar') => ({
    value: d[alan] ?? '', disabled: !duzenlenir, hata: form.hata(alan),
    onChange: (o: { target: { value: string } }) => form.degistir({ [alan]: o.target.value === '' ? null : (o.target.value as Cevap) }),
  });

  return (
    <Kart baslikEki={(
      <h2 className="dy-kalem-baslik">
        <span className="dy-kod">{malzemeMetni(kalem)}</span>
        {etiket(kalem.eskiCizimRevizyonu) && <> rev <span className="dy-kod">{etiket(kalem.eskiCizimRevizyonu)}</span></>}
        <span aria-hidden="true"> → </span>{sonra} {tur}
      </h2>
    )}>
      <form className="dy-kalem" aria-label={`${malzemeMetni(kalem)} kalemi`} noValidate onSubmit={form.gonder}>
        {form.genelHata && <p className="dy-not dy-not-hata" role="alert">{form.genelHata}</p>}
        {tasarim && (
          <div className={`dy-not ${yeniNo ? 'dy-not-hata' : 'dy-not-tamam'} dy-karar-blogu`}>
            <div className="dy-alanlar">
              <Secim etiket="Eski parça, yeni ürün yapısında yerine takılabilir mi?" secenekler={CEVAP_SECENEKLERI} bosSecenek="Seçin" {...cevapSec('eskiYeniyeUyar')} />
              <Secim etiket="Yeni parça, eski ürün yapısında yerine takılabilir mi?" secenekler={CEVAP_SECENEKLERI} bosSecenek="Seçin" {...cevapSec('yeniEskiyeUyar')} />
              <div className="dy-kural">
                <b>{yeniNo === null ? 'Kural' : yeniNo ? 'Değiştirilemez: yeni parça numarası verilir.' : 'İki yönlü değiştirilebilir: revizyon yeterli.'}</b>
                <p className="dy-silik">
                  {yeniNo === null
                    ? 'İki yönde de takılabiliyorsa revizyon, aksi halde yeni parça numarası. Üst montajın dış arayüzü değişmiyorsa üst montaj yalnızca revizyon alır.'
                    : yeniNo ? `Eski numara (${malzemeMetni(kalem)}) yalnızca yedek parça olarak kalır; stok ve eski konfigürasyondaki ürünler bu numarayla izlenir.`
                      : 'Stokta ayrıştırma gerekmez.'}
                </p>
              </div>
            </div>
            {yeniNo && (
              <div className="dy-alanlar">
                <Girdi etiket="Yeni parça numarası" maxLength={60} disabled={!duzenlenir} {...form.alan('yeniParcaNo')} />
                <Girdi etiket="Ad" maxLength={160} disabled={!duzenlenir} {...form.alan('yeniParcaAdi')} />
              </div>
            )}
          </div>
        )}
        <CokSatir etiket="Değişiklik özeti" rows={2} maxLength={1000} disabled={!duzenlenir} {...form.alan('ozet')} />
        <h3 className="dy-ara-baslik">Revizyon bağları</h3>
        <div className="tc-tablo-kap">
          <table className="tc-tablo dy-fark" aria-label={`${malzemeMetni(kalem)} revizyon bağları`}>
            <thead><tr><th scope="col">Kayıt</th><th scope="col">Yürürlükte</th><th scope="col">Yeni</th></tr></thead>
            <tbody>
              <tr><td>Çizim</td><td className="dy-eski">{etiket(kalem.eskiCizimRevizyonu) ?? '—'}</td><td className="dy-yeni">{etiket(kalem.yeniCizimRevizyonu) ?? 'Bağlanmadı'}</td></tr>
              <tr><td>Rota</td><td className="dy-eski">{etiket(kalem.eskiRotaRevizyonu) ?? '—'}</td><td className="dy-yeni">{etiket(kalem.yeniRotaRevizyonu) ?? 'Bağlanmadı'}</td></tr>
            </tbody>
          </table>
        </div>
        <h3 className="dy-ara-baslik">MBOM ve rota karşılaştırması</h3>
        <p className="dy-not">Bileşen ve operasyon farkları rota modülü bağlanınca burada gösterilir. Yeni çizim ve rota revizyonu sahibi modülde taslak olarak açılır ve bu kaleme bağlanır.</p>
        {duzenlenir && (
          <div className="dy-satir-sonu">
            <Dugme tur="birincil" type="submit" simge="check" yukleniyor={form.gonderiliyor}>Kalemi kaydet</Dugme>
          </div>
        )}
      </form>
    </Kart>
  );
}
