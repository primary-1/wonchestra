/**
 * MIDI → chart.json 자동 생성. 만들어진 chart.json은 손으로 고쳐도 됨.
 * 이미 chart.json이 있으면 덮어쓰지 않음 (--force로 덮어쓰기).
 *
 * 실행: pnpm chart public/songs/<id>/song.mid [--title "제목"] [--force]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateChart } from '../src/chart/generateChart';
import { songFromMidi } from '../src/chart/midiSong';

const SONGS_DIR = 'public/songs';

const args = process.argv.slice(2);
const midiPath = args.find((a) => !a.startsWith('--') && a.endsWith('.mid'));
const titleIdx = args.indexOf('--title');
const title = titleIdx >= 0 ? args[titleIdx + 1] : undefined;
const force = args.includes('--force');

if (!midiPath) {
  console.error('usage: pnpm chart public/songs/<id>/song.mid [--title "제목"] [--force]');
  process.exit(1);
}

const songDir = dirname(midiPath);
const chartPath = join(songDir, 'chart.json');

if (existsSync(chartPath) && !force) {
  console.error(`${chartPath} 이 이미 있어. 덮어쓰려면 --force`);
  process.exit(1);
}

const song = songFromMidi({ data: readFileSync(midiPath), title });
const chart = generateChart({ song });
writeFileSync(chartPath, `${JSON.stringify(chart, null, 2)}\n`);

const counts = chart.notes.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n.type]: (acc[n.type] ?? 0) + 1 }), {});
console.log(`wrote ${chartPath}`, { title: chart.title, bpm: chart.bpm, duration: chart.duration.toFixed(1), counts });

// 곡 목록 갱신
const songs = readdirSync(SONGS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(SONGS_DIR, entry.name, 'chart.json')))
  .map((entry) => {
    const dir = join(SONGS_DIR, entry.name);
    const saved = JSON.parse(readFileSync(join(dir, 'chart.json'), 'utf8'));
    const midi = readdirSync(dir).find((file) => file.endsWith('.mid'));
    return { id: entry.name, title: saved.title as string, midi };
  })
  .filter((entry) => entry.midi);
writeFileSync(join(SONGS_DIR, 'index.json'), `${JSON.stringify(songs, null, 2)}\n`);
console.log(`updated ${SONGS_DIR}/index.json (${songs.length} songs)`);
