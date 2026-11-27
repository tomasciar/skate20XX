import { defineConfig } from "vite";

export default defineConfig({
  server: {
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem,key,p12,pfx,cer,der}", ".npmrc", ".yarnrc.yml",
        "**/.git/**", "**/.local/**", "**/skate20XX-dlc/**"],
    },
    watch: {
      // Ensure file updates from the editor are picked up reliably
      usePolling: true,
      interval: 300,
    },
  },
});
