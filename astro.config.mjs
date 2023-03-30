import { defineConfig } from 'astro/config';
import metadataCollector from "./integration"

// https://astro.build/config
export default defineConfig({
  integrations: [metadataCollector({
    exportNames: ['myPageMetadata', 'cats']
  })],
});
