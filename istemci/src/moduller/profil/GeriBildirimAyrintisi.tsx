import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  GeriBildirimAyrintiCevabi, GeriBildirimDurumu, GeriBildirimSecenekleriCevabi, GeriBildirimTakipGovdesi,
} from '#paylasilan/sozlesme/profil.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ADI, DURUM_TONU, DURUMLAR, KONU_ADI, METIN_EN_COK, TUR_ADI, TUR_TONU, YANIT_EN_AZ, zamanMetni } from './gorunum.ts';
import { useIslemVar, useMerkezKomutu, yazmaIletisi } from './yazma.ts';

type Yazi = 'yanit' | 'not';
const HAREKET_SIMGESI: Record<GeriBildirimAyrintiCevabi['hareketler'][number]['tur'], SimgeAdi> = { yanit: 'chev-right', not: 'lock', durum: 'check' };

// Seçili kaydın ayrıntısı: çalışanın yazdığı (değişmez), takip alanları, hareketler ve yanıt ya da iç not. Yazma düğmeleri
// yalnız yanıtlama işlemi olana görünür; takip okunan sürümle yazılır.
export function GeriBildirimAyrintisi({ id, secenekler, sec }: {
  id: number; secenekler: GeriBildirimSecenekleriCevabi | null; sec: (id: number) => void;
}) {
  const sorgu = useQuery({ queryKey: anahtarlar.ayrinti(id), queryFn: () => api.get<GeriBildirimAyrintiCevabi>(`/profil/geri-bildirimler/${id}`) });
  if (sorgu.isPending) return <Kart><DurumKutusu durum="yukleniyor" /></Kart>;
  if (sorgu.isError) {
    return <Kart><DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Kayıt alınamadı')} yenile={() => { void sorgu.refetch(); }} /></Kart>;
  }
  return <Ayrinti key={`${sorgu.data.kayit.id}-${sorgu.data.surum}`} veri={sorgu.data} secenekler={secenekler} sec={sec} />;
}

function Ayrinti({ veri, secenekler, sec }: { veri: GeriBildirimAyrintiCevabi; secenekler: GeriBildirimSecenekleriCevabi | null; sec: (id: number) => void }) {
  const { kayit } = veri;
  const yazabilir = useIslemVar('profil.geri-bildirim-yanitla');
  const komut = useMerkezKomutu();
  const [durum, durumYaz] = useState<GeriBildirimDurumu>(kayit.durum);
  const [kategori, kategoriYaz] = useState(kayit.kategoriId === null ? '' : String(kayit.kategoriId));
  const [sorumlu, sorumluYaz] = useState(veri.sorumluKisiId === null ? '' : String(veri.sorumluKisiId));
  const [ana, anaYaz] = useState(kayit.anaKayitId === null ? '' : String(kayit.anaKayitId));
  const [yazi, yaziYaz] = useState<Yazi>('yanit');
  const [metin, metinYaz] = useState('');
  const [gidiyor, gidiyorYaz] = useState<'takip' | Yazi | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  // Pasif kategori yalnız kayıtta seçiliyse listede kalır (sunucu kuralı GBM-5).
  const kategoriler = (secenekler?.kategoriler ?? []).filter((k) => k.etkin || k.id === kayit.kategoriId)
    .filter((k) => k.konu === null || k.konu === kayit.konu || k.id === kayit.kategoriId);
  const sorumlular = secenekler?.sorumlular ?? [];
  const sayiYaDaNull = (d: string): number | null => (d.trim() === '' ? null : Number(d));
  const anaGecerli = ana.trim() === '' || /^\d+$/.test(ana.trim());
  const takipDegisti = durum !== kayit.durum || sayiYaDaNull(kategori) !== kayit.kategoriId
    || sayiYaDaNull(sorumlu) !== veri.sorumluKisiId || sayiYaDaNull(ana) !== kayit.anaKayitId;

  const takipKaydet = async () => {
    if (!anaGecerli) return;
    gidiyorYaz('takip');
    hataYaz(null);
    try {
      const govde: GeriBildirimTakipGovdesi = {
        durum, kategoriId: sayiYaDaNull(kategori), sorumluKisiId: sayiYaDaNull(sorumlu), anaKayitId: sayiYaDaNull(ana), surum: veri.surum,
      };
      await komut(`/profil/geri-bildirimler/${kayit.id}/takip-degistir`, govde, false);
    } catch (e) {
      hataYaz(yazmaIletisi(e, 'Kaydedilemedi.'));
    } finally {
      gidiyorYaz(null);
    }
  };

  const yaziGonder = async (o: FormEvent) => {
    o.preventDefault();
    if (metin.trim().length < YANIT_EN_AZ) return;
    gidiyorYaz(yazi);
    hataYaz(null);
    try {
      if (yazi === 'yanit') await komut(`/profil/geri-bildirimler/${kayit.id}/yanitla`, { metin: metin.trim(), surum: veri.surum }, true);
      else await komut(`/profil/geri-bildirimler/${kayit.id}/not-ekle`, { metin: metin.trim() }, true);
      metinYaz('');
    } catch (e) {
      hataYaz(yazmaIletisi(e, 'Gönderilemedi.'));
    } finally {
      gidiyorYaz(null);
    }
  };

  return (
    <Kart
      baslik={`#${kayit.id}`}
      baslikEki={(
        <span className="tc-profil-gb-ust">
          <Rozet ton={TUR_TONU[kayit.tur]}>{TUR_ADI[kayit.tur]}</Rozet>
          <Rozet ton={DURUM_TONU[kayit.durum]} gorunum="cizgi">{DURUM_ADI[kayit.durum]}</Rozet>
        </span>
      )}
    >
      <div className="tc-gbm-ayrinti">
        <p className="tc-profil-soluk"><Simge ad="user" boyut="k" /> {kayit.kisiAdi} · {KONU_ADI[kayit.konu]} · {zamanMetni(kayit.gonderildi)}</p>
        <blockquote className="tc-gbm-asil">{kayit.metin}</blockquote>
        <p className="tc-profil-soluk">Çalışanın yazdığı değiştirilemez.</p>

        <div className="tc-gbm-kunye">
          <Secim etiket="Durum" value={durum} disabled={!yazabilir} onChange={(o) => durumYaz(o.target.value as GeriBildirimDurumu)}
            secenekler={DURUMLAR.map((d) => ({ deger: d, baslik: DURUM_ADI[d] }))} />
          <Secim etiket="Kategori" value={kategori} bosSecenek="Kategorisiz" disabled={!yazabilir} onChange={(o) => kategoriYaz(o.target.value)}
            secenekler={kategoriler.map((k) => ({ deger: String(k.id), baslik: k.etkin ? k.ad : `${k.ad} (pasif)` }))} />
          <Secim etiket="Sorumlu" value={sorumlu} bosSecenek="Atanmadı" disabled={!yazabilir} onChange={(o) => sorumluYaz(o.target.value)}
            secenekler={[
              ...sorumlular.map((k) => ({ deger: String(k.id), baslik: k.ad })),
              ...(veri.sorumluKisiId !== null && !sorumlular.some((k) => k.id === veri.sorumluKisiId)
                ? [{ deger: String(veri.sorumluKisiId), baslik: veri.sorumluAdi ?? `Kişi ${veri.sorumluKisiId}` }] : []),
            ]} />
          <Girdi etiket="Aynı konu: ana kayıt no" inputMode="numeric" value={ana} disabled={!yazabilir} onChange={(o) => anaYaz(o.target.value)}
            hata={anaGecerli ? undefined : 'Kayıt numarası yazın.'} ipucu="Boş bırakılırsa bağlı değil." />
        </div>
        {yazabilir && (
          <div className="tc-gbm-dugmeler">
            <Dugme simge="check" disabled={!takipDegisti || !anaGecerli} yukleniyor={gidiyor === 'takip'} onClick={() => { void takipKaydet(); }}>
              Takibi kaydet
            </Dugme>
          </div>
        )}
        {veri.baglilar.length > 0 && (
          <div>
            <h3 className="tc-gbm-baslik"><Simge ad="layers" boyut="k" /> Bu kayda bağlananlar</h3>
            <ul className="tc-profil-liste">
              {veri.baglilar.map((b) => (
                <li key={b.id}>
                  <button type="button" className="tc-gbm-satir" onClick={() => sec(b.id)}>
                    <span className="tc-profil-gb-ust">
                      <Rozet ton={DURUM_TONU[b.durum]}>{DURUM_ADI[b.durum]}</Rozet>
                      <span className="tc-profil-soluk mono">#{b.id}</span>
                    </span>
                    <span className="tc-gbm-ozet-metin">{b.metin}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3 className="tc-gbm-baslik">Hareketler</h3>
        {veri.hareketler.length === 0 ? <p className="tc-profil-bos">Henüz hareket yok.</p> : (
          <ol className="tc-gbm-akis">
            {veri.hareketler.map((h) => (
              <li key={h.id} className={`tc-gbm-akis-oge tc-gbm-akis-${h.tur}`}>
                <span className="tc-gbm-akis-simge" aria-hidden="true"><Simge ad={HAREKET_SIMGESI[h.tur]} boyut="k" /></span>
                <div className="tc-gbm-akis-govde">
                  <span className="tc-profil-soluk">
                    {h.tur === 'yanit' ? `Yanıt · yazana "${h.imza ?? ''}" imzasıyla görünür` : h.tur === 'not' ? 'İç not · yalnız merkez' : 'Durum'}
                    {' · '}{h.kisiAdi} · {zamanMetni(h.zaman)}
                  </span>
                  {h.tur === 'durum' && h.durum !== null
                    ? <Rozet ton={DURUM_TONU[h.durum]} gorunum="cizgi">{DURUM_ADI[h.durum]}</Rozet>
                    : <p className="tc-profil-gb-metin">{h.metin}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {yazabilir && (
          <form className="tc-profil-form" onSubmit={(o) => { void yaziGonder(o); }} noValidate>
            <div className="tc-gbm-sekme" role="group" aria-label="Yazı türü">
              <Dugme tur={yazi === 'yanit' ? 'birincil' : 'ikincil'} simge="chev-right" aria-pressed={yazi === 'yanit'} onClick={() => yaziYaz('yanit')}>Yanıt</Dugme>
              <Dugme tur={yazi === 'not' ? 'birincil' : 'ikincil'} simge="lock" aria-pressed={yazi === 'not'} onClick={() => yaziYaz('not')}>İç not</Dugme>
            </div>
            <CokSatir
              etiket={yazi === 'yanit' ? 'Çalışana yanıt' : 'İç not'}
              rows={3}
              maxLength={METIN_EN_COK}
              value={metin}
              onChange={(o) => metinYaz(o.target.value)}
              ipucu={yazi === 'yanit' ? 'Yazana rol adınızla görünür.' : 'Yalnız merkezi görenler okur.'}
            />
            <div className="tc-gbm-dugmeler">
              <Dugme tur="birincil" type="submit" simge={yazi === 'yanit' ? 'chev-right' : 'lock'} disabled={metin.trim().length < YANIT_EN_AZ} yukleniyor={gidiyor === yazi}>
                {yazi === 'yanit' ? 'Yanıtı gönder' : 'Notu kaydet'}
              </Dugme>
            </div>
          </form>
        )}
        {hata !== null && <p className="tc-profil-hata" role="alert">{hata}</p>}
      </div>
    </Kart>
  );
}
