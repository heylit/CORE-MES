import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Arac, Masraf, MasrafCevabi, MasrafEkleGovdesi, MasraflarCevabi, MasrafTuru } from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Pencere, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { MASRAF_TURLERI, MASRAF_TURU, SINIR, bugunTarihi, kmMetni, tarihMetni, tlMetni } from './gorunum.ts';
import { useIslemVar, useKorumaliGonderim, yazmaIletisi } from './yazma.ts';

const TURLER = MASRAF_TURLERI.map((t) => ({ deger: t, baslik: MASRAF_TURU[t] }));
// Virgül ya da nokta kuruş ayırıcısıdır; binlik ayırıcı yazılmaz.
const TUTAR = /^\d{1,10}([.,]\d{1,2})?$/;
const KM = /^\d{1,7}$/;

// Araç masrafları (172 a): kayıt değişmez, yanlışı gerekçeyle iptal edilir. Tutar TL; yıl toplamı iptal edilmemiş kayıtlardan.
export function MasrafPenceresi({ arac, kapat }: { arac: Arac; kapat: () => void }) {
  const yazar = useIslemVar('idari-isler.filo-yaz');
  const liste = useQuery({
    queryKey: anahtarlar.masraflar(arac.id),
    queryFn: () => api.get<MasraflarCevabi>(`/idari-isler/araclar/${arac.id}/masraflar`),
  });
  const [iptalEdilen, iptalEdilenYaz] = useState<Masraf | null>(null);

  return (
    <Pencere acik kapat={kapat} baslik={`${arac.plaka} masrafları`} tur="yan" alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      <div className="tc-ii-yigin">
        {yazar && <MasrafFormu arac={arac} />}
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Masraflar alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : liste.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : (
          <>
            <p className="tc-ii-toplam">
              <span>Bu yıl</span>
              <span className="mono">{tlMetni(liste.data.yilToplami)}</span>
            </p>
            {liste.data.masraflar.length === 0 ? (
              <p className="tc-ii-soluk">Kayıt yok.</p>
            ) : (
              <ul className="tc-ii-liste">
                {liste.data.masraflar.map((m) => (
                  <li key={m.id} className="tc-ii-is">
                    <span className="tc-ii-govde" data-iptal={m.iptal === null ? undefined : ''}>
                      <span className="tc-ii-satir">
                        <strong>{MASRAF_TURU[m.tur]}</strong>
                        <span className="mono">{tlMetni(m.tutar)}</span>
                        {m.iptal !== null && <Rozet ton="pasif">İptal</Rozet>}
                      </span>
                      <span className="tc-ii-soluk">
                        <span className="mono">{tarihMetni(m.tarih)}</span>
                        {m.km !== null && <> · <span className="mono">{kmMetni(m.km)}</span> km</>}
                        {m.belgeNo !== null && <> · Belge {m.belgeNo}</>}
                        {' · '}{m.kaydedenAd ?? 'Bilinmeyen kişi'}
                        {m.iptalNedeni !== null && <> · İptal: {m.iptalNedeni}</>}
                      </span>
                      {m.aciklama !== null && <span className="tc-ii-soluk">{m.aciklama}</span>}
                    </span>
                    {yazar && m.iptal === null && <Dugme simge="x" onClick={() => iptalEdilenYaz(m)}>İptal et</Dugme>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {iptalEdilen !== null && <IptalPenceresi masraf={iptalEdilen} kapat={() => iptalEdilenYaz(null)} />}
    </Pencere>
  );
}

function MasrafFormu({ arac }: { arac: Arac }) {
  const istemci = useQueryClient();
  const gonderim = useKorumaliGonderim();
  const { bildir } = useBildirim();
  const [tarih, tarihYaz] = useState(bugunTarihi);
  const [tur, turYaz] = useState<MasrafTuru>('yakit');
  const [tutar, tutarYaz] = useState('');
  const [km, kmYaz] = useState('');
  const [belgeNo, belgeNoYaz] = useState('');
  const [aciklama, aciklamaYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);

  const eksik = [
    ...(tarih === '' ? ['tarih'] : []),
    ...(TUTAR.test(tutar.trim()) ? [] : ['tutar']),
    ...(km.trim() !== '' && !KM.test(km.trim()) ? ['km'] : []),
  ];

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    const govde: MasrafEkleGovdesi = {
      tarih, tur, tutar: tutar.trim().replace(',', '.'), km: km.trim() === '' ? null : Number(km.trim()),
      ...(belgeNo.trim() === '' ? {} : { belgeNo: belgeNo.trim() }), ...(aciklama.trim() === '' ? {} : { aciklama: aciklama.trim() }),
    };
    try {
      await gonderim<MasrafCevabi>(`/idari-isler/araclar/${arac.id}/masraf-ekle`, govde);
      bildir('tamam', 'Masraf kaydedildi');
      tutarYaz(''); kmYaz(''); belgeNoYaz(''); aciklamaYaz('');
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Masraf kaydedilemedi'));
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.masraflar(arac.id) });
      bekliyorYaz(false);
    }
  };

  return (
    <section className="tc-ii-yigin tc-ii-kutu" aria-label="Masraf gir">
      <h3 className="tc-ii-ara-baslik">Masraf gir</h3>
      <div className="tc-ii-iki">
        <Secim etiket="Tür" value={tur} secenekler={TURLER} onChange={(o) => turYaz(o.target.value as MasrafTuru)} />
        <Girdi etiket="Tutar (TL)" inputMode="decimal" required value={tutar} onChange={(o) => tutarYaz(o.target.value)} placeholder="1250,50" />
      </div>
      <div className="tc-ii-iki">
        <Girdi etiket="Tarih" type="date" required value={tarih} onChange={(o) => tarihYaz(o.target.value)} />
        <Girdi etiket="Km (isteğe bağlı)" inputMode="numeric" value={km} onChange={(o) => kmYaz(o.target.value)} />
      </div>
      <Girdi etiket="Belge no (isteğe bağlı)" maxLength={SINIR.belgeNo} value={belgeNo} onChange={(o) => belgeNoYaz(o.target.value)} />
      <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={SINIR.not} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
      {eksik.length > 0 && <p className="tc-ii-soluk">Eksik: {eksik.join(', ')}</p>}
      {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      <Dugme tur="birincil" simge="check" disabled={eksik.length > 0} yukleniyor={bekliyor} onClick={() => void gonder()}>Masrafı kaydet</Dugme>
    </section>
  );
}

function IptalPenceresi({ masraf, kapat }: { masraf: Masraf; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [neden, nedenYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    try {
      await api.post<MasrafCevabi>(`/idari-isler/masraflar/${masraf.id}/iptal`, { surum: masraf.surum, neden: neden.trim() });
      bildir('tamam', 'Masraf iptal edildi');
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'İptal edilemedi'));
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.masraflar(masraf.aracId) });
      bekliyorYaz(false);
    }
  };

  return (
    <Pencere acik kapat={kapat} baslik={`${MASRAF_TURU[masraf.tur]} ${tlMetni(masraf.tutar)} iptal`}
      alt={(
        <span className="tc-ii-dugmeler">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="x" disabled={neden.trim() === ''} yukleniyor={bekliyor} onClick={() => void gonder()}>İptal et</Dugme>
        </span>
      )}
    >
      <div className="tc-ii-yigin">
        <p className="tc-ii-soluk">Kayıt silinmez; iptal nedeniyle birlikte listede kalır ve toplama girmez.</p>
        <CokSatir etiket="İptal nedeni" required maxLength={SINIR.not} value={neden} onChange={(o) => nedenYaz(o.target.value)} />
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
