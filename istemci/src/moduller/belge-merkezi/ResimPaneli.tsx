import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  MalzemeBelgeEkleGovdesi, MalzemeBelgeleriCevabi, MalzemeBelgesi, MalzemeBelgeTuru, MalzemeRevizyonEkleGovdesi, Revizyon,
} from '#paylasilan/sozlesme/belge-merkezi.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { revKoduMetni } from './revizyon-kodu.ts';
import { DosyaHatasi, dosyaYukle } from './dosya-aktarimi.ts';
import { DURUM_ADI, DURUM_TONU, IZINLI_DOSYA_TURLERI, TUR_ADI, TUR_SIMGESI, boyutMetni, dosyaTuruBul, izinliMetni, kabulMetni } from './gosterim.ts';
import { KucukResimKutusu } from './KucukResim.tsx';
import { OnizlemeAtlandi, kareKaynagi } from './onizleme-kurallari.ts';
import { onizlemeGonder } from './onizleme-akisi.ts';
import './belge-merkezi.css';

// Malzeme kartının resimleri (kart #688): foto, teknik resim ve 3B model çizim merkezinde revizyonlu belge olarak durur; kart
// kopya tutmaz. Malzeme yazan kişi yalnız bu kartın belgelerine yazar. Foto ve teknik resim hemen yayına girer (1991 b); 3B model
// taslak girer, yayını çizim merkezi yapar. Küçük resim yüklemede bu cihazda üretilir; 3B modelde taslakken de (1990 a).

const MALZEME_TURLERI: readonly MalzemeBelgeTuru[] = ['fotograf', 'teknik-resim', '3b-model'];

const kok = (no: number): string => `/cizimler/malzemeler/${no}`;

export function useMalzemeResimYetkisi() {
  const islemler = useOturum().data?.islemler ?? [];
  return {
    yazar: islemler.includes('malzemeler.yaz') || islemler.includes('belge-merkezi.yaz'),
    merkezGorur: islemler.includes('sayfa.cizimler'),
    yayinlar: islemler.includes('belge-merkezi.yayinla'),
    atolyeGorur: islemler.includes('sayfa.geometri'),
  };
}

// 3D Atölyesi yalnız ölçülebilen biçimleri (STEP, IGES) listeler; bağlantı yalnız onlarda çıkar.
const OLCULEN = new Set(['step', 'iges']);

const adindan = (ad: string): string => (ad.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || 'Belge').slice(0, 120);

function dosyaReddi(dosya: File | null, tur: MalzemeBelgeTuru): string | null {
  if (!dosya) return null;
  const t = dosyaTuruBul(dosya.name);
  return t !== null && IZINLI_DOSYA_TURLERI[tur].includes(t) ? null : `${TUR_ADI[tur]} için ${izinliMetni(tur)} dosyası seçin.`;
}

// Yayında olup karesi olmayan revizyonun küçük resmini üretir; dosya elde varsa yeniden indirilmez.
async function kareUret(no: number, belgeId: number, r: Pick<Revizyon, 'id' | 'revKodu' | 'dosyaTuru' | 'boyut' | 'onizlemeKareSayisi'>, veri?: Uint8Array) {
  await onizlemeGonder(r, {
    dosyaYolu: `/cizimler/${belgeId}/revizyonlar/${r.id}/dosya`,
    yazmaYolu: `${kok(no)}/belgeler/${belgeId}/revizyonlar/${r.id}/onizleme`,
    ...(veri ? { veri } : {}),
  });
}

// Karesi eksik yayındaki revizyon: dosyası merkezden okunur; okuma yetkisi yoksa küçük resim merkezde üretilir.
const karesizYayinda = (b: MalzemeBelgesi): Revizyon | undefined =>
  b.revizyonlar.find((r) => r.durum === 'yayinda' && r.onizlemeKareSayisi === 0 && kareKaynagi(r.dosyaTuru) !== null);

export interface MalzemeBelgesiGirdisi {
  tur: MalzemeBelgeTuru;
  ad?: string;
  resimNo?: string | null;
  antetRev?: string | null;
  not?: string | null;
}

// Kartın açılışında seçilen dosyalar kart ilk kaydedilince bununla gönderilir: yükler, belgeyi açar, küçük resmini üretir.
// Küçük resim üretilemezse belge yine açılmış olur; ileti `kareHatasi`nda döner.
export async function malzemeBelgesiYukle(
  no: number, dosya: File, g: MalzemeBelgesiGirdisi, ilerleme: (oran: number) => void = () => {},
): Promise<{ cevap: MalzemeBelgeleriCevabi; kareHatasi: string | null }> {
  const veri = new Uint8Array(await dosya.arrayBuffer());
  const ozet = await dosyaYukle(veri, ilerleme);
  const govde: MalzemeBelgeEkleGovdesi = {
    ad: g.ad?.trim() || adindan(dosya.name), tur: g.tur, resimNo: g.resimNo ?? null, antetRev: g.antetRev ?? null, not: g.not ?? null,
    ozet, dosyaAdi: dosya.name.slice(0, 120),
  };
  const istekKimligi = yeniIstekKimligi();
  let cevap = await tekrarKorumaliGonder((deneme) => api.post<MalzemeBelgeleriCevabi>(`${kok(no)}/belge-ekle`, govde, deneme), { istekKimligi });
  let kareHatasi: string | null = null;
  const yeni = cevap.belgeler.find((b) => b.revizyonlar.some((r) => r.ozet === ozet));
  const r = yeni?.revizyonlar.find((x) => x.ozet === ozet);
  if (yeni && r && resimUretilir(yeni, r)) {
    try {
      await kareUret(no, yeni.id, r, veri);
      cevap = await api.get<MalzemeBelgeleriCevabi>(`${kok(no)}/belgeler`);
    } catch (e) {
      kareHatasi = e instanceof OnizlemeAtlandi ? e.message : hataIletisi(e, 'Küçük resim üretilemedi; belge eklendi.');
    }
  }
  return { cevap, kareHatasi };
}

// Yayındaki revizyonun ve taslak 3B modelin karesi yüklemede üretilir (1990 a); sunucu da aynı kuralla kabul eder.
export const resimUretilir = (b: Pick<MalzemeBelgesi, 'tur'>, r: Pick<Revizyon, 'durum'>): boolean =>
  r.durum === 'yayinda' || (r.durum === 'taslak' && b.tur === '3b-model');

const YUKLEME_ILETISI: Readonly<Record<MalzemeBelgeTuru, string | null>> = {
  fotograf: null,
  'teknik-resim': 'Teknik resim yayına alındı; atölyede geçerli revizyon oldu.',
  '3b-model': '3B model taslak olarak eklendi ve resmi malzemeye işlendi; çizim merkezinde yayınlanınca atölyeye gider.',
};

function Ilerleme({ oran }: { oran: number | null }) {
  if (oran === null) return null;
  return (
    <div className="tc-cz-ilerleme">
      <progress max={1} value={oran} aria-label="Yükleme" />
      <span className="mono">%{Math.round(oran * 100)}</span>
    </div>
  );
}

// 2138-1 a: antet revizyonu kartın revizyonuyla dolu açılır; kartla yalnız antet karşılaştırılır. Fotoğrafın anteti yoktur.
const antetOnDegeri = (tur: MalzemeBelgeTuru, kartRev: string | null): string => (tur === 'fotograf' ? '' : kartRev ?? '');
// 3242: teknik resim no da kartınkiyle dolu açılır; fotoğrafın numarası yoktur.
const resimNoOnDegeri = (tur: MalzemeBelgeTuru, kartResimNo: string | null): string => (tur === 'fotograf' ? '' : kartResimNo ?? '');

function BelgeEkle({ no, kartRev, kartResimNo, kapat }: { no: number; kartRev: string | null; kartResimNo: string | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [tur, turYaz] = useState<MalzemeBelgeTuru>('fotograf');
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const [ad, adYaz] = useState('');
  const [resimNo, resimNoYaz] = useState(resimNoOnDegeri('fotograf', kartResimNo));
  const [resimNoElle, resimNoElleYaz] = useState(false);
  const [antetRev, antetRevYaz] = useState(antetOnDegeri('fotograf', kartRev));
  const [antetElle, antetElleYaz] = useState(false);
  const [ilerleme, ilerlemeYaz] = useState<number | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const komut = useMutation({
    mutationFn: (d: File) => malzemeBelgesiYukle(no, d, { tur, ad, resimNo, antetRev }, ilerlemeYaz),
    onMutate: () => { hataYaz(null); ilerlemeYaz(0); },
    onSuccess: async ({ kareHatasi }) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      const ileti = kareHatasi ?? YUKLEME_ILETISI[tur];
      if (ileti !== null) bildir('bilgi', ileti);
      kapat();
    },
    onError: (e) => { ilerlemeYaz(null); hataYaz(e instanceof DosyaHatasi ? e.message : hataIletisi(e, 'Belge eklenemedi')); },
  });
  const red = dosyaReddi(dosya, tur);
  return (
    <Pencere
      acik
      tur="yan"
      kapat={kapat}
      baslik="Resim ya da çizim ekle"
      alt={<Dugme tur="birincil" simge="upload" yukleniyor={komut.isPending} disabled={!dosya || red !== null} onClick={() => { if (dosya) komut.mutate(dosya); }}>Yükle</Dugme>}
    >
      <div className="tc-cz-form">
        <Secim etiket="Tür" value={tur} onChange={(e) => { const t = e.target.value as MalzemeBelgeTuru; turYaz(t); if (!antetElle) antetRevYaz(antetOnDegeri(t, kartRev)); if (!resimNoElle) resimNoYaz(resimNoOnDegeri(t, kartResimNo)); }} secenekler={MALZEME_TURLERI.map((t) => ({ deger: t, baslik: TUR_ADI[t] }))} />
        <Girdi
          etiket="Dosya" type="file" accept={kabulMetni(tur)} required
          onChange={(e) => { const d = e.target.files?.[0] ?? null; dosyaYaz(d); if (d && ad.trim() === '') adYaz(adindan(d.name)); }}
          ipucu={dosya ? `${dosya.name} · ${boyutMetni(dosya.size)}` : `${izinliMetni(tur)}; en çok 200 MB.`}
          {...(red ? { hata: red } : {})}
        />
        <Girdi etiket="Belge adı" value={ad} maxLength={120} onChange={(e) => { adYaz(e.target.value); }} />
        <Girdi etiket="Teknik resim no" value={resimNo} maxLength={60} onChange={(e) => { resimNoYaz(e.target.value); resimNoElleYaz(true); }} ipucu="Kartın teknik resim numarasıyla dolu gelir; çizim merkezinde bu numarayla aranır." />
        <Girdi etiket="Revizyon kodu" value={antetRev} maxLength={20} onChange={(e) => { antetRevYaz(e.target.value); antetElleYaz(true); }} ipucu="Resmin antetindeki revizyon; kartın revizyonuyla karşılaştırılır. Boşsa kartın revizyonu gösterilir." />
        <Ilerleme oran={ilerleme} />
        {hata !== null && <p className="tc-cz-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

function RevizyonYukle({ no, belge, kartRev, kapat }: { no: number; belge: MalzemeBelgesi; kartRev: string | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const [antetRev, antetRevYaz] = useState(antetOnDegeri(belge.tur as MalzemeBelgeTuru, kartRev));
  const [not, notYaz] = useState('');
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  const [hata, hataYaz] = useState<string | null>(null);
  const tur = belge.tur as MalzemeBelgeTuru;
  const komut = useMutation({
    mutationFn: async (d: File) => {
      const veri = new Uint8Array(await d.arrayBuffer());
      const ozet = await dosyaYukle(veri, () => {});
      const govde: MalzemeRevizyonEkleGovdesi = { ozet, dosyaAdi: d.name.slice(0, 120), antetRev, not, surum: belge.surum };
      const cevap = await tekrarKorumaliGonder((deneme) => api.post<MalzemeBelgeleriCevabi>(`${kok(no)}/belgeler/${belge.id}/revizyon-ekle`, govde, deneme), { istekKimligi: kimlik });
      const r = cevap.belgeler.find((b) => b.id === belge.id)?.revizyonlar.find((x) => x.ozet === ozet);
      if (r && resimUretilir(belge, r)) await kareUret(no, belge.id, r, veri);
    },
    onMutate: () => { hataYaz(null); },
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      if (tur === 'teknik-resim') bildir('bilgi', 'Yeni revizyon yayına alındı; önceki revizyon eskidi.');
      else if (tur === '3b-model') bildir('bilgi', 'Yeni revizyon taslak; çizim merkezinde yayınlanınca geçerli olur.');
      kapat();
    },
    onError: async (e) => {
      kimlikYaz(yeniIstekKimligi());
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      hataYaz(e instanceof DosyaHatasi || e instanceof OnizlemeAtlandi ? e.message : hataIletisi(e, 'Revizyon eklenemedi'));
    },
  });
  const red = dosyaReddi(dosya, tur);
  return (
    <Pencere
      acik
      tur="yan"
      kapat={kapat}
      baslik={`${belge.ad} · yeni revizyon`}
      alt={<Dugme tur="birincil" simge="upload" yukleniyor={komut.isPending} disabled={!dosya || red !== null} onClick={() => { if (dosya) komut.mutate(dosya); }}>Yükle</Dugme>}
    >
      <div className="tc-cz-form">
        <Girdi
          etiket="Dosya" type="file" accept={kabulMetni(tur)} required onChange={(e) => { dosyaYaz(e.target.files?.[0] ?? null); }}
          ipucu={dosya ? `${dosya.name} · ${boyutMetni(dosya.size)}` : `${izinliMetni(tur)}; en çok 200 MB.`}
          {...(red ? { hata: red } : {})}
        />
        <Girdi etiket="Revizyon kodu" value={antetRev} maxLength={20} onChange={(e) => { antetRevYaz(e.target.value); }} ipucu="Resmin antetindeki revizyon; kartın revizyonuyla karşılaştırılır." />
        <Girdi etiket="Revizyon notu" value={not} maxLength={300} onChange={(e) => { notYaz(e.target.value); }} />
        {hata !== null && <p className="tc-cz-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

// Son revizyon: yayındaki varsa o, yoksa en yenisi (liste sıra azalan gelir).
const gosterilenRevizyon = (b: MalzemeBelgesi): Revizyon | undefined => b.revizyonlar.find((r) => r.durum === 'yayinda') ?? b.revizyonlar[0];

// `tazele` değişince liste yeniden okunur: kart açılışında seçilen dosyalar kayıttan sonra bu panelin dışından yüklenir (3242).
export function ResimPaneli({ malzemeNo, tazele = 0 }: { malzemeNo: number; tazele?: number }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const { yazar, merkezGorur, yayinlar, atolyeGorur } = useMalzemeResimYetkisi();
  const [acik, acikYaz] = useState<'ekle' | { revizyon: MalzemeBelgesi } | null>(null);
  const [isleyen, isleyenYaz] = useState<number | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.malzemeBelgeleri(malzemeNo),
    queryFn: () => api.get<MalzemeBelgeleriCevabi>(`${kok(malzemeNo)}/belgeler`),
  });
  useEffect(() => {
    if (tazele > 0) void istemci.invalidateQueries({ queryKey: anahtarlar.kok });
  }, [tazele, istemci]);
  const islem = async (belgeId: number, is: () => Promise<unknown>, hataMetni: string) => {
    isleyenYaz(belgeId);
    try {
      await is();
    } catch (e) {
      bildir(e instanceof OnizlemeAtlandi ? 'bilgi' : 'hata', e instanceof OnizlemeAtlandi ? e.message : hataIletisi(e, hataMetni));
    } finally {
      isleyenYaz(null);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    }
  };

  if (sorgu.isError) return <Kart baslik="Resimler"><DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Resimler alınamadı')} yenile={() => { void sorgu.refetch(); }} /></Kart>;
  const veri = sorgu.data;
  return (
    <Kart baslik="Resimler" sag={yazar && <Dugme simge="plus" onClick={() => { acikYaz('ekle'); }}>Ekle</Dugme>}>
      {!veri
        ? <DurumKutusu durum="yukleniyor" />
        : (
          <div className="tc-cz-rp">
            <div className="tc-cz-rp-ust">
              <KucukResimKutusu resim={veri.kucukResim} ad="Malzeme resmi" boy="buyuk" />
              {veri.kucukResim?.revUyumu === false && (
                <p className="tc-cz-uyari" role="status">
                  Resim kartla uyuşmuyor: resmin revizyon kodu {veri.kucukResim.antetRev ?? 'yok'}, kartın revizyonu {veri.kartRevizyon ?? 'yok'}. Teknik resim numarasını da denetleyin.
                </p>
              )}
              {veri.kucukResim?.taslak === true && <p className="tc-cz-ipucu" role="status">Resim taslak 3B modelden; model yayınlanınca ölçülür ve atölyeye gider.</p>}
              {veri.kucukResim === null && <p className="tc-cz-ipucu">Küçük resim yok. Foto, teknik resim ya da 3B model ekleyin.</p>}
            </div>
            {veri.belgeler.length === 0
              ? <DurumKutusu durum="bos" mesaj="Bağlı resim ya da çizim yok" />
              : (
                <ul className="tc-cz-rp-liste">
                  {veri.belgeler.map((b) => {
                    const r = gosterilenRevizyon(b);
                    const karesiz = karesizYayinda(b);
                    const yayinlanmis = b.revizyonlar.some((x) => x.durum !== 'taslak');
                    const yayindaki = b.revizyonlar.find((x) => x.durum === 'yayinda');
                    const taslakModel = b.tur === '3b-model' && yayindaki === undefined ? b.revizyonlar.find((x) => x.durum === 'taslak') : undefined;
                    return (
                      <li key={b.id}>
                        <span className="tc-cz-rp-ad">
                          <Simge ad={TUR_SIMGESI[b.tur]} />
                          {merkezGorur ? <Link to={`/cizimler/belge/${b.id}`}>{b.ad}</Link> : b.ad}
                        </span>
                        {r && <span className="mono">{revKoduMetni(r.revKodu)}</span>}
                        {r && <Rozet ton={DURUM_TONU[r.durum]}>{DURUM_ADI[r.durum]}</Rozet>}
                        {b.kapak && <Rozet ton="bilgi">Kapak</Rozet>}
                        {b.tur === '3b-model' && atolyeGorur && yayindaki && OLCULEN.has(yayindaki.dosyaTuru) && (
                          <Link className="tc-cz-rp-atolye" to={`/geometri?rev=${String(yayindaki.id)}`}><Simge ad="expand" />3D Atölyesi'nde aç</Link>
                        )}
                        {taslakModel && yayinlar && (
                          <Dugme
                            simge="check" tur="birincil" yukleniyor={isleyen === b.id} disabled={isleyen !== null} aria-label={`${b.ad} yayınla`}
                            onClick={() => { void islem(b.id, async () => { await api.post(`/cizimler/${String(b.id)}/revizyonlar/${String(taslakModel.id)}/yayinla`, { surum: b.surum }); bildir('bilgi', 'Model yayınlandı; 3D Atölyesi yarım dakika içinde ölçer.'); }, 'Yayınlanamadı'); }}
                          >
                            Yayınla
                          </Dugme>
                        )}
                        {yazar && (
                          <span className="tc-cz-rev-arac">
                            {!b.kapak && yayinlanmis && (
                              <Dugme
                                simge="flag" yukleniyor={isleyen === b.id} disabled={isleyen !== null} aria-label={`${b.ad} kapak olsun`}
                                onClick={() => { void islem(b.id, () => api.post(`${kok(malzemeNo)}/belgeler/${b.id}/kapak`, { surum: b.surum }), 'Kapak seçilemedi'); }}
                              >
                                Kapak yap
                              </Dugme>
                            )}
                            {karesiz && merkezGorur && (
                              <Dugme
                                simge="scan" yukleniyor={isleyen === b.id} disabled={isleyen !== null} aria-label={`${b.ad} için küçük resim üret`}
                                onClick={() => { void islem(b.id, () => kareUret(malzemeNo, b.id, karesiz), 'Küçük resim üretilemedi'); }}
                              >
                                Resim üret
                              </Dugme>
                            )}
                            <Dugme simge="upload" disabled={isleyen !== null} onClick={() => { acikYaz({ revizyon: b }); }} aria-label={`${b.ad} yeni revizyon`}>Revizyon</Dugme>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            {yazar && veri.oneriler.length > 0 && (
              <>
                <p className="tc-cz-ipucu">Teknik resim numarası bu karta uyan belgeler:</p>
                <ul className="tc-cz-rp-liste">
                  {veri.oneriler.map((o) => (
                    <li key={o.id}>
                      <span className="tc-cz-rp-ad"><Simge ad={TUR_SIMGESI[o.tur]} />{o.ad}</span>
                      <Dugme
                        simge="plus" yukleniyor={isleyen === o.id} disabled={isleyen !== null}
                        onClick={() => { void islem(o.id, () => api.post(`${kok(malzemeNo)}/belgeler/${o.id}/bagla`, { surum: o.surum }), 'Bağlanamadı'); }}
                      >
                        Bağla
                      </Dugme>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      {acik === 'ekle' && <BelgeEkle no={malzemeNo} kartRev={sorgu.data?.kartRevizyon ?? null} kartResimNo={sorgu.data?.kartResimNo ?? null} kapat={() => { acikYaz(null); }} />}
      {acik !== null && acik !== 'ekle' && <RevizyonYukle no={malzemeNo} belge={acik.revizyon} kartRev={sorgu.data?.kartRevizyon ?? null} kapat={() => { acikYaz(null); }} />}
    </Kart>
  );
}
