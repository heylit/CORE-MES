import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AksiyonDurumu, Toplanti, ToplantiAksiyonu, ToplantiListesiCevabi } from '#paylasilan/sozlesme/toplantilar.ts';
import { AKSIYON_DURUM_ADLARI, KONU_TUR_ADLARI, TOPLANTI_DURUM_ADLARI, TOPLANTI_TUR_ADLARI } from '#paylasilan/sozlesme/toplanti-sabitleri.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import {
  CokSatir, Dugme, DurumKutusu, Girdi, Kart, KisiSecici, OnayPenceresi, Pencere, Rozet, SayfaBasligi, type MenuOgesi, type SeciliKayit,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AKSIYON_TONU, DURUM_TONU, gunMetni, konuYolu, zamanMetni } from './gosterim.ts';
import { ToplantiFormu } from './ToplantiFormu.tsx';
import './toplantilar.css';

type Acik = 'duzenle' | 'iptal' | 'karar' | 'aksiyon' | null;

// Bütün komutlar güncel toplantıyı döner: ekran cevabı yerine koyar, listeler tazelenir.
function useToplantiKomutu(id: number) {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const komut = useMutation({
    mutationFn: ({ yol, govde, istekKimligi }: { yol: string; govde: unknown; istekKimligi?: string }) => (istekKimligi === undefined
      ? api.post<Toplanti>(`/toplantilar/${String(id)}${yol}`, govde)
      : tekrarKorumaliGonder((deneme) => api.post<Toplanti>(`/toplantilar/${String(id)}${yol}`, govde, deneme), { istekKimligi })),
    onMutate: () => { hataYaz(null); },
    onSuccess: async (t) => {
      istemci.setQueryData(anahtarlar.ayrinti(id), t);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    },
    onError: (e) => { hataYaz(hataIletisi(e, 'İşlem yapılamadı')); },
  });
  return {
    gonder: (yol: string, govde: unknown, istekKimligi?: string, tamam?: () => void) => {
      komut.mutate({ yol, govde, ...(istekKimligi === undefined ? {} : { istekKimligi }) }, { onSuccess: () => tamam?.() });
    },
    yukleniyor: komut.isPending, hata, temizle: () => { hataYaz(null); },
  };
}

function IptalPenceresi({ t, kapat }: { t: Toplanti; kapat: () => void }) {
  const komut = useToplantiKomutu(t.id);
  const [neden, nedenYaz] = useState('');
  return (
    <OnayPenceresi
      acik baslik="Toplantıyı iptal et" tehlikeli onayMetni="İptal et" yukleniyor={komut.yukleniyor} vazgec={kapat}
      onayla={() => { if (neden.trim() !== '') komut.gonder('/iptal', { neden, surum: t.surum }, undefined, kapat); }}
    >
      <CokSatir etiket="İptal nedeni" required maxLength={300} value={neden} onChange={(e) => nedenYaz(e.target.value)} />
      <p className="tc-top-ipucu">Katılımcılara iptal bildirimi gider. Toplantı silinmez, "İptal" olarak kalır.</p>
      {komut.hata !== null && <p className="tc-top-hata" role="alert">{komut.hata}</p>}
    </OnayPenceresi>
  );
}

function KararPenceresi({ t, kapat }: { t: Toplanti; kapat: () => void }) {
  const komut = useToplantiKomutu(t.id);
  const [metin, metinYaz] = useState('');
  const [kimlik] = useState(yeniIstekKimligi);
  return (
    <Pencere
      acik kapat={kapat} baslik="Karar ekle"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.yukleniyor}>Vazgeç</Dugme>
          <Dugme tur="birincil" yukleniyor={komut.yukleniyor} disabled={metin.trim() === ''} onClick={() => komut.gonder('/kararlar', { metin }, kimlik, kapat)}>Ekle</Dugme>
        </>
      )}
    >
      <CokSatir etiket="Karar" required maxLength={1000} value={metin} onChange={(e) => metinYaz(e.target.value)} />
      <p className="tc-top-ipucu">Karar yalnız eklenir; yanlış karar yeni kararla düzeltilir.</p>
      {komut.hata !== null && <p className="tc-top-hata" role="alert">{komut.hata}</p>}
    </Pencere>
  );
}

function AksiyonPenceresi({ t, kapat }: { t: Toplanti; kapat: () => void }) {
  const komut = useToplantiKomutu(t.id);
  const [metin, metinYaz] = useState('');
  const [sorumlu, sorumluYaz] = useState<SeciliKayit | null>(null);
  const [sonTarih, sonTarihYaz] = useState(tesisGunu(Date.now()));
  const [kimlik] = useState(yeniIstekKimligi);
  const tamam = metin.trim() !== '' && sorumlu !== null && sonTarih !== '';
  return (
    <Pencere
      acik kapat={kapat} baslik="Aksiyon ekle"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.yukleniyor}>Vazgeç</Dugme>
          <Dugme
            tur="birincil" yukleniyor={komut.yukleniyor} disabled={!tamam}
            onClick={() => { if (sorumlu !== null) komut.gonder('/aksiyonlar', { metin, sorumluKisiId: sorumlu.id, sonTarih }, kimlik, kapat); }}
          >Ekle</Dugme>
        </>
      )}
    >
      <Girdi etiket="Aksiyon" required maxLength={200} value={metin} onChange={(e) => metinYaz(e.target.value)} />
      <KisiSecici etiket="Sorumlu" deger={sorumlu} sec={(k) => sorumluYaz(k === null ? null : { id: k.id, kod: k.kod, ad: k.ad })} yerTutucu="Kişi ara" />
      <Girdi etiket="Son tarih" type="date" required value={sonTarih} onChange={(e) => sonTarihYaz(e.target.value)} />
      {komut.hata !== null && <p className="tc-top-hata" role="alert">{komut.hata}</p>}
    </Pencere>
  );
}

function AksiyonSatiri({ t, a }: { t: Toplanti; a: ToplantiAksiyonu }) {
  const komut = useToplantiKomutu(t.id);
  const yaz = t.izinler.yaz && t.durum !== 'iptal';
  const durumYaz = (durum: AksiyonDurumu) => komut.gonder(`/aksiyonlar/${String(a.id)}/durum`, { durum, surum: a.surum });
  return (
    <li className="tc-top-aksiyon">
      <div className="tc-top-aksiyon-ust">
        <span className="tc-top-ad">{a.metin}</span>
        <Rozet ton={AKSIYON_TONU[a.durum]}>{AKSIYON_DURUM_ADLARI[a.durum]}</Rozet>
      </div>
      <div className="tc-top-aksiyon-alt">
        <span>{a.sorumlu.ad}</span>
        <span className="mono">{gunMetni(a.sonTarih)}</span>
        {a.gorev !== null && <Rozet ton="tamam">Görev açıldı</Rozet>}
        {a.gorev === null && t.konuTuru !== 'proje' && <span className="tc-top-soluk">Toplantıda izlenir</span>}
      </div>
      {yaz && a.durum === 'acik' && (
        <div className="tc-top-grup">
          {t.konuTuru === 'proje' && a.gorev === null && (
            <Dugme simge="clipboard-check" yukleniyor={komut.yukleniyor} onClick={() => komut.gonder(`/aksiyonlar/${String(a.id)}/gorev`, { surum: a.surum })}>Göreve çevir</Dugme>
          )}
          <Dugme simge="check" disabled={komut.yukleniyor} onClick={() => durumYaz('bitti')}>Bitti</Dugme>
          <Dugme simge="x" disabled={komut.yukleniyor} onClick={() => durumYaz('iptal')}>İptal</Dugme>
        </div>
      )}
      {komut.hata !== null && <p className="tc-top-hata" role="alert">{komut.hata}</p>}
    </li>
  );
}

export function ToplantiGorunumu({ t, eposta }: { t: Toplanti; eposta: boolean }) {
  const [acik, acikYaz] = useState<Acik>(null);
  const yapildi = useToplantiKomutu(t.id);
  const planli = t.durum === 'planlandi';
  const basladi = Date.now() >= Date.parse(t.baslangic);
  const yaz = t.izinler.yaz;
  const eylemler: MenuOgesi[] = yaz && planli ? [{ anahtar: 'iptal', baslik: 'Toplantıyı iptal et', simge: 'x', ton: 'tehlike', sec: () => acikYaz('iptal') }] : [];
  const kapat = () => { acikYaz(null); };

  return (
    <div className="tc-top-sayfa">
      <SayfaBasligi
        baslik={t.baslik} simge="calendar"
        alt={(
          <span className="tc-top-alt">
            <Rozet ton={DURUM_TONU[t.durum]}>{TOPLANTI_DURUM_ADLARI[t.durum]}</Rozet>
            <span className="mono">{zamanMetni(t.baslangic, t.bitis)}</span>
          </span>
        )}
        eylemler={eylemler}
        ek={yaz && planli && <Dugme simge="edit" onClick={() => acikYaz('duzenle')}>Değiştir</Dugme>}
        {...(yaz && planli && basladi ? { birincil: { etiket: 'Yapıldı işaretle', simge: 'check' as const, yukleniyor: yapildi.yukleniyor, yap: () => yapildi.gonder('/yapildi', { surum: t.surum }) } } : {})}
      />
      {yapildi.hata !== null && <p className="tc-top-hata" role="alert">{yapildi.hata}</p>}
      {t.durum === 'iptal' && t.iptalNedeni !== null && <p className="tc-top-iptal">İptal nedeni: {t.iptalNedeni}</p>}
      {yaz && planli && !basladi && <p className="tc-top-ipucu">"Yapıldı işaretle" başlama saatinden sonra çıkar.</p>}

      <div className="tc-top-iki">
        <div className="tc-top-sutun">
          <Kart baslik="Bilgiler" simge="calendar">
            <dl className="tc-top-bilgi">
              <dt>Zaman</dt><dd className="mono">{zamanMetni(t.baslangic, t.bitis)}</dd>
              <dt>Yer</dt><dd>{t.yer ?? 'Yazılmadı'}</dd>
              <dt>Tür</dt><dd>{TOPLANTI_TUR_ADLARI[t.tur]}</dd>
              <dt>Düzenleyen</dt><dd>{t.duzenleyen.ad}</dd>
            </dl>
          </Kart>
          <Kart baslik={`Konu: ${KONU_TUR_ADLARI[t.konuTuru]}`} simge="pin">
            {t.konu === null
              ? <p className="tc-top-ipucu">{t.konuTuru === 'serbest' ? 'Bağlı kayıt yok; konu başlıktır.' : 'Bağlı kayıt artık bulunamıyor.'}</p>
              : (
                <dl className="tc-top-bilgi">
                  <dt>Kayıt</dt>
                  <dd><Link to={konuYolu(t.konu.tur, t.konu.id)} className="mono">{t.konu.no ?? t.konu.ad}</Link>{t.konu.ad !== null && t.konu.no !== null ? ` · ${t.konu.ad}` : ''}</dd>
                  {t.konu.durum !== null && (<><dt>Durum</dt><dd>{t.konu.durum}</dd></>)}
                  {t.konu.tarih !== null && (<><dt>Teslim</dt><dd className="mono">{gunMetni(t.konu.tarih)}</dd></>)}
                </dl>
              )}
          </Kart>
          <Kart baslik={`Katılımcılar (${String(t.katilimcilar.length)})`} simge="users">
            <ul className="tc-top-satirlar">
              <li><span className="tc-top-ad">{t.duzenleyen.ad}</span><Rozet ton="bilgi">Düzenleyen</Rozet></li>
              {t.katilimcilar.filter((k) => k.kisiId !== t.duzenleyen.id).map((k) => (
                <li key={k.kisiId}><span className="tc-top-ad">{k.ad}</span><Rozet ton={k.zorunlu ? 'uyari' : 'pasif'}>{k.zorunlu ? 'Zorunlu' : 'Bilgi için'}</Rozet></li>
              ))}
            </ul>
          </Kart>
        </div>
        <div className="tc-top-sutun">
          <Kart baslik="Gündem" simge="list">
            {t.gundem.length === 0 ? <p className="tc-top-ipucu">Gündem yazılmadı.</p> : <ol className="tc-top-gundem">{t.gundem.map((g, i) => <li key={`${String(i)}-${g}`}>{g}</li>)}</ol>}
          </Kart>
          <Kart baslik="Kararlar" simge="check" sag={yaz && t.durum !== 'iptal' && <Dugme simge="plus" onClick={() => acikYaz('karar')}>Karar ekle</Dugme>}>
            {t.kararlar.length === 0 ? <p className="tc-top-ipucu">Henüz karar yok.</p> : (
              <ol className="tc-top-gundem">{t.kararlar.map((k) => <li key={k.id}>{k.metin} <span className="tc-top-soluk">({k.yazan.ad})</span></li>)}</ol>
            )}
          </Kart>
          <Kart
            baslik={`Aksiyonlar (${String(t.aksiyonlar.length)})`} simge="clipboard-check"
            sag={yaz && t.durum !== 'iptal' && <Dugme simge="plus" onClick={() => acikYaz('aksiyon')}>Aksiyon ekle</Dugme>}
          >
            {t.aksiyonlar.length === 0 ? <p className="tc-top-ipucu">Henüz aksiyon yok.</p> : (
              <ul className="tc-top-aksiyonlar">{t.aksiyonlar.map((a) => <AksiyonSatiri key={a.id} t={t} a={a} />)}</ul>
            )}
            {t.konuTuru === 'proje' && t.konu !== null && <p className="tc-top-ipucu">Göreve çevrilen aksiyon {t.konu.no ?? 'proje'} altında Görevler'de görünür.</p>}
          </Kart>
        </div>
      </div>

      {acik === 'duzenle' && <ToplantiFormu toplanti={t} eposta={eposta} kapat={kapat} kaydedildi={kapat} />}
      {acik === 'iptal' && <IptalPenceresi t={t} kapat={kapat} />}
      {acik === 'karar' && <KararPenceresi t={t} kapat={kapat} />}
      {acik === 'aksiyon' && <AksiyonPenceresi t={t} kapat={kapat} />}
    </div>
  );
}

const kimlikMi = (d: string | undefined): number | null => (d !== undefined && /^[1-9]\d{0,9}$/.test(d) ? Number(d) : null);

// /toplantilar/:id (yönetim) ve /profil/toplantilarim/:id (katılımcı) aynı ekrandır; düğmeleri sunucunun izinleri belirler.
export function ToplantiSayfasi({ kok = '/toplantilar' }: { kok?: string }) {
  const id = kimlikMi(useParams().id);
  const git = useNavigate();
  const sorgu = useQuery({
    queryKey: anahtarlar.ayrinti(id ?? 0),
    queryFn: () => api.get<Toplanti>(`/toplantilar/${String(id)}`),
    enabled: id !== null,
  });
  // E-posta seçeneği listenin izninden gelir (yalnız yazan için okunur).
  const liste = useQuery({
    queryKey: anahtarlar.liste('yaklasan'),
    queryFn: () => api.get<ToplantiListesiCevabi>('/toplantilar'),
    enabled: sorgu.data?.izinler.yaz === true,
  });
  if (id === null) return <DurumKutusu durum="bos" mesaj="Toplantı bulunamadı" />;
  return (
    <>
      <Dugme simge="back" onClick={() => { void git(kok); }}>Toplantılar</Dugme>
      {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
      {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Toplantı alınamadı')} yenile={() => { void sorgu.refetch(); }} />}
      {sorgu.data && <ToplantiGorunumu t={sorgu.data} eposta={liste.data?.izinler.eposta === true} />}
    </>
  );
}

export const ToplantimSayfasi = () => <ToplantiSayfasi kok="/profil/toplantilarim" />;
