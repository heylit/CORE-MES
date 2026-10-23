import { spawn } from 'node:child_process';
import type { RobotAyari } from './ayar.ts';

// Dil modeli köprüsü (ADR 0019). Depoda dış çağrı yapan tek yer burasıdır ve yalnız robot klasöründedir.
// Modele yalnız robotun ürettiği sentetik koşu verisi gider; gerçek veri bu veritabanında yoktur (boş + örnek veri).
export type ModelCevabi = { metin: string } | { hata: string };

export interface ModelKoprusu {
  readonly kip: RobotAyari['model']['kip'];
  sor(istem: string): Promise<ModelCevabi>;
}

const API_ADRESI = 'https://api.anthropic.com/v1/messages';
const ZAMAN_ASIMI_MS = 10 * 60_000;

export interface KopruBagimliliklari {
  cagriSayildi: () => void;
  fetch?: typeof fetch;
  calistir?: (komut: string, istem: string) => Promise<ModelCevabi>;
}

// Abonelikle oturum açmış yerel Claude Code: istem stdin'den gider, argümanlar sabittir.
// Windows'ta komut .cmd sarmalayıcısıdır ve yalnız kabukla açılır; argümanlarda kullanıcı metni yoktur.
export function claudeKodCalistir(komut: string, istem: string): Promise<ModelCevabi> {
  return new Promise((coz) => {
    const cocuk = spawn(komut, ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && !komut.toLowerCase().endsWith('.exe'),
      timeout: ZAMAN_ASIMI_MS,
    });
    let cikti = '';
    let hata = '';
    cocuk.stdout.on('data', (p: Buffer) => { cikti += p.toString('utf8'); });
    cocuk.stderr.on('data', (p: Buffer) => { hata += p.toString('utf8'); });
    cocuk.on('error', (h) => { coz({ hata: `${komut} açılamadı: ${h.message}` }); });
    cocuk.on('close', (kod) => {
      coz(kod === 0 ? { metin: cikti.trim() } : { hata: `${komut} ${String(kod)} ile bitti: ${hata.trim().slice(0, 400)}` });
    });
    cocuk.stdin.end(istem);
  });
}

interface MesajCevabi {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  error?: { message?: string };
}

async function apiSor(ayar: RobotAyari['model'], istem: string, f: typeof fetch): Promise<ModelCevabi> {
  if (ayar.anahtar === null) return { hata: 'anahtar yok' };
  // Yeni paket alınmadığı için (onay 174 c) SDK yerine düz HTTP. Reddedilen istek sunucu tarafında varsayılan yedek modele döner.
  const cevap = await f(API_ADRESI, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ayar.anahtar,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: ayar.ad,
      max_tokens: 16000,
      output_config: { effort: 'high' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: istem }],
    }),
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
  const govde = (await cevap.json().catch(() => ({}))) as MesajCevabi;
  if (!cevap.ok) return { hata: `API ${String(cevap.status)}: ${govde.error?.message ?? 'ayrıntı yok'}` };
  if (govde.stop_reason === 'refusal') return { hata: 'model isteği reddetti' };
  const metin = (govde.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
  return metin === '' ? { hata: 'boş cevap' } : { metin };
}

export function modelKoprusuKur(ayar: RobotAyari['model'], b: KopruBagimliliklari): ModelKoprusu {
  let cagri = 0;
  return {
    kip: ayar.kip,
    async sor(istem) {
      if (ayar.kip === 'kapali') return { hata: 'model kapalı (TMIV2_ROBOT_MODEL)' };
      if (cagri >= ayar.ustSinir) return { hata: `çağrı üst sınırı doldu (${String(ayar.ustSinir)})` };
      cagri += 1;
      b.cagriSayildi();
      try {
        return ayar.kip === 'api'
          ? await apiSor(ayar, istem, b.fetch ?? fetch)
          : await (b.calistir ?? claudeKodCalistir)(ayar.claudeKomutu, istem);
      } catch (hata) {
        return { hata: hata instanceof Error ? hata.message : String(hata) };
      }
    },
  };
}
