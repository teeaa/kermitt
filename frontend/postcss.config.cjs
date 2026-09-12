const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const { compile } = require('tailwindcss');

// Tailwind CSS v4 PostCSS compilation bridge
const tailwindV4Plugin = () => {
  return {
    postcssPlugin: 'tailwindcss-v4-bridge',
    async Once(root) {
      const css = root.toString();
      if (!css.includes('tailwindcss')) return;

      const srcDir = path.resolve(__dirname, 'src');
      const candidates = new Set();

      function scan(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (/\.(tsx|ts|jsx|js|html)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const matches = content.match(/[a-zA-Z0-9_:\-\/\[\]\.]+/g);
            if (matches) {
              for (const m of matches) {
                candidates.add(m);
              }
            }
          }
        }
      }

      scan(srcDir);
      const indexHtml = path.resolve(__dirname, 'index.html');
      if (fs.existsSync(indexHtml)) {
        const content = fs.readFileSync(indexHtml, 'utf8');
        const matches = content.match(/[a-zA-Z0-9_:\-\/\[\]\.]+/g);
        if (matches) {
          for (const m of matches) {
            candidates.add(m);
          }
        }
      }

      const compiler = await compile(css, {
        base: __dirname,
        async loadStylesheet(id, base) {
          if (id === 'tailwindcss') {
            return {
              content: fs.readFileSync(
                path.resolve(__dirname, 'node_modules/tailwindcss/index.css'),
                'utf8'
              ),
              base: path.resolve(__dirname, 'node_modules/tailwindcss'),
            };
          }
          const p = path.resolve(base, id);
          return { content: fs.readFileSync(p, 'utf8'), base: path.dirname(p) };
        },
      });

      const compiledCss = compiler.build(Array.from(candidates));
      const newRoot = postcss.parse(compiledCss, {
        from: root.source?.input?.file || 'style.css',
      });
      root.removeAll();
      root.append(newRoot);
    },
  };
};
tailwindV4Plugin.postcss = true;

module.exports = {
  plugins: [tailwindV4Plugin(), require('autoprefixer')()],
};
