import type { AstroIntegration } from 'astro';
import { ExportSpecifier, parse as parseESM } from 'es-module-lexer';
import { parse, init } from '@astrojs/compiler';
import { is, walk } from '@astrojs/compiler/utils';
import { globbySync } from 'globby';
import path from 'path';
import fs from 'fs/promises';
import * as esbuild from 'esbuild';

type Options = { exportNames: string[] };
export default function integration({
  exportNames,
}: Options): AstroIntegration {
  const pages = globbySync('./src/pages/**/*.{astro,js,ts}');
  console.log(pages);
  const allMetadata = new Map();
  return {
    name: 'integration',
    hooks: {
      'astro:config:setup': async () => {
        // init es-module-lexer
        await init;
        for (const exportName of exportNames) {
          const metadata = new Map();
          for (let page of pages) {
            const pageContent = await fs.readFile(page, {
              encoding: 'utf-8',
            });
            switch (getExt(page)) {
              case 'astro': {
                // If it's an astro page we can parse the file,
                // visit the ast and then extract the export
                const { ast } = await parse(pageContent);
                walk(ast, async (node) => {
                  if (is.frontmatter(node)) {
                    // here is the frontmatter, we can look for the export
                    const exportValue = extractExportedMetadata(
                      node.value,
                      page,
                      exportName
                    );

                    if (typeof exportValue === 'undefined') {
                      return;
                    }
                    metadata.set(page, exportValue);
                  }
                });
                break;
              }
              case 'js': {
                const exportValue = extractExportedMetadata(
                  pageContent,
                  page,
                  exportName
                );
                if (typeof exportValue === 'undefined') {
                  break;
                }

                metadata.set(page, exportValue);
                break;
              }
              case 'ts': {
                // the parser only supports js syntax so we need to
                // compile the ts down to js
                // using esbuild because it's fast ⚡️
                const { code: js } = await esbuild.transform(pageContent, {
                  loader: 'ts',
                });
                const exportValue = extractExportedMetadata(
                  js,
                  page,
                  exportName
                );
                if (typeof exportValue === 'undefined') {
                  break;
                }
                metadata.set(page, exportValue);
                break;
              }
            }
          }
          allMetadata.set(exportName, metadata);
        }
      },
      'astro:build:done': () => {
        for (let [exportName, metadata] of allMetadata.entries()) {
          console.log('\n\n')
          console.log(exportName)
          console.table(Object.fromEntries(metadata));
        }
      },
    },
  };
}

function getExt(file: string) {
  return path.extname(file).slice(1);
}

function evalValue<T = any>(rawValue: string): T {
  const fn = new Function(`
    var console, exports, global, module, process, require
    return (\n${rawValue}\n)
  `);
  return fn();
}

function extractExportedMetadata(js, page, exportName) {
  let exports: readonly ExportSpecifier[] | undefined;
  try {
    [, exports] = parseESM(js);
  } catch (e) {
    console.error(`Error parsing filem (${page}), skipping`);
    return;
  }
  // if we don't find the variable, return
  for (let _export of exports) {
    if (_export.n !== exportName) continue;
    const exportedValueString = js
      .slice(_export.le)
      .trim()
      .replace(/\=/, '')
      .trim()
      .split(/[;]/)[0];

    const exportValue = evalValue(exportedValueString);
    return exportValue;
  }
}
