// @tonejs/midi는 CommonJS라서 Node ESM에서 named import가 안 됨. Vite와 Node 양쪽에서 동작하도록 default로 받음
import tonejsMidi from '@tonejs/midi';

export const { Midi } = tonejsMidi;
