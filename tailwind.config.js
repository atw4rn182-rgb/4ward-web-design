/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#080e1a",
        sand: "#eeebe7",
        paper: "#faf9f7",
        muted: "#556274",
        brand: {
          blue: "#1d4ed8",
          deep: "#1e40af",
          copper: "#c8792a",
        },
      },
      fontFamily: {
        sans: ["Figtree", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(8,14,26,0.03), 0 10px 28px rgba(8,14,26,0.06)",
      },
    },
  },
  plugins: [],
};
