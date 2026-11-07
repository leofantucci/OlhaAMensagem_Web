export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: '#0a192f',
          card: 'rgba(17, 34, 64, 0.75)',
          cyan: '#64ffda',
          blue: '#007bff',
          text: '#ccd6f6',
          muted: '#8892b0'
        }
      },
      fontFamily: {
        mono: ['"Fira Code"', 'monospace'],
      }
    },
  },
  plugins: [],
}
