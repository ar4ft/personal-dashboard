import { defineConfig } from 'astro/config';
const repository = process.env.GITHUB_REPOSITORY || 'ar4ft/personal-dashboard';
const [owner, name] = repository.split('/');
export default defineConfig({
  site: `https://${owner}.github.io`,
  base: name === `${owner}.github.io` ? '/' : `/${name}`,
  output: 'static',
  trailingSlash: 'always',
});
