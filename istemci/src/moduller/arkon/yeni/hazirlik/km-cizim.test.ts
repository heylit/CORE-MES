import { describe, expect, it } from 'vitest';
import { etkinResimler, kmBagi, kmIlkParcaAcik, kmNumuneDurumu, kmNumuneKurallari, kmNumunePlani, kmPlani, kmResimDurumu, kmSahibi, kmAlimEtiketi, kmOtomatikKarari, kmTopluPlani, otoKaynakOku, otoKaynakYaz, otomatikKmNumunesi, type KmParcaVerisi } from './km-cizim.ts';

// Kalite Merkezi resmi ve balonları (789, 795 a); değerler uydurmadır.
const BALON = {
  id: 7, no: 3, nominal: 'Ø12', tolerans: null, alt: null, ust: null, alet: null, siklik: 'Her 10 parça', kritik: false, yontem: 'cmm' as const,
  olcuAletiGerekir: false, tur: null, sayfa: null, x: null, y: null, yaziKutusu: null, surum: 1,
};

describe('Kalite Merkezi çizimi', () => {
  it('plan maddesi balon numarasını ve Kalite Merkezi kimliğini taşır; sınırsız balon mastar olur', () => {
    expect(kmPlani({ balonlar: [BALON] })).toEqual([{ id: 3, x: 0, y: 0, nom: 'Ø12', min: 0, max: 0, gauge: true, crit: false, m: 'cmm', freq: 'Her 10 parça', kmBalon: 7 }]);
  });
  it('sıklığı olmayan balon ilk parçada ölçülür', () => {
    expect(kmPlani({ balonlar: [{ ...BALON, siklik: null }] })[0]?.freq).toBe('İlk parça');
  });
  it('bağ yalnız kimlik ve sürümle okunur; bozuk kayıt bağ sayılmaz', () => {
    expect(kmBagi({ kmResim: { id: 1, surum: 2 } })).toEqual({ id: 1, surum: 2 });
    expect(kmBagi({ kmResim: { id: '1', surum: 2 } })).toBeNull();
    expect(kmBagi({ kmResim: null })).toBeNull();
    expect(kmBagi({})).toBeNull();
  });
  it('resim durumu: aynı sürüm pakette, yeni sürüm değişti, başka resim yok', () => {
    const p = { kmResim: { id: 1, surum: 2 } };
    expect(kmResimDurumu(p, { id: 1, surum: 2 })).toBe('pakette');
    expect(kmResimDurumu(p, { id: 1, surum: 3 })).toBe('degisti');
    expect(kmResimDurumu(p, { id: 2, surum: 2 })).toBe('yok');
  });
  it('yalnız malzemesi olan paket Kalite Merkezi\'ne bağlıdır; kaldırılmış resim listelenmez', () => {
    expect(kmSahibi({ malzemeNo: 5 })).toBe(true);
    expect(kmSahibi({ malzemeNo: null })).toBe(false);
    expect(kmSahibi({})).toBe(false);
    const r = { id: 1, malzemeNo: 5, tur: 'resim' as const, merkezBelgeId: 2, ozet: 'a', ad: 'A', revizyon: null, surum: 1, eklendi: '2026-01-01T00:00:00Z', balonlar: [] };
    expect(etkinResimler([{ ...r, aktif: true }, { ...r, id: 2, aktif: false }]).map((x) => x.id)).toEqual([1]);
  });

  // 3687, 3701: boş ve bağsız paket Kalite Merkezi'nin balonlu resmiyle kurulur; tek aday alınır, birden çoksa seçtirilir, yoksa neden söylenir.
  const resim = { id: 1, malzemeNo: 5, tur: 'resim' as const, merkezBelgeId: 2, ozet: 'a', ad: 'A', revizyon: null, aktif: true, surum: 1, eklendi: '2026-01-01T00:00:00Z', balonlar: [BALON] };
  const bos = { malzemeNo: 5, status: 'draft' as const, plan: [], files: [] as never[] };
  it('otomatik karar: tek balonlu etkin resim alınır; kaldırılmış, eski, balonsuz ve model sayılmaz', () => {
    const adaylar = [{ ...resim, id: 9, balonlar: [] }, { ...resim, id: 8, aktif: false }, { ...resim, id: 7, eski: true }, { ...resim, id: 6, tur: 'model' as const }, resim];
    expect(kmOtomatikKarari(bos, adaylar)).toMatchObject({ tur: 'al', resim: { id: 1 } });
    // Yayındaki paket terminale doğrudan okunur; kendiliğinden yazılmaz, yalnız öneri. Elle eklenmiş dosyası olan paket de öyle.
    expect(kmOtomatikKarari({ ...bos, status: 'published' as const }, [resim])).toMatchObject({ tur: 'oner' });
    expect(kmOtomatikKarari({ ...bos, files: [{ kind: 'pdf', name: 'elle.pdf' }] as never }, [resim])).toMatchObject({ tur: 'oner' });
    expect(kmOtomatikKarari({ ...bos, files: [{ kind: 'pdf', name: 'm.pdf', merkez: 3 }] as never }, [resim])).toMatchObject({ tur: 'al' });
  });
  it('otomatik karar: balonlu birden çok resim varsa seçtirilir, ilki alınmaz', () => {
    expect(kmOtomatikKarari(bos, [resim, { ...resim, id: 2 }])).toMatchObject({ tur: 'sec', adaylar: [{ id: 1 }, { id: 2 }] });
  });
  it('otomatik karar: resim ya da balon yoksa neden söylenir', () => {
    expect(kmOtomatikKarari(bos, [])).toEqual({ tur: 'bos', neden: 'resimsiz' });
    expect(kmOtomatikKarari(bos, [{ ...resim, aktif: false }])).toEqual({ tur: 'bos', neden: 'resimsiz' });
    expect(kmOtomatikKarari(bos, [{ ...resim, balonlar: [] }])).toEqual({ tur: 'bos', neden: 'balonsuz' });
  });
  it('otomatik karar: bağı, planı ya da bilerek boşaltılmış planı olan paket ve malzemesiz paket değişmez', () => {
    expect(kmOtomatikKarari({ ...bos, kmResim: { id: 1, surum: 1 } }, [resim])).toBeNull();
    expect(kmOtomatikKarari({ ...bos, plan: [{ id: 1 }] }, [resim])).toBeNull();
    expect(kmOtomatikKarari({ ...bos, otoKaynak: { plan: { kaynak: 'el' } } }, [resim])).toBeNull();
    expect(kmOtomatikKarari({ malzemeNo: null, status: 'draft' as const, files: [] }, [resim])).toBeNull();
  });
  it('adıma bağlı grup varsa yalnız o grubun balonları gelir; yoksa resmin hepsi', () => {
    const b2 = { ...BALON, id: 8, no: 4 };
    const r = { balonlar: [BALON, b2], gruplar: [{ id: 1, ad: 'Ön yüz', balonlar: [4], operasyonlar: [{ operasyonId: 90, opNo: 20 }] }] };
    expect(kmPlani(r, 20).map((m) => m.id)).toEqual([4]);
    expect(kmPlani(r, 30).map((m) => m.id)).toEqual([3, 4]);
    expect(kmPlani(r).map((m) => m.id)).toEqual([3, 4]);
    expect(kmAlimEtiketi({ ...resim, ...r }, 20)).toBe('A · 1 balon · "Ön yüz" grubu');
    expect(kmAlimEtiketi({ ...resim, ...r }, 30)).toBe('A · 2 balon · adıma göre ayırma yok');
  });
  it('kaynak satırı okunur ve yazılır; bozuk kayıt kaynak sayılmaz', () => {
    const y = otoKaynakYaz({ otoKaynak: { depo: { kaynak: 'rota' } } }, 'plan', { kaynak: 'km', etiket: 'x' });
    expect(otoKaynakOku(y, 'plan')).toEqual({ kaynak: 'km', etiket: 'x' });
    expect(otoKaynakOku(y, 'depo')).toEqual({ kaynak: 'rota' });
    expect(otoKaynakOku({ otoKaynak: { plan: { kaynak: 'baska' } } }, 'plan')).toBeNull();
    expect(otoKaynakOku({}, 'plan')).toBeNull();
  });
  it('toplu doldurma yalnız boş ve bağsız paketleri alır; atlananın nedeni yazılır', () => {
    const p = (ek: object) => ({ id: 'x', no: 'N', op: 'Op 10', malzemeNo: 5, plan: [], files: [], status: 'draft', ...ek }) as never;
    const veri = new Map<number, KmParcaVerisi>([[5, { resimler: [resim] }], [6, { resimler: [resim, { ...resim, id: 2 }] }], [7, 'yetkisiz'], [8, 'hata']]);
    const l = kmTopluPlani([p({}), p({ plan: [{ id: 1 }] }), p({ kmResim: { id: 1, surum: 1 } }), p({ malzemeNo: 6 }), p({ malzemeNo: 7 }), p({ malzemeNo: 8 }), p({ malzemeNo: null }), p({ status: 'published' }), p({ files: [{ kind: 'pdf', name: 'e.pdf' }] })], veri);
    expect(l.map((x) => x.resim?.id ?? null)).toEqual([1, null, null, null, null, null, null, null, null]);
    expect(l.map((x) => x.neden)).toEqual([null, 'kontrol planı dolu', 'zaten Kalite Merkezi’ne bağlı', 'balonlu 2 resim var, önce resmi seçin', 'Kalite Merkezi’ni okuma yetkisi yok', 'Kalite Merkezi okunamadı', 'paket malzeme kartına bağlı değil', 'yayında; önce geri çekin ya da paketi açıp tek tek alın', 'elle eklenmiş resim dosyası var; paketi açıp tek tek alın']);
  });

  // 3689: numune planının sahibi Kalite Merkezi; paket `samp`'ına çevrilir, sürüm pakette tutulur.
  const PLAN = { opNo: 20, surum: 3, kurallar: [
    { kimlik: 'a', ne: 'ilk' as const, kim: ['kalite' as const], balonlar: 'hepsi' as const, kapi: true },
    { kimlik: 'b', ne: 'her' as const, n: 25, kim: ['operator' as const, 'kalite' as const], balonlar: 'kritik' as const },
    { kimlik: 'c', ne: 'vardiya' as const, kim: ['operator' as const], balonlar: [3, 5] },
  ] };
  it('Kalite Merkezi kuralı paket numune kuralına çevrilir', () => {
    expect(kmNumuneKurallari(PLAN)).toEqual([
      { id: 'a', when: 'first', who: ['q'], items: 'all', gate: true },
      { id: 'b', when: 'every', n: 25, who: ['op', 'q'], items: 'crit' },
      { id: 'c', when: 'shift', who: ['op'], items: [3, 5] },
    ]);
  });
  it('plan paketin operasyon numarasıyla bulunur; sürüm farkı "değişti" der', () => {
    const p = { malzemeNo: 5, tmi: { opNo: 20 }, kmNumune: { surum: 3 } };
    expect(kmNumunePlani(p, [PLAN, { ...PLAN, opNo: 30 }])?.opNo).toBe(20);
    expect(kmNumunePlani({ malzemeNo: 5, tmi: { opNo: 99 } }, [PLAN])).toBeNull();
    expect(kmNumuneDurumu(p, PLAN)).toBe('pakette');
    expect(kmNumuneDurumu(p, { ...PLAN, surum: 4 })).toBe('degisti');
    expect(kmNumuneDurumu({ malzemeNo: 5 }, PLAN)).toBe('bagsiz');
    expect(kmNumuneDurumu(p, null)).toBe('yok');
  });
  it('otomatik numune planı: yalnız taslakta, bağsız ve kuralsız pakette, kuralı olan planla', () => {
    const t = { malzemeNo: 5, status: 'draft' as const, tmi: { opNo: 20 }, samp: [] };
    expect(otomatikKmNumunesi(t, [PLAN])?.surum).toBe(3);
    expect(otomatikKmNumunesi({ ...t, status: 'published' as const }, [PLAN])).toBeNull();
    // 3689-2: plan değişince bağlı taslak kendiliğinden güncellenir; aynı sürümde dokunulmaz.
    expect(otomatikKmNumunesi({ ...t, kmNumune: { surum: 1 } }, [PLAN])?.surum).toBe(3);
    expect(otomatikKmNumunesi({ ...t, kmNumune: { surum: 3 } }, [PLAN])).toBeNull();
    expect(otomatikKmNumunesi({ ...t, samp: [{ id: 'x', when: 'first', who: ['q'], items: 'all' }] as unknown as never[] }, [PLAN])).toBeNull();
    expect(otomatikKmNumunesi({ ...t, malzemeNo: null }, [PLAN])).toBeNull();
    expect(otomatikKmNumunesi(t, [{ ...PLAN, kurallar: [] }])).toBeNull();
  });
  it('R1 geçiş: kapılı ilk parça açık, kuralsız plan kapalı, kapısız planda karar rotada (null)', () => {
    const ilk = { kimlik: 'a', ne: 'ilk' as const, kim: ['kalite' as const], balonlar: 'hepsi' as const };
    expect(kmIlkParcaAcik({ kurallar: [{ ...ilk, kapi: true }] })).toBe(true);
    expect(kmIlkParcaAcik({ kurallar: [] })).toBe(false);
    expect(kmIlkParcaAcik({ kurallar: [ilk] })).toBeNull();
  });
});
