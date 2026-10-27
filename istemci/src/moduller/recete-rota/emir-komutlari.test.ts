import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EMIR_KOMUTLARI } from './emir-komutlari.ts';

// Emir komutlarının gövdesi sahibinin (Üretim Emirleri) adımlarından kurulur. Bu testler eski çerçevenin Emirler testindeydi (805); yeni
// ekran da aynı komutları kullanır. Veriler uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

type Emir = NonNullable<DurumCevabi['emirler']>['orders'][number];
const emir = (id: number, ek: Partial<Emir> = {}): Emir => ({
  id: String(id), kayitNo: id, no: `UE-2030-${String(id)}`, itemId: '12', qty: 20, start: '2030-01-02', due: '2030-01-20', priority: 3, note: null, rev: null,
  status: 'serbest', created: 1_893_456_000_000, doneAt: null, tur: 'seri', parentId: null, kol: null, birlestigiId: null, surum: 3, ...ek,
});
const isEmri = (sira: number, durum: 'bekliyor' | 'calisiyor' | 'tamam' = 'bekliyor') => ({
  id: 700 + sira, opNo: sira * 10, sira, tip: { id: 1, ad: 'Deneme', kod: 'T' }, ad: `Adım ${String(sira)}`, kaynak: null, istasyon: null, ayarSuresiDk: '5', birimSureDk: '2',
  terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, durum, baslama: null, bitis: null, saglamAdet: null, bilesenler: [], adaylar: [], fason: null,
});
const ayrinti = (e: Emir): AdimliEmirAyrintisi => ({
  id: e.kayitNo, emirNo: e.no, urun: { id: 12, kod: 'YM-0001', ad: 'Deneme gövde' }, adet: e.qty, oncelik: e.priority, baslangic: e.start, teslim: e.due,
  durum: ({ taslak: 'taslak', serbest: 'planli', uretimde: 'basladi', tamam: 'bitti', iptal: 'iptal' } as const)[e.status], arsiv: false,
  parti: { ustEmirId: e.parentId === null ? null : Number(e.parentId), bolunmeSira: e.parentId === null ? null : 1, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null },
  kaynakRotaRevizyonId: null, emirTuru: 'seri', projeId: null, adimSayisi: 3, tamamAdim: 0, siradaki: { id: 701, opNo: 10, ad: 'Adım 1', durum: 'bekliyor', kaynak: null, istasyon: null }, aciklama: null, acilma: '2030-01-01T00:00:00Z', surum: e.surum,
  isEmirleri: [isEmri(1), isEmri(2), isEmri(3)], eski: null,
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Bölme komutu sahibinin adımına çevrilir; uygunluğa Üretim Emirleri karar verir', () => {
  const kur = (durumlar: Array<'bekliyor' | 'calisiyor' | 'tamam'>, ek: Partial<AdimliEmirAyrintisi> = {}): AdimliEmirAyrintisi => ({
    ...ayrinti(emir(1)), isEmirleri: durumlar.map((d, i) => isEmri(i + 1, d)), ...ek,
  });
  const oku = (emirler: AdimliEmirAyrintisi[]) => {
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const e = emirler.find((x) => adres.endsWith(`/adimli-emirler/${String(x.id)}`));
      return e ? json(200, { emir: e }) : json(404, { kod: 'BULUNAMADI', mesaj: 'Emir bulunamadı.' });
    }));
  };
  const hazirla = (ad: string, girdi: Record<string, unknown>) => EMIR_KOMUTLARI[ad]!.hazirla(girdi);

  it('kolsuz parti bitmemiş ilk adımdan ayrılır; sonraki adım başlamış olsa da istek gider, karar sahibinindir', async () => {
    oku([kur(['tamam', 'calisiyor', 'calisiyor'])]);
    expect((await hazirla('emir-bol', { id: 1, adet: 2, surum: 3 })).govde).toEqual({ adimSira: 2, adet: 2, surum: 3, birlesmeOpNo: null });
    oku([kur(['tamam', 'tamam'])]);
    expect((await hazirla('emir-bol', { id: 1, adet: 2, surum: 3 })).govde).toMatchObject({ adimSira: 2 });
    oku([kur([])]);
    await expect(hazirla('emir-bol', { id: 1, adet: 2, surum: 3 })).rejects.toThrow('Emrin adımı yok');
  });

  it('kol ayrılma adımından sonraki adımdan bölünür, katılma op numarası emrin adımındandır; çalışan adım ekranda engellenmez', async () => {
    oku([kur(['bekliyor', 'calisiyor', 'calisiyor'])]);
    expect((await hazirla('emir-bol', { id: 1, adet: 2, surum: 3, kolN: 1, kolM: 3 })).govde).toMatchObject({ adimSira: 2, birlesmeOpNo: 30 });
    await expect(hazirla('emir-bol', { id: 1, adet: 2, surum: 3, kolN: 1, kolM: 9 })).rejects.toThrow('Kolun katılma adımı bu emirde yok.');
  });

  it('katılma adımı ana emrin adımıdır; başlamış adım ekranda engellenmez', async () => {
    const parti = { ustEmirId: 1, bolunmeSira: 2, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: 30 };
    oku([kur(['tamam', 'calisiyor', 'bekliyor']), kur(['bekliyor'], { id: 9, parti })]);
    expect(await hazirla('emir-katilma', { id: 9, m: 2, surum: 4 })).toMatchObject({ yol: '/adimli-emirler/9/birlesme-plani', govde: { birlesmeOpNo: 20, surum: 4 } });
    await expect(hazirla('emir-katilma', { id: 9, m: 7, surum: 4 })).rejects.toThrow('Katılma adımı ana emirde yok.');
  });

  it('geri katmanın hedefi üst emirdir ve sürümü yazmadan önce okunur; ana emir ilerlemiş olsa da istek gider', async () => {
    const parti = { ustEmirId: 1, bolunmeSira: 1, altEmirIdleri: [], birlestigiEmirId: null, birlesmeOpNo: null };
    oku([kur(['tamam', 'calisiyor', 'bekliyor'], { surum: 7 }), kur(['bekliyor', 'bekliyor', 'bekliyor'], { id: 9, parti })]);
    expect(await hazirla('emir-birlestir', { id: 9, surum: 2 })).toMatchObject({ yol: '/adimli-emirler/1/birlestir', govde: { kaynakEmirId: 9, surum: 7, kaynakSurum: 2 } });
    await expect(hazirla('emir-birlestir', { id: 1, surum: 7 })).rejects.toThrow('Bu emir bir alt emir değil.');
  });
});
