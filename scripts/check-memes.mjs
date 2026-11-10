import { readFile } from 'node:fs/promises';
import { validateLibrary } from '../functions/memes.ts';
const path=process.argv[2] || 'functions/data/memes.json';
validateLibrary(JSON.parse(await readFile(path,'utf8')));
console.log('Approved meme library valid');
