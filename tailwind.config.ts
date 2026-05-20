import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))", input: "hsl(var(--input))", ring: "hsl(var(--ring))",
        background: "hsl(var(--background))", foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        brand: { 50:"#EFF6FF", 100:"#DBEAFE", 500:"#3B82F6", 600:"#2563EB", 700:"#1D4ED8" },
        ai: { 50:"#F5F3FF", 100:"#EDE9FE", 500:"#8B5CF6", 600:"#7C3AED" },
      },
      borderRadius: { lg:"var(--radius)", md:"calc(var(--radius) - 2px)", sm:"calc(var(--radius) - 4px)" },
      fontFamily: { sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
