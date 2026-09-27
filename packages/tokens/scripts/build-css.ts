import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCss } from '../src/css';

writeFileSync(resolve(import.meta.dirname, '../tokens.css'), buildCss());
