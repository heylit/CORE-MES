import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LOGO_CARI_ARAMA_EN_AZ, LOGO_CARI_TOPLU_SINIRI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type {
  FirmaCevabi, LogoCariAramaCevabi, LogoCariSatiri, LogoCariTopluCevabi, LogoyaBaglaGovdesi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut, useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { FirmaFormu } from './FirmaFormu.tsx';
import { CrmRozeti, crmSorulur, useLogoCrm } from './logo-crm.tsx';
import { cariDurumu, topluPlan, type CariDurumu, type TopluPlan } from './logo-cari-gecisi.ts';
import { cevabiYaz } from './yazma.ts';
import './musteri-tedarikci.css';

// Logo geçişi, cariler sekmesi (3343). Logo'da aranan cariler CORE firmasıyla yan yana; seçilenler tek komutla bağlanır ya da
// öneriyle alınır (her cari ayrı işlenir, sonuç satır satır). Satırda tek işlem de vardır; alma o zaman firma formuyla yapılır.
// Logo'ya bir şey yazılmaz. Arama tek lisanslı yardımcıya gider: her tuşta değil, düğmeyle.
const DURUM: Record<CariDurumu, { ad: string; ton: RozetTonu; simge: SimgeAdi }> = {
  bagli: { ad: 'Bağlı', ton: 'tamam', simge: 'check' },
  baglanabilir: { ad: 'Bağlanabilir', ton: 'bilgi', simge: 'tag' },
  yeni: { ad: 'Yeni', ton: 'uyari', simge: 'plus' },
  eslesik: { ad: 'Elle bakılmalı', ton: 'pasif', simge: 'help' },
  alinamaz: { ad: 'Alınamaz', ton: 'hata', simge: 'alert' },
  pasif: { ad: "Logo'da pasif", ton: 'pasif', simge: 'minus' },
};
const SUZGEC_SIRASI: readonly (CariDurumu | 'tumu')[] = ['tumu', 'baglanabilir', 'yeni', 'bagli', 'eslesik', 'alinamaz', 'pasif'];
const ESLESME_NEDENI: Record<NonNullable<LogoCariSatiri['eslesme']>['neden'], string> = {
  'kayit-no': 'Logo kaydıyla bağlı',
  'cari-kodu': 'aynı Logo cari kodu',
  kod: 'aynı kod',
  'vergi-no': 'aynı vergi no',
};
const TUR_ADI = { musteri: 'Müşteri', tedarikci: 'Tedarikçi', ikisi: 'Müşteri ve tedarikçi' } as const;
const YAZMA_YETKISI = 'musteri-tedarikci.yaz';

export const LOGO_CARI_ANAHTARI = ['musteri-tedarikci', 'logo-cari'] as const;

export function LogoCariGecisi() {
  const oturum = useOturum();
  const istemci = useQueryClient();
  const navigate = useNavigate();
  const { bildir } = useBildirim();
  const [metin, metinYaz] = useState('');
  const [aranan, arananYaz] = useState('');
  const [suzgec, suzgecYaz] = useState<CariDurumu | 'tumu'>('tumu');
  const [plan, planYaz] = useState<TopluPlan | null>(null);
  const [sonuc, sonucYaz] = useState<LogoCariTopluCevabi | null>(null);
  const [alinan, alinanYaz] = useState<LogoCariSatiri | null>(null);
  const yazabilir = oturum.data?.islemler.includes(YAZMA_YETKISI) === true;
  const sonucSorgu = useQuery({
    queryKey: anahtarlar.logoCari(aranan),
    queryFn: () => api.get<LogoCariAramaCevabi>(`/musteri-tedarikci/logo-cari/ara?q=${encodeURIComponent(aranan)}`),
    enabled: yazabilir && aranan.length >= LOGO_CARI_ARAMA_EN_AZ,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const yenile = async () => {
    await istemci.invalidateQueries({ queryKey: ['musteri-tedarikci'] });
  };
  const bagla = useTekGonderim({
    mutationFn: (o: { firmaId: number; govde: LogoyaBaglaGovdesi }) =>
      api.post<FirmaCevabi>(`/musteri-tedarikci/firmalar/${o.firmaId}/logo-bagla`, o.govde),
    onSuccess: async (cevap) => {
      cevabiYaz(istemci, cevap);
      bildir('tamam', `${cevap.firma.kod ?? cevap.firma.ad} Logo carisine bağlandı.`);
      await istemci.invalidateQueries({ queryKey: LOGO_CARI_ANAHTARI });
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Bağlanamadı.')),
  });

  // 3359 a: bağlı satırda CORE firmasının CRM durumu (bulunan bağlı cariler tek istekle; kanca erken dönüşten önce).
  const crmFirmasi = (c: LogoCariSatiri): number | null =>
    cariDurumu(c) === 'bagli' && c.eslesme && crmSorulur({ tur: c.oneri.tur, logoCariKodu: c.kod }) ? c.eslesme.firmaId : null;
  const bulunan = sonucSorgu.data?.durum === 'tamam' ? sonucSorgu.data.cariler : [];
  const crm = useLogoCrm(bulunan.map(crmFirmasi).filter((id): id is number => id !== null));

  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (!yazabilir) {
    return <Kart><p className="tc-mt-yok">Logo'da cari aramak ve CORE'a almak firma yazma yetkisi ister; yetkiniz yok.</p></Kart>;
  }

  const gonder = (o: FormEvent) => {
    o.preventDefault();
    const q = metin.trim();
    if (q.length >= LOGO_CARI_ARAMA_EN_AZ) { arananYaz(q); suzgecYaz('tumu'); }
  };
  const veri = sonucSorgu.data?.durum === 'tamam' ? sonucSorgu.data : null;
  const cariler = veri?.cariler ?? [];
  const sayilar = new Map<CariDurumu | 'tumu', number>([['tumu', cariler.length]]);
  for (const c of cariler) sayilar.set(cariDurumu(c), (sayilar.get(cariDurumu(c)) ?? 0) + 1);
  const gorunen = suzgec === 'tumu' ? cariler : cariler.filter((c) => cariDurumu(c) === suzgec);

  const eylem = (c: LogoCariSatiri) => {
    const d = cariDurumu(c);
    const e = c.eslesme;
    if (d === 'baglanabilir' && e) {
      return (
        <Dugme simge="tag" aria-label={`${c.kod} bağla`} yukleniyor={bagla.isPending && bagla.variables?.firmaId === e.firmaId}
          onClick={() => bagla.mutate({ firmaId: e.firmaId, govde: { logoKodu: c.kod, surum: e.surum } })}>
          Bağla
        </Dugme>
      );
    }
    if (d === 'yeni') return <Dugme simge="download" aria-label={`${c.kod} CORE'a al`} onClick={() => alinanYaz(c)}>CORE'a al…</Dugme>;
    if (e && (d === 'bagli' || d === 'eslesik')) {
      return <Dugme simge="next" aria-label={`${c.kod} firmayı aç`} onClick={() => { void navigate(`/musteri-tedarikci?firma=${e.firmaId}`); }}>Firmayı aç</Dugme>;
    }
    return null;
  };
  const sutunlar: readonly Sutun<LogoCariSatiri>[] = [
    {
      anahtar: 'logo', baslik: 'Logo cari',
      hucre: (c) => (
        <span className="tc-mt-gecis-taraf">
          <span className="tc-mt-gecis-kod">{c.kod}</span>
          <span className="tc-mt-gecis-ek">{c.ad ?? '—'}</span>
        </span>
      ),
      csv: (c) => `${c.kod} ${c.ad ?? ''}`.trim(),
    },
    {
      anahtar: 'vergi', baslik: 'Vergi no / il',
      hucre: (c) => (
        <span className="tc-mt-gecis-taraf">
          <span className="tc-mt-gecis-kod">{c.vergiNo ?? '—'}</span>
          {c.il && <span className="tc-mt-gecis-ek">{c.il}</span>}
        </span>
      ),
      csv: (c) => [c.vergiNo, c.il].filter(Boolean).join(' '),
    },
    {
      anahtar: 'durum', baslik: 'Durum', kirilmaz: true,
      hucre: (c) => {
        const d = DURUM[cariDurumu(c)];
        const firmaId = crmFirmasi(c);
        return (
          <span className="tc-mt-logo-bag">
            <Rozet ton={d.ton}><Simge ad={d.simge} boyut="k" />{d.ad}</Rozet>
            {firmaId !== null && <CrmRozeti bilgi={crm.durum(firmaId)} />}
          </span>
        );
      },
      csv: (c) => DURUM[cariDurumu(c)].ad,
    },
    {
      anahtar: 'core', baslik: 'CORE karşılığı',
      hucre: (c) => <CoreKarsiligi cari={c} />,
      csv: (c) => (c.eslesme ? `${c.eslesme.kod ?? ''} ${c.eslesme.ad}`.trim() : ''),
    },
    { anahtar: 'islem', baslik: '', csv: false, hucre: eylem },
  ];

  return (
    <>
      <Kart>
        <form className="tc-mt-logo-ara" onSubmit={gonder}>
          <Girdi
            etiket="Logo'da ara"
            ipucu={`Kod, ad ya da vergi no; en az ${LOGO_CARI_ARAMA_EN_AZ} karakter. En çok ${LOGO_CARI_TOPLU_SINIRI} cari gelir.`}
            value={metin}
            maxLength={100}
            autoComplete="off"
            onChange={(o) => metinYaz(o.target.value)}
          />
          <Dugme simge="search" type="submit" yukleniyor={sonucSorgu.isFetching} disabled={metin.trim().length < LOGO_CARI_ARAMA_EN_AZ}>Logo'da ara</Dugme>
        </form>
      </Kart>
      {sonucSorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sonucSorgu.error, 'Logo\'da aranamadı.')} yenile={() => { void sonucSorgu.refetch(); }} />}
      {sonucSorgu.data && sonucSorgu.data.durum !== 'tamam' && <p className="tc-mt-hata" role="alert">{sonucSorgu.data.ileti}</p>}
      {aranan === '' && <p className="tc-mt-yok">Logo'daki cariyi kod, ad ya da vergi numarasıyla arayın; CORE'daki karşılığıyla yan yana gelir.</p>}
      {veri && (
        <Kart>
          <p className="tc-mt-yok">
            Seçilenlerden bağlanabilenler CORE firmasına bağlanır (yalnız Logo kayıt no ve cari kodu yazılır), yeniler CORE'da açılır (kod Logo kodudur).
            Ötekiler atlanır ve nedeni gösterilir.{veri.ileti ? ` ${veri.ileti}` : ''}
          </p>
          <Tablo
            etiket="Logo carileri"
            sutunlar={sutunlar}
            satirlar={gorunen}
            satirAnahtari={(c) => c.logoKayitNo}
            mesgul={sonucSorgu.isFetching}
            bosMesaj={cariler.length === 0 ? 'Logo\'da bu aramayla cari yok.' : 'Bu süzgece uyan cari yok.'}
            toplu={{ eylemler: [{ anahtar: 'isle', baslik: 'Seçilenleri işle', simge: 'check', ton: 'birincil', yap: (s) => planYaz(topluPlan(s)) }] }}
            arac={{
              suzgec: {
                etiket: 'Durum',
                secenekler: SUZGEC_SIRASI.filter((d) => d === 'tumu' || (sayilar.get(d) ?? 0) > 0)
                  .map((d) => ({ deger: d, baslik: `${d === 'tumu' ? 'Tümü' : DURUM[d].ad} (${sayilar.get(d) ?? 0})` })),
                secili: suzgec,
                sec: (d) => suzgecYaz(d as CariDurumu | 'tumu'),
              },
              csv: { ad: 'logo-gecisi-cariler' },
            }}
          />
        </Kart>
      )}
      {plan && (
        <TopluPencere
          plan={plan}
          kapat={() => planYaz(null)}
          bitti={async (s) => { planYaz(null); sonucYaz(s); await yenile(); }}
        />
      )}
      {sonuc && <SonucPenceresi sonuc={sonuc} kapat={() => sonucYaz(null)} />}
      {alinan && (
        <FirmaFormu
          key={alinan.logoKayitNo}
          firma={null}
          varsayilanTur={alinan.oneri.tur}
          logodan={alinan}
          kapat={() => alinanYaz(null)}
          kaydedildi={() => { alinanYaz(null); void istemci.invalidateQueries({ queryKey: LOGO_CARI_ANAHTARI }); }}
        />
      )}
    </>
  );
}

function CoreKarsiligi({ cari }: { cari: LogoCariSatiri }) {
  const d = cariDurumu(cari);
  const e = cari.eslesme;
  if (d === 'alinamaz') return <span className="tc-mt-gecis-ek">{cari.alinamaz} Logo'da kodu düzeltip yeniden arayın.</span>;
  if (e === null) {
    return <span className="tc-mt-gecis-ek">{d === 'pasif' ? 'CORE\'da yok' : `Açılacak: ${TUR_ADI[cari.oneri.tur]}`}</span>;
  }
  return (
    <span className="tc-mt-gecis-taraf">
      <span><span className="tc-mt-gecis-kod">{e.kod ?? '—'}</span> {e.ad}</span>
      <span className="tc-mt-gecis-ek">
        {d === 'eslesik' ? `${ESLESME_NEDENI[e.neden]}; firma başka cariye bağlı ya da Logo cari kodu farklı, firmada bakın.` : ESLESME_NEDENI[e.neden]}
      </span>
    </span>
  );
}

function TopluPencere({ plan, kapat, bitti }: { plan: TopluPlan; kapat: () => void; bitti: (s: LogoCariTopluCevabi) => Promise<void> }) {
  const { bildir } = useBildirim();
  const { bagla, al } = plan.govde;
  const gonder = useKorumaliKomut({
    gonder: (_: void, deneme) => api.post<LogoCariTopluCevabi>('/musteri-tedarikci/logo-cari/toplu', plan.govde, deneme),
    onSuccess: async (s) => { await bitti(s); },
    onError: (e) => bildir('hata', hataIletisi(e, 'Yapılamadı.')),
  });
  const islenecek = bagla.length + al.length;
  const onayla = (o: FormEvent) => {
    o.preventDefault();
    gonder.mutate();
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Seçilen carileri işle"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="logo-cari-toplu" simge="check" disabled={islenecek === 0} yukleniyor={gonder.isPending}>
            {islenecek === 0 ? 'İşlenecek cari yok' : `${bagla.length} bağla, ${al.length} al`}
          </Dugme>
        </>
      )}
    >
      <form id="logo-cari-toplu" onSubmit={onayla}>
        <ul className="tc-mt-gecis-liste" aria-label="Ne olacak">
          {bagla.length > 0 && <li><Simge ad="tag" boyut="k" /><span>{bagla.length} cari CORE'daki firmaya bağlanacak; firmanın öteki bilgileri değişmez.</span></li>}
          {al.length > 0 && <li><Simge ad="download" boyut="k" /><span>{al.length} firma CORE'da açılacak; kod ve Logo cari kodu Logo kodu, tür Logo cari türünden. Sonra firma kartında düzeltilebilir.</span></li>}
          {[...plan.atlanan].map(([n, adet]) => <li key={n}><Simge ad="minus" boyut="k" /><span>{adet} satır atlanacak: {n}</span></li>)}
          {plan.fazla > 0 && <li><Simge ad="minus" boyut="k" /><span>{plan.fazla} satır bu işleme sığmadı (en çok {LOGO_CARI_TOPLU_SINIRI}); sonra yeniden seçin.</span></li>}
          <li><Simge ad="eye" boyut="k" /><span>Logo'ya hiçbir şey yazılmaz.</span></li>
        </ul>
      </form>
    </Pencere>
  );
}

function SonucPenceresi({ sonuc, kapat }: { sonuc: LogoCariTopluCevabi; kapat: () => void }) {
  const tamam = sonuc.sonuclar.filter((s) => s.tamam);
  const bagli = tamam.filter((s) => s.islem === 'bagla').length;
  return (
    <Pencere acik kapat={kapat} baslik="Sonuç" alt={<Dugme tur="birincil" onClick={kapat}>Tamam</Dugme>}>
      <p className="tc-mt-yok" role="status">
        {bagli} bağlandı, {tamam.length - bagli} firma açıldı, {sonuc.sonuclar.length - tamam.length} işlenemedi.
      </p>
      <ul className="tc-mt-gecis-liste" aria-label="Satır sonuçları">
        {sonuc.sonuclar.map((s) => (
          <li key={s.logoKodu}>
            <Simge ad={s.tamam ? 'check' : 'alert'} boyut="k" />
            <span>
              <span className="tc-mt-gecis-kod">{s.logoKodu}</span>{' '}
              {s.tamam ? `${s.islem === 'bagla' ? 'Bağlandı' : 'Açıldı'}: ${s.firma?.kod ?? ''} ${s.firma?.ad ?? ''}`.trim() : s.ileti ?? 'İşlenemedi.'}
            </span>
          </li>
        ))}
      </ul>
    </Pencere>
  );
}
