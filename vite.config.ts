import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      // Ensure file updates from the editor are picked up reliably
      usePolling: true,
      interval: 300,
    },
  },
});
