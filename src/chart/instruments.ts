import type { Zone } from './types';

/** GM 프로그램 번호 순서의 사운드폰트 이름 (gleitz/midi-js-soundfonts 규칙) */
export const GM_SOUNDFONT_NAMES = [
  'acoustic_grand_piano', 'bright_acoustic_piano', 'electric_grand_piano', 'honkytonk_piano',
  'electric_piano_1', 'electric_piano_2', 'harpsichord', 'clavinet',
  'celesta', 'glockenspiel', 'music_box', 'vibraphone',
  'marimba', 'xylophone', 'tubular_bells', 'dulcimer',
  'drawbar_organ', 'percussive_organ', 'rock_organ', 'church_organ',
  'reed_organ', 'accordion', 'harmonica', 'tango_accordion',
  'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'electric_guitar_jazz', 'electric_guitar_clean',
  'electric_guitar_muted', 'overdriven_guitar', 'distortion_guitar', 'guitar_harmonics',
  'acoustic_bass', 'electric_bass_finger', 'electric_bass_pick', 'fretless_bass',
  'slap_bass_1', 'slap_bass_2', 'synth_bass_1', 'synth_bass_2',
  'violin', 'viola', 'cello', 'contrabass',
  'tremolo_strings', 'pizzicato_strings', 'orchestral_harp', 'timpani',
  'string_ensemble_1', 'string_ensemble_2', 'synth_strings_1', 'synth_strings_2',
  'choir_aahs', 'voice_oohs', 'synth_choir', 'orchestra_hit',
  'trumpet', 'trombone', 'tuba', 'muted_trumpet',
  'french_horn', 'brass_section', 'synth_brass_1', 'synth_brass_2',
  'soprano_sax', 'alto_sax', 'tenor_sax', 'baritone_sax',
  'oboe', 'english_horn', 'bassoon', 'clarinet',
  'piccolo', 'flute', 'recorder', 'pan_flute',
  'blown_bottle', 'shakuhachi', 'whistle', 'ocarina',
  'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope', 'lead_4_chiff',
  'lead_5_charang', 'lead_6_voice', 'lead_7_fifths', 'lead_8_bass__lead',
  'pad_1_new_age', 'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir',
  'pad_5_bowed', 'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep',
  'fx_1_rain', 'fx_2_soundtrack', 'fx_3_crystal', 'fx_4_atmosphere',
  'fx_5_brightness', 'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi',
  'sitar', 'banjo', 'shamisen', 'koto',
  'kalimba', 'bagpipe', 'fiddle', 'shanai',
  'tinkle_bell', 'agogo', 'steel_drums', 'woodblock',
  'taiko_drum', 'melodic_tom', 'synth_drum', 'reverse_cymbal',
  'guitar_fret_noise', 'breath_noise', 'seashore', 'bird_tweet',
  'telephone_ring', 'helicopter', 'applause', 'gunshot',
] as const;

export const soundfontNameForProgram = ({ program }: { program: number }) =>
  GM_SOUNDFONT_NAMES[Math.min(Math.max(Math.round(program), 0), 127)];

type Family = 'strings' | 'woodwinds' | 'brass' | 'percussion' | 'other';

const familyForProgram = ({ program }: { program: number }): Family => {
  if (program >= 40 && program <= 46) return 'strings';
  if (program >= 48 && program <= 51) return 'strings';
  if (program === 47) return 'percussion';
  if (program >= 56 && program <= 63) return 'brass';
  if (program >= 64 && program <= 79) return 'woodwinds';
  if (program >= 112 && program <= 119) return 'percussion';
  if (program >= 8 && program <= 15) return 'percussion';
  return 'other';
};

/** 실제 오케스트라 배치를 단순화: 현악은 왼쪽, 목관·타악은 가운데, 금관은 오른쪽 */
const ZONE_BY_FAMILY: Record<Family, Zone> = {
  strings: 'left',
  woodwinds: 'center',
  percussion: 'center',
  brass: 'right',
  other: 'center',
};

export const zoneForProgram = ({ program, isDrum = false }: { program: number; isDrum?: boolean }): Zone =>
  isDrum ? 'center' : ZONE_BY_FAMILY[familyForProgram({ program })];
