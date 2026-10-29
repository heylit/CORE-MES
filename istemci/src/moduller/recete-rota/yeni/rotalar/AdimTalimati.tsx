import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TalimatlarCevabi, TalimatSablonuCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, Pencere, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { AdimDuzenleyici } from '../sartnameler/index.tsx';
import { adimEksikleri, AZAMI_TALIMAT_ADIMI, girdiyeCevir, kontrolOzeti, taslagaCevir, type AdimTaslagi } from '../sartnameler/kurallar.ts';
import { anahtarlar, useSablonlar, useTalimatKomutu, useTalimatlar } from '../sartnameler/veri.ts';
import { useRrYetkisi } from '../yetki.ts';
import { Bolme } from './ortak.tsx';

// Rota adımının adım adım talimatı (989 a, 1193 a): panelde yayındaki sürümün özeti ve taslağın durumu; düzenleyici tam pencerede
// (prototip Duzenleyici). Talimat önce taslakta yazılır, yayınlanınca yeni sürüm olur ve bundan sonra açılan emre geçer (1194 b).

type Talimat = TalimatlarCevabi['surumler'][number];
type Taslak = NonNullable<TalimatlarCevabi['taslak']>;

const tarih = (z: string): string => new Date(z).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function AdimTalimati({ urunId, opNo }: { urunId: number; opNo: number | null }) {
  const talimat = useTalimatlar(urunId, opNo);
  const yazabilir = useRrYetkisi().talimatYaz;
  const [acik, setAcik] = useState(false);
  if (opNo === null) {
    return <Bolme baslik="Talimat"><p className="tc-rr1-ipucu">Adım kaydedilip OP numarası alınca talimat yazılır.</p></Bolme>;
  }
  const son = talimat.data?.surumler[0] ?? null;
  const taslak = talimat.data?.taslak ?? null;
  return (
    <Bolme baslik={son ? `Talimat · yayında sürüm ${String(son.surum)}` : 'Talimat'}>
      {talimat.isPending && <p className="tc-rr1-ipucu">Talimat okunuyor…</p>}
      {talimat.isError && <p className="tc-rr1-hata" role="alert">{hataIletisi(talimat.error, 'Talimat okunamadı.')}</p>}
      {talimat.isSuccess && !son && <p className="tc-rr1-ipucu">Yayında talimat yok. Operatör terminalde yalnız iş emrini görür.</p>}
      {son && <AdimOzeti adimlar={son.adimlar} />}
      {son && <p className="tc-rr1-ipucu">{`${son.yazan.ad ?? 'Bilinmeyen kişi'} yayınladı · ${tarih(son.yazma)}`}</p>}
      {taslak && (
        <p className="tc-rr1-eksik">
          <Simge ad="edit" boyut="k" />
          {`Yayınlanmamış taslak: ${String(taslak.adimlar.length)} adım · ${taslak.yazan.ad ?? 'Bilinmeyen kişi'} · ${tarih(taslak.yazma)}`}
        </p>
      )}
      {yazabilir && talimat.isSuccess && (
        <div className="tc-rr1-btnrow">
          <Dugme tur="ikincil" simge="edit" onClick={() => { setAcik(true); }}>{taslak ? 'Taslağı düzenle' : son ? 'Talimatı düzenle' : 'Talimat yaz'}</Dugme>
        </div>
      )}
      {acik && talimat.data && (
        <TalimatPenceresi urunId={urunId} opNo={opNo} son={son} taslak={taslak} kapat={() => { setAcik(false); }} />
      )}
    </Bolme>
  );
}

function AdimOzeti({ adimlar }: { adimlar: Talimat['adimlar'] }) {
  return (
    <ol className="tc-rr1-talimat">
      {adimlar.map((a) => {
        const kontrol = kontrolOzeti(a.kontrol);
        return (
          <li key={a.sira}>
            <b>{a.baslik}</b>
            {(kontrol || a.medya.length > 0) && (
              <small className="tc-rr1-ipucu">
                {a.medya.length > 0 && <><Simge ad="camera" boyut="k" />{a.medya.length} </>}
                {kontrol && (a.zorunlu ? `${kontrol} · zorunlu` : kontrol)}
              </small>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Düzenleyici taslaktan, taslak yoksa yayındaki sürümden başlar. "Yayınla" kaydedilmemiş değişikliği önce taslağa yazar.
function TalimatPenceresi({ urunId, opNo, son, taslak, kapat }: {
  urunId: number; opNo: number; son: Talimat | null; taslak: Taslak | null; kapat: () => void;
}) {
  const komut = useTalimatKomutu(urunId);
  const { bildir } = useBildirim();
  const [adimlar, setAdimlar] = useState<AdimTaslagi[]>(() => (taslak ?? son)?.adimlar.map(taslagaCevir) ?? []);
  const [kirli, setKirli] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const eksikler = adimEksikleri(adimlar);
  const yeniSurum = (son?.surum ?? 0) + 1;
  const degistir = (a: AdimTaslagi[]) => { setAdimlar(a); setKirli(true); };
  const hataYaz = (h: unknown, ekran: string) => { setHata(hataIletisi(h, ekran)); };

  const kaydet = async (): Promise<number | null> => {
    const c = await komut.mutateAsync({
      ad: 'talimat-taslak-kaydet', govde: { opNo, okunanSurum: son?.surum ?? null, taslakSurum: taslak?.surum ?? null, adimlar: adimlar.map(girdiyeCevir) },
    });
    setKirli(false);
    return c.taslak?.surum ?? null;
  };
  const taslagiKaydet = () => {
    setHata(null);
    kaydet().then(() => { bildir('tamam', `OP ${String(opNo)} talimat taslağı kaydedildi. Yayınlanana kadar emre geçmez.`); kapat(); })
      .catch((h: unknown) => { hataYaz(h, 'Taslak kaydedilemedi.'); });
  };
  const yayinla = () => {
    setHata(null);
    (async () => {
      const taslakSurum = kirli || !taslak ? await kaydet() : taslak.surum;
      if (taslakSurum === null) throw new Error('Taslak kaydedilemedi.');
      await komut.mutateAsync({ ad: 'talimat-yayinla', govde: { opNo, taslakSurum } });
      bildir('tamam', `OP ${String(opNo)} talimatının ${String(yeniSurum)}. sürümü yayınlandı. Bundan sonra açılan emirler bu sürümü alır.`);
      kapat();
    })().catch((h: unknown) => { hataYaz(h, 'Talimat yayınlanamadı.'); });
  };
  const sil = () => {
    if (!taslak) return;
    setHata(null);
    komut.mutateAsync({ ad: 'talimat-taslak-sil', govde: { opNo, taslakSurum: taslak.surum } })
      .then(() => { bildir('tamam', 'Talimat taslağı silindi; yayındaki sürüm kaldı.'); kapat(); })
      .catch((h: unknown) => { hataYaz(h, 'Taslak silinemedi.'); });
  };

  const durum = [taslak ? `taslak s${String(taslak.surum)}` : 'yeni taslak', son ? `yayında s${String(son.surum)}` : 'yayında sürüm yok'].join(' · ');
  return (
    <Pencere acik tur="tam" kapat={kapat} baslik={`OP ${String(opNo)} · adım adım talimat`}>
      <div className="tc-st-duz-govde">
        <p className="tc-rr1-ipucu">{`${durum}. Taslak yayınlanana kadar emre geçmez; yayınlanan sürüm bundan sonra açılan emirlere geçer, açık emirler kendi sürümünde kalır.`}</p>
        <AdimDuzenleyici adimlar={adimlar} degistir={degistir}
          sablonlar={<SablonListesi ekle={(yeni) => { degistir([...adimlar, ...yeni].slice(0, AZAMI_TALIMAT_ADIMI)); }} dolu={adimlar.length >= AZAMI_TALIMAT_ADIMI} />}
          alt={(
            <>
              {eksikler.length > 0 && <ul className="tc-st-eksik">{eksikler.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
              {hata && <p className="tc-st-hata" role="alert">{hata}</p>}
              <div className="tc-st-araclar tc-st-sag">
                <Dugme onClick={kapat}>Vazgeç</Dugme>
                {taslak && <Dugme tur="tehlike" simge="trash" disabled={komut.isPending} onClick={sil}>Taslağı sil</Dugme>}
                <Dugme simge="check" disabled={eksikler.length > 0 || (!kirli && taslak !== null)} yukleniyor={komut.isPending} onClick={taslagiKaydet}>Taslağı kaydet</Dugme>
                <Dugme tur="birincil" simge="upload" disabled={eksikler.length > 0} yukleniyor={komut.isPending} onClick={yayinla}>
                  {`Sürüm ${String(yeniSurum)}'i yayınla`}
                </Dugme>
              </div>
            </>
          )} />
      </div>
    </Pencere>
  );
}

// "Şablondan başla" (prototip): şablonun adımları talimatın sonuna kopyalanır; şablon sonradan değişse talimat değişmez (989 a).
function SablonListesi({ ekle, dolu }: { ekle: (a: AdimTaslagi[]) => void; dolu: boolean }) {
  const sablonlar = useSablonlar();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [yukleniyor, setYukleniyor] = useState<number | null>(null);
  const kopyala = async (id: number) => {
    setYukleniyor(id);
    try {
      const c = await istemci.fetchQuery({ queryKey: anahtarlar.sablon(id), queryFn: () => api.get<TalimatSablonuCevabi>(`/rota/talimat-sablonlari/${String(id)}`) });
      ekle(c.sablon.adimlar.map(taslagaCevir));
      bildir('tamam', `${c.sablon.kod} şablonunun ${String(c.sablon.adimlar.length)} adımı talimatın sonuna eklendi.`);
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Şablon okunamadı.'));
    } finally {
      setYukleniyor(null);
    }
  };
  const etkin = (sablonlar.data?.sablonlar ?? []).filter((s) => s.aktif);
  return (
    <div className="tc-rr1-sablon-sec">
      <p className="tc-rr1-ipucu">Şablon adımları talimatın sonuna kopyalanır; şablon sonradan değişse bu talimat değişmez.</p>
      {sablonlar.isError && <p className="tc-st-hata" role="alert">{hataIletisi(sablonlar.error, 'Şablonlar okunamadı.')}</p>}
      {sablonlar.isSuccess && etkin.length === 0 && <p className="tc-rr1-ipucu">Kullanımda şablon yok.</p>}
      {etkin.map((s) => (
        <Dugme key={s.id} disabled={dolu} yukleniyor={yukleniyor === s.id} onClick={() => { void kopyala(s.id); }}>
          {`${s.kod} · ${s.ad} · ${String(s.adimSayisi)} adım`}
        </Dugme>
      ))}
    </div>
  );
}
