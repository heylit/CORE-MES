import { derlemeBilgisi, type DerlemeKaynaklari } from './derleme-bilgisi.ts';

const COMMIT = 'a'.repeat(40);

function kaynak(ayar: { env?: Record<string, string>; git?: Record<string, string | null>; simdi?: string } = {}): DerlemeKaynaklari {
  const git = { 'rev-parse HEAD': `${COMMIT}\n`, [`show -s --format=%cI ${COMMIT}`]: '2026-11-11T08:00:00+03:00\n', ...ayar.git };
  return {
    env: ayar.env ?? {},
    paketSurumu: '0.0.0-gelistirme',
    git: (argumanlar) => git[argumanlar.join(' ')] ?? null,
    simdi: () => new Date(ayar.simdi ?? '2026-11-11T06:23:34.950Z'),
  };
}

describe('derlemeBilgisi', () => {
  it('aynı kaynaktan farklı anlarda yapılan iki derleme aynı bilgiyi verir (parça adları değişmez)', () => {
    const ilk = derlemeBilgisi(kaynak({ simdi: '2026-11-11T06:23:34.950Z' }));
    const ikinci = derlemeBilgisi(kaynak({ simdi: '2026-11-11T06:27:35.407Z' }));
    expect(JSON.stringify(ikinci)).toBe(JSON.stringify(ilk));
  });

  it('tarih commit zamanıdır, UTC ISO biçiminde', () => {
    expect(derlemeBilgisi(kaynak())).toEqual({ surum: '0.0.0-gelistirme', tarih: '2026-11-11T05:00:00.000Z', commit: COMMIT });
  });

  it('ortamdaki commit ve sürüm önce gelir; tarih o commit\'in zamanıdır', () => {
    const baska = 'b'.repeat(40);
    const b = derlemeBilgisi(kaynak({ env: { TMIV2_COMMIT: baska, TMIV2_SURUM: '2026.11.11' }, git: { [`show -s --format=%cI ${baska}`]: '2026-11-10T12:00:00Z' } }));
    expect(b).toEqual({ surum: '2026.11.11', tarih: '2026-11-10T12:00:00.000Z', commit: baska });
  });

  it('git yoksa commit bilinmez, tarih derleme anıdır', () => {
    const b = derlemeBilgisi({ ...kaynak(), git: () => null });
    expect(b).toEqual({ surum: '0.0.0-gelistirme', tarih: '2026-11-11T06:23:34.950Z', commit: null });
  });

  it('commit ortamdan gelip git o commit\'i bilmiyorsa tarih derleme anıdır', () => {
    const b = derlemeBilgisi(kaynak({ env: { TMIV2_COMMIT: 'c'.repeat(40) } }));
    expect(b.tarih).toBe('2026-11-11T06:23:34.950Z');
    expect(b.commit).toBe('c'.repeat(40));
  });
});
