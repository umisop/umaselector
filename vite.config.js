import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import skillReferenceHandler from './api/skill-reference.js';

/**
 * Vercel serves files in /api as serverless functions, but plain `vite`
 * does not execute those functions. This lightweight dev-only adapter routes
 * the same handler locally so `npm run dev` can load skill reference data.
 * Production continues to use Vercel's native /api/skill-reference function.
 */
function localSkillReferenceApi() {
  return {
    name: 'local-skill-reference-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let requestUrl;
        try {
          requestUrl = new URL(req.url || '/', 'http://localhost');
        } catch {
          return next();
        }

        if (requestUrl.pathname !== '/api/skill-reference') return next();

        req.query = Object.fromEntries(requestUrl.searchParams.entries());
        const response = {
          setHeader(name, value) {
            res.setHeader(name, value);
            return this;
          },
          status(code) {
            res.statusCode = code;
            return this;
          },
          json(payload) {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(payload));
            return this;
          },
        };

        try {
          await skillReferenceHandler(req, response);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localSkillReferenceApi()],
});
