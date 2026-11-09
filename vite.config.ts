import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function patchFetchPlugin(): Plugin {
  return {
    name: 'patch-fetch-plugin',
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [
          {
            tag: 'script',
            children: `(function(){try{var o=window.fetch;var s=function(){var c=(this===window||this===globalThis||!this)?window:this;return(o||Function.prototype).apply(c,arguments);};var a=o?s:null;function p(t){if(!t)return;try{try{delete t.fetch;}catch(_){}Object.defineProperty(t,'fetch',{get:function(){return a;},set:function(f){a=f;},configurable:true,enumerable:true});}catch(_){}}p(window);if(typeof Window!=='undefined'&&Window.prototype){p(Window.prototype);}if(typeof globalThis!=='undefined'&&globalThis!==window){p(globalThis);}}catch(_){}})();`,
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [patchFetchPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    build: {
      rollupOptions: {
        external: ['three', /^https:\/\/.+/],
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

