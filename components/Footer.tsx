export default function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-white/50">
      <p>
        <a
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noopener noreferrer"
          className="mr-2 inline-block rounded bg-[#01b4e4] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-[#0d253f]"
        >
          TMDB
        </a>
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
      <p className="mt-1">Not affiliated with Nuvio.</p>
    </footer>
  );
}
