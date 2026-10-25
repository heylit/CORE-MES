import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KurFaizOzeti } from '#paylasilan/sozlesme/finans.ts';
import { Dugme, Girdi, Kart, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './finans.css';

const TESIS_TZ = 'Europe/Istanbul';
const KUR_BIRIMLERI = ['USD', 'EUR', 'GBP'];
const FAIZ_BIRIMLERI = ['TRY', 'USD', 'EUR'];

const sayi = (deger: string, basamak: number): string => Number(deger).toLocaleString('tr-TR', { maximumFractionDigits: basamak });
const gunMetni = (tarih: string, bugun: string): string => (tarih === bugun ? 'bugün' : tarih.split('-').reverse().join('.'));
// Giriş anı tesis saatiyle; bugünse "bugün 09:44".
function girisMetni(iso: string, bugun: string): string {
  const an = new Date(iso);
  const gun = an.toLocaleDateString('sv-SE', { timeZone: TESIS_TZ });
  return `${gunMetni(gun, bugun)} ${an.toLocaleTimeString('tr-TR', { timeZone: TESIS_TZ, hour: '2-digit', minute: '2-digit' })}`;
}

// Günlük kur ve faiz şeridi (kart #953): finans ve satın alma ekranının en üstünde durur. Değerleri finans.oku ya da
// finans.kur-yaz okur; girişi yalnız finans.kur-yaz yapar. Finans rakamı göstermez.
export function KurFaizSeridi() {
  const islemler = useOturum().data?.islemler ?? [];
  const yazabilir = islemler.includes('finans.kur-yaz');
  const okuyabilir = yazabilir || islemler.includes('finans.oku');
  const ozet = useQuery({ queryKey: ['finans', 'kur-ozeti'], queryFn: () => api.get<KurFaizOzeti>('/finans/kur-ozeti'), enabled: okuyabilir });
  if (!okuyabilir) return null;
  const o = ozet.data;
  const bugun = o?.bugun ?? '';
  return (
    <Kart baslik="Günlük kur ve faiz">
      <div className="tc-kf">
        {ozet.isError && <p className="tc-kf-not" role="alert">Kur ve faiz okunamadı.</p>}
        {o && (
          <>
            <p className="tc-kf-son" data-son-giris>
              {o.sonGiris
                ? <>Son giriş: <b>{girisMetni(o.sonGiris.giris, bugun)}</b>, <b>{o.sonGiris.girenAd ?? 'bilinmiyor'}</b> ({o.sonGiris.tur})</>
                : 'Henüz kur ya da faiz girilmedi.'}
            </p>
            <div className="tc-kf-degerler">
              {o.kurlar.length === 0 && <Rozet ton="uyari">Kur girilmedi</Rozet>}
              {o.kurlar.map((k) => (
                <span key={`k-${k.paraBirimi}`} title={`Giriş: ${girisMetni(k.giris, bugun)}`}>
                  <Rozet ton={k.tarih === bugun ? 'tamam' : 'uyari'}>{k.paraBirimi} {sayi(k.kur, 4)} · {gunMetni(k.tarih, bugun)} · {k.girenAd ?? 'bilinmiyor'}</Rozet>
                </span>
              ))}
              {o.faizler.map((f) => (
                <span key={`f-${f.paraBirimi}`} title={`Giriş: ${girisMetni(f.giris, bugun)}`}>
                  <Rozet ton="bilgi">{f.paraBirimi} faiz %{sayi(f.aylikYuzde, 2)}/ay · {gunMetni(f.gecerlilikBaslangic, bugun)} · {f.girenAd ?? 'bilinmiyor'}</Rozet>
                </span>
              ))}
            </div>
          </>
        )}
        {yazabilir && bugun && <Formlar bugun={bugun} />}
        <p className="tc-kf-not">Yeni kur ve faiz girildiği tarihten sonrasını etkiler; önceki kayıtlar kendi kurunu saklar.</p>
      </div>
    </Kart>
  );
}

function Formlar({ bugun }: { bugun: string }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kur, setKur] = useState({ paraBirimi: 'USD', tarih: bugun, deger: '' });
  const [faiz, setFaiz] = useState({ paraBirimi: 'TRY', baslangic: bugun, deger: '' });
  const sonra = async (ileti: string) => { bildir('tamam', ileti); await istemci.invalidateQueries({ queryKey: ['finans'] }); };
  const kurYaz = useMutation({
    mutationFn: () => api.post('/finans/kurlar/ekle', { paraBirimi: kur.paraBirimi, tarih: kur.tarih, kur: Number(kur.deger.replace(',', '.')) }),
    onSuccess: async () => { setKur((k) => ({ ...k, deger: '' })); await sonra('Kur kaydedildi.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Kur kaydedilemedi.')),
  });
  // Sonucu bilinmeyen gönderimden sonra yeniden kaydet aynı kimlikle gider (faiz ikinci kez yazılmaz); kayıt ya da sunucunun reddi
  // yeni girişe yeni kimlik açar.
  const faizKimligi = useRef(yeniIstekKimligi());
  const faizYaz = useMutation({
    mutationFn: () => {
      const govde = { paraBirimi: faiz.paraBirimi, gecerlilikBaslangic: faiz.baslangic, aylikYuzde: Number(faiz.deger.replace(',', '.')) };
      return tekrarKorumaliGonder(
        (d) => api.post('/finans/faizler/ekle', govde, { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }),
        { istekKimligi: faizKimligi.current },
      );
    },
    onSuccess: async () => { faizKimligi.current = yeniIstekKimligi(); setFaiz((f) => ({ ...f, deger: '' })); await sonra('Faiz kaydedildi.'); },
    onError: (h) => {
      if (!yenidenDenenebilirMi(h)) faizKimligi.current = yeniIstekKimligi();
      bildir('hata', hataIletisi(h, 'Faiz kaydedilemedi.'));
    },
  });
  const gonder = (yaz: { mutate: () => void }) => (e: FormEvent) => { e.preventDefault(); yaz.mutate(); };
  return (
    <div className="tc-kf-formlar">
      <form className="tc-kf-form" onSubmit={gonder(kurYaz)} aria-label="Kur gir">
        <Secim etiket="Para birimi" value={kur.paraBirimi} onChange={(e) => setKur({ ...kur, paraBirimi: e.target.value })} secenekler={KUR_BIRIMLERI.map((p) => ({ deger: p, baslik: p }))} />
        <Girdi etiket="Tarih" type="date" required value={kur.tarih} onChange={(e) => setKur({ ...kur, tarih: e.target.value })} />
        <Girdi etiket="Kur (TRY)" inputMode="decimal" required value={kur.deger} onChange={(e) => setKur({ ...kur, deger: e.target.value })} />
        <Dugme type="submit" simge="check" yukleniyor={kurYaz.isPending}>Kuru kaydet</Dugme>
      </form>
      <form className="tc-kf-form" onSubmit={gonder(faizYaz)} aria-label="Faiz gir">
        <Secim etiket="Para birimi" value={faiz.paraBirimi} onChange={(e) => setFaiz({ ...faiz, paraBirimi: e.target.value })} secenekler={FAIZ_BIRIMLERI.map((p) => ({ deger: p, baslik: p }))} />
        <Girdi etiket="Geçerlilik başlangıcı" type="date" required value={faiz.baslangic} onChange={(e) => setFaiz({ ...faiz, baslangic: e.target.value })} />
        <Girdi etiket="Aylık faiz (%)" inputMode="decimal" required value={faiz.deger} onChange={(e) => setFaiz({ ...faiz, deger: e.target.value })} />
        <Dugme type="submit" simge="check" yukleniyor={faizYaz.isPending}>Faizi kaydet</Dugme>
      </form>
    </div>
  );
}
