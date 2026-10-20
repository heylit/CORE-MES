import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AtikBirimi, Kontrol, KontrolCevabi, KontrolEkleGovdesi, KontrolKayitlariCevabi, KontrolTuru, SiklikBirimi,
} from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, Girdi, Pencere, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaSecimi, type SecilenFirma } from './FirmaSecimi.tsx';
import {
  ATIK_BIRIMLERI, KONTROL_GRUBU, KONTROL_TURLERI, KONTROL_TURU, SIKLIK_BIRIMI, SINIR, bugunTarihi, kalanMetni, siklikMetni, tarihMetni,
} from './gorunum.ts';
import { useIslemVar, useKontrolKomutu, useKorumaliGonderim, yazmaIletisi } from './yazma.ts';

const SIKLIKLAR = (Object.keys(SIKLIK_BIRIMI) as SiklikBirimi[]).map((b) => ({ deger: b, baslik: SIKLIK_BIRIMI[b] }));

// "Yapıldı", "Teslim edildi" ve "Yenile": kayıt girilir, sonraki tarih boşsa sıklıktan hesaplanır (sözleşmede yeni bitiş girilir).
export function YapildiPenceresi({ kontrol, kapat }: { kontrol: Kontrol | null; kapat: () => void }) {
  const komut = useKontrolKomutu();
  const { bildir } = useBildirim();
  const [yapilma, yapilmaYaz] = useState(bugunTarihi());
  const [sonraki, sonrakiYaz] = useState('');
  const [belgeNo, belgeNoYaz] = useState('');
  const [not, notYaz] = useState('');
  const [miktar, miktarYaz] = useState('');
  const [birim, birimYaz] = useState<AtikBirimi | ''>('kg');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);
  useEffect(() => { yapilmaYaz(bugunTarihi()); sonrakiYaz(''); belgeNoYaz(''); notYaz(''); miktarYaz(''); hataYaz(null); }, [kontrol?.id]);
  if (kontrol === null) return null;
  const atik = kontrol.tur === 'atik';
  const siklikli = kontrol.siklikDeger !== null;
  const eksik = yapilma === '' || (!siklikli && sonraki === '') || (atik && (miktar.trim() === '' || birim === ''));

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    try {
      await komut(kontrol, 'yapildi', {
        yapilma,
        ...(sonraki === '' ? {} : { sonrakiTarih: sonraki }),
        ...(belgeNo.trim() === '' ? {} : { belgeNo: belgeNo.trim() }),
        ...(not.trim() === '' ? {} : { not: not.trim() }),
        ...(atik ? { miktar: miktar.trim().replace(',', '.'), birim } : {}),
      });
      bildir('tamam', `${kontrol.ad} kaydedildi; sonraki tarih güncellendi.`);
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Kaydedilemedi'));
    } finally {
      bekliyorYaz(false);
    }
  };

  return (
    <Pencere acik kapat={kapat} baslik={`${KONTROL_TURU[kontrol.tur].eylem}: ${kontrol.ad}`}
      alt={(
        <span className="tc-ii-dugmeler">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={eksik} yukleniyor={bekliyor} onClick={() => void gonder()}>Kaydet</Dugme>
        </span>
      )}
    >
      <div className="tc-ii-yigin">
        <p className="tc-ii-soluk">Şimdiki tarih {tarihMetni(kontrol.sonrakiTarih)} · {siklikMetni(kontrol)}</p>
        <Girdi etiket={atik ? 'Teslim tarihi' : 'Yapılma tarihi'} type="date" required max={bugunTarihi()} value={yapilma} onChange={(o) => yapilmaYaz(o.target.value)} />
        {atik && (
          <div className="tc-ii-iki">
            <Girdi etiket="Miktar" inputMode="decimal" required value={miktar} onChange={(o) => miktarYaz(o.target.value)} />
            <Secim etiket="Birim" required value={birim} onChange={(o) => birimYaz(o.target.value as AtikBirimi)}
              secenekler={ATIK_BIRIMLERI.map((b) => ({ deger: b, baslik: b }))} />
          </div>
        )}
        <Girdi etiket={atik ? 'Form no' : 'Rapor ya da belge no'} maxLength={SINIR.belgeNo} value={belgeNo} onChange={(o) => belgeNoYaz(o.target.value)} />
        <Girdi
          etiket={siklikli ? 'Sonraki tarih (boşsa sıklıktan)' : kontrol.tur === 'sozlesme' ? 'Yeni bitiş tarihi' : 'Sonraki tarih'}
          type="date" required={!siklikli} value={sonraki} onChange={(o) => sonrakiYaz(o.target.value)}
        />
        <CokSatir etiket="Not (isteğe bağlı)" maxLength={SINIR.not} value={not} onChange={(o) => notYaz(o.target.value)} />
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

// Kalem ekleme ve düzenleme. Tür yalnız eklerken seçilir.
export function KontrolFormu({ acik, kontrol, kapat }: { acik: boolean; kontrol: Kontrol | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const gonderim = useKorumaliGonderim();
  const komut = useKontrolKomutu();
  const { bildir } = useBildirim();
  const [tur, turYaz] = useState<KontrolTuru>('yasal');
  const [ad, adYaz] = useState('');
  const [siklikDeger, siklikDegerYaz] = useState('');
  const [siklikBirim, siklikBirimYaz] = useState<SiklikBirimi | ''>('');
  const [sonraki, sonrakiYaz] = useState('');
  const [firma, firmaYaz] = useState<SecilenFirma | null>(null);
  const [aciklama, aciklamaYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);
  useEffect(() => {
    if (!acik) return;
    turYaz(kontrol?.tur ?? 'yasal');
    adYaz(kontrol?.ad ?? '');
    siklikDegerYaz(kontrol?.siklikDeger === null || kontrol === null ? '' : String(kontrol.siklikDeger));
    siklikBirimYaz(kontrol?.siklikBirim ?? '');
    sonrakiYaz(kontrol?.sonrakiTarih ?? '');
    firmaYaz(kontrol?.firmaId != null ? { id: kontrol.firmaId, ad: kontrol.firmaAd ?? `Firma ${kontrol.firmaId}` } : null);
    aciklamaYaz(kontrol?.aciklama ?? '');
    hataYaz(null);
  }, [acik, kontrol?.id]);
  if (!acik) return null;
  const siklikEksik = (siklikDeger === '') !== (siklikBirim === '');
  const eksik = ad.trim() === '' || sonraki === '' || siklikEksik;

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    const ortak = {
      ad: ad.trim(), sonrakiTarih: sonraki, firmaId: firma?.id ?? null, aciklama: aciklama.trim() === '' ? null : aciklama.trim(),
      siklikDeger: siklikDeger === '' ? null : Number(siklikDeger), siklikBirim: siklikBirim === '' ? null : siklikBirim,
    };
    try {
      if (kontrol === null) {
        const govde: KontrolEkleGovdesi = { tur, ...ortak };
        await gonderim<KontrolCevabi>('/idari-isler/kontroller/ekle', govde);
        void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
        bildir('tamam', `${ortak.ad} eklendi`);
      } else {
        await komut(kontrol, 'guncelle', ortak);
        bildir('tamam', `${ortak.ad} güncellendi`);
      }
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Kaydedilemedi'));
    } finally {
      bekliyorYaz(false);
    }
  };

  return (
    <Pencere acik kapat={kapat} baslik={kontrol === null ? 'Kalem ekle' : 'Kalemi düzenle'} tur="yan"
      alt={(
        <span className="tc-ii-dugmeler">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={eksik} yukleniyor={bekliyor} onClick={() => void gonder()}>Kaydet</Dugme>
        </span>
      )}
    >
      <div className="tc-ii-yigin">
        {kontrol === null && (
          <div className="tc-ii-secimler" role="radiogroup" aria-label="Tür">
            {KONTROL_TURLERI.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tur === t} className="tc-ii-secim" onClick={() => turYaz(t)}>
                {KONTROL_TURU[t].etiket}
              </button>
            ))}
          </div>
        )}
        <Girdi etiket="Ad" required maxLength={SINIR.ad} placeholder="Örnek: Yangın tüpleri (24 adet)" value={ad} onChange={(o) => adYaz(o.target.value)} />
        <div className="tc-ii-iki">
          <Girdi etiket="Sıklık" type="number" min={1} max={120} value={siklikDeger} onChange={(o) => siklikDegerYaz(o.target.value)} />
          <Secim etiket="Birim" bosSecenek="Sıklık yok" value={siklikBirim} secenekler={SIKLIKLAR} onChange={(o) => siklikBirimYaz(o.target.value as SiklikBirimi | '')} />
        </div>
        {siklikEksik && <p className="tc-ii-soluk">Sıklık sayı ve birimle birlikte girilir.</p>}
        <Girdi etiket={tur === 'sozlesme' ? 'Bitiş tarihi' : 'Sonraki tarih'} type="date" required value={sonraki} onChange={(o) => sonrakiYaz(o.target.value)} />
        <FirmaSecimi deger={firma} degistir={firmaYaz} />
        <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={SINIR.not} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

// Kalem ayrıntısı: geçmiş kayıtlar; düzenle ve bitir yalnız kontrol-yaz işlemi olana.
export function KontrolAyrinti({ kontrol, kapat, duzenle }: { kontrol: Kontrol | null; kapat: () => void; duzenle: (k: Kontrol) => void }) {
  const yazar = useIslemVar('idari-isler.kontrol-yaz');
  const komut = useKontrolKomutu();
  const { bildir } = useBildirim();
  const [bitirKip, bitirKipYaz] = useState(false);
  const [neden, nedenYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const kayitlar = useQuery({
    queryKey: anahtarlar.kayitlar(kontrol?.id ?? 0),
    queryFn: () => api.get<KontrolKayitlariCevabi>(`/idari-isler/kontroller/${kontrol?.id ?? 0}/kayitlar`),
    enabled: kontrol !== null,
  });
  useEffect(() => { bitirKipYaz(false); nedenYaz(''); hataYaz(null); }, [kontrol?.id]);
  if (kontrol === null) return null;

  const bitir = async () => {
    try {
      await komut(kontrol, 'bitir', neden.trim() === '' ? {} : { neden: neden.trim() });
      bildir('tamam', `${kontrol.ad} bitirildi`);
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Bitirilemedi'));
    }
  };

  const alt = !yazar ? undefined : bitirKip ? (
    <span className="tc-ii-dugmeler">
      <Dugme onClick={() => bitirKipYaz(false)}>Vazgeç</Dugme>
      <Dugme tur="tehlike" simge="x" onClick={() => void bitir()}>Bitir</Dugme>
    </span>
  ) : (
    <span className="tc-ii-dugmeler">
      <Dugme simge="edit" onClick={() => duzenle(kontrol)}>Düzenle</Dugme>
      <Dugme tur="tehlike" simge="x" onClick={() => bitirKipYaz(true)}>Bitir</Dugme>
    </span>
  );

  return (
    <Pencere acik kapat={kapat} baslik={kontrol.ad} tur="yan" {...(alt ? { alt } : {})}>
      <div className="tc-ii-yigin">
        <span className="tc-ii-satir">
          <Rozet ton={KONTROL_GRUBU[kontrol.grup].ton}>{KONTROL_GRUBU[kontrol.grup].etiket}</Rozet>
          <span className="tc-ii-soluk">{KONTROL_TURU[kontrol.tur].etiket}</span>
        </span>
        <dl className="tc-ii-ozellikler">
          <div><dt>{kontrol.tur === 'sozlesme' ? 'Bitiş' : 'Sonraki tarih'}</dt><dd>{tarihMetni(kontrol.sonrakiTarih)} · {kalanMetni(kontrol.kalanGun)}</dd></div>
          <div><dt>Sıklık</dt><dd>{siklikMetni(kontrol)}</dd></div>
          <div><dt>Firma</dt><dd>{kontrol.firmaAd ?? '—'}</dd></div>
        </dl>
        {kontrol.aciklama !== null && <p className="tc-ii-not">{kontrol.aciklama}</p>}
        <h3 className="tc-ii-ara-baslik">Geçmiş kayıtlar</h3>
        {kayitlar.isPending ? <p className="tc-ii-soluk">Yükleniyor</p>
          : (kayitlar.data?.kayitlar.length ?? 0) === 0 ? <p className="tc-ii-soluk">Henüz kayıt yok.</p>
          : (
            <ul className="tc-ii-kayitlar">
              {kayitlar.data?.kayitlar.map((r) => (
                <li key={r.id}>
                  <strong>{tarihMetni(r.yapilma)}</strong>
                  {r.miktar !== null && <span> · {r.miktar} {r.birim}</span>}
                  {r.belgeNo !== null && <span className="mono"> · {r.belgeNo}</span>}
                  <span className="tc-ii-soluk"> · sonraki {tarihMetni(r.sonrakiTarih)} · {r.kaydedenAd ?? '—'}</span>
                  {r.not !== null && <p className="tc-ii-not">{r.not}</p>}
                </li>
              ))}
            </ul>
          )}
        {bitirKip && <CokSatir etiket="Bitirme nedeni (isteğe bağlı)" maxLength={SINIR.not} value={neden} onChange={(o) => nedenYaz(o.target.value)} autoFocus />}
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
