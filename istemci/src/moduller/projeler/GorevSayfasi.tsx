import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  AdimEkleGovdesi, AdimIsaretleGovdesi, GeriCevirGovdesi, GeriGonderGovdesi, GorevAyrintisiCevabi, GorevKaniti, GorevKomutuGovdesi, GorevOlayi, KanitBaglaGovdesi,
  NotEkleGovdesi, ProjeYonetimiCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { DosyaHatasi, dosyaYukle } from '../belge-merkezi/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GOREV_DURUM_TONU, GOREV_ISLEMI, atamaMetni, gorevDurumMetni, tarihMetni } from './gosterim.ts';
import { useIslemVar, useIstekKimligi } from './komut.ts';
import { GorevFormu, Ilerleme } from './ProjeGorevleri.tsx';
import './projeler.css';

const OLAY_METNI: Record<GorevOlayi['olay'], string> = {
  ustlen: 'üstlendi', basla: 'başladı', bitti: 'bitirdi', onay: 'onayladı', geri: 'geri gönderdi',
  cevir: 'geri çevirdi',
};
const anMetni = (an: string): string => `${tarihMetni(an.slice(0, 10))} ${an.slice(11, 16)}`;
const KANIT_TURU = 'image/jpeg,image/png,image/webp,application/pdf';
const KANIT_AZAMI = 20 * 1024 * 1024;

type Komut = 'ustlen' | 'basla' | 'bitir' | 'onayla' | 'geri-gonder' | 'geri-cevir' | 'iptal';
type Istek =
  | { ad: Komut; govde: GorevKomutuGovdesi | GeriGonderGovdesi | GeriCevirGovdesi }
  | { ad: 'adim'; govde: AdimEkleGovdesi }
  | { ad: 'isaret'; adimId: number; govde: AdimIsaretleGovdesi }
  | { ad: 'adim-sil'; adimId: number }
  | { ad: 'not'; govde: NotEkleGovdesi }
  | { ad: 'kanit'; govde: KanitBaglaGovdesi }
  | { ad: 'kanit-kaldir'; ozet: string };

function istekYolu(gorevId: number, i: Istek): { yol: string; govde: unknown; korumali: boolean } {
  const kok = `/projeler/gorevler/${String(gorevId)}`;
  switch (i.ad) {
    case 'adim': return { yol: `${kok}/adimlar`, govde: i.govde, korumali: true };
    case 'isaret': return { yol: `${kok}/adimlar/${String(i.adimId)}/isaretle`, govde: i.govde, korumali: false };
    case 'adim-sil': return { yol: `${kok}/adimlar/${String(i.adimId)}/sil`, govde: {}, korumali: false };
    case 'not': return { yol: `${kok}/notlar`, govde: i.govde, korumali: true };
    case 'kanit': return { yol: `${kok}/kanitlar`, govde: i.govde, korumali: true };
    case 'kanit-kaldir': return { yol: `${kok}/kanitlar/${i.ozet}/kaldir`, govde: {}, korumali: false };
    case 'ustlen': case 'basla': case 'bitir': case 'onayla': case 'geri-gonder': case 'geri-cevir': case 'iptal':
      return { yol: `${kok}/${i.ad}`, govde: i.govde, korumali: false };
  }
}

// 3458 (1 b): görev kendi sayfasında. Solda açıklama, yapılacaklar ve kanıt; sağda bilgi, adım düğmeleri, notlar ve geçmiş.
// Dar ekranda tek sütun ve bilgi kartı başlığın hemen altında. Düğmeleri sunucunun verdiği izinler açar; yazma sunucuda yeniden
// denetlenir. Görev silinmez, görev yazan iptal eder (3303-1 c).
export function GorevSayfasi() {
  const { gorevId: ham } = useParams();
  const gorevId = Number(ham);
  const istemci = useQueryClient();
  const yonlendir = useNavigate();
  const yazar = useIslemVar(GOREV_ISLEMI);
  const kimlik = useIstekKimligi();
  const [geri, geriYaz] = useState<string | null>(null);
  const [geriHatasi, geriHatasiYaz] = useState<string | undefined>(undefined);
  const [cevir, cevirYaz] = useState<string | null>(null);
  const [cevirHatasi, cevirHatasiYaz] = useState<string | undefined>(undefined);
  const cevirDonus = useRef(false);
  const [iptalSor, iptalSorYaz] = useState(false);
  const [bittiSor, bittiSorYaz] = useState(false);
  const [duzenle, duzenleYaz] = useState(false);
  const [yeniAdim, yeniAdimYaz] = useState('');
  const [not, notYaz] = useState('');
  const [kaldirilacak, kaldirilacakYaz] = useState<GorevKaniti | null>(null);
  const [yukleniyor, yukleniyorYaz] = useState(false);
  const [yuklemeHatasi, yuklemeHatasiYaz] = useState<string | null>(null);
  const dosyaGirdisi = useRef<HTMLInputElement>(null);

  // Gerekçe kutusu kapanınca (Vazgeç) odak yeniden açan düğmeye döner; klavyeyle kullanan yerini kaybetmez.
  useEffect(() => {
    if (cevir !== null || !cevirDonus.current) return;
    cevirDonus.current = false;
    document.getElementById('gorev-geri-cevir')?.focus();
  }, [cevir]);

  const a = useQuery({
    queryKey: anahtarlar.gorevAyrinti(gorevId),
    queryFn: () => api.get<GorevAyrintisiCevabi>(`/projeler/gorevler/${String(gorevId)}/ayrinti`),
    enabled: Number.isInteger(gorevId) && gorevId > 0,
  });
  const projeId = a.data?.proje.id ?? 0;
  // Düzenleme formu projenin kilometre taşlarını ve öteki görevlerini ister; yalnız görev yazana ve form açılınca.
  const yonetim = useQuery({
    queryKey: anahtarlar.yonetim(projeId),
    queryFn: () => api.get<ProjeYonetimiCevabi>(`/projeler/${String(projeId)}/yonetim`),
    enabled: duzenle && projeId > 0,
  });
  const komut = useMutation({
    mutationFn: (i: Istek) => {
      const { yol, govde, korumali } = istekYolu(gorevId, i);
      return api.post<GorevAyrintisiCevabi>(yol, govde, korumali ? { istekKimligi: kimlik.al() } : undefined);
    },
    onSuccess: async (cevap, i) => {
      istemci.setQueryData(anahtarlar.gorevAyrinti(gorevId), cevap);
      kimlik.hataSonrasi(null);
      geriYaz(null); cevirYaz(null); iptalSorYaz(false); bittiSorYaz(false);
      if (i.ad === 'adim') yeniAdimYaz('');
      if (i.ad === 'not') notYaz('');
      if (i.ad === 'kanit-kaldir') kaldirilacakYaz(null);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok, predicate: (q) => q.queryKey[1] !== 'gorev' });
    },
    onError: kimlik.hataSonrasi,
  });

  if (a.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(a.error, 'Görev alınamadı')} yenile={() => { void a.refetch(); }} />;
  if (a.data === undefined) return <DurumKutusu durum="yukleniyor" />;
  const { gorev: g, izinler: izin, icerikIzinleri: ic, adimlar, kanitlar, notlar, olaylar, proje } = a.data;
  const surum = { surum: g.surum };
  const acikAdimlar = adimlar.filter((x) => !x.yapildi);
  const kanitEksik = g.kanitZorunlu && kanitlar.length === 0;
  const iptalAcik = yazar && g.durum !== 'bitti' && g.durum !== 'iptal';
  const bitir = () => { if (acikAdimlar.length > 0) bittiSorYaz(true); else komut.mutate({ ad: 'bitir', govde: surum }); };
  const geriGonder = () => {
    if (geri === null) return;
    if (geri.trim() === '') { geriHatasiYaz('Neden geri gönderiyorsun? Gerekçe zorunlu.'); return; }
    komut.mutate({ ad: 'geri-gonder', govde: { gerekce: geri.trim(), surum: g.surum } });
  };
  const geriCevir = () => {
    if (cevir === null) return;
    if (cevir.trim() === '') { cevirHatasiYaz('Neden geri çeviriyorsun? Gerekçe zorunlu.'); return; }
    komut.mutate({ ad: 'geri-cevir', govde: { gerekce: cevir.trim(), surum: g.surum } });
  };
  const adimEkle = (o: FormEvent) => {
    o.preventDefault();
    if (yeniAdim.trim() !== '') komut.mutate({ ad: 'adim', govde: { ad: yeniAdim.trim() } });
  };
  const notEkle = (o: FormEvent) => {
    o.preventDefault();
    if (not.trim() !== '') komut.mutate({ ad: 'not', govde: { metin: not.trim() } });
  };
  const kanitSec = async (dosyalar: FileList | null) => {
    const dosya = dosyalar?.[0];
    if (dosya === undefined) return;
    yuklemeHatasiYaz(null);
    if (dosya.size > KANIT_AZAMI) { yuklemeHatasiYaz('Kanıt en çok 20 MB olur.'); return; }
    yukleniyorYaz(true);
    try {
      const ozet = await dosyaYukle(new Uint8Array(await dosya.arrayBuffer()), () => undefined);
      komut.mutate({ ad: 'kanit', govde: { ozet, dosyaAdi: dosya.name.slice(-200) } });
    } catch (hata) {
      yuklemeHatasiYaz(hata instanceof DosyaHatasi ? hata.message : hataIletisi(hata, 'Dosya yüklenemedi'));
    } finally {
      yukleniyorYaz(false);
      if (dosyaGirdisi.current) dosyaGirdisi.current.value = '';
    }
  };
  const kanitAdresi = (ozet: string): string => `/api/projeler/gorevler/${String(gorevId)}/kanitlar/${ozet}/dosya`;
  const yuzde = g.adimToplam === 0 ? null : Math.round((100 * g.adimYapilan) / g.adimToplam);

  const bilgi = (
    <section className="tc-kart tc-prj-gorev-bilgi" aria-label="Görev bilgisi">
      <dl className="tc-prj-bilgi">
        <dt>Durum</dt><dd><Rozet ton={GOREV_DURUM_TONU[g.durum]}>{gorevDurumMetni(g)}</Rozet></dd>
        <dt>Proje</dt><dd className="tc-prj-mono">{proje.kod}</dd>
        <dt>Yapan</dt>
        <dd>
          {g.yapanRolAd !== null ? atamaMetni(null, g.yapanRolAd) : atamaMetni(g.sorumluAd, null, 'Atanmadı')}
          {g.yapanRolAd !== null && <span className="tc-prj-soluk"> · {g.sorumluAd === null ? 'üstlenen yok' : `üstlenen ${g.sorumluAd}`}</span>}
        </dd>
        <dt>Kontrol eden</dt>
        <dd>
          {atamaMetni(g.kontrolKisiAd, g.kontrolRolAd, 'Yok')}
          {(g.yedekKontrolKisiAd !== null || g.yedekKontrolRolAd !== null) && (
            <span className="tc-prj-soluk"> · yedek: {atamaMetni(g.yedekKontrolKisiAd, g.yedekKontrolRolAd)}</span>
          )}
        </dd>
        <dt>Plan</dt><dd className="tc-prj-mono">{tarihMetni(g.planBaslangic)} – {tarihMetni(g.planBitis)}</dd>
        <dt>İlerleme</dt><dd><Ilerleme deger={g.ilerleme} /></dd>
        <dt>Kanıt</dt><dd>{kanitlar.length} dosya · {g.kanitZorunlu ? 'bitirmek için zorunlu' : 'zorunlu değil'}</dd>
      </dl>
      {cevir === null && (izin.ustlenebilir || izin.baslayabilir || izin.bitirebilir || izin.onaylayabilir || izin.geriCevirebilir || iptalAcik || yazar) && (
        <div className="tc-prj-gorunum" role="group" aria-label="Görev adımları">
          {izin.ustlenebilir && <Dugme tur="birincil" simge="user-plus" yukleniyor={komut.isPending} onClick={() => { komut.mutate({ ad: 'ustlen', govde: surum }); }}>Üstlen</Dugme>}
          {izin.baslayabilir && <Dugme simge="play" yukleniyor={komut.isPending} onClick={() => { komut.mutate({ ad: 'basla', govde: surum }); }}>Başla</Dugme>}
          {izin.bitirebilir && (
            <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} disabled={kanitEksik} onClick={bitir}>
              {g.kontrolKisiAd !== null || g.kontrolRolAd !== null ? 'Bitti, kontrole gönder' : 'Bitti'}
            </Dugme>
          )}
          {izin.onaylayabilir && <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} onClick={() => { komut.mutate({ ad: 'onayla', govde: surum }); }}>Onayla</Dugme>}
          {izin.onaylayabilir && geri === null && <Dugme simge="back" onClick={() => { geriYaz(''); geriHatasiYaz(undefined); }}>Geri gönder</Dugme>}
          {izin.geriCevirebilir && <Dugme id="gorev-geri-cevir" simge="back" onClick={() => { cevirYaz(''); cevirHatasiYaz(undefined); }}>Geri çevir</Dugme>}
          {yazar && <Dugme simge="edit" onClick={() => { duzenleYaz(true); }}>Düzenle</Dugme>}
          {iptalAcik && !iptalSor && <Dugme simge="x" onClick={() => { iptalSorYaz(true); }}>İptal et</Dugme>}
        </div>
      )}
      {izin.bitirebilir && kanitEksik && <p className="tc-prj-soluk" role="note">Bu görev kanıt ister: bitirmeden önce fotoğraf ya da PDF ekle.</p>}
      {g.durum === 'kontrolde' && !izin.onaylayabilir && (
        <p className="tc-prj-soluk">Kontrol edenin onayını bekliyor. İşi yapan kendi işini onaylayamaz.</p>
      )}
      {geri !== null && (
        <div className="tc-prj-icerik">
          <CokSatir
            etiket="Geri gönderme gerekçesi" required value={geri} maxLength={500} hata={geriHatasi}
            onChange={(e) => { geriYaz(e.target.value); geriHatasiYaz(undefined); }}
          />
          <div className="tc-prj-gorunum">
            <Dugme onClick={() => { geriYaz(null); }} disabled={komut.isPending}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="back" yukleniyor={komut.isPending} onClick={geriGonder}>Geri gönder</Dugme>
          </div>
        </div>
      )}
      {cevir !== null && (
        <div className="tc-prj-icerik">
          <CokSatir
            etiket="Geri çevirme gerekçesi" required autoFocus value={cevir} maxLength={500} hata={cevirHatasi}
            ipucu="Görev senden alınır: rol görevi role döner, değilse atanmamış kalır. Görevi yazana haber gider."
            onChange={(e) => { cevirYaz(e.target.value); cevirHatasiYaz(undefined); }}
          />
          <div className="tc-prj-gorunum">
            <Dugme onClick={() => { cevirDonus.current = true; cevirYaz(null); }} disabled={komut.isPending}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="back" yukleniyor={komut.isPending} onClick={geriCevir}>Geri çevir</Dugme>
          </div>
        </div>
      )}
      {iptalAcik && iptalSor && (
        <div className="tc-prj-icerik" role="group" aria-label="Görevi iptal et">
          <p>Görev iptal edilsin mi? Görev silinmez; listede İptal olarak kalır ve proje ilerlemesine sayılmaz.</p>
          <div className="tc-prj-gorunum">
            <Dugme onClick={() => { iptalSorYaz(false); }} disabled={komut.isPending}>Vazgeç</Dugme>
            <Dugme tur="tehlike" simge="x" yukleniyor={komut.isPending} onClick={() => { komut.mutate({ ad: 'iptal', govde: surum }); }}>Görevi iptal et</Dugme>
          </div>
        </div>
      )}
      {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Görev işlenemedi')}</p>}
    </section>
  );

  return (
    <div className="tc-prj-icerik">
      <div className="tc-prj-bas">
        <Dugme simge="chev-left" onClick={() => { void yonlendir(`/proje-gorevlerim?proje=${String(proje.id)}`); }}>{proje.kod} görevleri</Dugme>
      </div>
      <div className="tc-prj-bas">
        <h2 className="tc-prj-gorev-ad">{g.ad}</h2>
        <span className="tc-prj-soluk">{proje.kod} · {proje.ad}{g.asama !== null && ` · ${g.asama}`}</span>
        {g.hazirlikMaddesi !== null && <Rozet ton="bilgi">Emir görevi</Rozet>}
      </div>
      <div className="tc-prj-gorev-sayfa">
        <div className="tc-prj-gorev-kol">
          <Kart baslik="Açıklama" simge="file">
            <p className="tc-prj-aciklama">{g.aciklama ?? 'Açıklama yazılmamış.'}</p>
          </Kart>
          <Kart baslik="Yapılacaklar" simge="list" sag={yuzde === null ? undefined : <span className="tc-prj-mono tc-prj-soluk">{g.adimYapilan}/{g.adimToplam} · %{yuzde}</span>}>
            {adimlar.length === 0 && <p className="tc-prj-soluk">Adım yok. Adım eklenirse ilerleme işaretlenen adımlardan hesaplanır.</p>}
            <ul className="tc-prj-adimlar" aria-label="Yapılacaklar">
              {adimlar.map((x) => (
                <li key={x.id} className={x.yapildi ? 'tc-prj-adim-yapildi' : undefined}>
                  <label className="tc-isaret">
                    <input
                      type="checkbox" checked={x.yapildi} disabled={!ic.adimIsaretler || komut.isPending}
                      onChange={(e) => { komut.mutate({ ad: 'isaret', adimId: x.id, govde: { yapildi: e.target.checked } }); }}
                    />
                    <span>{x.ad}</span>
                  </label>
                  {x.yapildi && x.an !== null && <span className="tc-prj-soluk tc-prj-adim-kim">{x.yapanAd ?? '—'} · {anMetni(x.an)}</span>}
                  {!x.yapildi && ic.adimYazar && (
                    <Dugme simge="trash" aria-label={`${x.ad}: adımı sil`} disabled={komut.isPending} onClick={() => { komut.mutate({ ad: 'adim-sil', adimId: x.id }); }} />
                  )}
                </li>
              ))}
            </ul>
            {ic.adimYazar && (
              <form className="tc-prj-gorunum" onSubmit={adimEkle}>
                <Girdi etiket="Yeni adım" value={yeniAdim} maxLength={200} onChange={(e) => { yeniAdimYaz(e.target.value); }} />
                <Dugme simge="plus" type="submit" disabled={yeniAdim.trim() === ''} yukleniyor={komut.isPending}>Adım ekle</Dugme>
              </form>
            )}
          </Kart>
          <Kart baslik="Kanıt" simge="camera">
            {kanitlar.length === 0 && <p className="tc-prj-soluk">Kanıt yok.</p>}
            <ul className="tc-prj-kanitlar" aria-label="Kanıtlar">
              {kanitlar.map((k) => (
                <li key={k.ozet} className="tc-prj-kanit">
                  <a href={kanitAdresi(k.ozet)} target="_blank" rel="noreferrer" className="tc-prj-kanit-bag">
                    {k.tur === 'pdf'
                      ? <span className="tc-prj-kanit-pdf"><Simge ad="file" />PDF</span>
                      : <img src={kanitAdresi(k.ozet)} alt={k.ad} loading="lazy" className="tc-prj-kanit-resim" />}
                    <span className="tc-prj-kanit-ad">{k.ad}</span>
                  </a>
                  <span className="tc-prj-soluk">{k.ekleyenAd ?? '—'} · {anMetni(k.zaman)}</span>
                  {ic.kanitEkler && <Dugme simge="trash" aria-label={`${k.ad}: kanıtı kaldır`} onClick={() => { kaldirilacakYaz(k); }}>Kaldır</Dugme>}
                </li>
              ))}
            </ul>
            {ic.kanitEkler && (
              <div className="tc-prj-gorunum">
                <input
                  ref={dosyaGirdisi} type="file" accept={KANIT_TURU} hidden aria-label="Kanıt dosyası"
                  onChange={(e) => { void kanitSec(e.target.files); }}
                />
                <Dugme simge="upload" yukleniyor={yukleniyor} onClick={() => dosyaGirdisi.current?.click()}>Fotoğraf ya da PDF ekle</Dugme>
                <span className="tc-prj-soluk">en çok 20 MB</span>
              </div>
            )}
            {yuklemeHatasi !== null && <p className="tc-prj-hata" role="alert">{yuklemeHatasi}</p>}
          </Kart>
        </div>
        <div className="tc-prj-gorev-kol">
          {bilgi}
          <Kart baslik="Notlar ve geçmiş" simge="clock">
            {ic.notYazar && (
              <form className="tc-prj-icerik" onSubmit={notEkle}>
                <CokSatir etiket="Not" rows={2} value={not} maxLength={2000} placeholder="Görevi gören herkes okur" onChange={(e) => { notYaz(e.target.value); }} />
                <div className="tc-prj-gorunum"><Dugme type="submit" disabled={not.trim() === ''} yukleniyor={komut.isPending}>Notu ekle</Dugme></div>
              </form>
            )}
            <ul className="tc-prj-liste" aria-label="Görev geçmişi">
              {[
                ...notlar.map((n) => ({ an: n.an, anahtar: `n${String(n.id)}`, metin: <span className="tc-prj-not">{n.kisiAd ?? 'Bilinmeyen kişi'}: “{n.metin}”</span> })),
                ...olaylar.map((o, i) => ({
                  an: o.an, anahtar: `o${String(i)}`,
                  metin: <span>{o.kisiAd ?? 'Bilinmeyen kişi'} {OLAY_METNI[o.olay]}{o.gerekce !== null && `: "${o.gerekce}"`}</span>,
                })),
              ].sort((x, y) => (x.an < y.an ? 1 : -1)).map((s) => (
                <li key={s.anahtar}>
                  <span className="tc-prj-soluk tc-prj-tarih">{anMetni(s.an)}</span>
                  {s.metin}
                </li>
              ))}
            </ul>
          </Kart>
        </div>
      </div>
      <OnayPenceresi
        acik={bittiSor} baslik={`${String(acikAdimlar.length)} adım işaretlenmedi`} onayMetni="İşaretle ve gönder"
        yukleniyor={komut.isPending} onayla={() => { komut.mutate({ ad: 'bitir', govde: surum }); }} vazgec={() => { bittiSorYaz(false); }}
      >
        <ul className="tc-prj-liste">{acikAdimlar.map((x) => <li key={x.id}>{x.ad}</li>)}</ul>
        <p>Bitti demek bu adımları da yapıldı diye işaretler; ilerleme %100 olur.</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={kaldirilacak !== null} baslik="Kanıt kaldırılsın mı?" onayMetni="Kaldır" tehlikeli yukleniyor={komut.isPending}
        onayla={() => { if (kaldirilacak) komut.mutate({ ad: 'kanit-kaldir', ozet: kaldirilacak.ozet }); }} vazgec={() => { kaldirilacakYaz(null); }}
      >
        <p>{kaldirilacak?.ad} bu görevden kalkar. Kaldırma denetim kaydına yazılır.</p>
      </OnayPenceresi>
      {duzenle && yonetim.data !== undefined && (
        <GorevFormu
          projeId={proje.id} yonetim={yonetim.data} gorev={yonetim.data.gorevler.find((x) => x.id === g.id) ?? null}
          kapat={() => { duzenleYaz(false); void a.refetch(); }}
        />
      )}
    </div>
  );
}
