import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { HaritaOzetiCevabi, IsKutusuCevabi, PanelCevabi, SayimBekleyenlerCevabi, SepetCevabi, ToplamalarCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { HAREKET_ETIKETI, bugunMetni, hareketIsareti, miktarMetni, paraMetni } from './gorunum.ts';
import { SayfaBasi, hataMetni, useIslem } from './ortak.tsx';
import './stok.css';
import { paneliAc, type PanelIstegi } from './panel-olayi.ts';

// panel: iş sayfada değil Malzeme · Teslim panelindedir; düğme paneli o bölümde açar.
interface Is { ton: 'bilgi' | 'uyari' | 'hata' | 'notr'; baslik: string; alt: string; yol: string; eylem: string; panel?: PanelIstegi }
// Tek sıralı liste (753 b): önce düzeltilecek (hata), sonra dikkat (uyarı), sonra sıradaki iş; aynı tondakiler eklendiği sırada kalır.
const TON_SIRASI: Record<Is['ton'], number> = { hata: 0, uyari: 1, bilgi: 2, notr: 3 };

// Önizlemedeki "Bekleyen işler": veri olan iş satır olur; sayım süresi tanımlı değilse uydurulmaz, söylenir (DEP-15).
export function isler(k: IsKutusuCevabi, eslenmemis = 0): Is[] {
  const l: Is[] = [];
  if ((k.teslimBekleyenIstek ?? 0) > 0) l.push({ ton: 'bilgi', baslik: `${k.teslimBekleyenIstek} malzeme isteği teslim bekliyor`, alt: 'İstenen malzeme hazırlanıp teslim edilmeli.', yol: '/stok/hazirlik', eylem: 'İstekler' });
  if ((k.depoyaGelenTeslim ?? 0) > 0) l.push({ ton: 'bilgi', baslik: `${k.depoyaGelenTeslim} teslim depoya geliyor`, alt: 'İstasyondan iade ya da geri gönderilen malzeme; teslim alınınca stok depoya geçer.', yol: '/stok', eylem: 'Teslim al', panel: { sekme: 'al' } });
  if (k.kabuldeBekleyen > 0) l.push({ ton: 'bilgi', baslik: `${k.kabuldeBekleyen} malzeme mal kabul alanında bekliyor`, alt: 'Rafa yerleştirilmeleri gerekiyor.', yol: '/stok/malzemeler?durum=kabulde', eylem: 'Listele' });
  if (k.eksiBakiye > 0) l.push({ ton: 'hata', baslik: `${k.eksiBakiye} bakiye satırı eksiye düştü`, alt: 'Onaylı eksi çıkışlar; sayım ya da düzeltme bekliyor.', yol: '/stok/malzemeler?durum=eksi', eylem: 'Listele' });
  if (k.kritik > 0) l.push({ ton: 'uyari', baslik: `${k.kritik} malzeme kritik seviyede`, alt: 'Serbest stok tanımlı kritik seviyeye indi.', yol: '/stok/malzemeler?durum=kritik', eylem: 'Listele' });
  if (k.logoFarki > 0) l.push({ ton: 'hata', baslik: `${k.logoFarki} mal kabul satırında Logo irsaliyesiyle fark var`, alt: 'Sayılan miktar irsaliyeden farklı.', yol: '/stok/mal-kabul?logoDurumu=fark_var', eylem: 'Belgeler' });
  if (k.sayimBekleyen) l.push({ ton: 'uyari', baslik: `${k.sayimBekleyen} dolu göz sayım bekliyor`, alt: 'Son sayımı sayım süresinden eski ya da hiç sayılmamış gözler.', yol: '/stok?sayim=1', eylem: 'Gözler' });
  if (k.fasondaEksik > 0) l.push({ ton: 'uyari', baslik: `${k.fasondaEksik} emrin parçası fason firmasında kaldı`, alt: 'Emir kapandı; gönderilen, dönen ve hurda tutmuyor. Firmayla eksik kontrol edilmeli.', yol: '/stok/konumlar', eylem: 'Konumlar' });
  if (k.fasonEksikGonderimi > 0) l.push({ ton: 'uyari', baslik: `${k.fasonEksikGonderimi} fason gönderiminde parça eksik gitti`, alt: 'İstasyonda yeterli parça yoktu; olan kadar gönderildi.', yol: '/stok/hareketler', eylem: 'Hareketler' });
  if (k.logoHatasi > 0) l.push({ ton: 'hata', baslik: `${k.logoHatasi} hareket Logo'ya gönderilemedi`, alt: 'Gönderim hata verdi.', yol: '/stok/hareketler', eylem: 'Hareketler' });
  if (eslenmemis > 0) l.push({ ton: 'bilgi', baslik: `${eslenmemis} harita yeri stok konumu değil`, alt: 'Fabrika Haritası\'nda açılan raf gözü ya da alan; Konumlar\'da "Haritadan eşle" ile eşlenir.', yol: '/stok/konumlar', eylem: 'Konumlar' });
  return l.sort((a, b) => TON_SIRASI[a.ton] - TON_SIRASI[b.ton]);
}

// Güncel değerin dışında, kendi satırında değerlenen konumlar (228 a).
const AYRI_DEGERLER = [['kalite', 'Kalite bekleyen / red'], ['hurda', 'Hurda'], ['fason', 'Fason'], ['yolda', 'Yolda'], ['diger', 'Üretimde ve diğer'], ['toplam', 'Toplam']] as const satisfies readonly (readonly [keyof PanelCevabi['guncelAyri'], string])[];
const GUN = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
function Gunluk({ gunluk }: { gunluk: PanelCevabi['gunluk'] }) {
  const enCok = Math.max(1, ...gunluk.flatMap((g) => [g.giris, g.cikis]));
  const sutun = 56, yukseklik = 120;
  return (
    <figure className="tc-stok-grafik">
      <svg viewBox={`0 0 ${gunluk.length * sutun} ${yukseklik + 22}`} role="img" aria-label="Son yedi günün giriş ve çıkış hareket sayıları">
        {[0.5, 1].map((o) => <line key={o} x1="0" x2={gunluk.length * sutun} y1={yukseklik - yukseklik * o} y2={yukseklik - yukseklik * o} className="tc-stok-grafik-cizgi" />)}
        {gunluk.map((g, i) => {
          const hg = (g.giris / enCok) * (yukseklik - 8), hc = (g.cikis / enCok) * (yukseklik - 8), x = i * sutun + 12;
          return (
            <g key={g.gun}>
              <rect x={x} y={yukseklik - hg} width="14" height={hg} rx="2" className="tc-stok-grafik-giris"><title>{`Giriş ${g.giris}`}</title></rect>
              <rect x={x + 17} y={yukseklik - hc} width="14" height={hc} rx="2" className="tc-stok-grafik-cikis"><title>{`Çıkış ${g.cikis}`}</title></rect>
              <text x={x + 15} y={yukseklik + 16} textAnchor="middle" className="tc-stok-grafik-yazi">{GUN.format(new Date(`${g.gun}T12:00:00`))}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="tc-stok-lejant"><span className="tc-stok-nokta tc-stok-nokta-giris" />Giriş <span className="tc-stok-nokta tc-stok-nokta-cikis" />Çıkış</figcaption>
    </figure>
  );
}

// Sayım bekleyen dolu gözler (DEP-15): süre yerleşimdedir (yerleşim düzenleyici, Bina).
function SayimBekleyenler() {
  const c = useQuery({ queryKey: [...anahtarlar.hepsi, 'sayim-bekleyenler'], queryFn: () => api.get<SayimBekleyenlerCevabi>('/stok/sayim-bekleyenler') });
  if (!c.data) return null;
  return (
    <Kart baslik={`Sayım bekleyen gözler (${c.data.gun} gün)`}>
      <div className="tc-stok-etiketler">
        {c.data.gozler.map((g) => <Link key={g.konumId} to={`/stok/konumlar/${g.konumId}`} className="tc-stok-etiket">{g.kod}{g.sonSayim ? '' : ' · hiç'}</Link>)}
      </div>
    </Kart>
  );
}

// Depocu açılışı herkesin açılışıdır: okut, sepet ve toplama öne alınır, kutucuklar yetkiyle süzülür.
function DepocuAcilis() {
  const sepetYetki = useIslem('stok.transfer'), toplamaYetki = useIslem('stok.toplama'), girisYetki = useIslem('stok.giris');
  const sepet = useQuery({ queryKey: [...anahtarlar.hepsi, 'sepet'], queryFn: () => api.get<SepetCevabi>('/stok/sepet'), enabled: sepetYetki });
  const toplama = useQuery({ queryKey: anahtarlar.liste('toplamalar-acik', {}), queryFn: () => api.get<ToplamalarCevabi>('/stok/toplamalar?durum=topluyor&sayfaBoyu=5'), enabled: toplamaYetki });
  return (
    <div className="tc-stok-depocu">
      <button type="button" className="tc-stok-depocu-kutu tc-stok-depocu-ana" onClick={() => paneliAc({ sekme: 'sepet', depoSepeti: true })}><strong>Okut</strong><span>Ürün ya da raf kodunu okut</span></button>
      {sepetYetki && <Link to="/stok/sepet" className="tc-stok-depocu-kutu"><strong>Sepet</strong><span>{sepet.data ? `${sepet.data.satirlar.length} kalem` : '—'}</span></Link>}
      {toplamaYetki && <Link to={toplama.data?.satirlar[0] ? `/stok/hazirlik/${toplama.data.satirlar[0].id}` : '/stok/hazirlik'} className="tc-stok-depocu-kutu"><strong>Toplama</strong><span>{toplama.data ? `${toplama.data.toplam ?? toplama.data.satirlar.length} açık liste` : '—'}</span></Link>}
      {girisYetki && <button type="button" className="tc-stok-depocu-kutu" onClick={() => paneliAc({ sekme: 'al' })}><strong>Mal kabul</strong><span>Okutarak teslim al</span></button>}
    </div>
  );
}

export function IsKutusu() {
  const tanimlar = useIslem('stok.tanim');
  const malKabulYetkisi = useIslem('stok.giris');
  const cikisYetkisi = useIslem('stok.cikis');
  const s = useQuery({ queryKey: anahtarlar.isKutusu, queryFn: () => api.get<IsKutusuCevabi>('/stok/is-kutusu') });
  const p = useQuery({ queryKey: [...anahtarlar.hepsi, 'panel'], queryFn: () => api.get<PanelCevabi>('/stok/panel') });
  // Okuma sayfası yazmaz: eşlenmemiş harita yeri yalnız iş olarak söylenir, eşleme tanım yetkilisinin düğmesiyle koşar.
  const h = useQuery({ queryKey: [...anahtarlar.hepsi, 'harita-ozeti'], queryFn: () => api.get<HaritaOzetiCevabi>('/stok/harita-ozeti'), enabled: tanimlar });
  const l = s.data ? isler(s.data, tanimlar ? h.data?.eslenmemis ?? 0 : 0) : [];
  const d = p.data;
  return (
    <section className="tc-stok">
      <SayfaBasi
        baslik="İş kutusu"
        alt={s.data ? `${bugunMetni()}. ${l.length ? `Sizi bekleyen ${l.length} iş var.` : 'Bekleyen iş yok.'}` : bugunMetni()}
        sag={<>
          <Dugme tur="birincil" simge="scan" onClick={() => paneliAc({ sekme: 'al' })}>Okut</Dugme>
          {malKabulYetkisi && <Link to="/stok/mal-kabul"><Dugme simge="truck">Mal kabul</Dugme></Link>}
          {cikisYetkisi && <Dugme simge="truck" onClick={() => paneliAc({ sekme: 'et' })}>Sevk çıkışı</Dugme>}
          <Link to="/malzemeler"><Dugme simge="layers">Malzeme kartları</Dugme></Link>
        </>}
      />
      <DepocuAcilis />
      {(s.isPending || p.isPending) && <DurumKutusu durum="yukleniyor" />}
      {s.isError && <DurumKutusu durum="hata" mesaj={hataMetni(s.error)} yenile={() => void s.refetch()} />}
      {d && (
        <div className="tc-stok-kpiler">
          <Link to="/stok/malzemeler" className="tc-stok-kpi"><strong>{d.malzemeCesidi}</strong><span>Malzeme çeşidi</span></Link>
          {d.degerGorunur && <div className="tc-stok-kpi"><strong>{d.stokDegeri === null ? 'Veri yok' : paraMetni(d.stokDegeri)}</strong><span>Stok değeri</span><small>Ortalama alış fiyatıyla{d.fiyatsizKart ? ` · ${d.fiyatsizKart} kartın fiyatı yok` : ''}</small></div>}
          {d.degerGorunur && <div className="tc-stok-kpi"><strong>{d.guncelDeger === null ? '—' : paraMetni(d.guncelDeger)}</strong><span>Güncel stok değeri</span><small>Satın alma kg fiyatıyla{d.guncelFiyatsizKart ? ` · ${d.guncelFiyatsizKart} kartın fiyatı yok` : ''}</small><small>Yalnız kullanılabilir · {AYRI_DEGERLER.map(([k, ad]) => `${ad} ${d.guncelAyri[k] === null ? '—' : paraMetni(d.guncelAyri[k])}`).join(' · ')}</small></div>}
          <Link to="/stok/raflar" className="tc-stok-kpi"><strong>%{d.gozToplam ? Math.round((d.gozDolu / d.gozToplam) * 100) : 0}</strong><span>Raf doluluğu ({d.gozDolu}/{d.gozToplam})</span></Link>
          <Link to="/stok/malzemeler?durum=kritik" className={`tc-stok-kpi ${d.kritik + d.eksi ? 'tc-stok-kpi-uyari' : ''}`}><strong>{d.kritik + d.eksi}</strong><span>Kritik ya da eksi</span></Link>
          <Link to="/stok/malzemeler?durum=kabulde" className="tc-stok-kpi"><strong>{d.kabulde}</strong><span>Mal kabul bekleyen</span></Link>
          <Link to="/stok/hazirlik" className="tc-stok-kpi"><strong>{d.toplamaBekleyen}</strong><span>Toplama bekleyen</span></Link>
          <div className={`tc-stok-kpi ${s.data?.sayimBekleyen ? 'tc-stok-kpi-uyari' : ''}`}><strong>{s.data?.sayimBekleyen ?? '—'}</strong><span>Sayım bekleyen göz</span></div>
        </div>
      )}
      {s.data && (
        <Kart baslik="Bekleyen işler">
          <div className="tc-stok-isler">
            {l.length === 0 && <div className="tc-stok-is tc-stok-is-tamam"><div><strong>Her şey yolunda</strong><span>Bekleyen kabul, eksi bakiye, kritik stok ya da Logo farkı yok.</span></div></div>}
            {l.map((i) => (
              <div key={i.baslik} className={`tc-stok-is tc-stok-is-${i.ton}`}>
                <div><strong>{i.baslik}</strong><span>{i.alt}</span></div>
                {i.panel ? <Dugme onClick={() => { if (i.panel) paneliAc(i.panel); }}>{i.eylem}</Dugme> : <Link to={i.yol}><Dugme>{i.eylem}</Dugme></Link>}
              </div>
            ))}
          </div>
        </Kart>
      )}
      {d && (
        <div className="tc-stok-izgara">
          <Kart baslik="Son 7 gün işlemler"><Gunluk gunluk={d.gunluk} /></Kart>
          <Kart baslik="Kritik stok" sag={<Link to="/stok/malzemeler?durum=kritik">Tümü</Link>}>
            {d.kritikListe.length === 0 ? <p className="tc-stok-not">Kritik seviyede malzeme yok (kritik seviye tanımlı olanlar arasında).</p> : (
              <ul className="tc-stok-satirlar">
                {d.kritikListe.map((k) => (
                  <li key={k.malzemeId}><Link to={`/stok/malzemeler/${k.malzemeId}`}>{k.ad ?? `Kart ${k.malzemeId}`} <span className="tc-stok-mono">{k.kod ?? ''}</span></Link>
                    <strong className="tc-stok-uyari-yazi">{miktarMetni(k.toplam)} / {miktarMetni(k.kritikSeviye)}</strong></li>
                ))}
              </ul>
            )}
          </Kart>
          <Kart baslik="Raf doluluğu" sag={<Link to="/stok/raflar">Matris</Link>}>
            <ul className="tc-stok-satirlar">
              {d.raflar.map((r) => {
                const oran = r.toplam ? r.dolu / r.toplam : 0;
                return (
                  <li key={r.rafId}><Link to={`/stok/raflar/${r.rafId}`}><strong className="tc-stok-mono">Raf {r.kod}</strong></Link>
                    <svg className="tc-stok-cubuk" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="4" className="tc-stok-cubuk-zemin" /><rect width={oran * 100} height="8" rx="4" className="tc-stok-cubuk-dolu" /></svg>
                    <span className="tc-stok-not">%{Math.round(oran * 100)} · {r.dolu}/{r.toplam}</span></li>
                );
              })}
              {d.raflar.length === 0 && <li className="tc-stok-not">Henüz raf yok.</li>}
            </ul>
          </Kart>
          <Kart baslik="Son hareketler" sag={<Link to="/stok/hareketler">Tümü</Link>}>
            <ul className="tc-stok-satirlar">
              {d.sonHareketler.map((h) => (
                <li key={h.id}><span><strong>{h.malzemeAd ?? `Kart ${h.malzemeId}`}</strong> <span className="tc-stok-not">{HAREKET_ETIKETI[h.tur]} · {[h.kaynakKonumKod, h.hedefKonumKod].filter(Boolean).join(' → ')}</span></span>
                  <strong className={hareketIsareti(h).eksi ? 'tc-stok-eksi' : ''}>{hareketIsareti(h).isaret}{miktarMetni(h.miktar)}</strong></li>
              ))}
            </ul>
          </Kart>
        </div>
      )}
      {s.data?.sayimBekleyen === null && <p className="tc-stok-not">Sayım süresi tanımlı değil; sayım bekleyen gözler gösterilmiyor.</p>}
      {!!s.data?.sayimBekleyen && <SayimBekleyenler />}
      <p className="tc-stok-not">Sarf düşümü ve biten mamul girişi şimdilik elle yapılır: üretim sayımı TMI üretim emrine yazılınca otomatik olur.</p>
    </section>
  );
}
