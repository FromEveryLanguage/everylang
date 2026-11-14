import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { declarationNames, ENV_DECLARATIONS, readServerEnv } from './envConfig.ts';

describe('environment configuration', () => {
  it('reports every missing required variable at startup validation', () => {
    expect(() => readServerEnv({})).toThrow(/YSWEET_CONNECTION_STRING[\s\S]*GEMINI_API_KEY[\s\S]*ELEVENLABS_API_KEY/);
  });

  it('applies declaration defaults', () => {
    const env = readServerEnv({
      YSWEET_CONNECTION_STRING: 'ys://test',
      GEMINI_API_KEY: 'gemini',
      ELEVENLABS_API_KEY: 'eleven',
    });
    expect(env.PORT).toBe('8000');
    expect(env.WRITE_AUTH_MODE).toBe('observe');
    expect(env.LIVE_AUDIO_SOURCE_LANGUAGE).toBe('en');
  });

  it('every process.env read in application TypeScript has a declaration', () => {
    const repoRoot = process.cwd();
    const excludedDirs = new Set(['node_modules', '.git', '.claude', 'dist']);
    const roots = [repoRoot];

    const visit = (dir: string, files: string[]) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (excludedDirs.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full, files);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };

    const files: string[] = [];
    for (const root of roots) visit(root, files);
    const undeclared = new Set<string>();
    const pattern = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;

    for (const file of files) {
      if (file.endsWith(`${path.sep}envConfig.ts`) || file.includes(`${path.sep}scripts${path.sep}`)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(pattern)) {
        const name = match[1] ?? match[2];
        if (!declarationNames().has(name)) undeclared.add(`${path.relative(repoRoot, file)}:${name}`);
      }
    }

    expect([...undeclared].sort()).toEqual([]);
  });

  it('every import.meta.env read in application TypeScript has a declaration', () => {
    const repoRoot = process.cwd();
    const excludedDirs = new Set(['node_modules', '.git', '.claude', 'dist']);
    const files: string[] = [];
    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (excludedDirs.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };
    visit(repoRoot);

    const undeclared = new Set<string>();
    const pattern = /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g;
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(pattern)) {
        const name = match[1];
        if (name === 'MODE') continue;
        if (!declarationNames().has(name)) undeclared.add(`${path.relative(repoRoot, file)}:${name}`);
      }
    }
    expect([...undeclared].sort()).toEqual([]);
  });

  it('declared names are unique', () => {
    const names = ENV_DECLARATIONS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
