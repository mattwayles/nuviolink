export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-xl font-bold tracking-tight ${className}`}>
      Nuvio<span className="text-sky-400">Link</span>
    </span>
  );
}
